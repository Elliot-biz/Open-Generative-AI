import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, createWorkflow, hashWorkflow, assessWorkflowReadiness, setNodeApproval, bindWorkflowQuotes } from 'whihm-workflow-core';
import { buildWorkflowReadinessContext, assessProjectWorkflowReadiness } from '../lib/whihm-execution/readiness.mjs';
import { resolveExecutionBinding } from '../lib/whihm-execution/runtime.mjs';

const evaluatedAt = '2026-10-23T16:00:00Z';
const node = (type = 'remote-model', patch = {}) => ({ id: 'image', title: 'A custom title', kind: 'generation',
  executor: { id: 'studio', type, ...(type === 'remote-model' ? { provider: 'muapi', model: 'nano-banana' } : type === 'local-ai' ? { provider: 'sdcpp', model: 'z-image-turbo' } : { tool: 'whihm.combine' }), mayCostMoney: type === 'remote-model', requiresConfirmation: false },
  inputs: [], outputs: [{ id: 'result', type: 'image' }], parameters: { prompt: 'Harmless mock brief' }, metadata: { oga: { mode: 't2i' } }, ...patch });
const workflow = (n = node()) => createWorkflow({ workflowId: 'readiness_job', name: 'Readiness job', nodes: [n] });
const quoteContext = (w, overrides = {}) => ({ schemaVersion: 1, workflowId: w.workflowId, workflowHash: hashWorkflow(w), quotes: [{ nodeId: 'image', amount: 0.1, currency: 'USD', quotedAt: '2026-10-23T15:00:00Z', expiresAt: '2026-10-24T15:00:00Z', provider: 'muapi', model: 'nano-banana', source: 'fake-estimator', metadata: { evidence: 'fictional' }, ...overrides }] });
const request = (w = workflow()) => ({ workflow: w, evaluatedAt, quoteContext: w.nodes[0]?.executor.mayCostMoney ? quoteContext(w) : undefined });
const build = (w = workflow(), extra = {}, dependencies) => buildWorkflowReadinessContext({ ...request(w), ...extra }, dependencies);
async function project(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-evidence-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project');
  const created = await createProject(root, { title: 'Evidence fixture' }); assert.equal(created.status, 'created');
  return { base, root, store: created.project };
}
async function asset(t) {
  const p = await project(t), source = path.join(p.base, 'tiny.txt'); await fs.writeFile(source, 'Small harmless fixture');
  const imported = await p.store.importAsset({ sourcePath: source, assetId: 'logo', contentType: 'text/plain' });
  assert.equal(imported.status, 'imported');
  return { ...p, asset: imported.asset };
}

test('actual project APIs supply registered, checksum-verified assets and canonical workflow', async t => {
  const p = await asset(t), w = workflow(); w.nodes[0].assetRefs = ['logo']; w.assets = [{ id: 'logo', type: 'file', localPath: p.asset.path, checksum: { algorithm: 'sha256', value: p.asset.checksum } }];
  assert.equal((await p.store.addWorkflowToProject(w)).status, 'added');
  const before = await fs.readFile(path.join(p.root, 'project.json'), 'utf8');
  const result = await assessProjectWorkflowReadiness({ projectRoot: p.root, workflowId: w.workflowId, evaluatedAt, quoteContext: quoteContext(w) });
  assert.equal(result.status, 'assessed'); assert.equal(result.report.status, 'READY');
  assert.deepEqual(result.context.assets, [{ id: 'logo', present: true }]); assert.equal(result.provenance.assets.logo.source, 'project-assets');
  assert.equal(await fs.readFile(path.join(p.root, 'project.json'), 'utf8'), before);
  assert.ok(!JSON.stringify(result).includes(p.base));
});
test('unregistered required asset produces authoritative ASSET_MISSING', async t => {
  const p = await project(t), w = workflow(); w.assets = [{ id: 'logo', type: 'file', localPath: 'assets/missing.txt' }]; w.nodes[0].assetRefs = ['logo'];
  const result = await build(w, { project: p.store });
  assert.equal(result.status, 'built'); assert.equal(result.report.status, 'BLOCKED');
  assert.equal(result.context.assets[0].present, false); assert.ok(result.report.blockers.some(d => d.code === 'ASSET_MISSING'));
});
test('optional missing asset remains optional and remote presence remains unverified', async t => {
  const p = await project(t), w = workflow(); w.assets = [{ id: 'optional', type: 'file', localPath: 'assets/optional', metadata: { optional: true } }, { id: 'remote', type: 'image', remoteUrl: 'https://example.com/image.png' }]; w.nodes[0].assetRefs = ['optional', 'remote'];
  const r = await build(w, { project: p.store });
  assert.equal(r.report.status, 'CONDITIONALLY_READY'); assert.equal(r.provenance.assets.optional.optional, true);
  assert.equal(r.provenance.assets.remote.state, 'UNVERIFIED'); assert.equal(r.report.blockers.length, 0);
});
test('tampered/missing project files fail closed through existing integrity checks', async t => {
  const p = await asset(t), w = workflow();
  await fs.writeFile(path.join(p.root, p.asset.path), 'tampered');
  let result = await build(w, { project: p.store });
  assert.equal(result.status, 'rejected'); assert.equal(result.context, null); assert.equal(result.report, null);
  assert.equal(result.diagnostics[0].code, 'ASSET_HASH_MISMATCH');
  await fs.unlink(path.join(p.root, p.asset.path));
  result = await assessProjectWorkflowReadiness({ ...request(w), projectRoot: p.root });
  assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, 'ASSET_NOT_FOUND');
});
test('registered asset identity mismatch is not marked present', async t => {
  const p = await asset(t), w = workflow(); w.assets = [{ id: 'logo', type: 'file', localPath: 'assets/other.bin' }]; w.nodes[0].assetRefs = ['logo'];
  const r = await build(w, { project: p.store }); assert.equal(r.context.assets[0].present, false); assert.equal(r.provenance.assets.logo.code, 'ASSET_IDENTITY_MISMATCH');
});
test('known MuAPI route is plannable without treating credentials as evidence', async () => {
  const r = await build(); assert.equal(r.report.status, 'READY');
  assert.equal(r.context.executors[0].available, true); assert.equal(r.provenance.executors.image.runtime, 'studio.generateImage');
  assert.equal(r.provenance.executors.image.source, 'execution-bridge');
});
test('unsupported executor and unavailable utility reuse shared bridge binding checks', async () => {
  const w = workflow(); w.nodes[0].executor.model = 'not-a-model';
  const r = await build(w, { quoteContext: undefined }); assert.equal(r.context.executors.length, 0); assert.equal(r.report.nodes.image.status, 'UNSUPPORTED');
  const u = await build(workflow(node('utility'))); assert.equal(u.provenance.executors.image.code, 'UTILITY_UNAVAILABLE'); assert.equal(u.report.status, 'BLOCKED');
});
test('existing utility binding is inspected without invoking run or validation', async () => {
  let called = 0; const utility = { tool: 'whihm.combine', run() { called++; throw Error('Forbidden'); }, validate() { called++; throw Error('Forbidden'); } };
  const r = await build(workflow(node('utility')), { utility });
  assert.equal(r.report.status, 'READY'); assert.equal(called, 0);
});
test('uncertain runtime evidence uses nullable binding, not invented availability', async () => {
  const r = await build(workflow(), {}, { resolveBinding() { throw Error('private machine path'); } });
  assert.equal(r.status, 'built'); assert.equal(r.context.executors[0].available, null); assert.equal(r.report.status, 'CONDITIONALLY_READY');
  assert.ok(!JSON.stringify(r).includes('private machine path'));
});
test('local configuration/installed files do not establish successful inference', async () => {
  const w = workflow(node('local-ai'));
  const r = await build(w, { localState: { hostAvailable: true, binaryStatus: { exists: true, path: '/private/bin' }, models: [{ id: 'z-image-turbo', state: 'downloaded', path: 'C:/private/model' }] } });
  assert.equal(r.report.nodes.image.status, 'UNVERIFIED'); assert.equal(r.provenance.executors.image.source, 'local-runtime-configuration');
  assert.ok(!JSON.stringify(r).includes('/private')); assert.ok(!JSON.stringify(r).includes('C:'));
});
test('local host, binary or weight absence is a concrete unavailable signal', async () => {
  const w = workflow(node('local-ai'));
  for (const localState of [{ hostAvailable: false }, { binaryStatus: { exists: false } }, { models: [{ id: 'z-image-turbo', state: 'partial' }] }]) {
    const r = await build(w, { localState }); assert.equal(r.context.executors[0].available, false); assert.equal(r.report.status, 'BLOCKED');
  }
});
test('Wan2GP config is read only from supplied snapshot; no probes/downloads', async () => {
  const n = node('local-ai'); n.executor.provider = 'wan2gp'; n.executor.model = 'wan2gp:flux-dev';
  const w = workflow(n);
  const configured = await build(w, { localState: { wan2gpConfig: { dir: 'C:/private/Wan2GP', url: '', python: 'C:/private/python.exe' }, models: [{ id: n.executor.model, ready: true }] } });
  assert.equal(configured.report.nodes.image.status, 'UNVERIFIED'); assert.ok(!JSON.stringify(configured).includes('C:'));
  assert.equal((await build(w, { localState: { wan2gpConfig: { dir: '', url: '' } } })).context.executors[0].available, false);
});
test('manual control remains pending manual action rather than a runtime failure', async () => {
  const n = node('control'); n.executor.tool = 'approval-gate';
  const r = await build(workflow(n));
  assert.equal(r.report.nodes.image.status, 'MANUAL_PENDING'); assert.equal(r.report.blockers.length, 0);
  assert.equal(r.provenance.executors.image.state, 'MANUAL'); assert.equal(r.provenance.executors.image.source, 'workflow-declaration');
});
test('external quote envelope, source metadata and budget are preserved exactly', async () => {
  const w = workflow(), q = quoteContext(w), budget = { maximumSpend: 2, currency: 'USD' };
  const r = await build(w, { quoteContext: q, budget });
  assert.deepEqual(r.context.quoteContext, q); assert.deepEqual(r.context.budget, budget);
  assert.equal(r.report.cost.budgetStatus, 'WITHIN_BUDGET'); assert.notEqual(r.context.quoteContext, q);
});
test('wrong workflow/hash quotes are flagged, never rebound or dropped', async () => {
  const w = workflow(), q = quoteContext(w); q.workflowHash = 'f'.repeat(64);
  const r = await build(w, { quoteContext: q, budget: { maximumSpend: 2, currency: 'USD' } });
  assert.equal(r.context.quoteContext.workflowHash, q.workflowHash); assert.equal(r.report.nodes.image.cost.status, 'STALE');
  assert.equal(r.provenance.quotes.state, 'MISMATCHED'); assert.equal(r.report.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.equal(r.diagnostics[0].code, 'QUOTE_WORKFLOW_MISMATCH');
});
test('stale quote/freshness policy passes through without refreshing', async () => {
  const w = workflow(), r = await build(w, { quoteContext: quoteContext(w, { quotedAt: '2026-10-22T15:00:00Z' }), quotePolicy: { maxAgeMs: 3600000 } });
  assert.deepEqual(r.report.cost.staleNodeIds, ['image']); assert.equal(r.context.quotePolicy.maxAgeMs, 3600000);
});
test('malformed/secret-bearing evidence is rejected without echoing it', async () => {
  const w = workflow();
  for (const q of [quoteContext(w, { amount: -1 }), { ...quoteContext(w), schemaVersion: 2 }, quoteContext(w, { metadata: { apiKey: 'private-key-placeholder' } })]) {
    const r = await build(w, { quoteContext: q }); assert.equal(r.status, 'rejected'); assert.equal(r.context, null); assert.ok(!JSON.stringify(r).includes('private-key-placeholder'));
  }
});
test('Director mixed workflow assembles source evidence into one existing authoritative report', async () => {
  const w = JSON.parse(await fs.readFile(new URL('../packages/whihm-workflow-core/fixtures/director-readiness.json', import.meta.url)));
  const q = { schemaVersion: 1, workflowId: w.workflowId, workflowHash: hashWorkflow(w), quotes: [['image', 0.03], ['reference_edit', 0.1], ['video_a', 0.4], ['premium', 3]].map(([nodeId, amount]) => ({ nodeId, amount, currency: 'USD', quotedAt: '2026-10-23T15:00:00Z' })) };
  let registryCalls = 0;
  const project = { async listProjectAssets() { registryCalls++; return { status: 'ok', assets: [{ assetId: 'music', path: 'assets/music.wav', checksum: '0'.repeat(64) }] }; } };
  const resolveBinding = n => n.executor.type === 'remote-model' ? { runtime: 'studio.generateImage' } : resolveExecutionBinding(n);
  const r = await assessProjectWorkflowReadiness({ workflow: w, project, evaluatedAt, quoteContext: q, budget: { maximumSpend: 2, currency: 'USD' } }, { resolveBinding });
  assert.equal(r.status, 'assessed'); assert.equal(r.report.status, 'BLOCKED'); assert.equal(registryCalls, 1);
  assert.equal(r.provenance.assets.logo.state, 'UNAVAILABLE'); assert.equal(r.provenance.assets.music.state, 'AVAILABLE');
  assert.equal(r.provenance.executors.image.state, 'AVAILABLE'); assert.equal(r.provenance.executors.storyboard.state, 'MANUAL');
  assert.equal(r.provenance.executors.assembly.code, 'UTILITY_UNAVAILABLE'); assert.equal(r.report.summary.disabledOptional, 2);
  assert.equal(r.report.cost.knownSubtotal, 0.53); assert.deepEqual(r.report.cost.unknownNodeIds, ['video_b']); assert.equal(r.report.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.deepEqual(r.report, assessWorkflowReadiness(w, r.context));
});
test('builder is repeatable/JSON serializable and cannot call fetch, auth or execution', async () => {
  const oldFetch = globalThis.fetch; let network = 0;
  globalThis.fetch = () => { network++; throw Error('Network forbidden'); };
  try {
    const w = workflow(), before = structuredClone(w), r = await build(w);
    assert.deepEqual(r, await build(w)); assert.deepEqual(r, JSON.parse(JSON.stringify(r))); assert.deepEqual(w, before); assert.equal(network, 0);
  } finally { globalThis.fetch = oldFetch; }
});
test('source failures, missing workflows and ambiguous identity fail without raw errors/paths', async t => {
  const p = await project(t);
  assert.equal((await assessProjectWorkflowReadiness({ project: p.store, workflowId: 'missing', evaluatedAt })).diagnostics[0].code, 'WORKFLOW_NOT_FOUND');
  assert.equal((await build(workflow(), { workflowId: 'different' })).diagnostics[0].code, 'WORKFLOW_ID_MISMATCH');
  assert.equal((await build(workflow(), { project: p.store, projectRoot: p.root })).diagnostics[0].code, 'PROJECT_SOURCE_AMBIGUOUS');
  const result = await build(workflow(), { project: { listProjectAssets() { throw Error('secret absolute path'); } } });
  assert.equal(result.status, 'rejected'); assert.ok(!JSON.stringify(result).includes('secret absolute path'));
});
test('conflicting mode support for one executor identity stays unverified', async () => {
  const w = workflow(); w.nodes.push({ ...structuredClone(w.nodes[0]), id: 'second', metadata: { oga: { mode: 'unknown' } } });
  const r = await build(w, { quoteContext: undefined });
  assert.equal(r.context.executors.length, 1); assert.equal(r.context.executors[0].available, null);
  assert.equal(r.provenance.executors.image.state, 'UNVERIFIED'); assert.ok(r.diagnostics.some(d => d.code === 'BINDING_EVIDENCE_CONFLICT'));
});

test('resolved manual controls retain declaration provenance without misclassifying QC', async () => {
  const n = node('control'); n.executor.tool = 'approval-gate';
  const w = workflow(n), approved = setNodeApproval(w, { nodeId: 'image', decision: 'APPROVED', timestamp: evaluatedAt, expectedWorkflowHash: hashWorkflow(w) }).workflow;
  const resolved = await build(approved);
  assert.equal(resolved.report.status, 'READY'); assert.equal(resolved.provenance.executors.image.state, 'MANUAL');
  n.executor.tool = 'qc';
  const qc = await build(workflow(n), { nodeStates: { image: { manualResolved: true } } });
  assert.equal(qc.report.status, 'BLOCKED'); assert.notEqual(qc.provenance.executors.image.state, 'MANUAL');
});
test('expected project identity cannot be silently ignored without a root source', async () => {
  const r = await build(workflow(), { expectedProjectId: 'unexpected' });
  assert.equal(r.status, 'rejected'); assert.equal(r.diagnostics[0].code, 'PROJECT_ID_CONTEXT_INVALID');
});

test('scope-bound quote provenance distinguishes preserved branch evidence from stale quotes', async () => {
  const w = workflow(); w.nodes.push({ ...structuredClone(w.nodes[0]), id: 'second' });
  const q = quoteContext(w); q.quotes.push({ ...q.quotes[0], nodeId: 'second' });
  const scoped = bindWorkflowQuotes(w, q, { evaluatedAt }); assert.equal(scoped.status, 'bound');
  const cosmetic = structuredClone(w); cosmetic.nodes[0].title = 'Only a title';
  const preserved = await build(cosmetic, { quoteContext: scoped.quoteContext });
  assert.equal(preserved.provenance.quotes.state, 'SCOPE_VERIFIED'); assert.equal(preserved.report.cost.staleNodeIds.length, 0);
  cosmetic.nodes[0].parameters.prompt = 'New input';
  const changed = await build(cosmetic, { quoteContext: scoped.quoteContext });
  assert.equal(changed.provenance.quotes.state, 'PARTIALLY_STALE'); assert.deepEqual(changed.report.cost.staleNodeIds, ['image']);
});

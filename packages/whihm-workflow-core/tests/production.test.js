import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, hashWorkflow, hashNodeProductionScope, setNodeApproval, recordNodeOutput, getNodeProductionEvidence,
  invalidateWorkflowProduction, bindWorkflowQuotes, applyEditBatch, assessWorkflowReadiness, createProject, openProject, exportWorkflow, importWorkflow } from '../src/index.js';

const timestamp = '2026-10-25T12:00:00Z';
const node = (id, type = 'remote-model', extra = {}) => ({ id, title: id, kind: 'media', executor: { id: type, type, mayCostMoney: type === 'remote-model', requiresConfirmation: false,
  ...(type === 'remote-model' ? { provider: 'fictional', model: 'test-model' } : { tool: type === 'control' ? 'approval-gate' : 'whihm.video-combiner' }) },
  inputs: [], outputs: [{ id: 'result', type: 'video' }], parameters: { prompt: 'Harmless fixture' }, ...extra });
function director() {
  return createWorkflow({ workflowId: 'director_production', name: 'Fictional branch approval proof', nodes: [
    node('alpine'), node('snow_frame'), node('snow_motion', 'remote-model', { dependencies: ['snow_frame'] }), node('motorcycle'),
    node('storyboard', 'control', { dependencies: ['alpine', 'snow_frame', 'motorcycle'] }),
    node('assembly', 'utility', { dependencies: ['alpine', 'snow_motion', 'motorcycle', 'storyboard'] }),
    node('final_review', 'control', { dependencies: ['assembly'] }),
    node('premium', 'remote-model', { enabled: false, executionPolicy: { optional: true } }),
  ], outputs: [{ id: 'final', type: 'video', source: { nodeId: 'final_review', portId: 'result' } }] });
}
const good = result => { assert.equal(result.status, 'applied', JSON.stringify(result)); return result; };
function approve(w, id, decision = 'APPROVED', extra = {}) {
  return setNodeApproval(w, { nodeId: id, decision, timestamp, expectedWorkflowHash: hashWorkflow(w), ...extra });
}
function outputs(w) {
  for (const [index, n] of w.nodes.entries()) if (n.enabled !== false) w = good(recordNodeOutput(w, { nodeId: n.id, outputHash: String(index + 1).repeat(64), timestamp, expectedWorkflowHash: hashWorkflow(w) })).workflow;
  return w;
}
function quotes(w) {
  const quoteContext = { schemaVersion: 1, workflowId: w.workflowId, workflowHash: hashWorkflow(w), quotes: w.nodes.filter(n => n.executor.mayCostMoney).map(n => ({ nodeId: n.id, amount: 0.1, currency: 'USD', quotedAt: timestamp, provider: n.executor.provider, model: n.executor.model, source: 'fake-estimate' })) };
  const result = bindWorkflowQuotes(w, quoteContext, { evaluatedAt: timestamp }); assert.equal(result.status, 'bound', JSON.stringify(result)); return result.quoteContext;
}
function context(w, quoteContext) {
  const executors = [...new Map(w.nodes.map(n => { const { id, type, provider, model, tool } = n.executor; const entry = { id, type, available: true, ...(provider ? { provider } : {}), ...(model ? { model } : {}), ...(tool ? { tool } : {}) }; return [JSON.stringify(entry), entry]; })).values()];
  return { evaluatedAt: timestamp, executors, ...(quoteContext ? { quoteContext, budget: { maximumSpend: 2, currency: 'USD' } } : {}) };
}
function edit(w, commands) { return good(applyEditBatch(w, { commandVersion: 1, expectedWorkflowHash: hashWorkflow(w), commands })).workflow; }
const change = w => edit(w, [{ type: 'set-node-parameter', targetId: 'snow_frame', parameterPath: '/prompt', value: 'New snowboard shot' }]);

test('pending, approved, rejected and stale gate decisions are authoritative in readiness', () => {
  let w = director(), ctx = context(w);
  assert.equal(assessWorkflowReadiness(w, ctx).nodes.storyboard.approval, 'PENDING');
  assert.equal(assessWorkflowReadiness(w, { ...ctx, nodeStates: { storyboard: { manualResolved: true } } }).nodes.storyboard.status, 'MANUAL_PENDING');
  w = good(approve(w, 'storyboard')).workflow;
  assert.equal(assessWorkflowReadiness(w, ctx).nodes.storyboard.status, 'EXECUTABLE');
  const rejected = good(approve(w, 'storyboard', 'REJECTED')).workflow;
  const report = assessWorkflowReadiness(rejected, { ...ctx, nodeStates: { storyboard: { manualResolved: true } } });
  assert.ok(report.blockers.some(d => d.code === 'APPROVAL_REJECTED'));
  assert.ok(report.nodes.assembly.reasons.some(d => d.code === 'UPSTREAM_BLOCKED'));
  const changed = change(w), stale = assessWorkflowReadiness(changed, ctx);
  assert.equal(stale.nodes.storyboard.approval, 'STALE'); assert.equal(stale.nodes.storyboard.status, 'MANUAL_PENDING');
  assert.ok(stale.nodes.storyboard.reasons.some(d => d.code === 'APPROVAL_STALE'));
});

test('approval records bind stable workflow/node identity, scope, original version, explicit actor/time', () => {
  const w = director(), result = good(approve(w, 'storyboard', 'APPROVED', { actor: { source: 'local-review' }, note: 'Fictional approval' }));
  const record = result.workflow.nodes.find(n => n.id === 'storyboard').metadata.production.approval;
  assert.equal(record.workflowHash, hashWorkflow(w)); assert.equal(record.workflowId, w.workflowId); assert.equal(record.nodeId, 'storyboard'); assert.equal(record.decidedAt, timestamp);
  assert.equal(record.scopeHash, hashNodeProductionScope(w, 'storyboard', { includeOwnOutput: true }));
  assert.deepEqual(importWorkflow(exportWorkflow(result.workflow)), result.workflow);
  const wrongId = structuredClone(result.workflow); wrongId.nodes.find(n => n.id === 'storyboard').metadata.production.approval.workflowId = 'other_workflow';
  assert.ok(assessWorkflowReadiness(wrongId, context(wrongId)).blockers.some(d => d.code === 'PRODUCTION_STATE_INVALID'));
  const wrongScope = structuredClone(result.workflow); wrongScope.nodes.find(n => n.id === 'storyboard').metadata.production.approval.scopeHash = 'f'.repeat(64);
  assert.equal(assessWorkflowReadiness(wrongScope, context(wrongScope)).nodes.storyboard.approval, 'STALE');
  assert.equal(approve(w, 'storyboard', 'APPROVED', { expectedWorkflowHash: 'f'.repeat(64) }).errors[0].code, 'WORKFLOW_HASH_MISMATCH');
  assert.equal(approve(w, 'alpine').status, 'rejected');
  assert.equal(approve(w, 'storyboard', 'APPROVED', { actor: { apiKey: 'never-persist-this' } }).status, 'rejected');
});

test('Director sequence preserves siblings, stales affected quotes/outputs/gates and reports budget uncertainty', () => {
  let w = outputs(director()); const quoteContext = quotes(w), ctx = context(w, quoteContext);
  assert.deepEqual(assessWorkflowReadiness(w, ctx).manualGates, ['final_review', 'storyboard']);
  w = good(approve(w, 'storyboard')).workflow;
  assert.equal(assessWorkflowReadiness(w, ctx).nodes.storyboard.status, 'EXECUTABLE');
  w = good(approve(w, 'final_review')).workflow;
  assert.equal(assessWorkflowReadiness(w, ctx).status, 'READY');
  const after = change(w), original = structuredClone(after), result = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp, quoteContext }));
  assert.deepEqual(after, original); assert.notEqual(result.workflow, after);
  assert.deepEqual(result.affectedNodeIds, ['assembly', 'final_review', 'snow_frame', 'snow_motion', 'storyboard']);
  for (const id of ['alpine', 'motorcycle', 'premium']) assert.deepEqual(result.workflow.nodes.find(n => n.id === id), w.nodes.find(n => n.id === id));
  for (const id of ['storyboard', 'final_review']) assert.equal(getNodeProductionEvidence(result.workflow, id).approval.status, 'STALE');
  assert.equal(getNodeProductionEvidence(result.workflow, 'snow_motion').derived.status, 'STALE');
  const report = assessWorkflowReadiness(result.workflow, { ...context(result.workflow), quoteContext: result.quoteContext, budget: ctx.budget });
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.deepEqual(report.cost.staleNodeIds, ['snow_frame', 'snow_motion']);
  assert.deepEqual(report.cost.quotedNodeIds, ['alpine', 'motorcycle']);
  assert.equal(report.summary.disabledOptional, 1); assert.equal(report.nodes.final_review.approval, 'STALE');
  assert.deepEqual(result, invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp, quoteContext }));
  const again = good(invalidateWorkflowProduction(after, result.workflow, { evaluatedAt: timestamp, quoteContext: result.quoteContext }));
  assert.deepEqual(again.workflow, result.workflow); assert.deepEqual(again.quoteContext, result.quoteContext);
});

test('titles, positions and explicitly presentation-only metadata do not invalidate evidence or scoped quotes', () => {
  let w = outputs(director()); const q = quotes(w); w = good(approve(w, 'storyboard')).workflow;
  const after = edit(w, [{ type: 'rename-node-title', targetId: 'snow_frame', value: 'Snow Follow Still' }, { type: 'set-node-position', targetId: 'snow_frame', value: { x: 25, y: 70 } },
    { type: 'update-node', targetId: 'snow_frame', changes: { metadata: { ...w.nodes.find(n => n.id === 'snow_frame').metadata, presentation: { color: 'blue' } } } }]);
  const r = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp, quoteContext: q }));
  assert.deepEqual(r.affectedNodeIds, []); assert.deepEqual(r.batch.commands, []); assert.equal(getNodeProductionEvidence(r.workflow, 'storyboard').approval.status, 'APPROVED');
  assert.deepEqual(assessWorkflowReadiness(r.workflow, context(r.workflow, r.quoteContext)).cost.staleNodeIds, []);
});

test('edge rewiring, executor/model, assets and workflow inputs invalidate the relevant dependency scope', () => {
  for (const mutate of [
    w => { w.nodes.find(n => n.id === 'snow_motion').executor.model = 'another-model'; },
    w => { w.nodes.find(n => n.id === 'snow_motion').dependencies = ['motorcycle']; },
    w => { w.nodes.find(n => n.id === 'snow_frame').assetRefs = ['logo']; w.assets = [{ id: 'logo', type: 'image', localPath: 'assets/logo.png' }]; },
    w => { w.nodes.find(n => n.id === 'snow_frame').inputs = [{ id: 'brief', type: 'text' }]; w.inputs = [{ id: 'brief', type: 'text', default: 'A new brief', targets: [{ nodeId: 'snow_frame', portId: 'brief' }] }]; },
  ]) {
    const w = outputs(director()), after = structuredClone(w); mutate(after);
    const result = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp }));
    assert.ok(result.affectedNodeIds.includes('snow_motion')); assert.ok(result.affectedNodeIds.includes('final_review'));
    assert.ok(!result.affectedNodeIds.includes('alpine')); assert.ok(!result.affectedNodeIds.includes('motorcycle'));
  }
});

test('canonical embedded references and input-default dependencies use validator graph discovery', () => {
  const w = director(); w.nodes.find(n => n.id === 'snow_motion').dependencies = [];
  w.nodes.find(n => n.id === 'snow_motion').parameters.reference = '{{ snow_frame.outputs[0].value }}';
  const result = good(invalidateWorkflowProduction(w, change(w), { evaluatedAt: timestamp }));
  assert.ok(result.affectedNodeIds.includes('snow_motion'));
  delete w.nodes.find(n => n.id === 'snow_motion').parameters.reference;
  w.nodes.find(n => n.id === 'snow_motion').inputs = [{ id: 'source', type: 'object' }];
  w.inputs = [{ id: 'source', type: 'object', default: { $nodeOutput: { nodeId: 'snow_frame', portId: 'result' } }, targets: [{ nodeId: 'snow_motion', portId: 'source' }] }];
  assert.ok(good(invalidateWorkflowProduction(w, change(w), { evaluatedAt: timestamp })).affectedNodeIds.includes('snow_motion'));
});

test('changed runtime input values and ancestor output identities invalidate only their consumers', () => {
  let w = director(); w.nodes.find(n => n.id === 'snow_frame').inputs = [{ id: 'brief', type: 'text' }];
  w.inputs = [{ id: 'brief', type: 'text', targets: [{ nodeId: 'snow_frame', portId: 'brief' }] }];
  w = good(approve(w, 'storyboard', 'APPROVED', { inputs: { brief: 'Original' } })).workflow;
  const report = assessWorkflowReadiness(w, { ...context(w), inputs: { brief: 'Changed' } }); assert.equal(report.nodes.storyboard.approval, 'STALE');
  const invalid = good(invalidateWorkflowProduction(w, w, { evaluatedAt: timestamp, beforeInputs: { brief: 'Original' }, afterInputs: { brief: 'Changed' } }));
  assert.ok(invalid.affectedNodeIds.includes('snow_motion')); assert.ok(!invalid.affectedNodeIds.includes('motorcycle'));
  w = outputs(director()); w = good(approve(w, 'storyboard')).workflow;
  const after = good(recordNodeOutput(w, { nodeId: 'snow_frame', outputHash: 'f'.repeat(64), timestamp, expectedWorkflowHash: hashWorkflow(w) })).workflow;
  const r = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp }));
  assert.equal(getNodeProductionEvidence(r.workflow, 'snow_frame').derived.status, 'VALID');
  assert.equal(getNodeProductionEvidence(r.workflow, 'snow_motion').derived.status, 'STALE');
  assert.equal(getNodeProductionEvidence(r.workflow, 'storyboard').approval.status, 'STALE');
});

test('a gate own output revision makes its approval stale without invalidating its new output evidence', () => {
  let w = outputs(director()); w = good(approve(w, 'storyboard')).workflow;
  w = good(recordNodeOutput(w, { nodeId: 'storyboard', outputHash: 'f'.repeat(64), timestamp, expectedWorkflowHash: hashWorkflow(w) })).workflow;
  assert.equal(getNodeProductionEvidence(w, 'storyboard').approval.status, 'STALE');
  assert.equal(getNodeProductionEvidence(w, 'storyboard').derived.status, 'VALID');
});

test('approval cannot bless known stale derived inputs or unresolved upstream gates', () => {
  let w = outputs(director());
  assert.equal(approve(w, 'final_review').errors[0].code, 'APPROVAL_INPUT_UNRESOLVED');
  w = good(approve(w, 'storyboard')).workflow;
  assert.equal(approve(change(w), 'storyboard').errors[0].code, 'APPROVAL_INPUT_UNRESOLVED');
});

test('future decisions cannot resolve gates before their explicit decision time; APIs perform no network work', () => {
  const original = globalThis.fetch; globalThis.fetch = () => { assert.fail('Network/execution forbidden'); };
  try {
    const w = director(), result = good(approve(w, 'storyboard', 'APPROVED', { timestamp: '2026-10-26T12:00:00Z' }));
    const report = assessWorkflowReadiness(result.workflow, context(result.workflow));
    assert.equal(report.nodes.storyboard.approval, 'PENDING');
    const q = quotes(result.workflow), after = change(result.workflow);
    assert.equal(invalidateWorkflowProduction(result.workflow, after, { evaluatedAt: timestamp, quoteContext: q }).status, 'applied');
  } finally { globalThis.fetch = original; }
});

test('real edge reconnection and asset checksum changes selectively invalidate dependent state', () => {
  const w = director();
  w.nodes.find(n => n.id === 'snow_motion').dependencies = [];
  w.nodes.find(n => n.id === 'snow_motion').inputs = [{ id: 'source', type: 'video' }];
  w.edges = [{ id: 'source_motion', source: { nodeId: 'snow_frame', portId: 'result' }, target: { nodeId: 'snow_motion', portId: 'source' } }];
  const rewired = edit(w, [{ type: 'reconnect-edge', targetId: 'source_motion', changes: { source: { nodeId: 'motorcycle', portId: 'result' } } }]);
  assert.deepEqual(good(invalidateWorkflowProduction(w, rewired, { evaluatedAt: timestamp })).affectedNodeIds, ['assembly', 'final_review', 'snow_motion']);
  w.assets = [{ id: 'logo', type: 'image', localPath: 'assets/logo.png', checksum: { algorithm: 'sha256', value: 'a'.repeat(64) } }];
  w.nodes.find(n => n.id === 'snow_frame').assetRefs = ['logo'];
  const after = structuredClone(w); after.assets[0].checksum.value = 'b'.repeat(64);
  const result = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp }));
  assert.ok(result.affectedNodeIds.includes('snow_motion')); assert.ok(!result.affectedNodeIds.includes('motorcycle'));
});

test('removed node quotes are preserved explicitly as retired evidence and files/history are untouched', () => {
  const w = director(), q = quotes(w), after = edit(w, [{ type: 'remove-node', targetId: 'premium' }]);
  const result = good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp, quoteContext: q }));
  assert.deepEqual(result.removedNodeIds, ['premium']); assert.equal(result.retiredQuotes[0].quote.nodeId, 'premium');
  assert.equal(result.retiredQuotes[0].reason, 'NODE_REMOVED'); assert.ok(!result.quoteContext.quotes.some(quote => quote.nodeId === 'premium'));
  assert.equal(q.quotes.length, 5); assert.equal(result.sourceDiff[0].collection, 'nodes');
});

test('disabled disconnected optional branch edits preserve the active production path', () => {
  const w = outputs(director()), after = edit(w, [{ type: 'set-model', targetId: 'premium', value: 'new-premium' }]);
  assert.deepEqual(good(invalidateWorkflowProduction(w, after, { evaluatedAt: timestamp })).affectedNodeIds, ['premium']);
});

test('legacy whole-workflow quotes remain conservative; malformed/wrong-id/stale quotes cannot be rebound', () => {
  const w = director(), scoped = quotes(w), legacy = structuredClone(scoped); legacy.quotes.forEach(q => { delete q.metadata.whihmScope; });
  const after = edit(w, [{ type: 'rename-node-title', targetId: 'alpine', value: 'Alpine' }]);
  assert.equal(assessWorkflowReadiness(after, context(after, legacy)).cost.staleNodeIds.length, 4);
  assert.deepEqual(assessWorkflowReadiness(after, context(after, scoped)).cost.staleNodeIds, []);
  assert.equal(bindWorkflowQuotes(after, legacy, { evaluatedAt: timestamp }).status, 'rejected');
  const promoted = good(invalidateWorkflowProduction(w, change(w), { evaluatedAt: timestamp, quoteContext: legacy }));
  assert.equal(promoted.quoteBindingSource, 'verified-before-workflow');
  assert.deepEqual(assessWorkflowReadiness(promoted.workflow, context(promoted.workflow, promoted.quoteContext)).cost.staleNodeIds, ['snow_frame', 'snow_motion']);
  assert.equal(promoted.quoteContext.workflowHash, legacy.workflowHash);
  const wrongId = { ...scoped, workflowId: 'other' }; assert.equal(assessWorkflowReadiness(w, context(w, wrongId)).cost.staleNodeIds.length, 4);
  const invalid = structuredClone(scoped); invalid.quotes[0].metadata.whihmScope.scopeHash = 'bad';
  assert.ok(assessWorkflowReadiness(w, context(w, invalid)).blockers.some(d => d.code === 'READINESS_CONTEXT_INVALID'));
  const changed = change(w), stale = good(invalidateWorkflowProduction(w, changed, { evaluatedAt: timestamp, quoteContext: scoped })).quoteContext;
  assert.equal(bindWorkflowQuotes(changed, { ...stale, workflowHash: hashWorkflow(changed) }, { evaluatedAt: timestamp }).status, 'rejected');
});

test('project/history persist approval and invalidation as normal append-only edit transitions', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-production-')); t.after(() => fs.rm(root, { force: true, recursive: true }));
  const project = (await createProject(path.join(root, 'project'), { title: 'Portable approvals' })).project;
  let w = director(); assert.equal((await project.addWorkflowToProject(w)).status, 'added');
  const history = (await project.getProjectHistory(w.workflowId)).store;
  async function save(result) {
    assert.equal((await history.recordEdit({ before: w, result, batch: result.batch })).status, 'recorded');
    assert.equal((await project.updateWorkflowInProject({ workflow: result.workflow, expectedHash: hashWorkflow(w) })).status, 'updated'); w = result.workflow;
  }
  await save(good(approve(w, 'storyboard'))); const approved = structuredClone(w);
  const editBatch = { commandVersion: 1, commands: [{ type: 'set-node-parameter', targetId: 'snow_frame', parameterPath: '/prompt', value: 'New' }] };
  const editResult = good(applyEditBatch(w, editBatch)); await save({ ...editResult, batch: editBatch });
  await save(good(invalidateWorkflowProduction(approved, w, { evaluatedAt: timestamp })));
  const records = (await history.listHistory(w.workflowId)).records; assert.equal(records.length, 3);
  const old = (await history.getWorkflowAtRecord(w.workflowId, records[0].recordId)).workflow;
  assert.equal(getNodeProductionEvidence(old, 'storyboard').approval.status, 'APPROVED');
  assert.equal(getNodeProductionEvidence(w, 'storyboard').approval.status, 'STALE');
  const reopened = await openProject(path.join(root, 'project')); assert.equal(reopened.status, 'opened');
  assert.deepEqual((await reopened.project.getProjectWorkflow(w.workflowId)).workflow, w);
});

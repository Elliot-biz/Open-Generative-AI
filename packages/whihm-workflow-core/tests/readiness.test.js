import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessWorkflowReadiness, createWorkflow, hashWorkflow, validateWorkflow, exportWorkflow } from '../src/index.js';
const time = '2026-10-23T16:00:00Z';
const node = (id = 'a', type = 'utility') => ({ id, title: id, kind: 'test', executor: { id: type, type, ...(type === 'remote-model' ? { provider: 'example', model: 'fake-model' } : { tool: 'test-tool' }), mayCostMoney: type === 'remote-model', requiresConfirmation: false }, inputs: [{ id: 'input', type: 'video' }], outputs: [{ id: 'output', type: 'video' }], parameters: {} });
const doc = (nodes = [node()]) => createWorkflow({ workflowId: 'test_ready', name: 'Test', nodes });
const binding = n => Object.fromEntries(Object.entries({ ...n.executor, available: true }).filter(([key]) => !['mayCostMoney', 'requiresConfirmation', 'capabilities'].includes(key)));
const options = w => ({ evaluatedAt: time, executors: [...new Map(w.nodes.map(n => { const b = binding(n); return [JSON.stringify(b), b]; })).values()] });
const edge = (source, target, id = `${source}_${target}`) => ({ id, source: { nodeId: source, portId: 'output' }, target: { nodeId: target, portId: 'input' } });
const quote = (nodeId = 'a', amount = 0.3, extras = {}) => ({ nodeId, amount, currency: 'USD', quotedAt: '2026-10-23T15:00:00Z', ...extras });
const quotes = (w, entries) => ({ schemaVersion: 1, workflowId: w.workflowId, workflowHash: hashWorkflow(w), quotes: entries });
const has = (r, code) => [...r.blockers, ...r.warnings].some(e => e.code === code);
const priced = (entries = [quote()], extra = {}) => { const w = doc([node('a', 'remote-model')]); return assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, entries), ...extra }); };

test('fully ready workflow and public workspace export are pure and serializable', () => {
  const w = doc(), ctx = options(w), before = structuredClone({ w, ctx });
  const result = assessWorkflowReadiness(w, ctx);
  assert.equal(result.status, 'READY'); assert.equal(result.ready, true);
  assert.equal(result.summary.executable, 1); assert.equal(result.cost.budgetStatus, 'NO_BUDGET');
  assert.deepEqual({ w, ctx }, before); assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test('canonical invalidity remains INVALID and contains useful diagnostics', () => {
  const w = doc(); w.edges.push(edge('missing', 'a'));
  const r = assessWorkflowReadiness(w, options(w));
  assert.equal(r.status, 'INVALID'); assert.equal(r.blockers[0].code, 'WORKFLOW_INVALID');
  assert.ok(r.validation.errors.some(e => e.code === 'MISSING_NODE'));
});
test('required asset inventory absence blocks; optional missing asset warns', () => {
  const w = doc(); w.assets.push({ id: 'logo', type: 'image', localPath: 'assets/logo.png' }); w.nodes[0].parameters.logo = { $asset: 'logo' };
  const r = assessWorkflowReadiness(w, { ...options(w), assets: [] });
  assert.equal(r.status, 'BLOCKED'); assert.ok(has(r, 'ASSET_MISSING'));
  w.assets[0].metadata = { optional: true };
  const optional = assessWorkflowReadiness(w, { ...options(w), assets: [] });
  assert.equal(optional.status, 'READY'); assert.ok(has(optional, 'OPTIONAL_ASSET_MISSING'));
});
test('omitted availability evidence cannot silently claim readiness', () => {
  const w = doc(); w.nodes[0].assetRefs = ['logo']; w.assets = [{ id: 'logo', type: 'image', localPath: 'assets/logo.png' }];
  const r = assessWorkflowReadiness(w, { evaluatedAt: time });
  assert.equal(r.status, 'CONDITIONALLY_READY'); assert.ok(has(r, 'EXECUTOR_UNVERIFIED')); assert.ok(has(r, 'ASSET_UNVERIFIED'));
});
test('unsupported executor and unavailable utility are distinct hard blockers', () => {
  const w = doc(); const r = assessWorkflowReadiness(w, { ...options(w), executors: [] });
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.nodes.a.status, 'UNSUPPORTED'); assert.equal(r.summary.unsupported, 1);
  assert.ok(has(r, 'EXECUTOR_UNSUPPORTED'));
  const ctx = options(w); ctx.executors[0].available = false;
  assert.ok(has(assessWorkflowReadiness(w, ctx), 'UTILITY_UNAVAILABLE'));
});
test('model identity and local runtime availability are matched, never inferred', () => {
  const w = doc([node('a', 'remote-model')]); const ctx = options(w); ctx.executors[0].model = 'different';
  assert.ok(has(assessWorkflowReadiness(w, ctx), 'EXECUTOR_UNSUPPORTED'));
  const local = doc([node('a', 'local-ai')]); const localCtx = options(local); localCtx.executors[0].available = false;
  assert.ok(has(assessWorkflowReadiness(local, localCtx), 'EXECUTOR_UNAVAILABLE'));
});
test('manual gate and downstream waiting remain conditional, not hard failures', () => {
  const w = doc([node('gate', 'control'), node('b')]); w.nodes[0].executor.tool = 'approval-gate'; w.edges = [edge('gate', 'b')];
  let r = assessWorkflowReadiness(w, options(w));
  assert.equal(r.status, 'CONDITIONALLY_READY'); assert.deepEqual(r.manualGates, ['gate']);
  assert.equal(r.nodes.gate.status, 'MANUAL_PENDING'); assert.equal(r.nodes.b.status, 'WAITING_MANUAL'); assert.equal(r.blockers.length, 0);
  r = assessWorkflowReadiness(w, { ...options(w), nodeStates: { gate: { manualResolved: true } } });
  assert.equal(r.status, 'READY');
});
test('requiresConfirmation is a reported gate, never an execution authorization', () => {
  const w = doc(); w.nodes[0].executor.requiresConfirmation = true;
  const r = assessWorkflowReadiness(w, options(w)); assert.equal(r.nodes.a.status, 'MANUAL_PENDING');
});
test('disabled optional premium/SFX branches do not demand bindings/assets/quotes', () => {
  const w = doc([node(), node('premium', 'remote-model')]);
  Object.assign(w.nodes[1], { enabled: false, executionPolicy: { optional: true }, assetRefs: ['unused'] });
  w.assets.push({ id: 'unused', type: 'image', localPath: 'assets/unused.png' });
  const r = assessWorkflowReadiness(w, { evaluatedAt: time, executors: [binding(w.nodes[0])], assets: [] });
  assert.equal(r.status, 'READY'); assert.equal(r.summary.disabledOptional, 1); assert.equal(r.summary.unknownCost, 0);
});
test('disabled source still blocks an active dependent and inactive declared output', () => {
  const w = doc([node('off'), node('b')]); w.nodes[0].enabled = false; w.nodes[0].executionPolicy = { optional: true };
  w.edges = [edge('off', 'b')];
  assert.ok(has(assessWorkflowReadiness(w, options(w)), 'UPSTREAM_BLOCKED'));
  w.outputs.push({ id: 'final', type: 'video', source: { nodeId: 'off', portId: 'output' } });
  assert.ok(has(assessWorkflowReadiness(w, options(w)), 'WORKFLOW_OUTPUT_INACTIVE'));
});
test('explicit optional inactivity and output reachability remain distinct', () => {
  const w = doc([node('a'), node('extra')]); w.nodes[1].executionPolicy = { optional: true };
  w.outputs.push({ id: 'result', type: 'video', source: { nodeId: 'a', portId: 'output' } });
  let r = assessWorkflowReadiness(w, options(w));
  assert.ok(has(r, 'NODE_OUTSIDE_OUTPUT_PATH')); assert.equal(r.nodes.extra.active, true);
  r = assessWorkflowReadiness(w, { ...options(w), nodeStates: { extra: { active: false } } });
  assert.equal(r.nodes.extra.status, 'INACTIVE'); assert.equal(r.status, 'READY');
});
test('asset blockers propagate through graph AND embedded dependencies', () => {
  const w = doc([node('a'), node('b'), node('c')]); w.nodes[0].assetRefs = ['logo'];
  w.assets.push({ id: 'logo', type: 'image', localPath: 'assets/logo.png' });
  w.edges.push(edge('a', 'b')); w.nodes[2].parameters.clip = '{{ b.outputs[0].value }}';
  const r = assessWorkflowReadiness(w, { ...options(w), assets: [] });
  assert.equal(r.summary.blocked, 3); assert.ok(r.nodes.c.reasons.some(e => e.code === 'UPSTREAM_BLOCKED'));
});
test('active cycles are invalid; disabled optional cycle is inactive', () => {
  const w = doc([node('a'), node('b')]); w.edges = [edge('a', 'b'), edge('b', 'a')];
  assert.equal(assessWorkflowReadiness(w, options(w)).status, 'INVALID');
  w.nodes.forEach(n => { n.enabled = false; n.executionPolicy = { optional: true }; });
  assert.equal(assessWorkflowReadiness(w, options(w)).status, 'READY');
});
test('required workflow and port input values must be supplied and typed', () => {
  const w = doc(); w.nodes[0].inputs[0].required = true;
  assert.ok(has(assessWorkflowReadiness(w, options(w)), 'REQUIRED_INPUT_MISSING'));
  w.inputs.push({ id: 'clip', type: 'video', required: true, targets: [{ nodeId: 'a', portId: 'input' }] });
  assert.ok(has(assessWorkflowReadiness(w, options(w)), 'WORKFLOW_INPUT_MISSING'));
  assert.equal(assessWorkflowReadiness(w, { ...options(w), inputs: { clip: 'assets/source.mp4' } }).status, 'READY');
  assert.ok(has(assessWorkflowReadiness(w, { ...options(w), inputs: { clip: false } }), 'WORKFLOW_INPUT_MISSING'));
});
test('asset workflow input requires a declared/present asset identity', () => {
  const w = doc(); w.nodes[0].inputs[0].type = 'asset';
  w.inputs.push({ id: 'logo', type: 'asset', required: true, default: 'logo', targets: [{ nodeId: 'a', portId: 'input' }] });
  assert.ok(has(assessWorkflowReadiness(w, { ...options(w), assets: [] }), 'ASSET_MISSING'));
});
test('known current quotes aggregate without float sum noise', () => {
  const w = doc([node('a', 'remote-model'), node('b', 'remote-model')]);
  const r = assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, [quote('a', 0.1), quote('b', 0.2)]) });
  assert.equal(r.status, 'READY'); assert.equal(r.cost.knownSubtotal, 0.3); assert.equal(r.cost.totals[0].exactAmount, '0.3');
  assert.deepEqual(r.cost.quotedNodeIds, ['a', 'b']);
});
test('missing quote is unknown, never a zero-cost production', () => {
  const r = priced([]); assert.equal(r.status, 'CONDITIONALLY_READY'); assert.equal(r.nodes.a.cost.status, 'MISSING');
  assert.deepEqual(r.cost.unknownNodeIds, ['a']); assert.deepEqual(r.cost.zeroCostNodeIds, []);
});
test('stale, expired and future quotes are excluded from known subtotal', () => {
  for (const extras of [{ quotedAt: '2026-10-22T16:00:00Z' }, { expiresAt: time }, { quotedAt: '2026-10-23T17:00:00Z' }]) {
    const r = priced([quote('a', 0.3, extras)]);
    assert.equal(r.nodes.a.cost.status, 'STALE'); assert.equal(r.cost.knownSubtotal, 0); assert.deepEqual(r.cost.staleNodeIds, ['a']);
  }
});
test('workflow changes or provider/model mismatch invalidate supplied quotes', () => {
  const w = doc([node('a', 'remote-model')]), ctx = options(w); ctx.quoteContext = quotes(w, [quote()]);
  w.nodes[0].parameters.duration = 10;
  assert.equal(assessWorkflowReadiness(w, ctx).nodes.a.cost.status, 'STALE');
  assert.equal(priced([quote('a', 0.3, { model: 'different' })]).nodes.a.cost.status, 'STALE');
});
test('explicit zero quote and no-money executor are the only zero-cost declarations', () => {
  assert.deepEqual(priced([quote('a', 0)]).cost.zeroCostNodeIds, ['a']);
  assert.equal(assessWorkflowReadiness(doc(), options(doc())).nodes.a.cost.status, 'NOT_REQUIRED');
  const w = doc(); const r = assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, [quote('a', 2)]) });
  assert.equal(r.cost.knownSubtotal, 2, 'A supplied positive quote overrides a no-money declaration');
});
test('below/equal/above spending limit use exact decimal comparisons', () => {
  for (const [limit, expected] of [[1, 'WITHIN_BUDGET'], [0.3, 'WITHIN_BUDGET'], [0.29, 'OVER_BUDGET']]) {
    const r = priced([quote()], { budget: { maximumSpend: limit, currency: 'USD' } });
    assert.equal(r.cost.budgetStatus, expected); assert.equal(r.status, expected === 'OVER_BUDGET' ? 'BLOCKED' : 'READY');
  }
});
test('known subtotal under limit plus unquoted node is BUDGET_UNKNOWN and BLOCKED', () => {
  const w = doc([node('a', 'remote-model'), node('b', 'remote-model')]);
  const r = assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, [quote('a', 0.93)]), budget: { maximumSpend: 2, currency: 'USD' } });
  assert.equal(r.cost.knownSubtotal, 0.93); assert.equal(r.cost.budgetStatus, 'BUDGET_UNKNOWN'); assert.equal(r.status, 'BLOCKED');
  assert.ok(has(r, 'BUDGET_UNCERTAIN'));
});
test('stale costs cannot prove a budget and known overage still proves OVER_BUDGET', () => {
  const r = priced([quote('a', 0.1, { quotedAt: '2020-01-01T00:00:00Z' })], { budget: { maximumSpend: 10, currency: 'USD' } });
  assert.equal(r.cost.budgetStatus, 'BUDGET_UNKNOWN');
  const w = doc([node('a', 'remote-model'), node('b', 'remote-model')]);
  assert.equal(assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, [quote('a', 3)]), budget: { maximumSpend: 2, currency: 'USD' } }).cost.budgetStatus, 'OVER_BUDGET');
});
test('mixed or mismatching currencies never become a single misleading total', () => {
  const w = doc([node('a', 'remote-model'), node('b', 'remote-model')]);
  const r = assessWorkflowReadiness(w, { ...options(w), quoteContext: quotes(w, [quote(), quote('b', 1, { currency: 'EUR' })]), budget: { maximumSpend: 10, currency: 'USD' } });
  assert.equal(r.cost.knownSubtotal, null); assert.equal(r.cost.currency, null); assert.equal(r.cost.totals.length, 2); assert.equal(r.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.equal(priced([quote('a', 1, { currency: 'EUR' })], { budget: { maximumSpend: 10, currency: 'USD' } }).cost.budgetStatus, 'BUDGET_UNKNOWN');
});
test('Director proof reports assets, unavailable assembly, manual waiting and uncertain budget together', () => {
  const w = JSON.parse(readFileSync(new URL('../fixtures/director-readiness.json', import.meta.url)));
  assert.equal(validateWorkflow(w).valid, true);
  const ctx = options(w); ctx.executors = ctx.executors.filter((e, i, all) => all.findIndex(a => JSON.stringify(a) === JSON.stringify(e)) === i);
  ctx.executors.find(e => e.tool === 'whihm.video-combiner').available = false;
  Object.assign(ctx, { assets: [{ id: 'logo', present: false }, { id: 'music', present: true }], quoteContext: quotes(w, [quote('image', 0.03), quote('reference_edit', 0.1), quote('video_a', 0.4), quote('premium', 3)]), budget: { maximumSpend: 2, currency: 'USD' } });
  const r = assessWorkflowReadiness(w, ctx);
  assert.equal(r.status, 'BLOCKED'); assert.deepEqual(r.manualGates, ['storyboard']); assert.equal(r.nodes.video_a.status, 'WAITING_MANUAL');
  assert.equal(r.summary.disabledOptional, 2); assert.ok(has(r, 'ASSET_MISSING')); assert.ok(has(r, 'UTILITY_UNAVAILABLE'));
  assert.equal(r.cost.knownSubtotal, 0.53); assert.deepEqual(r.cost.unknownNodeIds, ['video_b']);
  assert.equal(r.cost.excluded.totals[0].amount, 3); assert.equal(r.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.deepEqual(assessWorkflowReadiness(w, ctx), r); assert.equal(exportWorkflow(w).includes('quotedAt'), false);
});
test('context is strict, JSON/secret safe and never echoes forbidden values', () => {
  const w = doc();
  for (const patch of [
    { evaluatedAt: undefined }, { budget: { maximumSpend: -1, currency: 'USD' } },
    { budget: { maximumSpend: 1e-13, currency: 'USD' } }, { assets: [{ id: 'a', present: 'yes' }] },
    { nodeStates: { a: { active: false } } }, { inputs: { nonexistent: 'x' } },
    { quoteContext: quotes(w, [quote(), quote()]) }, { quotePolicy: { maxAgeMs: 0 } },
    { apiKey: 'sk-live-abcdefghijklmnop' },
  ]) {
    const r = assessWorkflowReadiness(w, { ...options(w), ...patch });
    assert.equal(r.status, 'BLOCKED'); assert.ok(has(r, 'READINESS_CONTEXT_INVALID')); assert.ok(!JSON.stringify(r).includes('sk-live-abcdefghijklmnop'));
  }
});
test('quote timestamps and supplied freshness policy have exact boundaries', () => {
  assert.equal(priced([quote()], { quotePolicy: { maxAgeMs: 3600000 } }).nodes.a.cost.status, 'STALE');
  assert.equal(priced([quote()], { quotePolicy: { maxAgeMs: 3600001 } }).nodes.a.cost.status, 'CURRENT');
});
test('formatting/key order does not invalidate canonical quote bindings or change reports', () => {
  const w = doc([node('a', 'remote-model')]), ctx = { ...options(w), quoteContext: quotes(w, [quote()]) };
  const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(w).reverse())));
  assert.deepEqual(assessWorkflowReadiness(w, ctx), assessWorkflowReadiness(reordered, ctx));
});

test('per-entry null evidence preserves mixed known and unknown availability', () => {
  const w = doc([node('a'), node('b', 'local-ai')]);
  const ctx = options(w); ctx.executors.find(e => e.type === 'local-ai').available = null;
  const r = assessWorkflowReadiness(w, ctx);
  assert.equal(r.nodes.a.status, 'EXECUTABLE'); assert.equal(r.nodes.b.status, 'UNVERIFIED');
  assert.equal(r.status, 'CONDITIONALLY_READY'); assert.ok(has(r, 'EXECUTOR_UNVERIFIED'));
});
test('per-asset null means unverified, not missing, alongside verified project assets', () => {
  const w = doc(); w.assets = [{ id: 'logo', type: 'image', localPath: 'assets/logo.png' }, { id: 'music', type: 'audio', remoteUrl: 'https://example.com/music.wav' }];
  w.nodes[0].assetRefs = ['logo', 'music'];
  const r = assessWorkflowReadiness(w, { ...options(w), assets: [{ id: 'logo', present: true }, { id: 'music', present: null }] });
  assert.equal(r.status, 'CONDITIONALLY_READY'); assert.ok(has(r, 'ASSET_UNVERIFIED')); assert.ok(!has(r, 'ASSET_MISSING'));
});

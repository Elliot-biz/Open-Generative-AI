import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject, validateWorkflow } from 'whihm-workflow-core';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime } from '../lib/whihm-execution/runtime.mjs';

const make = (overrides = {}) => ({ ...createWorkflow({ workflowId: 'job', name: 'Job' }), nodes: [{
  id: 'image', title: 'My custom title', kind: 'image-generation', inputs: [], outputs: [{ id: 'result', type: 'image' }],
  parameters: { prompt: 'A jacket', aspect_ratio: '1:1' }, executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model: 'nano-banana', mayCostMoney: true, requiresConfirmation: true }, metadata: { oga: { mode: 't2i' } }, ...overrides,
}] });
function harness(result = { status: 'completed', request_id: 'job_1', outputs: ['https://example.com/output.png'], cost: { amount_credits: 1 } }) {
  const calls = [];
  const runtime = { localAvailable: () => true, canUpload: () => true,
    remote: async (...args) => { calls.push(args); return result; },
    local: async (...args) => { calls.push(args); return { url: 'data:image/png;base64,AA==' }; },
    upload: async (...args) => { calls.push(['upload', ...args]); return 'https://example.com/upload.png'; },
  };
  return { calls, runtime, bridge: createExecutionBridge({ runtime }) };
}
const request = workflow => ({ workflow, nodeId: 'image' });
const execute = (bridge, workflow) => bridge.execute(request(workflow), { allowExecution: true });
test('canonical node uses existing studio method without mutating identity, title or parameters', async () => {
  const { calls, bridge } = harness(), workflow = make(), before = structuredClone(workflow);
  assert.equal(validateWorkflow(workflow).valid, true);
  const result = await execute(bridge, workflow);
  assert.equal(result.status, 'succeeded'); assert.equal(result.requestId, 'job_1'); assert.equal(result.cost.amount_credits, 1);
  assert.deepEqual(calls, [['generateImage', { prompt: 'A jacket', aspect_ratio: '1:1', model: 'nano-banana' }]]);
  assert.deepEqual(workflow, before); assert.equal(result.outputs[0].mediaType, 'image');
});
test('dry run never calls authentication, upload or submission and defaults execution to denied', async () => {
  let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey() { auth++; throw Error('not allowed'); } }) });
  const plan = await bridge.plan(request(make()));
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.generateImage'); assert.equal(plan.provider, 'muapi');
  assert.equal(plan.model, 'nano-banana'); assert.equal(plan.estimatedCost, null); assert.equal(auth, 0);
  assert.equal((await bridge.execute(request(make()))).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
});
test('binding invokes existing-compatible functions with credential kept out of bridge output', async () => {
  const observed = [];
  const runtime = createApplicationRuntime({ getApiKey: () => 'test-only-placeholder', remote: {
    async generateImage(key, params) { observed.push([key, params]); return { url: 'https://example.com/a.png' }; },
  } });
  const result = await execute(createExecutionBridge({ runtime }), make());
  assert.equal(result.status, 'succeeded'); assert.equal(observed[0][0], 'test-only-placeholder');
  assert.ok(!JSON.stringify(result).includes('test-only-placeholder'));
});
for (const [label, overrides, code] of [
  ['missing prompt', { parameters: {} }, 'CAPABILITY_INPUT_INVALID'],
  ['invalid aspect', { parameters: { prompt: 'test', aspect_ratio: 'impossible' } }, 'CAPABILITY_ENUM_INVALID'],
  ['wrong type', { parameters: { prompt: 55 } }, 'CAPABILITY_INPUT_INVALID'],
  ['unsupported media', { parameters: { prompt: 'test', video_url: 'https://example.com/a.mp4' } }, 'MEDIA_CAPABILITY_INVALID'],
  ['disabled', { enabled: false }, 'NODE_UNAVAILABLE'],
  ['secret', { parameters: { apiKey: 'test-only' } }, 'WORKFLOW_INVALID'],
]) test(`reject ${label} before submission`, async () => {
  const { bridge, calls } = harness(); const result = await execute(bridge, make(overrides));
  assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, code); assert.equal(calls.length, 0);
});
test('upstream thrown error is normalized without echoing error message', async () => {
  const { runtime } = harness(); runtime.remote = async () => { throw Object.assign(new Error('credential should never be echoed'), { requestId: 'request_1', generationResult: { status: 'failed', cost: { refunded: true }, apiKey: 'sensitive' } }); };
  const result = await execute(createExecutionBridge({ runtime }), make());
  assert.equal(result.status, 'failed'); assert.equal(result.requestId, 'request_1'); assert.equal(result.upstream.cost.refunded, true);
  assert.ok(!JSON.stringify(result).includes('sensitive')); assert.ok(!JSON.stringify(result).includes('credential should'));
});
for (const status of ['queued', 'running', 'cancelled', 'failed']) test(`preserves upstream lifecycle ${status}`, async () => {
  const { bridge } = harness({ status, request_id: 'r' }); assert.equal((await execute(bridge, make())).status, status);
});
test('signed output URLs are redacted, not exposed as portable metadata', async () => {
  const { bridge } = harness({ url: 'https://example.com/a?token=private' });
  assert.ok(!JSON.stringify(await execute(bridge, make())).includes('private'));
});
test('project assets resolve through project API; paths remain transient and upload uses existing boundary', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-project-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'fixture.txt'); await fs.writeFile(source, 'Small harmless fixture');
  const created = await createProject(path.join(root, 'project'), { title: 'Test' });
  const imported = await created.project.importAsset({ sourcePath: source, assetId: 'reference' });
  assert.equal(imported.status, 'imported');
  const workflow = make({ executor: { ...make().nodes[0].executor, model: 'ai-image-upscaler' }, parameters: {}, metadata: { oga: { mode: 'i2i' } }, inputs: [{ id: 'image_url', type: 'image' }], assetRefs: ['reference'] });
  workflow.assets.push({ id: 'reference', type: 'file', localPath: imported.asset.path });
  assert.equal((await created.project.addWorkflowToProject(workflow)).status, 'added');
  const before = JSON.stringify(workflow), manifest = JSON.stringify((await created.project.getManifest()).manifest);
  const { bridge, calls } = harness(); const args = { ...request(workflow), project: created.project, assetBindings: { image_url: 'reference' } };
  const plan = await bridge.plan(args); assert.equal(plan.status, 'planned'); assert.equal(calls.length, 0); assert.ok(!JSON.stringify(plan).includes(root));
  assert.equal((await bridge.execute(args, { allowExecution: true })).status, 'succeeded');
  assert.equal(calls[0][0], 'upload'); assert.ok(calls[0][1].resolvedPath.startsWith(root)); assert.equal(calls[1][1].image_url, 'https://example.com/upload.png');
  assert.equal(JSON.stringify(workflow), before); assert.equal(JSON.stringify((await created.project.getManifest()).manifest), manifest);
});
test('resolved typed input reaches runtime, unknown inputs and conflicts fail', async () => {
  const { bridge, calls } = harness(), workflow = make({ parameters: {}, inputs: [{ id: 'prompt', type: 'text', required: true }] });
  assert.equal((await bridge.execute({ ...request(workflow), inputs: { prompt: 'Resolved brief' } }, { allowExecution: true })).status, 'succeeded');
  assert.equal(calls[0][1].prompt, 'Resolved brief');
  assert.equal((await bridge.plan({ ...request(workflow), inputs: { missing: 'x' } })).diagnostics[0].code, 'INPUT_PORT_NOT_FOUND');
});
test('local client selected without executing a model; unavailable desktop fails closed', async () => {
  const workflow = make({ executor: { type: 'local-ai', id: 'local', provider: 'sdcpp', model: 'z-image-turbo', mayCostMoney: false, requiresConfirmation: false } });
  const { runtime, calls, bridge } = harness(); assert.equal((await bridge.plan(request(workflow))).runtime, 'localAI.generate'); assert.equal(calls.length, 0);
  assert.equal((await execute(bridge, workflow)).status, 'succeeded'); assert.equal(calls[0][0].model, 'z-image-turbo');
  runtime.localAvailable = () => false;
  assert.equal((await bridge.plan(request(workflow))).diagnostics[0].code, 'LOCAL_RUNTIME_UNAVAILABLE');
});
test('utility boundary has no MuAPI assumptions', async () => {
  const workflow = make({ executor: { type: 'utility', id: 'whihm', tool: 'test.identity', mayCostMoney: false, requiresConfirmation: false }, parameters: { value: 3 } });
  const { runtime, calls } = harness();
  const bridge = createExecutionBridge({ runtime, utility: { tool: 'test.identity', validate: p => typeof p.value === 'number', run: async p => ({ status: 'succeeded', outputs: [p.value] }) } });
  const result = await execute(bridge, workflow); assert.equal(result.status, 'succeeded'); assert.equal(result.outputs[0].value, 3); assert.equal(calls.length, 0);
});
test('audio endpoint identity remains separate from audio model-version parameter', async () => {
  const { bridge, calls } = harness(); const workflow = make({ executor: { ...make().nodes[0].executor, model: 'suno-create-music' }, metadata: { oga: { mode: 'audio' } }, parameters: { style: 'Jazz', model: 'V5' } });
  assert.equal((await execute(bridge, workflow)).status, 'succeeded'); assert.equal(calls[0][0], 'generateAudio'); assert.equal(calls[0][1]._modelId, 'suno-create-music'); assert.equal(calls[0][1].model, 'V5');
});
test('actual studio generation function runs behind fake fetch with no network and preserves submission payload', async t => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ url: 'https://example.com/fake.png' }) }; };
  t.after(() => { globalThis.fetch = original; });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => 'fixture-only' }) });
  const result = await execute(bridge, make());
  assert.equal(result.status, 'succeeded'); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.muapi.ai/api/v1/nano-banana'); assert.equal(calls[0].body.prompt, 'A jacket');
});
test('actual existing local client uses preload generate boundary with fake window only', async t => {
  const original = globalThis.window; const calls = [];
  globalThis.window = { localAI: { isElectron: true, generate: async params => { calls.push(params); return { url: 'data:image/png;base64,AA==' }; } } };
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });
  const workflow = make({ executor: { type: 'local-ai', id: 'local', provider: 'sdcpp', model: 'z-image-turbo', mayCostMoney: false, requiresConfirmation: false } });
  assert.equal((await execute(createExecutionBridge(), workflow)).status, 'succeeded'); assert.equal(calls[0].model, 'z-image-turbo');
});
test('unresolved embedded dependencies cannot accidentally reach the generation service', async () => {
  const workflow = make(); workflow.nodes[0].parameters.prompt = '{{ image.outputs[0].value }}';
  const { bridge, calls } = harness(); const result = await bridge.plan(request(workflow));
  assert.equal(result.status, 'rejected'); assert.equal(calls.length, 0);
});
test('upload binding reuses upstream uploader with host File loader and does not store credential', async () => {
  const file = { name: 'fixture.png' }, calls = [];
  const runtime = createApplicationRuntime({ getApiKey: () => 'fixture-only', fileFromPath: async () => file, remote: {
    uploadFile: async (key, data) => { calls.push([key, data]); return 'https://example.com/asset.png'; },
  } });
  assert.equal(await runtime.upload({ resolvedPath: '/transient/test' }), 'https://example.com/asset.png');
  assert.deepEqual(calls, [['fixture-only', file]]);
});
test('actual shared submit-and-poll lifecycle retains job ID and cost using fake fetch', async t => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, method: options.method }); return { ok: true, json: async () => calls.length === 1 ? { request_id: 'mock_job' } : { status: 'completed', outputs: ['https://example.com/result.png'], cost: { amount_credits: 2 } } }; };
  t.after(() => { globalThis.fetch = original; });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => 'fixture-only' }) });
  const result = await execute(bridge, make());
  assert.equal(result.status, 'succeeded'); assert.equal(result.requestId, 'mock_job'); assert.equal(result.cost.amount_credits, 2);
  assert.equal(calls.length, 2); assert.equal(calls[1].url, 'https://api.muapi.ai/api/v1/predictions/mock_job/result');
});
test('actual upstream HTTP errors produce sanitized bridge failure', async t => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => 'Never echo secret diagnostic' });
  t.after(() => { globalThis.fetch = original; });
  const result = await execute(createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => 'fixture-only' }) }), make());
  assert.equal(result.status, 'failed'); assert.equal(result.diagnostics[0].code, 'UPSTREAM_ERROR'); assert.ok(!JSON.stringify(result).includes('Never echo'));
});
test('unknown models/providers, absent utility and input conflicts reject without dispatch', async () => {
  const { bridge, calls } = harness();
  for (const executor of [
    { ...make().nodes[0].executor, model: 'not-a-real-model' },
    { ...make().nodes[0].executor, provider: 'other' },
    { type: 'utility', id: 'tool', tool: 'missing', mayCostMoney: false, requiresConfirmation: false },
  ]) assert.equal((await execute(bridge, make({ executor }))).status, 'rejected');
  assert.equal((await bridge.plan({ ...request(make({ inputs: [{ id: 'prompt', type: 'text' }] })), inputs: { prompt: 'Conflicting' } })).diagnostics[0].code, 'INPUT_CONFLICT');
  assert.equal(calls.length, 0);
});

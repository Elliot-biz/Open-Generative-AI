import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processRecast, generateI2V } from '../packages/studio/src/muapi.js';
import { buildRecastRequest } from '../packages/studio/src/recastInputContracts.js';
import { getI2VModelById } from '../packages/studio/src/models.js';
import { mapReferenceParams } from '../packages/studio/src/modelCapabilities.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const key = 'test-recast-placeholder';
const image = 'https://example.com/character.png', video = 'https://example.com/performance.mp4';
const base = { image_url: image, video_url: video };
const cases = [
  { model: 'kling-v3.0-pro-recast', endpoint: 'kling-v3.0-pro-motion-control',
    options: { prompt: 'Follow the performance', character_orientation: 'video', keep_original_sound: false },
    payload: { ...base, prompt: 'Follow the performance', character_orientation: 'video', keep_original_sound: false } },
  { model: 'runway-act-two-recast', endpoint: 'runway-act-two-i2v', options: { aspect_ratio: '9:16' },
    payload: { image_url: image, reference_video_url: video, aspect_ratio: '9:16' } },
  { model: 'wan2.2-animate-recast', endpoint: 'wan2.2-animate', options: { mode: 'replace', resolution: '720p', prompt: 'Replace the performer' },
    payload: { ...base, mode: 'replace', resolution: '720p', prompt: 'Replace the performer' } },
];
function fakeTransport(t, { poll = false } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const request = { url, ...init, payload: init.body ? JSON.parse(init.body) : null };
    calls.push(request);
    // Every response is local test data. No original fetch is ever called.
    return { ok: true, json: async () => poll && init.method === 'POST'
      ? { request_id: 'recast-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4' } };
  });
  return calls;
}
function workflow(model, parameters = base, mode = 'recast') {
  return createWorkflow({ workflowId: 'recast_job', name: 'Recast job', nodes: [{
    id: 'performer', title: 'Custom performer title', kind: 'character-recast',
    inputs: [], outputs: [{ id: 'result', type: 'video' }], parameters: structuredClone(parameters),
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode } },
  }] });
}

for (const c of cases) {
  test(`shared ${c.model} submits the exact provider contract and preserves the caller`, async t => {
    const calls = fakeTransport(t), params = { ...base, model: c.model, ...c.options }, before = structuredClone(params);
    const result = await processRecast(key, params);
    assert.equal(calls.length, 1); assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${c.endpoint}`);
    assert.equal(calls[0].headers['x-api-key'], key); assert.deepEqual(calls[0].payload, c.payload);
    assert.deepEqual(params, before); assert.equal(result.url, 'https://example.com/result.mp4');
  });
  test(`desktop/application ${c.model} delegates to the shared service without option loss`, async t => {
    const calls = fakeTransport(t), client = new MuapiClient(); client.getKey = () => key;
    const params = { ...base, model: c.model, ...c.options };
    const shared = await processRecast(key, params), application = await client.processRecast(params);
    assert.deepEqual(application, shared); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[1].payload, c.payload);
  });
  test(`canonical ${c.model} plans without auth/transport and executes via shared processRecast`, async t => {
    const calls = fakeTransport(t); let auth = 0;
    const runtime = createApplicationRuntime({ getApiKey: () => { auth++; return key; } });
    const bridge = createExecutionBridge({ runtime }), w = workflow(c.model, { ...base, ...c.options }), before = structuredClone(w);
    const request = { workflow: w, nodeId: 'performer' }, plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processRecast');
    assert.equal(plan.model, c.model); assert.equal(plan.provider, 'muapi'); assert.equal(plan.request.endpoint, c.endpoint);
    assert.deepEqual(plan.request.upstreamParameterKeys, Object.keys(c.payload).sort());
    assert.equal(plan.request.requiredMedia.length, 2); assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    const result = await bridge.execute(request, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.model, c.model); assert.equal(result.nodeId, 'performer');
    assert.deepEqual(calls[0].payload, c.payload); assert.deepEqual(w, before); assert.equal(auth, 1);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
  for (const field of ['video_url', 'image_url']) test(`${c.model} rejects missing ${field} before any transport`, async t => {
    const calls = fakeTransport(t), params = { ...base, ...c.options, model: c.model }; delete params[field];
    const code = field === 'video_url' ? 'RECAST_VIDEO_REQUIRED' : 'RECAST_IMAGE_REQUIRED';
    await assert.rejects(processRecast(key, params), { code });
    const bridge = createExecutionBridge();
    const w = workflow(c.model, Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'model')));
    const result = await bridge.plan({ workflow: w, nodeId: 'performer' });
    assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, code);
    assert.equal(result.diagnostics[0].path, field); assert.equal(calls.length, 0);
  });
  test(`readiness discovers ${c.model} through the existing binding resolver`, async t => {
    const calls = fakeTransport(t), w = workflow(c.model, { ...base, ...c.options });
    const result = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T12:00:00Z' });
    assert.equal(result.status, 'built'); assert.equal(result.context.executors[0].available, true);
    assert.equal(result.provenance.executors.performer.runtime, 'studio.processRecast'); assert.equal(calls.length, 0);
  });
}
for (const mode of ['animate', 'replace', undefined]) test(`Wan explicitly forwards ${mode ?? 'default animate'}`, async t => {
  const calls = fakeTransport(t), params = { ...base, model: 'wan2.2-animate-recast', ...(mode === undefined ? {} : { mode }) };
  await processRecast(key, params); assert.equal(calls[0].payload.mode, mode ?? 'animate');
  const bridge = createExecutionBridge();
  const plan = await bridge.plan({ workflow: workflow(params.model, { ...base, ...(mode === undefined ? {} : { mode }) }), nodeId: 'performer' });
  assert.equal(plan.request.effectiveOptions.mode, mode ?? 'animate');
});
for (const [model, options, code] of [
  ['unknown-recast', {}, 'RECAST_MODEL_UNSUPPORTED'],
  ['wan2.2-animate-recast', { mode: 'swap-everything' }, 'RECAST_OPTION_INVALID'],
  ['wan2.2-animate-recast', { mode: null }, 'RECAST_OPTION_INVALID'],
  ['wan2.2-animate-recast', { resolution: '4k' }, 'RECAST_OPTION_INVALID'],
  ['kling-v3.0-pro-recast', { character_orientation: 'camera' }, 'RECAST_OPTION_INVALID'],
  ['kling-v3.0-pro-recast', { keep_original_sound: 'yes' }, 'RECAST_OPTION_INVALID'],
  ['kling-v3.0-pro-recast', { duration: 45 }, 'RECAST_OPTION_UNSUPPORTED'],
  ['runway-act-two-recast', { prompt: 'Not supported' }, 'RECAST_OPTION_UNSUPPORTED'],
  ['runway-act-two-recast', { reference_video_url: 'https://example.com/other.mp4' }, 'RECAST_INPUT_CONFLICT'],
]) test(`reject unsupported ${model} options ${JSON.stringify(options)}`, async t => {
  const calls = fakeTransport(t);
  await assert.rejects(processRecast(key, { ...base, model, ...options }), { code });
  const result = await createExecutionBridge().plan({ workflow: workflow(model, { ...base, ...options }), nodeId: 'performer' });
  assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, model === 'unknown-recast' ? 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS' : code);
  assert.equal(calls.length, 0);
});
test('Kling retains existing payload when new options are omitted', async t => {
  const calls = fakeTransport(t); await processRecast(key, { ...base, model: cases[0].model });
  assert.deepEqual(calls[0].payload, base);
});
test('Act Two accepts an explicit reference field, without emitting video_url', async t => {
  const calls = fakeTransport(t);
  await processRecast(key, { model: cases[1].model, image_url: image, reference_video_url: video });
  assert.deepEqual(calls[0].payload, { image_url: image, reference_video_url: video });
});
test('exact Act Two I2V metadata and service retain the driving video and enforce it', async t => {
  const calls = fakeTransport(t), model = getI2VModelById('runway-act-two-i2v');
  assert.equal(model.videoField, 'reference_video_url');
  assert.equal(mapReferenceParams(model, base).reference_video_url, video);
  for (const input of [{ video_url: video }, { reference_video_url: video }]) {
    const params = { model: model.id, image_url: image, ...input, aspect_ratio: '16:9' };
    await generateI2V(key, params);
    assert.deepEqual(calls.at(-1).payload, { image_url: image, reference_video_url: video, aspect_ratio: '16:9' });
    const plan = await createExecutionBridge().plan({ workflow: workflow(model.id, { image_url: image, ...input }, 'i2v'), nodeId: 'performer' });
    assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.generateI2V');
  }
  const count = calls.length;
  await assert.rejects(generateI2V(key, { model: model.id, image_url: image }), { code: 'RECAST_VIDEO_REQUIRED' });
  assert.equal(calls.length, count);
});
test('existing polling and request callback remain authoritative', async t => {
  const calls = fakeTransport(t, { poll: true }), ids = [];
  const result = await processRecast(key, { ...base, model: cases[0].model, onRequestId: id => ids.push(id) });
  assert.deepEqual(ids, ['recast-job']); assert.equal(result.request_id, 'recast-job');
  assert.equal(calls.length, 2); assert.equal(calls[1].url, 'https://api.muapi.ai/api/v1/predictions/recast-job/result');
});
test('project asset roles remain relative and planning never loads/uploads bytes', async t => {
  const calls = fakeTransport(t), w = workflow(cases[1].model, { aspect_ratio: '16:9' });
  w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }, { id: 'image_url', type: 'image' }];
  w.nodes[0].assetRefs = ['driver', 'character'];
  w.assets = [{ id: 'driver', type: 'video', localPath: 'assets/driver.mp4' }, { id: 'character', type: 'image', localPath: 'assets/character.png' }];
  const original = structuredClone(w), uploads = [];
  const project = { async resolveProjectAssetPath(id) { const a = w.assets.find(a => a.id === id); return { status: 'ok', relativePath: a.localPath, resolvedPath: `/transient/${a.localPath}` }; } };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key, fileFromPath: async (_path, asset) => { uploads.push(asset); return {}; },
    remote: { processRecast, async uploadFile() { return uploads.length === 1 ? video : image; } } }) });
  const request = { workflow: w, nodeId: 'performer', project, assetBindings: { video_url: 'driver', image_url: 'character' } };
  const plan = await bridge.plan(request);
  assert.equal(plan.status, 'planned'); assert.equal(uploads.length, 0); assert.equal(calls.length, 0);
  assert.ok(!JSON.stringify(plan).includes('/transient/')); assert.equal(plan.requiredUploads.length, 2);
  assert.equal((await bridge.execute(request, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(calls[0].payload, { image_url: image, reference_video_url: video, aspect_ratio: '16:9' });
  assert.deepEqual(w, original);
});
test('Recast preserves its narrow contract separately from reviewed V2V routing', () => {
  assert.equal(findRemote('runway-act-two-v2v').mode, 'v2v');
  assert.equal(findRemote('runway-act-two-i2v', 'v2v'), null);
  assert.throws(() => buildRecastRequest(null), { code: 'RECAST_REQUEST_INVALID' });
});

test('desktop exact Act Two I2V delegates the complete shared contract', async t => {
  const calls = fakeTransport(t), client = new MuapiClient(); client.getKey = () => key;
  const params = { ...base, model: 'runway-act-two-i2v', aspect_ratio: '9:16' };
  const shared = await generateI2V(key, params), application = await client.generateI2V(params);
  assert.deepEqual(shared, application); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[1].payload, { image_url: image, reference_video_url: video, aspect_ratio: '9:16' });
  await assert.rejects(client.generateI2V({ model: params.model, image_url: image }), { code: 'RECAST_VIDEO_REQUIRED' });
  assert.equal(calls.length, 2);
});

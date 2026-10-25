import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processV2V } from '../packages/studio/src/muapi.js';
import { buildV2VRequest, getV2VExecutionModel } from '../packages/studio/src/v2vInputContracts.js';
import { getSeedanceEndpointResolution } from '../packages/studio/src/seedanceModels.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const video = 'https://example.com/source.mp4', image = 'https://example.com/face.png';
const refs = ['https://example.com/b.png', 'https://example.com/a.png', 'https://example.com/b.png'];
const key = 'v2v-test-placeholder';
const cases = [
  ['runway-aleph-v2v', { prompt: 'Relight', aspect_ratio: '9:16' }],
  ['wan2.2-edit-video', { prompt: 'Restyle', resolution: '720p' }],
  ['seedance-2.5-video-edit', { prompt: 'Edit', images_list: refs, audios_list: ['https://example.com/audio.wav'],
    duration: 30, resolution: '4k', generate_audio: false, high_bitrate: true, seed: 42 }],
  ['runway-act-two-v2v', { reference_video_url: 'https://example.com/performance.mp4', aspect_ratio: '4:3' }],
  ['ai-video-face-swap', { image_url: image }],
  ['video-background-remover', {}],
  ['ai-video-upscaler', { resolution: '1080p', copy_audio: false }],
  ['topaz-video-upscale', { upscale_factor: 4 }],
  ['heygen-video-translate', { language: 'French' }],
];
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'v2v-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4', cost: 0.3 } };
  });
  return calls;
}
function workflow(model, parameters) {
  return createWorkflow({ workflowId: 'v2v_workflow', name: 'V2V', nodes: [{ id: 'edit', title: 'Independent title', kind: 'video-edit',
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'v2v' } }, parameters: structuredClone(parameters), inputs: [], outputs: [{ id: 'result', type: 'video' }],
  }] });
}
for (const [model, options] of cases) {
  test(`${model}: shared/application parity preserves declared inputs exactly`, async t => {
    const calls = fake(t), params = { model, video_url: video, ...options }, original = structuredClone(params);
    const shared = await processV2V(key, params), client = new MuapiClient(); client.getKey = () => key;
    assert.deepEqual(await client.processV2V(params), shared); assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${model}`);
    const payload = JSON.parse(calls[0].body);
    for (const [field, value] of Object.entries({ video_url: video, ...options })) assert.deepEqual(payload[field], value);
    assert.equal(Object.hasOwn(payload, 'model'), false); assert.deepEqual(params, original);
  });
  test(`${model}: canonical plan, authorization and shared execution retain identity`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(model, { video_url: video, ...options }), original = structuredClone(w), req = { workflow: w, nodeId: 'edit' };
    const plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processV2V');
    assert.equal(plan.request.endpoint, model); assert.ok(plan.request.requiredMedia.some(input => input.role === 'source-video'));
    assert.equal(plan.request.v2v.family, getV2VExecutionModel(model).family);
    assert.equal(plan.model, model); assert.equal(plan.provider, 'muapi'); assert.equal(plan.title, 'Independent title');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    const result = await bridge.execute(req, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.model, model); assert.equal(result.nodeId, 'edit');
    assert.equal(result.cost, 0.3); assert.deepEqual(w, original);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T12:00:00Z' });
    assert.equal(evidence.context.executors[0].available, true);
    assert.equal(evidence.provenance.executors.edit.runtime, 'studio.processV2V');
    assert.equal(calls.length, 1);
  });
}
const invalid = [
  ['runway-aleph-v2v', { prompt: 'Edit', image_url: image }, 'V2V_OPTION_UNSUPPORTED', 'image_url'],
  ['runway-aleph-v2v', {}, 'V2V_REQUIRED_INPUT_MISSING', 'prompt'],
  ['runway-aleph-v2v', { prompt: 'Edit', video_url: '' }, 'V2V_REQUIRED_INPUT_MISSING', 'video_url'],
  ['runway-act-two-v2v', {}, 'V2V_REQUIRED_INPUT_MISSING', 'reference_video_url'],
  ['ai-video-face-swap', {}, 'V2V_REQUIRED_INPUT_MISSING', 'image_url'],
  ['heygen-video-translate', { language: 'not-a-language' }, 'V2V_OPTION_INVALID', 'language'],
  ['heygen-video-translate', { duration: 5 }, 'V2V_OPTION_UNSUPPORTED', 'duration'],
  ['ai-video-upscaler', { resolution: '8k' }, 'V2V_OPTION_INVALID', 'resolution'],
  ['ai-video-upscaler', { copy_audio: 'false' }, 'V2V_OPTION_INVALID', 'copy_audio'],
  ['topaz-video-upscale', { upscale_factor: 3 }, 'V2V_OPTION_INVALID', 'upscale_factor'],
  ['video-background-remover', { prompt: 'Edit' }, 'V2V_OPTION_UNSUPPORTED', 'prompt'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', images_list: Array(31).fill(image) }, 'V2V_OPTION_INVALID', 'images_list'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', images_list: [null] }, 'V2V_OPTION_INVALID', 'images_list'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', images_list: image }, 'V2V_OPTION_INVALID', 'images_list'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', audios_list: Array(11).fill(video) }, 'V2V_OPTION_INVALID', 'audios_list'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', duration: 31 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', duration: 3 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', duration: 4.5 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', seed: 4294967296 }, 'V2V_OPTION_INVALID', 'seed'],
  ['seedance-2.5-video-edit', { prompt: 'Edit', aspect_ratio: '9:16' }, 'V2V_OPTION_UNSUPPORTED', 'aspect_ratio'],
  ['ai-video-upscaler', { options: { invented: true } }, 'V2V_OPTION_UNSUPPORTED', 'options.invented'],
  ['ai-video-upscaler', { resolution: '1080p', options: { resolution: '720p' } }, 'V2V_INPUT_CONFLICT', 'resolution'],
];
for (const [model, patch, code, path] of invalid) test(`${model}: reject ${JSON.stringify(patch)} without transport/auth`, async t => {
  const calls = fake(t); let auth = 0;
  await assert.rejects(processV2V(key, { model, video_url: video, ...patch }), { code, path });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const req = { workflow: workflow(model, { video_url: video, ...patch }), nodeId: 'edit' };
  for (const result of [await bridge.plan(req), await bridge.execute(req, { allowExecution: true })]) {
    assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, code); assert.equal(result.diagnostics[0].path, path);
  }
  assert.equal(calls.length, 0); assert.equal(auth, 0);
});
test('unknown/deferred/specialized models never gain generic canonical V2V access', async t => {
  const calls = fake(t);
  for (const model of ['unknown', 'kling-v3.0-pro-motion-control', 'wan2.2-animate', 'topaz-upscale-video-precision', 'happy-horse-1-video-edit', 'topaz-upscale-video-generative']) {
    assert.equal(findRemote(model, 'v2v'), null);
    assert.throws(() => buildV2VRequest({ model, video_url: video }), { code: 'V2V_MODEL_UNSUPPORTED' });
    const r = await createExecutionBridge().plan({ workflow: workflow(model, { video_url: video }), nodeId: 'edit' });
    assert.equal(r.diagnostics[0].code, 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS');
  }
  assert.equal(findRemote('kling-v3.0-pro-recast').mode, 'recast');
  assert.equal(findRemote('seedance-2.5-motion-control').mode, 'motion_control');
  assert.equal(calls.length, 0);
});
test('existing options envelope and defaults are explicit; no option loss or array coercion', async t => {
  const calls = fake(t);
  await processV2V(key, { model: 'ai-video-upscaler', video_url: video, options: { resolution: '4k', copy_audio: false } });
  assert.deepEqual(JSON.parse(calls[0].body), { video_url: video, resolution: '4k', copy_audio: false });
  const plan = await createExecutionBridge().plan({ workflow: workflow('heygen-video-translate', { video_url: video }), nodeId: 'edit' });
  assert.equal(plan.request.effectiveOptions.language, 'Hindi');
  assert.equal(getSeedanceEndpointResolution('seedance-2.5-video-edit'), undefined);
  assert.throws(() => buildV2VRequest({ model: 'seedance-2.5-video-edit', video_url: video, prompt: 'Edit', images_list: Array(2) }), { code: 'V2V_OPTION_INVALID' });
});
test('existing desktop single-image alias maps explicitly without merging references', async t => {
  const calls = fake(t), client = new MuapiClient(); client.getKey = () => key;
  await client.processV2V({ model: 'seedance-2.5-video-edit', video_url: video, prompt: 'Edit', image_url: image });
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.images_list, [image]); assert.equal(Object.hasOwn(payload, 'image_url'), false);
  assert.throws(() => buildV2VRequest({ model: 'seedance-2.5-video-edit', video_url: video, prompt: 'Edit', image_url: image, images_list: refs }),
    { code: 'V2V_INPUT_CONFLICT', path: 'images_list' });
});
test('existing polling, request callback and provider failure lifecycle are reused', async t => {
  const calls = fake(t, true), ids = [];
  const r = await processV2V(key, { model: 'wan2.2-edit-video', video_url: video, prompt: 'Edit', onRequestId: id => ids.push(id) });
  assert.deepEqual(ids, ['v2v-job']); assert.equal(r.request_id, 'v2v-job'); assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/predictions/v2v-job/result'));
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 400, text: async () => 'Invalid provider request' }));
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key }) });
  const failure = await bridge.execute({ workflow: workflow('wan2.2-edit-video', { video_url: video, prompt: 'Edit' }), nodeId: 'edit' }, { allowExecution: true });
  assert.equal(failure.status, 'failed'); assert.equal(failure.diagnostics[0].code, 'UPSTREAM_ERROR');
});
test('ordered project media arrays resolve transiently and use the existing upload boundary', async t => {
  const calls = fake(t), w = workflow('seedance-2.5-video-edit', { prompt: 'Edit', duration: 4 });
  w.assets = [{ id: 'driver', type: 'video', localPath: 'assets/source.mp4' },
    { id: 'a', type: 'image', localPath: 'assets/a.png' }, { id: 'b', type: 'image', localPath: 'assets/b.png' },
    { id: 'sound', type: 'audio', localPath: 'assets/sound.wav' }];
  w.nodes[0].assetRefs = w.assets.map(a => a.id);
  w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }, { id: 'images_list', type: 'image' }, { id: 'audios_list', type: 'audio' }];
  const before = structuredClone(w), loaded = [];
  const project = { async resolveProjectAssetPath(id) { const a = w.assets.find(a => a.id === id); return { status: 'ok', relativePath: a.localPath, resolvedPath: `/transient/${a.localPath}` }; } };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key,
    fileFromPath: async (_path, asset) => { loaded.push(asset.assetId); return asset.assetId; },
    remote: { processV2V, uploadFile: async (_key, id) => `https://example.com/${id}` } }) });
  const req = { workflow: w, nodeId: 'edit', project, assetBindings: { video_url: 'driver', images_list: ['b', 'a', 'b'], audios_list: ['sound'] } };
  const plan = await bridge.plan(req);
  assert.equal(plan.status, 'planned'); assert.equal(plan.requiredUploads.length, 5); assert.equal(loaded.length, 0); assert.equal(calls.length, 0);
  assert.equal(plan.request.v2v.media.find(m => m.field === 'images_list').count, 3);
  assert.ok(!JSON.stringify(plan).includes('/transient/'));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(JSON.parse(calls[0].body).images_list, ['b', 'a', 'b'].map(id => `https://example.com/${id}`));
  assert.deepEqual(JSON.parse(calls[0].body).audios_list, ['https://example.com/sound']); assert.deepEqual(w, before);
});

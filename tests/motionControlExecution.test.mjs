import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processMotionControl } from '../packages/studio/src/muapi.js';
import { buildMotionControlRequest } from '../packages/studio/src/motionControlInputContracts.js';
import { getMotionControlModelById } from '../packages/studio/src/models.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const primary = 'seedance-2.5-motion-control', basic = 'seedance-2-motion-control';
const video = 'https://example.com/motion.mp4';
const images = ['https://example.com/second.png', 'https://example.com/first.png'];
const key = 'motion-test-placeholder';
const base = { mode: 'motion_transfer', video_url: video, images_list: images };
const cases = [primary, basic].flatMap(model => ['motion_transfer', 'objects_swap'].map(mode => ({
  model, mode, options: { prompt: 'Brand-specific direction', duration: model === primary ? 30 : 15,
    aspect_ratio: '9:16', generate_audio: true, ...(model === primary ? { seed: 4294967295, high_bitrate: true } : { quality: 'basic' }) },
})));
const policy = mode => mode === 'objects_swap'
  ? 'Keep the rest of the scene as filmed, swap the characters, products, or clothes with the reference images.'
  : 'Extract motion from the reference video and rebuild the scene with the new characters and assets, preserving the original motion, choreography, and camera movements.';
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'motion-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4' } };
  });
  return calls;
}
function workflow(model = primary, parameters = base) {
  return createWorkflow({ workflowId: 'motion_workflow', name: 'Motion workflow', nodes: [{
    id: 'performance', title: 'A custom motion title', kind: 'motion-control', inputs: [], outputs: [{ id: 'result', type: 'video' }],
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'motion_control' } }, parameters: structuredClone(parameters),
  }] });
}
for (const c of cases) {
  test(`${c.model} ${c.mode} preserves ordered references, exact controls and existing policy`, async t => {
    const calls = fake(t), params = { ...base, ...c.options, model: c.model, mode: c.mode }, before = structuredClone(params);
    const shared = await processMotionControl(key, params), client = new MuapiClient(); client.getKey = () => key;
    assert.deepEqual(await client.processMotionControl(params), shared);
    assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${c.model}`);
    const payload = JSON.parse(calls[0].body);
    assert.deepEqual(payload, { ...Object.fromEntries(Object.entries(c.options).filter(([k]) => k !== 'prompt')),
      video_url: video, images_list: images, prompt: `${policy(c.mode)} Brand-specific direction` });
    assert.equal(Object.hasOwn(payload, 'mode'), false); // Intent is existing prompt policy, not a provider mode field.
    assert.deepEqual(params, before);
  });
  test(`${c.model} ${c.mode} canonical plan, auth and shared runtime work without identity changes`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(c.model, { ...base, ...c.options, mode: c.mode }), before = structuredClone(w), request = { workflow: w, nodeId: 'performance' };
    const plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processMotionControl');
    assert.equal(plan.model, c.model); assert.equal(plan.provider, 'muapi'); assert.equal(plan.request.endpoint, c.model);
    assert.equal(plan.request.motionControl.intentMode, c.mode); assert.equal(plan.request.motionControl.imageCount, 2);
    assert.equal(plan.request.motionControl.maximumImages, c.model === primary ? 30 : 9);
    assert.equal(plan.request.motionControl.maximumDuration, c.model === primary ? 30 : 15);
    assert.equal(plan.request.motionControl.duration, c.options.duration);
    assert.equal(plan.request.requiredMedia[0].role, 'source-motion');
    assert.deepEqual(plan.resolvedInputs.images_list, images); assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    const result = await bridge.execute(request, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.nodeId, 'performance'); assert.equal(result.model, c.model);
    assert.deepEqual(JSON.parse(calls[0].body).images_list, images); assert.deepEqual(w, before);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
  test(`${c.model} ${c.mode} readiness uses the existing binding evidence`, async t => {
    const calls = fake(t), w = workflow(c.model, { ...base, ...c.options, mode: c.mode });
    const result = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T12:00:00Z' });
    assert.equal(result.status, 'built'); assert.equal(result.context.executors[0].available, true);
    assert.equal(result.provenance.executors.performance.runtime, 'studio.processMotionControl'); assert.equal(calls.length, 0);
  });
}
for (const [model, count, duration] of [[primary, 30, 30], [basic, 9, 15], [primary, 1, 4], [basic, 1, 4]]) {
  test(`${model} preserves boundary count ${count} and duration ${duration}`, async t => {
    const calls = fake(t), refs = Array.from({ length: count }, (_, i) => `https://example.com/${count - i}.png`);
    await processMotionControl(key, { ...base, model, duration, images_list: refs });
    const payload = JSON.parse(calls[0].body); assert.deepEqual(payload.images_list, refs); assert.equal(payload.duration, duration);
  });
}
const invalid = [
  [primary, { mode: 'invented' }, 'MOTION_MODE_INVALID', 'mode'],
  [primary, { mode: undefined }, 'MOTION_MODE_INVALID', 'mode'],
  ['unknown-model', {}, 'MOTION_MODEL_UNSUPPORTED', 'model'],
  [primary, { video_url: '' }, 'MOTION_VIDEO_REQUIRED', 'video_url'],
  [primary, { image_url: images[0] }, 'MOTION_REFERENCE_CONFLICT', 'images_list'],
  [primary, { images_list: [] }, 'MOTION_REFERENCE_COUNT_INVALID', 'images_list'],
  [primary, { images_list: Array(31).fill(images[0]) }, 'MOTION_REFERENCE_COUNT_INVALID', 'images_list'],
  [basic, { images_list: Array(10).fill(images[0]) }, 'MOTION_REFERENCE_COUNT_INVALID', 'images_list'],
  [primary, { images_list: [images[0], null] }, 'MOTION_REFERENCE_INVALID', 'images_list'],
  [primary, { images_list: [''] }, 'MOTION_REFERENCE_INVALID', 'images_list'],
  [primary, { images_list: images[0] }, 'MOTION_REFERENCE_COUNT_INVALID', 'images_list'],
  [primary, { duration: 3 }, 'MOTION_DURATION_INVALID', 'duration'],
  [basic, { duration: 16 }, 'MOTION_DURATION_INVALID', 'duration'],
  [primary, { duration: 31 }, 'MOTION_DURATION_INVALID', 'duration'],
  [primary, { duration: 4.5 }, 'MOTION_DURATION_INVALID', 'duration'],
  [primary, { duration: '5' }, 'MOTION_DURATION_INVALID', 'duration'],
  [primary, { duration: null }, 'MOTION_DURATION_INVALID', 'duration'],
  [primary, { generate_audio: 'false' }, 'MOTION_OPTION_INVALID', 'generate_audio'],
  [primary, { high_bitrate: 1 }, 'MOTION_OPTION_INVALID', 'high_bitrate'],
  [primary, { seed: 4294967296 }, 'MOTION_OPTION_INVALID', 'seed'],
  [primary, { seed: 1.5 }, 'MOTION_OPTION_INVALID', 'seed'],
  [basic, { seed: 7 }, 'MOTION_OPTION_UNSUPPORTED', 'seed'],
  [basic, { high_bitrate: true }, 'MOTION_OPTION_UNSUPPORTED', 'high_bitrate'],
  [primary, { quality: 'basic' }, 'MOTION_OPTION_UNSUPPORTED', 'quality'],
  [basic, { quality: 'fastest' }, 'MOTION_OPTION_INVALID', 'quality'],
  [basic, { aspect_ratio: 'adaptive' }, 'MOTION_OPTION_INVALID', 'aspect_ratio'],
  [primary, { resolution: '1080p' }, 'MOTION_OPTION_UNSUPPORTED', 'resolution'],
  [primary, { audio_url: 'https://example.com/music.wav' }, 'MOTION_OPTION_UNSUPPORTED', 'audio_url'],
  [primary, { prompt: 5 }, 'MOTION_OPTION_INVALID', 'prompt'],
];
for (const [model, patch, code, field] of invalid) test(`reject ${model} ${JSON.stringify(patch)} before transport`, async t => {
  const calls = fake(t), params = { ...base, ...patch, model };
  await assert.rejects(processMotionControl(key, params), { code, path: field });
  let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const request = { workflow: workflow(model, Object.fromEntries(Object.entries({ ...base, ...patch }).filter(([, value]) => value !== undefined))), nodeId: 'performance' };
  for (const r of [await bridge.plan(request), await bridge.execute(request, { allowExecution: true })]) {
    assert.equal(r.status, 'rejected'); assert.equal(r.diagnostics[0].code, model === 'unknown-model' ? 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS' : code);
  }
  assert.equal(auth, 0); assert.equal(calls.length, 0);
});
test('legacy image aliases normalize explicitly without dropping, deduplication or mutation', async t => {
  const calls = fake(t);
  for (const refs of [{ images: [images[1], images[0], images[1]] }, { image_url: images[0] }]) {
    await processMotionControl(key, { model: primary, mode: 'objects_swap', video_url: video, ...refs });
    assert.deepEqual(JSON.parse(calls.at(-1).body).images_list, refs.images || [refs.image_url]);
  }
  assert.throws(() => buildMotionControlRequest({ ...base, model: primary, images_list: Array(2) }), { code: 'MOTION_REFERENCE_INVALID' });
});
test('supported defaults and explicit random seed remain visible in planning', async t => {
  const calls = fake(t), params = { ...base, model: primary, seed: -1 };
  await processMotionControl(key, params);
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload.seed, -1); assert.equal(payload.duration, 5); assert.equal(payload.generate_audio, false); assert.equal(payload.high_bitrate, false);
  const plan = await createExecutionBridge().plan({ workflow: workflow(primary, { ...base, seed: -1 }), nodeId: 'performance' });
  assert.equal(plan.request.effectiveOptions.seed, -1); assert.equal(plan.request.effectiveOptions.duration, 5);
});
test('source catalog reflects provider 2.0 seed support and unknown routes do not fall back', () => {
  assert.equal(getMotionControlModelById(basic).supportsSeed, false);
  assert.throws(() => buildMotionControlRequest({ ...base, model: primary, mode: Object('motion_transfer') }), { code: 'MOTION_MODE_INVALID' });
  assert.equal(findRemote('not-a-motion-model', 'motion_control'), null);
  assert.equal(findRemote('mmaudio-v2-video-to-video'), null);
  assert.equal(findRemote('seedance-2.5-intl-motion-control', 'motion_control'), null);
  assert.equal(findRemote('seedance-2.5-spicy-motion-control', 'motion_control'), null);
});
test('shared service retains source-declared existing variants without binding them in WHIHM', async t => {
  const calls = fake(t);
  for (const model of ['seedance-2.5-intl-motion-control', 'seedance-2.5-spicy-motion-control']) {
    await processMotionControl(key, { ...base, model, seed: 7 });
    assert.ok(calls.at(-1).url.endsWith(`/api/v1/${model}`));
    assert.deepEqual(JSON.parse(calls.at(-1).body).images_list, images);
  }
});
test('existing callback, polling, request IDs and results remain authoritative', async t => {
  const calls = fake(t, true), ids = [];
  const result = await processMotionControl(key, { ...base, model: primary, onRequestId: id => ids.push(id) });
  assert.deepEqual(ids, ['motion-job']); assert.equal(result.request_id, 'motion-job'); assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/predictions/motion-job/result'));
});
test('ordered project asset bindings plan without loading bytes and upload through the existing boundary', async t => {
  const calls = fake(t), w = workflow(primary, { mode: 'objects_swap', duration: 5 });
  w.assets = [
    { id: 'driver', type: 'video', localPath: 'assets/driver.mp4' },
    { id: 'a', type: 'image', localPath: 'assets/a.png' },
    { id: 'b', type: 'image', localPath: 'assets/b.png' },
  ];
  w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }, { id: 'images_list', type: 'image' }];
  w.nodes[0].assetRefs = ['driver', 'a', 'b'];
  const original = structuredClone(w), loaded = [], uploaded = [], project = {
    async resolveProjectAssetPath(id) { const asset = w.assets.find(a => a.id === id); return { status: 'ok', relativePath: asset.localPath, resolvedPath: `/transient/${asset.localPath}` }; },
  };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key,
    fileFromPath: async (_path, asset) => { loaded.push(asset.assetId); return asset.assetId; },
    remote: { processMotionControl, uploadFile: async (_key, id) => { uploaded.push(id); return id === 'driver' ? video : `https://example.com/${id}.png`; } } }) });
  const request = { workflow: w, nodeId: 'performance', project, assetBindings: { images_list: ['b', 'a', 'b'], video_url: 'driver' } };
  const plan = await bridge.plan(request);
  assert.equal(plan.status, 'planned'); assert.equal(plan.request.motionControl.imageCount, 3);
  assert.deepEqual(plan.requiredUploads.filter(x => x.field === 'images_list').map(x => [x.assetId, x.index]), [['b', 0], ['a', 1], ['b', 2]]);
  assert.ok(!JSON.stringify(plan).includes('/transient/')); assert.deepEqual(loaded, []); assert.equal(calls.length, 0);
  assert.equal((await bridge.execute(request, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(uploaded, ['b', 'a', 'b', 'driver']); assert.deepEqual(loaded, uploaded);
  assert.deepEqual(JSON.parse(calls[0].body).images_list, ['https://example.com/b.png', 'https://example.com/a.png', 'https://example.com/b.png']);
  assert.deepEqual(w, original);
  calls.length = 0; loaded.length = 0; uploaded.length = 0;
  const excess = { ...request, assetBindings: { video_url: 'driver', images_list: Array(31).fill('a') } };
  assert.equal((await bridge.execute(excess, { allowExecution: true })).diagnostics[0].code, 'MOTION_REFERENCE_COUNT_INVALID');
  assert.equal(calls.length, 0); assert.equal(loaded.length, 0); assert.equal(uploaded.length, 0);
});
test('array asset bindings do not expand unrelated execution routes', async () => {
  const w = workflow('kling-v3.0-pro-recast', { video_url: video }); w.nodes[0].metadata.oga.mode = 'recast';
  w.nodes[0].inputs = [{ id: 'image_url', type: 'image' }];
  const r = await createExecutionBridge().plan({ workflow: w, nodeId: 'performance', assetBindings: { image_url: ['a'] } });
  assert.equal(r.diagnostics[0].code, 'ASSET_BINDING_INVALID');
});

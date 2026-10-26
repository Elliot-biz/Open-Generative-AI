import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processV2V } from '../packages/studio/src/muapi.js';
import { getV2VModelById } from '../packages/studio/src/models.js';
import { buildV2VRequest } from '../packages/studio/src/v2vInputContracts.js';
import { getSeedanceEndpointResolution } from '../packages/studio/src/seedanceModels.js';
import { buildReferenceParams } from '../packages/studio/src/modelCapabilities.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const video = 'https://example.com/source.mp4', last = 'https://example.com/last.png';
const images = ['https://example.com/b.png', 'https://example.com/a.png', 'https://example.com/b.png'];
const audio = ['https://example.com/b.wav', 'https://example.com/a.wav', 'https://example.com/b.wav'];
const key = 'wave1-test-placeholder';
const editVariants = ['seedance-2.5-video-edit-480p', 'seedance-2.5-video-edit-1080p', 'seedance-2.5-video-edit-4k'];
const extendVariants = ['seedance-2.5-video-extend'];
const fixedExtendVariants = ['seedance-2.5-video-extend-480p', 'seedance-2.5-video-extend-1080p', 'seedance-2.5-video-extend-4k'];
const klingVariants = ['kling-o1-video-edit', 'kling-o1-video-edit-fast', 'kling-o1-standard-video-edit'];
const cases = [
  ...extendVariants.map(model => [model, { video_url: video, prompt: 'Continue the action', last_image: last, duration: 30,
    seed: 4294967295, generate_audio: true, high_bitrate: true, ...(model === 'seedance-2.5-video-extend' ? { resolution: '1080p', aspect_ratio: '9:16' } : {}) }]),
  ['seedance-2-video-edit', { video_urls: [video], prompt: 'Edit with @image1 and @audio1', images_list: images, audio_files: audio,
    quality: 'high', duration: 15, aspect_ratio: '9:16' }],
  ['wan2.7-video-edit', { video_url: video, images_list: images, prompt: 'Change the scene', negative_prompt: 'blur', duration: 10,
    resolution: '1080p', audio_setting: 'origin' }],
  ['wan2.7-video-extend', { video_url: video, audio_url: audio[0], prompt: 'Continue', negative_prompt: 'blur', duration: 15, resolution: '1080p' }],
  ...klingVariants.map(model => [model, { video_url: video, images_list: images, prompt: 'Replace @image1', keep_original_sound: false,
    ...(model === 'kling-o1-standard-video-edit' ? {} : { aspect_ratio: '9:16' }) }]),
];
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'wave1-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4' } };
  });
  return calls;
}
function workflow(model, parameters) {
  return createWorkflow({ workflowId: 'wave1_workflow', name: 'Wave 1', nodes: [{
    id: 'transform', title: 'Independent production title', kind: 'video', inputs: [], outputs: [{ id: 'out', type: 'video' }],
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'v2v' } }, parameters: structuredClone(parameters),
  }] });
}
for (const [model, parameters] of cases) {
  test(`${model}: exact shared/application payload and endpoint retain all controls`, async t => {
    const calls = fake(t), params = { model, ...parameters }, original = structuredClone(params);
    const client = new MuapiClient(); client.getKey = () => key;
    assert.deepEqual(await client.processV2V(params), await processV2V(key, params));
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${getV2VModelById(model).endpoint}`);
    const payload = JSON.parse(calls[0].body);
    assert.deepEqual(payload, parameters);
    assert.deepEqual(params, original);
    if (model === 'seedance-2-video-edit') assert.equal(Object.hasOwn(payload, 'video_url'), false);
  });
  test(`${model}: transport-free canonical plan, auth, readiness and execution`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(model, parameters), original = structuredClone(w), req = { workflow: w, nodeId: 'transform' };
    const plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processV2V');
    assert.equal(plan.request.endpoint, getV2VModelById(model).endpoint); assert.equal(plan.model, model);
    assert.equal(plan.request.v2v.requiredInputs.includes('prompt'), true);
    assert.equal(plan.request.v2v.controls.duration?.maxValue ?? (model.startsWith('kling') ? 0 : -1), model.startsWith('kling') ? 0 : model.startsWith('seedance-2.5') ? 30 : model === 'wan2.7-video-edit' ? 10 : 15);
    assert.deepEqual(plan.request.v2v.fixedParameters, getV2VModelById(model).fixedParameters ?? {});
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T15:00:00Z' });
    assert.equal(evidence.context.executors[0].available, true); assert.equal(calls.length, 0);
    const result = await bridge.execute(req, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.nodeId, 'transform'); assert.equal(result.model, model);
    assert.deepEqual(JSON.parse(calls[0].body), parameters); assert.deepEqual(w, original);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', aspect_ratio: '5:4' }, 'V2V_OPTION_INVALID', 'aspect_ratio'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', resolution: '8k' }, 'V2V_OPTION_INVALID', 'resolution'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', duration: 3 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', duration: 31 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', seed: -2 }, 'V2V_OPTION_INVALID', 'seed'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', generate_audio: 'true' }, 'V2V_OPTION_INVALID', 'generate_audio'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', high_bitrate: 1 }, 'V2V_OPTION_INVALID', 'high_bitrate'],
  ['seedance-2.5-video-extend', { video_url: video, prompt: 'Continue', last_image: ['https://example.com/a.png'] }, 'V2V_OPTION_INVALID', 'last_image'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video, 'https://example.com/second.mp4'] }, 'V2V_OPTION_INVALID', 'video_urls'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video, video] }, 'V2V_OPTION_INVALID', 'video_urls'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [] }, 'V2V_REQUIRED_INPUT_MISSING', 'video_urls'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: video }, 'V2V_REQUIRED_INPUT_MISSING', 'video_urls'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_url: video, video_urls: [video] }, 'V2V_INPUT_CONFLICT', 'video_urls'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_url: video }, 'V2V_OPTION_UNSUPPORTED', 'video_url'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video], quality: 'ultra' }, 'V2V_OPTION_INVALID', 'quality'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video], aspect_ratio: '1:1' }, 'V2V_OPTION_INVALID', 'aspect_ratio'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video], duration: 16 }, 'V2V_OPTION_INVALID', 'duration'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video], images_list: Array(10).fill(last) }, 'V2V_OPTION_INVALID', 'images_list'],
  ['seedance-2-video-edit', { prompt: 'Edit', video_urls: [video], audio_files: Array(4).fill(audio[0]) }, 'V2V_OPTION_INVALID', 'audio_files'],
  ['wan2.7-video-edit', { video_url: video, prompt: 'Edit', images_list: Array(4).fill(last) }, 'V2V_OPTION_INVALID', 'images_list'],
  ['wan2.7-video-edit', { video_url: video, prompt: 'Edit', duration: 11 }, 'V2V_OPTION_INVALID', 'duration'],
  ['wan2.7-video-edit', { video_url: video, prompt: 'Edit', audio_setting: 'silent' }, 'V2V_OPTION_INVALID', 'audio_setting'],
  ['wan2.7-video-extend', { prompt: 'Continue', audio_url: audio[0] }, 'V2V_REQUIRED_INPUT_MISSING', 'video_url'],
  ['wan2.7-video-extend', { video_url: video, prompt: 'Continue', duration: 4 }, 'V2V_OPTION_INVALID', 'duration'],
  ['wan2.7-video-extend', { video_url: video, prompt: 'Continue', duration: 16 }, 'V2V_OPTION_INVALID', 'duration'],
  ['wan2.7-video-extend', { video_url: video, prompt: 'Continue', resolution: '480p' }, 'V2V_OPTION_INVALID', 'resolution'],
  ...klingVariants.map(model => [model, { video_url: video, prompt: 'Edit', images_list: Array(5).fill(last) }, 'V2V_OPTION_INVALID', 'images_list']),
  ['kling-o1-standard-video-edit', { video_url: video, prompt: 'Edit', aspect_ratio: '16:9' }, 'V2V_OPTION_UNSUPPORTED', 'aspect_ratio'],
  ['kling-o1-video-edit-fast', { video_url: video, prompt: 'Edit', aspect_ratio: '21:9' }, 'V2V_OPTION_INVALID', 'aspect_ratio'],
  ['kling-o1-video-edit', { video_url: video, prompt: 'Edit', keep_original_sound: 'false' }, 'V2V_OPTION_INVALID', 'keep_original_sound'],
  ['kling-o1-video-edit', { video_url: video, prompt: ' ' }, 'V2V_REQUIRED_INPUT_MISSING', 'prompt'],
];
for (const [model, parameters, code, path] of invalid) test(`${model}: reject ${path} ${JSON.stringify(parameters)} before transport`, async t => {
  const calls = fake(t); let auth = 0, upload = 0;
  await assert.rejects(processV2V(key, { model, ...parameters }), { code, path });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; }, fileFromPath: () => { upload++; } }) });
  const req = { workflow: workflow(model, parameters), nodeId: 'transform' };
  for (const result of [await bridge.plan(req), await bridge.execute(req, { allowExecution: true })]) {
    assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, code); assert.equal(result.diagnostics[0].path, path);
  }
  assert.equal(calls.length, 0); assert.equal(auth, 0); assert.equal(upload, 0);
});
test('optional references/media and boundary defaults remain faithful to provider contracts', async t => {
  const calls = fake(t);
  for (const model of klingVariants) {
    const planned = buildV2VRequest({ model, video_url: video, prompt: 'Edit' });
    assert.deepEqual(planned.requiredMedia.map(m => m.field), ['video_url']);
    assert.equal(planned.v2v.media.find(m => m.field === 'images_list').required, false);
    assert.equal(planned.v2v.media.find(m => m.field === 'images_list').minimum, 0);
    for (const extra of [{}, { images_list: [] }, { images_list: Array(4).fill(last) }]) {
      await processV2V(key, { model, video_url: video, prompt: 'Edit', ...extra });
      const payload = JSON.parse(calls.at(-1).body);
      assert.deepEqual(payload.images_list, extra.images_list ?? []); assert.equal(payload.keep_original_sound, true);
      assert.equal(Object.hasOwn(payload, 'aspect_ratio'), model !== 'kling-o1-standard-video-edit');
    }
  }
  await processV2V(key, { model: 'wan2.7-video-edit', video_url: video, prompt: 'Edit' });
  assert.equal(JSON.parse(calls.at(-1).body).duration, 0);
  await processV2V(key, { model: 'wan2.7-video-extend', video_url: video, prompt: 'Extend' });
  assert.equal(Object.hasOwn(JSON.parse(calls.at(-1).body), 'audio_url'), false);
  for (const model of extendVariants) {
    await processV2V(key, { model, video_url: video, prompt: 'Extend', duration: 4 });
    assert.equal(Object.hasOwn(JSON.parse(calls.at(-1).body), 'last_image'), false);
  }
  assert.equal(getSeedanceEndpointResolution('seedance-2.5-video-extend'), undefined);
  const p = buildV2VRequest({ model: 'wan2.7-video-extend', video_url: video, prompt: 'Extend' });
  assert.match(p.v2v.controls.duration.description, /Total duration/);
  p.v2v.controls.resolution.enum.push('invented');
  assert.throws(() => buildV2VRequest({ model: 'wan2.7-video-extend', video_url: video, prompt: 'Extend', resolution: 'invented' }), { code: 'V2V_OPTION_INVALID' });
});
test('existing Studio logical media aliases retain array roles; conflicting forms reject', async t => {
  const calls = fake(t), model = getV2VModelById('seedance-2-video-edit');
  const logical = buildReferenceParams(model, { videoUrls: [video], imageUrls: images.slice(0, 2), audioUrls: audio.slice(0, 2) });
  await processV2V(key, { model: model.id, prompt: 'Edit', ...logical });
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.video_urls, [video]); assert.deepEqual(payload.audio_files, audio.slice(0, 2));
  assert.equal(Object.hasOwn(payload, 'videos_list'), false); assert.equal(Object.hasOwn(payload, 'audios_list'), false);
  assert.throws(() => buildV2VRequest({ model: model.id, prompt: 'Edit', video_urls: [video], videos_list: [video] }), { code: 'V2V_INPUT_CONFLICT' });
  assert.throws(() => buildV2VRequest({ model: model.id, prompt: 'Edit', video_urls: [video], audio_files: audio, audios_list: audio }), { code: 'V2V_INPUT_CONFLICT' });
  await processV2V(key, { model: 'seedance-2.5-video-extend', video_url: video, prompt: 'Extend', image_url: last });
  assert.equal(JSON.parse(calls.at(-1).body).last_image, last);
  assert.equal(Object.hasOwn(JSON.parse(calls.at(-1).body), 'image_url'), false);
});
test('unreviewed profiles and specialized routes remain separate without fallback', async t => {
  const calls = fake(t); let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  for (const id of [...editVariants, ...fixedExtendVariants, 'seedance-2.5-intl-video-edit', 'seedance-2.5-spicy-video-extend-4k', 'seedance-2.5-intl-video-extend-4k', 'invented']) {
    assert.equal(findRemote(id, 'v2v'), null);
    assert.throws(() => buildV2VRequest({ model: id, video_url: video, prompt: 'Edit' }), { code: 'V2V_MODEL_UNSUPPORTED' });
    const request = { workflow: workflow(id, { video_url: video, prompt: 'Edit' }), nodeId: 'transform' };
    for (const r of [await bridge.plan(request), await bridge.execute(request, { allowExecution: true })]) {
      assert.equal(r.diagnostics[0].code, 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS');
    }
  }
  assert.equal(findRemote('wan2.2-animate', 'v2v'), null);
  assert.equal(findRemote('wan2.2-animate-recast').mode, 'recast');
  assert.equal(findRemote('seedance-2.5-motion-control').mode, 'motion_control');
  assert.equal(calls.length, 0); assert.equal(auth, 0);
});
test('Seedance 2.0 project source/audio arrays resolve through existing project/upload boundaries', async t => {
  const calls = fake(t), w = workflow('seedance-2-video-edit', { prompt: 'Edit', duration: 4 });
  w.assets = [{ id: 'source', type: 'video', localPath: 'assets/source.mp4' },
    { id: 'a', type: 'image', localPath: 'assets/a.png' }, { id: 'b', type: 'image', localPath: 'assets/b.png' },
    { id: 'sound', type: 'audio', localPath: 'assets/sound.wav' }];
  w.nodes[0].assetRefs = w.assets.map(a => a.id);
  w.nodes[0].inputs = [{ id: 'video_urls', type: 'video' }, { id: 'images_list', type: 'image' }, { id: 'audio_files', type: 'audio' }];
  const before = structuredClone(w), loaded = [], project = { async resolveProjectAssetPath(id) {
    const a = w.assets.find(a => a.id === id); return { status: 'ok', relativePath: a.localPath, resolvedPath: `/transient/${a.localPath}` };
  } };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key,
    fileFromPath: async (_path, a) => { loaded.push(a.assetId); return a.assetId; },
    remote: { processV2V, uploadFile: async (_key, id) => `https://example.com/${id}` } }) });
  const req = { workflow: w, nodeId: 'transform', project, assetBindings: { video_urls: ['source'], images_list: ['b', 'a', 'b'], audio_files: ['sound', 'sound'] } };
  const plan = await bridge.plan(req);
  assert.equal(plan.status, 'planned'); assert.equal(loaded.length, 0); assert.equal(calls.length, 0);
  assert.deepEqual(plan.request.requiredMedia[0], { role: 'source-video', field: 'video_urls', upstreamField: 'video_urls', type: 'video', minimum: 1, maximum: 1, ordered: true });
  assert.ok(!JSON.stringify(plan).includes('/transient/'));
  const invalid = { ...req, assetBindings: { ...req.assetBindings, video_urls: ['source', 'source'] } };
  assert.equal((await bridge.execute(invalid, { allowExecution: true })).diagnostics[0].code, 'V2V_OPTION_INVALID');
  assert.equal(loaded.length, 0); assert.equal(calls.length, 0);
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.video_urls, ['https://example.com/source']);
  assert.deepEqual(payload.images_list, ['b', 'a', 'b'].map(id => `https://example.com/${id}`));
  assert.deepEqual(payload.audio_files, Array(2).fill('https://example.com/sound')); assert.deepEqual(w, before);
});

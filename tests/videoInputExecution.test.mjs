import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWorkflow, createProject } from 'whihm-workflow-core';
import { i2vModels, lipsyncModels } from '../packages/studio/src/models.js';
import { getVideoInputModel, getVideoInputStatus, getVideoInputMedia, buildVideoInputRequest } from '../packages/studio/src/videoInputContracts.js';
import { generateI2V, processLipSync } from '../packages/studio/src/muapi.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';
const a = 'https://example.com/start.png', b = 'https://example.com/end.png', video = 'https://example.com/ref.mp4', audio = 'https://example.com/speech.wav', key = 'fixture-key-only';
const references = [
  ['seedance-lite-reference-video', { images_list: [b, a, b], resolution: '720p' }],
  ['seedance-2-omni-reference', { images_list: [a, b], video_files: [video], audio_files: [audio], quality: 'basic' }],
  ...['seedance-2-omni-reference-no-video', 'seedance-2-omni-reference-no-video-fast'].map(id => [id, { images_list: [a, b], audio_files: [audio] }]),
  ...['seedance-2-vip-omni-reference', 'seedance-2-vip-omni-reference-fast'].map(id => [id, { images_list: [a], video_files: [video], audio_files: [audio], high_bitrate: true, resolution: '1080p' }]),
  ['seedance-2.5-omni-reference', { videos_list: [video], audios_list: [audio], duration: 30, seed: 0, high_bitrate: true, omni_reference_task_type: 'reference', resolution: '1080p' }],
  ...['kling-v3.0-omni-standard-image-to-video', 'kling-v3.0-omni-pro-image-to-video'].map(id => [id, { images_list: [a, b, a], duration: 10, generate_audio: true }]),
  ['kling-v3.0-omni-4k-image-to-video', { images_list: [a], duration: 15 }],
  ['vidu-q1-reference', { images_list: [a, b] }],
  ['vidu-q2-reference', { images_list: [b, a], resolution: '1080p', movement_amplitude: 'large' }],
  ['vidu-q4-reference-to-video', { images_list: [a], audios_list: [audio], audio: true, duration: 16 }],
  ['gemini-omni-image-to-video', { image_urls: [a, b], audio_ids: ['voice-profile'], character_ids: ['character-id'], seed: 0 }],
  ['gemini-omni-flash-1-1-reference-to-video', { reference_video_urls: [video], resolution: '360p' }],
  ['minimax-h3-reference-to-video', { reference_videos: [video], reference_audios: [audio], duration: 15 }],
  ['minimax-h3-open-reference-to-video', { audios_list: [audio], seed: -1 }],
  ['wan2.1-reference-video', { images_list: [a], duration: 10 }],
  ['wan2.7-reference-to-video', { images_list: [b], videos_list: [video], image_url: a, negative_prompt: 'Blur', duration: 10 }],
  ['wan3.0-reference-to-video', { images_list: [a], videos_list: [video], audios_list: [audio], thinking_mode: true, enable_audio: true, seed: 5 }],
].map(([id, params]) => [id, { prompt: '  Use these references  ', ...params }]);
const frames = [
  ...['seedance-2-first-last-frame', 'seedance-2-first-last-frame-fast', 'seedance-2-vip-first-last-frame', 'seedance-2-vip-first-last-frame-fast'].map(id => [id, { images_list: [a, b], duration: 15, high_bitrate: true }]),
  ['seedance-2.5-first-last-frame', { images_list: [a, b], duration: 30, seed: 0 }],
  ...['vidu-q2-pro-start-end-video', 'vidu-q2-turbo-start-end-video'].map(id => [id, { image_url: a, last_image: b, duration: 5, bgm: false }]),
  ...['vidu-q3-pro-first-last-frames', 'vidu-q3-turbo-first-last-frames'].map(id => [id, { image_url: a, last_image: b, duration: 16, audio: true }]),
  ['flux-3-start-end-to-video', { image_url: a, end_image_url: b, generate_audio: false, duration: 20 }],
  ['gemini-omni-flash-1-1-image-to-video', { first_frame_url: a, last_frame_url: b, seed: 0, duration: 8 }],
].map(([id, params]) => [id, { prompt: '  Transition between these frames  ', ...params }]);
const lip = lipsyncModels.map(m => [m.id, { audio_url: audio, [m.category === 'image' ? 'image_url' : 'video_url']: m.category === 'image' ? a : video,
  ...(m.hasPrompt ? { prompt: 'Natural delivery' } : {}), ...(m.inputs?.resolution ? { resolution: m.inputs.resolution.default } : {}),
  ...(m.hasSeed ? { seed: -1 } : {}), ...(m.id === 'volcengine-video-to-video-lip-sync' ? { mode: 'lite', align_audio: true, align_audio_reverse: true, templ_start_seconds: 1.5, separate_vocal: true } : {}),
  ...(m.id === 'omnihuman-1-5' ? { output_resolution: '720', pe_fast_mode: true, seed: -1 } : {}),
}]);
const cases = [...references.map(x => [...x, 'i2v']), ...frames.map(x => [...x, 'i2v']), ...lip.map(x => [...x, 'lipsync'])];
function workflow(model, mode, parameters) {
  return createWorkflow({ workflowId: 'video_inputs', name: 'Video inputs', nodes: [{ id: 'shot', title: 'Independent shot title', kind: 'video-generation',
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true }, metadata: { oga: { mode } },
    parameters: structuredClone(parameters), inputs: [], outputs: [{ id: 'result', type: 'video' }],
  }] });
}
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => { calls.push({ url, ...init }); return { ok: true, json: async () => poll && init.method === 'POST'
    ? { request_id: 'video-input-job' } : { status: 'completed', outputs: ['https://example.com/result.mp4'], cost: 0.5 } }; }); return calls;
}
test('original 20 reference/11 keyframe/15 Lip Sync contracts remain; reviewed I2V inventory grows explicitly', () => {
  assert.equal(references.length, 20); assert.equal(frames.length, 11); assert.equal(lip.length, 15);
  assert.equal(i2vModels.filter(m => getVideoInputStatus(m.id).status === 'REVIEWED').length, 36);
  assert.equal(getVideoInputModel('not-a-model'), null);
  for (const id of ['kling-o1-reference-to-video', 'kling-o1-standard-reference-to-video']) {
    assert.equal(getVideoInputStatus(id).status, 'DEFERRED'); assert.equal(findRemote(id, 'i2v'), null);
  }
});
for (const [id, parameters, mode] of cases) {
  test(`${id}: shared/application contract preserves exact media, controls and lifecycle`, async t => {
    const poll = ['flux-3-start-end-to-video', 'minimax-h3-reference-to-video', 'volcengine-video-to-video-lip-sync'].includes(id), calls = fake(t, poll);
    const method = mode === 'i2v' ? generateI2V : processLipSync, client = new MuapiClient(); client.getKey = () => key;
    const params = { ...parameters, model: id }, before = structuredClone(params), contract = buildVideoInputRequest(mode, params);
    const result = await method(key, params), application = mode === 'i2v' ? await client.generateI2V(params) : await client.processLipSync(params);
    assert.deepEqual(application, result); assert.ok(calls[0].url.endsWith('/api/v1/' + contract.endpoint));
    assert.deepEqual(JSON.parse(calls[0].body), contract.payload); assert.deepEqual(JSON.parse(calls[poll ? 2 : 1].body), contract.payload);
    for (const [field, value] of Object.entries(parameters)) assert.deepEqual(contract.payload[field], value);
    if (poll) { assert.equal(result.request_id, 'video-input-job'); assert.ok(calls[1].url.endsWith('/predictions/video-input-job/result')); }
    assert.deepEqual(params, before); assert.equal(Object.hasOwn(contract.payload, 'model'), false);
  });
  test(`${id}: canonical plan/readiness is passive and execution authorization remains required`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(id, mode, parameters), before = structuredClone(w), req = { workflow: w, nodeId: 'shot' }, plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.model, id); assert.equal(plan.request.videoInput.modelId, id);
    assert.equal(plan.runtime, mode === 'i2v' ? 'studio.generateI2V' : 'studio.processLipSync'); assert.equal(plan.title, 'Independent shot title');
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-26T18:00:00Z' });
    assert.equal(evidence.provenance.executors.shot.state, 'AVAILABLE');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await bridge.execute(req, { allowExecution: true }); assert.equal(result.status, 'succeeded', JSON.stringify(result));
    assert.equal(result.model, id); assert.deepEqual(JSON.parse(calls[0].body), plan.request.videoInput.providerRequest.payload);
    assert.equal(calls.length, 1); assert.equal(auth, 1); assert.deepEqual(w, before);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs' }, 'images_list'],
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs', images_list: [] }, 'images_list'],
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs', images_list: [a, ''] }, 'images_list'],
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs', images_list: Array(8).fill(a) }, 'images_list'],
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs', images_list: [a], video_url: video }, 'video_url'],
  ['i2v', 'seedance-2.5-omni-reference', { prompt: 'Refs' }, 'references'],
  ['i2v', 'seedance-2.5-omni-reference', { prompt: 'Refs', images_list: [a], omni_reference_task_type: 'edit' }, 'omni_reference_task_type'],
  ['i2v', 'wan2.7-reference-to-video', { prompt: 'Refs', image_url: a }, 'references'],
  ['i2v', 'wan2.7-reference-to-video', { prompt: 'Refs', images_list: Array(4).fill(a), videos_list: Array(2).fill(video) }, 'references'],
  ['i2v', 'minimax-h3-reference-to-video', { prompt: 'Refs', reference_audios: [audio] }, 'references'],
  ['i2v', 'minimax-h3-reference-to-video', { prompt: 'Refs', reference_images: Array(9).fill(a), reference_videos: [video], reference_audios: Array(3).fill(audio) }, 'references'],
  ['i2v', 'seedance-2-omni-reference-no-video', { prompt: 'Refs', images_list: [a], video_files: [video] }, 'video_files'],
  ['i2v', 'vidu-q2-pro-start-end-video', { prompt: 'Frames', image_url: a }, 'last_image'],
  ['i2v', 'vidu-q2-turbo-start-end-video', { prompt: 'Frames', last_image: b }, 'image_url'],
  ['i2v', 'flux-3-start-end-to-video', { prompt: 'Frames', images_list: [a, b] }, 'images_list'],
  ['i2v', 'flux-3-start-end-to-video', { prompt: 'Frames', image_url: a }, 'end_image_url'],
  ['i2v', 'seedance-2-first-last-frame-fast', { prompt: 'Frames', images_list: [a] }, 'images_list'],
  ['i2v', 'seedance-2-first-last-frame', { prompt: 'Frames', images_list: [a, b], last_image: a }, 'last_image'],
  ['i2v', 'seedance-2-first-last-frame', { prompt: 'Frames', images_list: [a, b], image_url: b }, 'image_url'],
  ['i2v', 'seedance-2.5-first-last-frame', { prompt: 'Frames', images_list: [a, b], duration: 31 }, 'duration'],
  ['i2v', 'kling-v3.0-omni-4k-image-to-video', { prompt: 'Refs', images_list: [a], generate_audio: true }, 'generate_audio'],
  ['i2v', 'gemini-omni-flash-1-1-image-to-video', { prompt: 'Frames', first_frame_url: a, seed: -1 }, 'seed'],
  ['lipsync', 'sync-lipsync', { video_url: video }, 'audio_url'],
  ['lipsync', 'sync-lipsync', { image_url: a, audio_url: audio }, 'image_url'],
  ['lipsync', 'infinitetalk-image-to-video', { video_url: video, audio_url: audio }, 'video_url'],
  ['lipsync', 'infinitetalk-image-to-video', { audio_url: audio }, 'image_url'],
  ['lipsync', 'sync-lipsync', { video_url: video, audio_url: audio, prompt: 'Not supported' }, 'prompt'],
  ['lipsync', 'infinitetalk-image-to-video', { image_url: a, audio_url: audio, seed: 1 }, 'seed'],
  ['lipsync', 'ltx-2.3-lipsync', { image_url: a, audio_url: audio, resolution: '4k' }, 'resolution'],
  ['lipsync', 'volcengine-video-to-video-lip-sync', { video_url: video, audio_url: audio, mode: 'basic', align_audio: true }, 'align_audio'],
  ['lipsync', 'volcengine-video-to-video-lip-sync', { video_url: video, audio_url: audio, mode: 'lite', open_scenedet: true }, 'open_scenedet'],
  ['lipsync', 'volcengine-video-to-video-lip-sync', { video_url: video, audio_url: audio, align_audio: false, align_audio_reverse: true }, 'align_audio_reverse'],
  ['lipsync', 'volcengine-video-to-video-lip-sync', { video_url: video, audio_url: audio, templ_start_seconds: -1 }, 'templ_start_seconds'],
  ['lipsync', 'omnihuman-1-5', { image_url: a, audio_url: audio, output_resolution: '720p' }, 'output_resolution'],
  ['lipsync', 'omnihuman-1-5', { image_url: a, audio_url: audio, mask_url: [b] }, 'mask_url'],
  ['lipsync', 'sync-lipsync', { video_url: video, audio_url: audio, options: { raw: true } }, 'options'],
  ['i2v', 'vidu-q2-reference', { prompt: 'Refs', images_list: [a], raw: { any: true } }, 'raw'],
];
for (const [mode, id, params, errorPath] of invalid) test(`${mode}/${id}: reject invalid ${errorPath} before auth/transport`, async t => {
  const calls = fake(t); let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const req = { workflow: workflow(id, mode, params), nodeId: 'shot' }, plan = await bridge.plan(req);
  assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].path, errorPath, JSON.stringify(plan));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'rejected');
  await assert.rejects((mode === 'i2v' ? generateI2V : processLipSync)(key, { ...params, model: id }), e => e.path === errorPath);
  assert.equal(calls.length, 0); assert.equal(auth, 0);
});
test('every Lip Sync model enforces its source and required audio before transport', async t => {
  const calls = fake(t);
  for (const [id, params] of lip) {
    await assert.rejects(processLipSync(key, { ...params, audio_url: undefined, model: id }));
    const field = getVideoInputMedia(id, 'lipsync').find(r => r.type !== 'audio').field;
    await assert.rejects(processLipSync(key, { ...params, [field]: undefined, model: id }));
  }
  assert.equal(calls.length, 0);
});
test('keyframe order and aliases are explicit, duplicate frames are not deduplicated', () => {
  for (const [id, params] of frames) {
    const contract = buildVideoInputRequest('i2v', { model: id, ...params });
    assert.equal(contract.requiredMedia[0].role, 'start-frame');
  }
  const basic = buildVideoInputRequest('i2v', { model: 'seedance-2-first-last-frame', prompt: 'Start only', images_list: [a] });
  assert.deepEqual(basic.payload.images_list, [a]); assert.equal(basic.videoInput.media[0].endRequired, false);
  const both = buildVideoInputRequest('i2v', { model: 'seedance-2-first-last-frame-fast', prompt: 'Frame holds', image_url: a, last_image: a });
  assert.deepEqual(both.payload.images_list, [a, a]);
  const scalar = buildVideoInputRequest('i2v', { model: 'flux-3-start-end-to-video', prompt: 'End', image_url: a, last_image: b });
  assert.equal(scalar.payload.end_image_url, b);
  const gemini = buildVideoInputRequest('i2v', { model: 'gemini-omni-flash-1-1-image-to-video', prompt: 'Start', image_url: a });
  assert.equal(gemini.payload.first_frame_url, a); assert.equal(gemini.payload.last_frame_url, undefined);
});
test('canonical model identity cannot be replaced and specialized routes stay distinct', async () => {
  const req = { workflow: workflow('vidu-q2-reference', 'i2v', { prompt: 'Refs', images_list: [a], model: 'another' }), nodeId: 'shot' };
  assert.equal((await createExecutionBridge().plan(req)).diagnostics[0].code, 'IDENTITY_OVERRIDE');
  for (const [id] of lip) assert.equal(findRemote(id, 'lipsync').method, 'processLipSync');
  for (const id of ['infinitetalk-video-to-video', 'volcengine-video-to-video-lip-sync']) assert.equal(findRemote(id, 'v2v'), null);
  assert.throws(() => buildVideoInputRequest('lipsync', { model: 'not-a-model' }), { code: 'VIDEO_INPUT_MODEL_UNSUPPORTED' });
});
test('Volcengine Basic settings and OmniHuman native controls are preserved', () => {
  const base = { model: 'volcengine-video-to-video-lip-sync', video_url: video, audio_url: audio, mode: 'basic', open_scenedet: true, separate_vocal: true };
  const { payload } = buildVideoInputRequest('lipsync', base);
  assert.equal(payload.open_scenedet, true); assert.equal(payload.separate_vocal, true); assert.equal(payload.align_audio, undefined);
  assert.equal(payload.templ_start_seconds, undefined);
});

test('project image/video/audio arrays preserve types, mixed URL positions, duplicates and integrity', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'video-inputs-')), root = path.join(directory, 'project');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { project } = await createProject(root, { title: 'Video references' }), records = [];
  for (const [id, type] of [['picture', 'image'], ['clip', 'video'], ['sound', 'audio']]) {
    const sourcePath = path.join(directory, id); await fs.writeFile(sourcePath, id);
    const imported = await project.importAsset({ sourcePath, assetId: id, contentType: type + '/fixture' }); assert.equal(imported.status, 'imported'); records.push([imported.asset, type]);
  }
  const w = workflow('seedance-2.5-omni-reference', 'i2v', { prompt: 'References' });
  w.assets = records.map(([r, type]) => ({ id: r.assetId, type, localPath: r.path }));
  w.nodes[0].inputs = [{ id: 'images_list', type: 'image' }, { id: 'videos_list', type: 'video' }, { id: 'audios_list', type: 'audio' }];
  w.nodes[0].assetRefs = ['picture', 'clip', 'sound'];
  assert.equal((await project.addWorkflowToProject(w)).status, 'added');
  const before = JSON.stringify(w), manifest = JSON.stringify((await project.getManifest()).manifest), calls = fake(t), uploaded = [];
  const runtime = createApplicationRuntime({ getApiKey: () => key }); runtime.canUpload = () => true;
  runtime.upload = async r => { uploaded.push(r.assetId); return `https://example.com/upload-${uploaded.length}`; };
  const bridge = createExecutionBridge({ runtime }), req = { workflow: w, nodeId: 'shot', project, assetBindings: { images_list: ['picture', b, 'picture'], videos_list: [video, 'clip'], audios_list: ['sound', audio] } };
  const plan = await bridge.plan(req); assert.equal(plan.status, 'planned', JSON.stringify(plan));
  assert.equal(calls.length, 0); assert.equal(uploaded.length, 0); assert.ok(!JSON.stringify(plan).includes(root));
  assert.deepEqual(plan.requiredUploads.map(r => [r.field, r.index]), [['images_list', 0], ['images_list', 2], ['videos_list', 1], ['audios_list', 0]]);
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  const payload = JSON.parse(calls[0].body); assert.deepEqual(payload.images_list, ['https://example.com/upload-1', b, 'https://example.com/upload-2']);
  assert.deepEqual(payload.videos_list, [video, 'https://example.com/upload-3']); assert.deepEqual(payload.audios_list, ['https://example.com/upload-4', audio]);
  assert.equal(JSON.stringify(w), before); assert.equal(JSON.stringify((await project.getManifest()).manifest), manifest);
  for (const bindings of [{ images_list: ['clip'] }, { videos_list: ['sound'] }, { audios_list: ['picture'] }, { prompt: ['picture'] }, { images_list: ['../picture'] }, { images_list: [] }]) assert.equal((await bridge.plan({ ...req, assetBindings: bindings })).status, 'rejected');
  await fs.writeFile(path.join(root, records[0][0].path), 'corrupt'); assert.equal((await bridge.plan(req)).status, 'rejected');
});
test('basic I2V remains on its existing shared behavior', async t => {
  const calls = fake(t);
  const result = await generateI2V(key, { model: 'seedance-lite-i2v', image_url: a, last_image: b, prompt: 'Animate', duration: 5 });
  assert.deepEqual(result.outputs, ['https://example.com/result.mp4']); const payload = JSON.parse(calls[0].body); assert.equal(payload.image_url, a); assert.equal(payload.last_image, b); assert.equal(payload.prompt, 'Animate');
});


test('shared Lip Sync rejects unsupported endpoint identifiers without transport', async t => {
  const calls = fake(t);
  await assert.rejects(processLipSync(key, { model: 'arbitrary-provider-path', image_url: a, audio_url: audio }), { code: 'VIDEO_INPUT_MODEL_UNSUPPORTED' });
  assert.equal(calls.length, 0);
});

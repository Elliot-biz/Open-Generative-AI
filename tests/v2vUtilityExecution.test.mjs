import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject, hashWorkflow } from 'whihm-workflow-core';
import { v2vModels } from '../packages/studio/src/models.js';
import { getV2VExecutionModel, getV2VMediaInputs, buildV2VRequest } from '../packages/studio/src/v2vInputContracts.js';
import { getVideoToolPresentation } from '../packages/studio/src/videoToolCapabilities.js';
import { processV2V } from '../packages/studio/src/muapi.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';
const video = 'https://example.com/source.mp4', image = 'https://example.com/logo.png', key = 'fake-utility-key';
const cases = [
  ['luma-flash-reframe', { video_url: video, image_url: image, prompt: '  Expand the scene  ', aspect_ratio: '21:9', duration: 10 }, 'REFRAME_VIDEO'],
  ['add-video-watermark', { video_url: video, watermark_image_url: image, position: 'top-left', opacity: 0, scale: 0.25 }, 'APPLY_VIDEO_WATERMARK'],
  ['video-watermark-remover', { video_url: video }, 'REMOVE_VIDEO_WATERMARK'],
  ['seedance-2-watermark-remover', { video_url: video }, 'REMOVE_VIDEO_WATERMARK'],
  ['seedance-2-video-watermark-remover-pro', { video_url: video }, 'REMOVE_VIDEO_WATERMARK'],
  ['ai-captions', { video_url: video, language: 'French (Canada)', theme: 'Beast' }, 'CAPTION_VIDEO'],
];
function workflow(id, parameters) {
  return createWorkflow({ workflowId: 'utility_workflow', name: 'Utilities', nodes: [{ id: 'utility', title: 'Independent title', kind: 'video-edit',
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model: id, mayCostMoney: true, requiresConfirmation: true },
    parameters: structuredClone(Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined))), metadata: { oga: { mode: 'v2v' } }, inputs: [], outputs: [{ id: 'result', type: 'video' }] }] });
}
function fake(t, poll = false, overrides = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'utility-job' }
      : { status: 'completed', output: { video: 'https://example.com/utility.mp4', metadata: { source: 'fixture' } }, ...overrides } };
  }); return calls;
}
for (const [id, params, capability] of cases) {
  test(`${id}: shared/application V2V preserve exact reviewed payload and native video result`, async t => {
    const poll = ['luma-flash-reframe', 'ai-captions'].includes(id), calls = fake(t, poll), ids = [];
    const before = structuredClone(params), contract = buildV2VRequest({ ...params, model: id });
    const client = new MuapiClient(); client.getKey = () => key;
    const result = await processV2V(key, { ...params, model: id, onRequestId: id => ids.push(id) });
    assert.deepEqual(await client.processV2V({ ...params, model: id }), result);
    assert.ok(calls[0].url.endsWith('/api/v1/' + contract.endpoint)); assert.deepEqual(JSON.parse(calls[0].body), contract.payload);
    assert.equal(result.url, 'https://example.com/utility.mp4'); assert.equal(result.output.metadata.source, 'fixture');
    if (poll) { assert.deepEqual(ids, ['utility-job']); assert.equal(result.request_id, 'utility-job'); assert.ok(calls[1].url.endsWith('/predictions/utility-job/result')); }
    for (const [field, value] of Object.entries(params)) assert.deepEqual(contract.payload[field], value);
    assert.equal(contract.v2v.utility.capability, capability); assert.deepEqual(params, before);
    assert.equal(Object.hasOwn(contract.payload, 'model'), false);
  });
  test(`${id}: plan/readiness are passive and authorized execution uses existing processV2V`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(id, params), request = { workflow: w, nodeId: 'utility' }, before = hashWorkflow(w), plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.runtime, 'studio.processV2V'); assert.equal(plan.model, id);
    assert.equal(plan.request.v2v.utility.capability, capability); assert.equal(plan.provider, 'muapi');
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-26T20:00:00Z' });
    assert.equal(evidence.provenance.executors.utility.state, 'AVAILABLE'); assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await bridge.execute(request, { allowExecution: true }); assert.equal(result.status, 'succeeded', JSON.stringify(result));
    assert.equal(result.model, id); assert.equal(result.resultKind, 'v2v-utility'); assert.equal(result.utility.capability, capability);
    assert.equal(result.outputs[0].mediaType, 'video'); assert.equal(result.outputs[0].value, 'https://example.com/utility.mp4');
    assert.deepEqual(JSON.parse(calls[0].body), buildV2VRequest({ ...params, model: id }).payload); assert.equal(auth, 1);
    assert.equal(hashWorkflow(w), before); assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
  for (const [extra, expectedPath] of [[{ video_url: '' }, 'video_url'], [{ provider_options: {} }, 'provider_options'], [{ mask_url: image }, 'mask_url'], [{ model: 'another-model' }, 'model']]) {
    test(`${id}: invalid ${expectedPath} rejects before auth/submission`, async t => {
      const calls = fake(t); let auth = 0;
      const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
      const request = { workflow: workflow(id, { ...params, ...extra }), nodeId: 'utility' }, plan = await bridge.plan(request);
      assert.equal(plan.status, 'rejected');
      if (expectedPath === 'model') assert.equal(plan.diagnostics[0].code, 'IDENTITY_OVERRIDE'); else assert.equal(plan.diagnostics[0].path, expectedPath);
      assert.equal((await bridge.execute(request, { allowExecution: true })).status, 'rejected');
      if (expectedPath !== 'model') await assert.rejects(processV2V(key, { ...params, ...extra, model: id }));
      assert.equal(auth, 0); assert.equal(calls.length, 0);
    });
  }
}
const invalid = [
  ['luma-flash-reframe', { aspect_ratio: '2:1' }, 'aspect_ratio'], ['luma-flash-reframe', { duration: 6 }, 'duration'],
  ['luma-flash-reframe', { resolution: '720p' }, 'resolution'], ['luma-flash-reframe', { image_url: [] }, 'image_url'],
  ['add-video-watermark', { watermark_image_url: undefined }, 'watermark_image_url'],
  ['add-video-watermark', { position: 'bottom' }, 'position'],
  ...[-0.1, 1.01, '0.5'].map(opacity => ['add-video-watermark', { opacity }, 'opacity']),
  ...[0.09, 1.01].map(scale => ['add-video-watermark', { scale }, 'scale']),
  ['add-video-watermark', { start_time: 1 }, 'start_time'], ['add-video-watermark', { width: 1024 }, 'width'],
  ['ai-captions', { language: 'auto' }, 'language'], ['ai-captions', { theme: 'unknown' }, 'theme'],
  ['ai-captions', { response_format: 'srt' }, 'response_format'], ['ai-captions', { position: 'center' }, 'position'],
  ['video-watermark-remover', { prompt: 'Remove' }, 'prompt'], ['seedance-2-watermark-remover', { region: [0, 0, 10, 10] }, 'region'],
  ['seedance-2-video-watermark-remover-pro', { duration: 5 }, 'duration'],
  ['ai-captions', { video_url: 'not-a-url' }, 'video_url'],
  ['ai-captions', { video_url: 'https://example.com/' + 'a'.repeat(2083) }, 'video_url'],
  ['ai-captions', { options: { model: 'overridden' } }, 'options.model'],
  ['ai-captions', { raw: { video_url: video } }, 'raw'],
];
for (const [id, extra, expectedPath] of invalid) test(`${id}: rejects cross-family or invalid ${expectedPath}`, async t => {
  const calls = fake(t), params = { ...cases.find(([m]) => m === id)[1], ...extra };
  await assert.rejects(processV2V(key, { ...params, model: id }), e => e.path === expectedPath);
  const bridge = createExecutionBridge(), plan = await bridge.plan({ workflow: workflow(id, params), nodeId: 'utility' });
  assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].path, expectedPath); assert.equal(calls.length, 0);
});
test('utility defaults and optional image/reference semantics stay explicit', () => {
  const reframed = buildV2VRequest({ model: 'luma-flash-reframe', video_url: video });
  assert.deepEqual(reframed.payload, { video_url: video, aspect_ratio: '1:1', duration: 5 });
  assert.equal(reframed.v2v.utility.classification, 'GENERATIVE_AI');
  assert.notEqual(getVideoToolPresentation(getV2VExecutionModel('add-video-watermark')).actionLabel, 'Remove watermark');
  assert.deepEqual(buildV2VRequest({ model: 'ai-captions', video_url: video }).payload, { video_url: video, language: 'English', theme: 'Hormozi_1' });
  assert.deepEqual(buildV2VRequest({ model: 'add-video-watermark', video_url: video, image_url: image }).payload, { video_url: video, watermark_image_url: image, position: 'bottom-right', opacity: 0.7, scale: 0.15 });
  assert.deepEqual(getV2VMediaInputs('add-video-watermark').map(r => [r.field, r.type]), [['watermark_image_url', 'image'], ['video_url', 'video']]);
});
test('MMAudio/depth and unrelated unresolved/specialized routes do not gain generic admission', async t => {
  const calls = fake(t), bridge = createExecutionBridge();
  assert.equal(v2vModels.filter(m => getV2VExecutionModel(m.id)).length, 29);
  for (const id of ['mmaudio-v2-video-to-video', 'depth-anything', 'gemini-omni-video-edit', 'ai-dance-effects', 'remix-video', 'ai-video-upscaler-pro', 'happy-horse-1-video-edit', 'seedance-2.5-video-edit-4k', 'kling-v3.0-pro-motion-control', 'wan2.2-animate', 'infinitetalk-video-to-video', 'volcengine-video-to-video-lip-sync']) {
    assert.equal(getV2VExecutionModel(id), null); assert.equal(findRemote(id, 'v2v'), null);
    assert.equal((await bridge.plan({ workflow: workflow(id, { video_url: video }), nodeId: 'utility' })).status, 'rejected');
  }
  assert.equal(calls.length, 0);
});
test('native nested outputs and all actual metadata survive without invented subtitle/depth artifacts', async t => {
  fake(t, false, { output: { outputs: ['https://example.com/two.mp4', 'https://example.com/one.mp4'], diagnostic: { language: 'French' } }, subtitles: [{ provider_supplied: true }] });
  const result = await createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key }) }).execute({ workflow: workflow('ai-captions', { video_url: video }), nodeId: 'utility' }, { allowExecution: true });
  assert.deepEqual(result.outputs.map(r => r.value), ['https://example.com/two.mp4', 'https://example.com/one.mp4']);
  assert.deepEqual(result.upstream.subtitles, [{ provider_supplied: true }]); assert.equal(Object.hasOwn(result, 'transcript'), false); assert.equal(Object.hasOwn(result, 'subtitleFile'), false);
});
test('project source-video and watermark-image roles resolve separately with integrity and logical plans', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'v2v-utility-')), root = path.join(directory, 'project'); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { project } = await createProject(root, { title: 'Watermark assets' }), assets = [];
  for (const [id, type] of [['clip', 'video'], ['logo', 'image']]) { const sourcePath = path.join(directory, id); await fs.writeFile(sourcePath, id); const imported = await project.importAsset({ assetId: id, contentType: type + '/fixture', sourcePath }); assets.push({ id, type, localPath: imported.asset.path }); }
  const w = workflow('add-video-watermark', { opacity: 0.5 }); w.assets = assets; w.nodes[0].assetRefs = ['clip', 'logo']; w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }, { id: 'watermark_image_url', type: 'image' }];
  const calls = fake(t), uploaded = [], runtime = createApplicationRuntime({ getApiKey: () => key }); runtime.canUpload = () => true; runtime.upload = async r => { uploaded.push(r.assetId); return `https://example.com/asset-${uploaded.length}`; };
  const bridge = createExecutionBridge({ runtime }), request = { workflow: w, project, nodeId: 'utility', assetBindings: { video_url: 'clip', watermark_image_url: 'logo' } };
  const before = hashWorkflow(w), plan = await bridge.plan(request); assert.equal(plan.status, 'planned', JSON.stringify(plan));
  assert.deepEqual(plan.requiredUploads.map(r => [r.field, r.relativePath]), [['video_url', assets[0].localPath], ['watermark_image_url', assets[1].localPath]]);
  assert.equal(calls.length, 0); assert.equal(uploaded.length, 0); assert.ok(!JSON.stringify(plan).includes(root));
  for (const assetBindings of [{ video_url: 'logo', watermark_image_url: 'clip' }, { video_url: 'clip', watermark_image_url: 'clip' }, { video_url: ['clip'], watermark_image_url: 'logo' }, { video_url: '../clip' }, { opacity: 'logo' }]) assert.equal((await bridge.plan({ ...request, assetBindings })).status, 'rejected');
  assert.equal((await bridge.execute(request, { allowExecution: true })).status, 'succeeded'); assert.deepEqual(uploaded, ['clip', 'logo']);
  const payload = JSON.parse(calls[0].body); assert.equal(payload.video_url, 'https://example.com/asset-1'); assert.equal(payload.watermark_image_url, 'https://example.com/asset-2'); assert.equal(hashWorkflow(w), before);
  await fs.writeFile(path.join(root, assets[1].localPath), 'corrupt'); assert.equal((await bridge.plan(request)).status, 'rejected');
});

test('75-row review classifications match exact execution admission without hidden family expansion', async () => {
  const document = await fs.readFile(new URL('../lib/whihm-execution/V2V_CONTRACT_REVIEW.md', import.meta.url), 'utf8');
  const entries = [...document.matchAll(/^\| `([^`]+)`[^|]* \| ([DFIRS]) \|/gm)].map(m => [m[1], m[2]]);
  assert.equal(entries.length, 75); assert.equal(new Set(entries.map(([id]) => id)).size, 75);
  assert.deepEqual(Object.fromEntries('DFIRS'.split('').map(c => [c, entries.filter(([, value]) => value === c).length])), { D: 33, F: 13, I: 9, R: 16, S: 4 });
  for (const [id, status] of entries) assert.equal(Boolean(getV2VExecutionModel(id)), ['F', 'R'].includes(status), id);
});

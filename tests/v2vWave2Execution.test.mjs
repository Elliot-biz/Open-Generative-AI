import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processV2V } from '../packages/studio/src/muapi.js';
import { buildV2VRequest } from '../packages/studio/src/v2vInputContracts.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const video = 'https://example.com/source.mp4', key = 'wave2-test-placeholder';
const gemini = 'gemini-omni-flash-1-1-edit', full = 'flux-3-video-extend';
const draft = 'flux-3-video-extend-draft', upscale = 'flux-3-video-upscaler';
const cases = [
  [gemini, { prompt: '  Make the scene cinematic. Keep the subject.  ', video_url: video, resolution: '4k' }],
  [full, { prompt: '  Continue the action  ', video_url: video, aspect_ratio: '21:9', resolution: '1080p', duration: 20, generate_audio: false }],
  [draft, { prompt: 'Test continuity', video_url: video, aspect_ratio: '3:4', duration: 5, generate_audio: true }],
  [upscale, { video_url: video, prompt: '  Refine fine detail  ', upscale_factor: 1.25, creativity: 1 }],
];
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'wave2-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4', cost: 0.4 } };
  });
  return calls;
}
function workflow(model, parameters) {
  return createWorkflow({ workflowId: 'wave2_workflow', name: 'Wave 2', nodes: [{
    id: 'transform', title: 'Independent custom title', kind: 'video', inputs: [], outputs: [{ id: 'out', type: 'video' }],
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'v2v' } }, parameters: structuredClone(parameters),
  }] });
}
for (const [model, parameters] of cases) {
  test(`${model}: shared/application parity retains exact payload and selected endpoint`, async t => {
    const calls = fake(t), params = { model, ...parameters }, before = structuredClone(params);
    const client = new MuapiClient(); client.getKey = () => key;
    assert.deepEqual(await client.processV2V(params), await processV2V(key, params));
    assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${model}`);
    assert.deepEqual(JSON.parse(calls[0].body), parameters); assert.deepEqual(params, before);
    assert.equal(calls[0].headers['x-api-key'], key);
  });
  test(`${model}: canonical plan and readiness are passive; authorized execution uses shared service`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(model, parameters), before = structuredClone(w), req = { workflow: w, nodeId: 'transform' };
    const plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned'); assert.equal(plan.model, model); assert.equal(plan.provider, 'muapi');
    assert.equal(plan.runtime, 'studio.processV2V'); assert.equal(plan.title, 'Independent custom title');
    assert.equal(plan.request.endpoint, model); assert.deepEqual(plan.request.requiredMedia.map(m => m.field), ['video_url']);
    assert.equal(plan.request.v2v.requiredInputs.includes('prompt'), model !== upscale);
    assert.equal(plan.request.v2v.operation, model === gemini ? 'edit' : model === upscale ? 'upscale' : 'extend');
    for (const [field, value] of Object.entries(parameters)) assert.deepEqual(plan.resolvedInputs[field], value);
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T17:00:00Z' });
    assert.equal(evidence.context.executors[0].available, true);
    assert.equal(evidence.provenance.executors.transform.runtime, 'studio.processV2V');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    const result = await bridge.execute(req, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.nodeId, 'transform'); assert.equal(result.model, model);
    assert.equal(result.cost, 0.4); assert.deepEqual(JSON.parse(calls[0].body), parameters);
    assert.deepEqual(w, before); assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  [gemini, { resolution: '480p' }, 'V2V_OPTION_INVALID', 'resolution'],
  [gemini, { image_url: 'https://example.com/ref.png' }, 'V2V_OPTION_UNSUPPORTED', 'image_url'],
  [gemini, { duration: 5 }, 'V2V_OPTION_UNSUPPORTED', 'duration'],
  [gemini, { prompt: '' }, 'V2V_REQUIRED_INPUT_MISSING', 'prompt'],
  [gemini, { video_url: '' }, 'V2V_REQUIRED_INPUT_MISSING', 'video_url'],
  [full, { aspect_ratio: '5:4' }, 'V2V_OPTION_INVALID', 'aspect_ratio'],
  [full, { aspect_ratio: '2:1' }, 'V2V_OPTION_INVALID', 'aspect_ratio'], // Not declared by current OGA catalog.
  [full, { resolution: '4k' }, 'V2V_OPTION_INVALID', 'resolution'],
  [full, { duration: 4 }, 'V2V_OPTION_INVALID', 'duration'],
  [full, { duration: 21 }, 'V2V_OPTION_INVALID', 'duration'],
  [full, { duration: 5.5 }, 'V2V_OPTION_INVALID', 'duration'],
  [full, { generate_audio: 'false' }, 'V2V_OPTION_INVALID', 'generate_audio'],
  [full, { seed: 42 }, 'V2V_OPTION_UNSUPPORTED', 'seed'],
  [draft, { resolution: '720p' }, 'V2V_OPTION_UNSUPPORTED', 'resolution'],
  [draft, { duration: 21 }, 'V2V_OPTION_INVALID', 'duration'],
  [draft, { duration: '5' }, 'V2V_OPTION_INVALID', 'duration'],
  [draft, { aspect_ratio: '2:1' }, 'V2V_OPTION_INVALID', 'aspect_ratio'],
  [draft, { prompt: '   ' }, 'V2V_REQUIRED_INPUT_MISSING', 'prompt'],
  [upscale, { upscale_factor: 0.9 }, 'V2V_OPTION_INVALID', 'upscale_factor'],
  [upscale, { upscale_factor: 4.1 }, 'V2V_OPTION_INVALID', 'upscale_factor'],
  [upscale, { upscale_factor: '2' }, 'V2V_OPTION_INVALID', 'upscale_factor'],
  [upscale, { creativity: 2 }, 'V2V_OPTION_INVALID', 'creativity'],
  [upscale, { creativity: 0.5 }, 'V2V_OPTION_INVALID', 'creativity'],
  [upscale, { prompt: null }, 'V2V_OPTION_INVALID', 'prompt'],
  [upscale, { copy_audio: true }, 'V2V_OPTION_UNSUPPORTED', 'copy_audio'],
  [upscale, { resolution: '1080p' }, 'V2V_OPTION_UNSUPPORTED', 'resolution'],
  [upscale, { raw: { provider: 'payload' } }, 'V2V_OPTION_UNSUPPORTED', 'raw'],
  [upscale, { webhook_url: 'https://example.com/callback' }, 'V2V_OPTION_UNSUPPORTED', 'webhook_url'],
];
for (const [model, patch, code, path] of invalid) test(`${model}: reject ${JSON.stringify(patch)} before auth/upload/transport`, async t => {
  const calls = fake(t); let auth = 0, loaded = 0;
  const parameters = { ...cases.find(c => c[0] === model)[1], ...patch };
  await assert.rejects(processV2V(key, { model, ...parameters }), { code, path });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; }, fileFromPath: () => { loaded++; } }) });
  const req = { workflow: workflow(model, parameters), nodeId: 'transform' };
  for (const r of [await bridge.plan(req), await bridge.execute(req, { allowExecution: true })]) {
    assert.equal(r.status, 'rejected'); assert.equal(r.diagnostics[0].code, code); assert.equal(r.diagnostics[0].path, path);
  }
  assert.equal(calls.length, 0); assert.equal(auth, 0); assert.equal(loaded, 0);
});
test('provider/catalog defaults and full/draft distinctions are visible in plans', async t => {
  const calls = fake(t), bridge = createExecutionBridge();
  for (const [model, defaults] of [
    [gemini, { resolution: '720p' }],
    [full, { aspect_ratio: '16:9', resolution: '720p', duration: 5, generate_audio: true }],
    [draft, { duration: 5, generate_audio: true }],
    [upscale, { upscale_factor: 2, creativity: 0 }],
  ]) {
    const p = await bridge.plan({ workflow: workflow(model, { video_url: video, ...(model !== upscale ? { prompt: 'Continue' } : {}) }), nodeId: 'transform' });
    assert.equal(p.status, 'planned');
    for (const [field, value] of Object.entries(defaults)) assert.equal(p.request.effectiveOptions[field], value);
    if (model === draft) {
      assert.equal(Object.hasOwn(p.request.effectiveOptions, 'aspect_ratio'), false);
      assert.equal(p.request.supportedOptions.includes('resolution'), false);
      assert.match(p.request.v2v.purpose, /draft/i);
    }
    if (model === upscale) {
      assert.match(p.request.v2v.purpose, /AI-based/); assert.match(p.request.v2v.purpose, /Creative/);
      assert.match(p.request.v2v.purpose, /neither mode guarantees deterministic pixel preservation/);
      assert.deepEqual(p.request.v2v.controls.creativity.enum, [0, 1]);
      assert.equal(p.request.v2v.requiredInputs.includes('prompt'), false);
    }
  }
  assert.equal(calls.length, 0);
});
test('supported boundaries preserve exact durations, fractional scale and optional prompt', async t => {
  const calls = fake(t);
  for (const duration of [5, 20]) for (const model of [full, draft]) {
    await processV2V(key, { model, video_url: video, prompt: 'Continue', duration, generate_audio: false });
    assert.equal(JSON.parse(calls.at(-1).body).duration, duration);
  }
  for (const factor of [1, 1.25, 2.5, 4]) for (const creativity of [0, 1]) {
    await processV2V(key, { model: upscale, video_url: video, upscale_factor: factor, creativity });
    const p = JSON.parse(calls.at(-1).body);
    assert.equal(p.upscale_factor, factor); assert.equal(p.creativity, creativity);
    assert.equal(Object.hasOwn(p, 'prompt'), false);
  }
  await processV2V(key, { model: upscale, video_url: video, prompt: '' });
  assert.equal(JSON.parse(calls.at(-1).body).prompt, '');
});
test('existing request-ID callback and polling lifecycle remain shared', async t => {
  const calls = fake(t, true), ids = [];
  const r = await processV2V(key, { model: full, ...cases[1][1], onRequestId: id => ids.push(id) });
  assert.deepEqual(ids, ['wave2-job']); assert.equal(r.request_id, 'wave2-job'); assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/predictions/wave2-job/result'));
});
test('project source assets plan without bytes/auth and use existing upload path only when authorized', async t => {
  const calls = fake(t), loaded = [], w = workflow(gemini, { prompt: 'Edit', resolution: '1080p' });
  w.assets = [{ id: 'source', type: 'video', localPath: 'assets/source.mp4' }];
  w.nodes[0].assetRefs = ['source']; w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }];
  const before = structuredClone(w), project = { async resolveProjectAssetPath() {
    return { status: 'ok', relativePath: 'assets/source.mp4', resolvedPath: '/transient/assets/source.mp4' };
  } };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key,
    fileFromPath: async (_path, asset) => { loaded.push(asset.assetId); return asset.assetId; },
    remote: { processV2V, uploadFile: async () => video } }) });
  const req = { workflow: w, nodeId: 'transform', project, assetBindings: { video_url: 'source' } };
  const p = await bridge.plan(req);
  assert.equal(p.status, 'planned'); assert.equal(p.requiredUploads[0].relativePath, 'assets/source.mp4');
  assert.equal(loaded.length, 0); assert.equal(calls.length, 0); assert.ok(!JSON.stringify(p).includes('/transient/'));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(loaded, ['source']); assert.equal(JSON.parse(calls[0].body).video_url, video); assert.deepEqual(w, before);
});
test('unrelated and specialized routes remain outside generic Wave 2 admission', async t => {
  const calls = fake(t);
  for (const id of ['gemini-omni-video-edit', 'luma-flash-reframe', 'invented']) assert.equal(findRemote(id, 'v2v'), null);
  assert.equal(findRemote('wan2.2-animate', 'v2v'), null);
  assert.equal(findRemote('wan2.2-animate-recast').mode, 'recast');
  assert.equal(findRemote('seedance-2.5-motion-control').mode, 'motion_control');
  assert.equal(calls.length, 0);
});

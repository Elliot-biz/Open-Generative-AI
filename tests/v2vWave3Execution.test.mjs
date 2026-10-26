import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflow } from 'whihm-workflow-core';
import { processV2V } from '../packages/studio/src/muapi.js';
import { getV2VModelById } from '../packages/studio/src/models.js';
import { buildSupplementalInputPayload, createModelParameterValues } from '../packages/studio/src/modelParameters.js';
import { buildV2VRequest } from '../packages/studio/src/v2vInputContracts.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';

const video = 'https://example.com/source.mp4', key = 'wave3-test-placeholder';
const creative = 'topaz-upscale-video-creative', generative = 'topaz-upscale-video-generative', precision = 'topaz-upscale-video-precision';
const cases = [
  [creative, { video_url: video, prompt: '  Enhance detail  ', creativity: 0.8, realism: 0.6, sharp: 0.7, upscale_factor: 1.25, target_fps: 60, H264_output: true }],
  [generative, { video_url: video, topaz_model: 'Starlight Precise 2.6', upscale_factor: 2.5, target_fps: 24, softness: 4, H264_output: false }],
  [precision, { video_url: video, topaz_model: 'Proteus Natural', upscale_factor: 4, target_fps: 16, compression: 0.2, noise: 0.3,
    halo: 0.4, grain: 0.05, recover_detail: 0.6, H264_output: true }],
];
function wire(parameters) {
  const { topaz_model, ...rest } = parameters;
  return topaz_model === undefined ? rest : { ...rest, model: topaz_model };
}
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'wave3-job' }
      : { status: 'completed', outputs: ['https://example.com/result.mp4'], url: 'https://example.com/result.mp4', model: 'upstream-engine-metadata', cost: 0.4 } };
  });
  return calls;
}
function workflow(model, parameters) {
  return createWorkflow({ workflowId: 'wave3_workflow', name: 'Wave 3', nodes: [{
    id: 'enhance', title: 'Independent title', kind: 'video', inputs: [], outputs: [{ id: 'out', type: 'video' }],
    executor: { id: 'studio', type: 'remote-model', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    metadata: { oga: { mode: 'v2v' } }, parameters: structuredClone(parameters),
  }] });
}
for (const [model, parameters] of cases) {
  test(`${model}: shared/application payloads retain every control and distinct executor identity`, async t => {
    const calls = fake(t), client = new MuapiClient(); client.getKey = () => key;
    const request = { model, ...parameters }, before = structuredClone(request);
    assert.deepEqual(await processV2V(key, request), await client.processV2V(request));
    assert.deepEqual(calls[0], calls[1]); assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${model}`);
    const payload = JSON.parse(calls[0].body);
    assert.deepEqual(payload, wire(parameters)); assert.equal(Object.hasOwn(payload, 'topaz_model'), false);
    assert.notEqual(payload.model, model); assert.deepEqual(request, before);
  });
  test(`${model}: plan exposes canonical identity and provider engine without transport or auth`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(model, parameters), before = structuredClone(w), request = { workflow: w, nodeId: 'enhance' };
    const plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned'); assert.equal(plan.model, model); assert.equal(plan.provider, 'muapi');
    assert.equal(plan.runtime, 'studio.processV2V'); assert.equal(plan.request.endpoint, model);
    assert.deepEqual(plan.request.requiredMedia.map(m => m.field), ['video_url']);
    assert.match(plan.request.v2v.purpose, /AI/); assert.match(plan.request.v2v.purpose, /guarantee/);
    assert.equal(plan.request.supportedOptions.includes('model'), false);
    for (const [field, value] of Object.entries(parameters).filter(([k]) => k !== 'video_url')) assert.deepEqual(plan.request.effectiveOptions[field], value);
    if (model !== creative) {
      assert.equal(plan.request.v2v.providerModel, parameters.topaz_model);
      assert.equal(plan.request.v2v.providerModelField, 'model');
      assert.equal(plan.resolvedInputs.topaz_model, parameters.topaz_model);
      assert.ok(plan.request.upstreamParameterKeys.includes('model'));
      assert.equal(plan.request.upstreamParameterKeys.includes('topaz_model'), false);
    } else assert.equal(Object.hasOwn(plan.request.v2v, 'providerModel'), false);
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-25T19:00:00Z' });
    assert.equal(evidence.context.executors[0].available, true);
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    const result = await bridge.execute(request, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.model, model); assert.equal(result.nodeId, 'enhance');
    assert.equal(result.upstream.model, 'upstream-engine-metadata'); assert.equal(result.cost, 0.4);
    assert.deepEqual(JSON.parse(calls[0].body), wire(parameters)); assert.deepEqual(w, before);
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ...[creative, generative, precision].flatMap(model => [
    [{ upscale_factor: 0.99 }, 'V2V_OPTION_INVALID', 'upscale_factor'],
    [{ upscale_factor: 4.01 }, 'V2V_OPTION_INVALID', 'upscale_factor'],
    [{ upscale_factor: '2' }, 'V2V_OPTION_INVALID', 'upscale_factor'],
    [{ target_fps: 15 }, 'V2V_OPTION_INVALID', 'target_fps'],
    [{ target_fps: 61 }, 'V2V_OPTION_INVALID', 'target_fps'],
    [{ target_fps: 24.5 }, 'V2V_OPTION_INVALID', 'target_fps'],
    [{ H264_output: 'true' }, 'V2V_OPTION_INVALID', 'H264_output'],
    [{ video_url: '' }, 'V2V_REQUIRED_INPUT_MISSING', 'video_url'],
    [{ provider_options: { model: 'arbitrary' } }, 'V2V_OPTION_UNSUPPORTED', 'provider_options'],
    [{ options: { model: 'arbitrary' } }, 'V2V_OPTION_UNSUPPORTED', 'options.model'],
  ].map(row => [model, ...row])),
  ...['creativity', 'realism', 'sharp'].flatMap(field => [-0.01, 1.01].map(value => [creative, { [field]: value }, 'V2V_OPTION_INVALID', field])),
  ...['compression', 'noise', 'halo', 'grain', 'recover_detail'].flatMap(field => [-0.01, field === 'grain' ? 0.1001 : 1.01]
    .map(value => [precision, { [field]: value }, 'V2V_OPTION_INVALID', field])),
  [creative, { topaz_model: 'Proteus' }, 'V2V_OPTION_UNSUPPORTED', 'topaz_model'],
  [creative, { softness: 2 }, 'V2V_OPTION_UNSUPPORTED', 'softness'],
  [creative, { noise: 0.5 }, 'V2V_OPTION_UNSUPPORTED', 'noise'],
  [creative, { prompt: 'x'.repeat(1025) }, 'V2V_OPTION_INVALID', 'prompt'],
  [generative, { topaz_model: 'Proteus' }, 'V2V_OPTION_INVALID', 'topaz_model'],
  [generative, { topaz_model: generative }, 'V2V_OPTION_INVALID', 'topaz_model'],
  [generative, { topaz_model: 'Starlight HQ', softness: 2 }, 'V2V_OPTION_INVALID', 'softness'],
  [generative, { softness: 0 }, 'V2V_OPTION_INVALID', 'softness'],
  [generative, { softness: 6 }, 'V2V_OPTION_INVALID', 'softness'],
  [generative, { softness: 1.5 }, 'V2V_OPTION_INVALID', 'softness'],
  [generative, { creativity: 0.5 }, 'V2V_OPTION_UNSUPPORTED', 'creativity'],
  [generative, { noise: 0.5 }, 'V2V_OPTION_UNSUPPORTED', 'noise'],
  [generative, { prompt: 'Refine' }, 'V2V_OPTION_UNSUPPORTED', 'prompt'],
  [precision, { topaz_model: 'Starlight HQ' }, 'V2V_OPTION_INVALID', 'topaz_model'],
  [precision, { topaz_model: null }, 'V2V_OPTION_INVALID', 'topaz_model'],
  [precision, { softness: 2 }, 'V2V_OPTION_UNSUPPORTED', 'softness'],
  [precision, { creativity: 0.5 }, 'V2V_OPTION_UNSUPPORTED', 'creativity'],
  [precision, { prompt: 'Refine' }, 'V2V_OPTION_UNSUPPORTED', 'prompt'],
];
for (const [model, patch, code, path] of invalid) test(`${model}: invalid ${path} rejects before auth/upload/submission`, async t => {
  const calls = fake(t); let auth = 0, loaded = 0;
  const parameters = { ...cases.find(c => c[0] === model)[1], ...patch };
  await assert.rejects(processV2V(key, { model, ...parameters }), { code, path });
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; }, fileFromPath: () => { loaded++; } }) });
  const request = { workflow: workflow(model, parameters), nodeId: 'enhance' };
  for (const r of [await bridge.plan(request), await bridge.execute(request, { allowExecution: true })]) {
    assert.equal(r.status, 'rejected'); assert.equal(r.diagnostics[0].code, code); assert.equal(r.diagnostics[0].path, path);
  }
  assert.equal(auth, 0); assert.equal(loaded, 0); assert.equal(calls.length, 0);
});
test('canonical selected model cannot be overridden by root parameters or generic options', async t => {
  const calls = fake(t), bridge = createExecutionBridge();
  for (const model of [generative, precision]) {
    for (const override of [model, 'Proteus']) {
      const request = { workflow: workflow(model, { video_url: video, model: override }), nodeId: 'enhance' };
      assert.equal((await bridge.plan(request)).diagnostics[0].code, 'IDENTITY_OVERRIDE');
    }
    const w = workflow(model, { video_url: video }); w.nodes[0].inputs = [{ id: 'model', type: 'text' }];
    assert.equal((await bridge.plan({ workflow: w, nodeId: 'enhance', inputs: { model: 'Proteus' } })).diagnostics[0].code, 'IDENTITY_OVERRIDE');
  }
  assert.throws(() => buildV2VRequest({ model: 'Proteus', topaz_model: 'Proteus', video_url: video }), { code: 'V2V_MODEL_UNSUPPORTED' });
  assert.equal(calls.length, 0);
});
test('explicit defaults distinguish provider engine from executor, without invented FPS or tuning', async t => {
  const calls = fake(t), bridge = createExecutionBridge();
  for (const [model, extras] of [[creative, { creativity: 0.5 }], [generative, { model: 'Starlight Precise 2.6' }], [precision, { model: 'Proteus' }]]) {
    await processV2V(key, { model, video_url: video });
    assert.deepEqual(JSON.parse(calls.at(-1).body), { video_url: video, upscale_factor: 2, H264_output: false, ...extras });
    const plan = await bridge.plan({ workflow: workflow(model, { video_url: video }), nodeId: 'enhance' });
    assert.equal(plan.model, model); assert.equal(Object.hasOwn(plan.request.effectiveOptions, 'model'), false);
    assert.equal(Object.hasOwn(plan.request.effectiveOptions, 'target_fps'), false);
    if (model !== creative) {
      assert.equal(plan.request.effectiveOptions.topaz_model, extras.model);
      assert.equal(plan.request.v2v.providerModel, extras.model);
    }
  }
});
test('all existing declared engines remain selectable without substitution or canonical identity loss', async t => {
  const calls = fake(t);
  for (const [model, count] of [[generative, 5], [precision, 21]]) {
    const engines = getV2VModelById(model).inputs.topaz_model.enum; assert.equal(engines.length, count);
    for (const engine of engines) {
      const params = { model, video_url: video, topaz_model: engine, upscale_factor: 1.25 };
      await processV2V(key, params);
      assert.equal(calls.at(-1).url, `https://api.muapi.ai/api/v1/${model}`);
      assert.equal(JSON.parse(calls.at(-1).body).model, engine); assert.equal(params.model, model);
    }
  }
});
test('numeric and prompt boundaries are preserved exactly, not clamped or truncated', async t => {
  const calls = fake(t);
  for (const factor of [1, 1.25, 4]) {
    await processV2V(key, { model: creative, video_url: video, prompt: '🙂'.repeat(1024), creativity: 0, realism: 1, sharp: 0,
      upscale_factor: factor, target_fps: 16, H264_output: true });
    const payload = JSON.parse(calls.at(-1).body);
    assert.equal(payload.upscale_factor, factor); assert.equal([...payload.prompt].length, 1024);
    assert.equal(payload.realism, 1); assert.equal(payload.creativity, 0);
  }
  await processV2V(key, { model: generative, video_url: video, softness: 5, target_fps: 60 });
  assert.equal(JSON.parse(calls.at(-1).body).softness, 5);
  await processV2V(key, { model: precision, video_url: video, grain: 0.1, compression: 1, noise: 0, halo: 1, recover_detail: 0 });
  assert.equal(JSON.parse(calls.at(-1).body).grain, 0.1);
});
test('existing web parameter builder emits namespaced engine without overwriting selected endpoint', async t => {
  const calls = fake(t);
  for (const [model, engine] of [[generative, 'Starlight HQ'], [precision, 'Gaia CG']]) {
    const source = getV2VModelById(model);
    assert.equal(Object.hasOwn(source.inputs, 'model'), false);
    const values = createModelParameterValues(source, { topaz_model: engine, upscale_factor: 1.25, target_fps: 30, H264_output: true });
    const request = { model, ...buildSupplementalInputPayload(source, values), video_url: video };
    assert.equal(request.model, model); assert.equal(request.topaz_model, engine);
    await processV2V(key, request);
    const payload = JSON.parse(calls.at(-1).body);
    assert.equal(payload.model, engine); assert.equal(payload.upscale_factor, 1.25); assert.equal(payload.target_fps, 30);
  }
});
test('project asset paths remain relative while upload and existing polling see native controls', async t => {
  const calls = fake(t, true), loaded = [], w = workflow(precision, { topaz_model: 'Proteus', upscale_factor: 2, target_fps: 24 });
  w.assets = [{ id: 'source', type: 'video', localPath: 'assets/source.mp4' }];
  w.nodes[0].assetRefs = ['source']; w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }];
  const before = structuredClone(w), project = { async resolveProjectAssetPath() { return { status: 'ok', relativePath: 'assets/source.mp4', resolvedPath: '/transient/assets/source.mp4' }; } };
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key,
    fileFromPath: async (_path, asset) => { loaded.push(asset.assetId); return asset.assetId; }, remote: { processV2V, uploadFile: async () => video } }) });
  const request = { workflow: w, nodeId: 'enhance', project, assetBindings: { video_url: 'source' } };
  const plan = await bridge.plan(request);
  assert.equal(plan.status, 'planned'); assert.equal(plan.requiredUploads[0].relativePath, 'assets/source.mp4');
  assert.equal(loaded.length, 0); assert.equal(calls.length, 0); assert.ok(!JSON.stringify(plan).includes('/transient/'));
  const result = await bridge.execute(request, { allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.requestId, 'wave3-job'); assert.equal(result.model, precision);
  assert.equal(JSON.parse(calls[0].body).model, 'Proteus'); assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/predictions/wave3-job/result')); assert.deepEqual(loaded, ['source']); assert.deepEqual(w, before);
});
test('unreviewed and specialized routes remain separate without automatic substitution', async t => {
  const calls = fake(t);
  for (const id of ['gemini-omni-video-edit', 'mmaudio-v2-video-to-video', 'invented']) assert.equal(findRemote(id, 'v2v'), null);
  assert.equal(findRemote('wan2.2-animate', 'v2v'), null);
  assert.equal(findRemote('wan2.2-animate-recast').mode, 'recast');
  assert.equal(findRemote('seedance-2.5-motion-control').mode, 'motion_control');
  assert.equal(calls.length, 0);
});

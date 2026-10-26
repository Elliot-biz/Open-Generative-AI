import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject } from 'whihm-workflow-core';
import { getI2IModelById, getSelectableAspectRatiosForI2IModel } from '../packages/studio/src/models.js';
import { buildSupplementalInputPayload, createModelParameterValues } from '../packages/studio/src/modelParameters.js';
import { buildAdvancedImageRequest, getAdvancedImageModel, getAdvancedImageStatus, getAdvancedImageMediaInputs, normalizeAdvancedImageResult } from '../packages/studio/src/advancedImageInputContracts.js';
import { generateImage, generateI2I, decomposeLayers } from '../packages/studio/src/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';
const a = 'https://example.com/a.png', b = 'https://example.com/b.png', key = 'fixture-only-key';
const cases = [
  ...['t2i', 'i2i'].flatMap(mode => [
    ['flux-pulid', mode, { prompt: 'Same person, different painting', image_url: a, aspect_ratio: '9:16' }],
    ['flux-redux', mode, { prompt: 'Reimagine the composition', image_url: a, num_images: 2 }],
  ]),
  ['minimax-image-01-subject-reference', 'i2i', { prompt: 'Same subject', image_url: a }],
  ['ideogram-character', 'i2i', { prompt: 'Character', image_url: a, style: 'Fiction', render_speed: 'Quality' }],
  ['vidu-q2-reference-to-image', 'i2i', { prompt: 'Compose subjects', images_list: [b, a], resolution: '2k' }],
  ['gemini-omni-character', 'i2i', { descriptions: '  Character description  ', images_list: [a], character_name: 'Hero', audio_ids: ['voice-profile'] }],
  ['topaz-image-upscale', 'i2i', { image_url: a, upscale_factor: 8 }],
  ['topaz-upscale-image-creative', 'i2i', { image_url: a, topaz_model: 'Bloom Realism', creativity: 8, autoprompt: true, color_preservation: true, upscale_factor: 1.5 }],
  ['topaz-upscale-image-generative', 'i2i', { image_url: a, topaz_model: 'Redefine', creativity: 4, texture: 2, prompt: 'Fine texture', sharpen: 0.3, denoise: 0.4, detail: 0.5, face_enhancement_strength: 0.6 }],
  ['topaz-upscale-image-precision', 'i2i', { image_url: a, topaz_model: 'Faces', fix_compression: 0.4, strength: 0.01, face_enhancement_creativity: 0.1 }],
  ['seedvr2-image-upscale', 'i2i', { image_url: a, resolution: '8k' }],
  ['ai-skin-enhancer', 'i2i', { image_url: a }],
  ['bytedance-seedream-5.0-pro-layer', 'i2i', { image_url: a, prompt: 'Separate foreground', output_format: 'png' }],
  ['seedream-5.0-flash-layerize', 'i2i', { image_url: a, resolution: '1.5K', output_format: 'jpeg' }],
  ['face-expression-change', 'i2i', { images_list: [a, b], move_forward: 1.2, vertical_angle: -0.5, rotate_right_left: 45, wide_angle_lens: true }],
];
function workflow(id, mode, parameters) {
  return createWorkflow({ workflowId: 'advanced_image', name: 'Advanced image', nodes: [{ id: 'image', title: 'Independent title', kind: 'image-generation',
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model: id, mayCostMoney: true, requiresConfirmation: true }, metadata: { oga: { mode } },
    parameters: structuredClone(parameters), inputs: [], outputs: [{ id: 'result', type: 'image' }],
  }] });
}
function fake(t, layers = false, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'image-job' }
      : { status: 'completed', ...(layers ? { output: { images: [b, a], labels: ['foreground', 'background'], masks: ['opaque-provider-metadata'] } } : { outputs: [b, a] }), cost: 0.25 } };
  }); return calls;
}
for (const [id, mode, parameters] of cases) {
  test(`${id}/${mode}: shared contract preserves inputs, controls and results`, async t => {
    const layers = getAdvancedImageStatus(id).resultKind === 'layers', calls = fake(t, layers, true), before = structuredClone(parameters);
    const method = mode === 't2i' ? generateImage : generateI2I;
    const expected = buildAdvancedImageRequest(id, mode, { ...parameters, model: id });
    const result = await method(key, { ...parameters, model: id });
    assert.ok(calls[0].url.endsWith(`/api/v1/${expected.endpoint}`)); assert.deepEqual(JSON.parse(calls[0].body), expected.payload);
    for (const [field, value] of Object.entries(parameters)) assert.deepEqual(expected.payload[field === 'topaz_model' ? 'model' : field], value);
    assert.equal(result.request_id, 'image-job'); assert.equal(calls.length, 2);
    if (layers) { assert.deepEqual(result.images, [b, a]); assert.deepEqual(result.output.labels, ['foreground', 'background']); }
    else assert.deepEqual(result.outputs, [b, a]);
    assert.deepEqual(parameters, before);
  });
  test(`${id}/${mode}: plan/readiness is passive; authorized canonical path uses existing service`, async t => {
    const calls = fake(t, getAdvancedImageStatus(id).resultKind === 'layers'); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(id, mode, parameters), before = structuredClone(w), req = { workflow: w, nodeId: 'image' };
    const plan = await bridge.plan(req);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.model, id); assert.equal(plan.title, 'Independent title');
    assert.equal(plan.request.image.modelId, id); assert.equal(plan.request.image.providerModel, parameters.topaz_model ?? getAdvancedImageModel(id, mode).inputs.topaz_model?.default ?? null);
    const evidence = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-26T16:00:00Z' });
    assert.equal(evidence.provenance.executors.image.state, 'AVAILABLE');
    assert.equal(calls.length, 0); assert.equal(auth, 0);
    assert.equal((await bridge.execute(req)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await bridge.execute(req, { allowExecution: true });
    assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(result.model, id); assert.equal(result.cost, 0.25);
    assert.deepEqual(JSON.parse(calls[0].body), plan.request.image.providerRequest.payload);
    assert.equal(calls.length, 1); assert.equal(auth, 1); assert.deepEqual(w, before);
    if (plan.request.image.resultKind === 'layers') {
      assert.equal(result.resultKind, 'layers'); assert.deepEqual(result.outputs.map(o => o.value), [b, a]);
      assert.deepEqual(result.upstream.output.masks, ['opaque-provider-metadata']);
    }
    assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ['flux-pulid', { prompt: 'Person' }, 'image_url'],
  ['flux-redux', { image_url: a }, 'prompt'],
  ['minimax-image-01-subject-reference', { image_url: a, prompt: '' }, 'prompt'],
  ['ideogram-character', { image_url: a, prompt: 'Hi', style: 'unknown' }, 'style'],
  ['vidu-q2-reference-to-image', { images_list: [], prompt: 'Hi' }, 'images_list'],
  ['vidu-q2-reference-to-image', { images_list: [a, ''], prompt: 'Hi' }, 'images_list'],
  ['vidu-q2-reference-to-image', { images_list: Array(8).fill(a), prompt: 'Hi' }, 'images_list'],
  ['vidu-q2-reference-to-image', { images_list: [a, b], image_url: b, prompt: 'Hi' }, 'images_list'],
  ['gemini-omni-character', { images_list: [a] }, 'descriptions'],
  ['gemini-omni-character', { images_list: [a, b], descriptions: 'Hi' }, 'images_list'],
  ['topaz-upscale-image-creative', { image_url: a, topaz_model: 'Wonder 3' }, 'topaz_model'],
  ['topaz-upscale-image-creative', { image_url: a, prompt: 'Not supported' }, 'prompt'],
  ['topaz-upscale-image-generative', { image_url: a, fix_compression: 0.5 }, 'fix_compression'],
  ['topaz-upscale-image-generative', { image_url: a, upscale_factor: 4.1 }, 'upscale_factor'],
  ['topaz-upscale-image-precision', { image_url: a, creativity: 5 }, 'creativity'],
  ['topaz-upscale-image-precision', { image_url: a, strength: 0 }, 'strength'],
  ['topaz-upscale-image-generative', { image_url: a, face_enhancement_strength: 1.1 }, 'face_enhancement_strength'],
  ['topaz-upscale-image-creative', { image_url: a, creativity: 1.5 }, 'creativity'],
  ['topaz-image-upscale', { image_url: a, upscale_factor: '2' }, 'upscale_factor'],
  ['seedvr2-image-upscale', { image_url: a, resolution: '4K' }, 'resolution'],
  ['ai-skin-enhancer', { image_url: a, prompt: 'Invented' }, 'prompt'],
  ['seedream-5.0-flash-layerize', { image_url: a, output_format: 'webp' }, 'output_format'],
  ['bytedance-seedream-5.0-pro-layer', {}, 'image_url'],
  ['face-expression-change', { images_list: [] }, 'images_list'],
  ['face-expression-change', { images_list: [a], expression: 'happy' }, 'expression'],
  ['face-expression-change', { images_list: [a], rotate_right_left: 91 }, 'rotate_right_left'],
  ['face-expression-change', { images_list: [a], vertical_angle: 2 }, 'vertical_angle'],
  ['face-expression-change', { images_list: [a], pose: 'jumping' }, 'pose'],
  ['flux-pulid', { image_url: a, prompt: 'Hi', garment_image_url: b }, 'garment_image_url'],
  ['flux-redux', { images_list: [a, b], prompt: 'Hi' }, 'images_list'],
  ['flux-pulid', { image_url: a, prompt: 'Hi', options: { model: 'arbitrary' } }, 'options'],
  ['flux-pulid', { image_url: a, prompt: 'Hi', raw: { any: true } }, 'raw'],
];
for (const [id, parameters, errorPath] of invalid) test(`${id}: invalid ${errorPath} rejected before auth/upload/transport`, async t => {
  const calls = fake(t); let auth = 0;
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const req = { workflow: workflow(id, 'i2i', parameters), nodeId: 'image' };
  const plan = await bridge.plan(req); assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].path, errorPath, JSON.stringify(plan));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'rejected');
  await assert.rejects(generateI2I(key, { ...parameters, model: id }), e => e.path === errorPath);
  assert.equal(calls.length, 0); assert.equal(auth, 0);
});

test('Topaz metadata and Studio parameter builder cannot overwrite selected executor', () => {
  for (const suffix of ['creative', 'generative', 'precision']) {
    const id = `topaz-upscale-image-${suffix}`, m = getI2IModelById(id), values = createModelParameterValues(m);
    assert.ok(m.inputs.topaz_model); assert.equal(m.inputs.model, undefined);
    const params = { model: id, ...buildSupplementalInputPayload(m, values), images_list: [a], image_url: a };
    assert.equal(params.model, id); assert.equal(getSelectableAspectRatiosForI2IModel(id).length, 0);
    const { payload, image } = buildAdvancedImageRequest(id, 'i2i', params);
    assert.equal(payload.model, m.inputs.topaz_model.default); assert.equal(image.modelId, id); assert.equal(image.providerModel, payload.model);
    assert.throws(() => buildAdvancedImageRequest(id, 'i2i', { ...params, model: 'SomeOtherExecutor' }), { code: 'IMAGE_IDENTITY_OVERRIDE' });
  }
});
test('Qwen angle metadata conflicts with provider and is not canonically executable', async () => {
  assert.equal(getAdvancedImageStatus('qwen-image-edit-plus-lora').status, 'DEFERRED');
  assert.equal(findRemote('qwen-image-edit-plus-lora', 'i2i'), null);
  assert.equal((await createExecutionBridge().plan({ workflow: workflow('qwen-image-edit-plus-lora', 'i2i', { images_list: [a], rotate_right_left: 10 }), nodeId: 'image' })).status, 'rejected');
});
test('specialized layer helper supports exact endpoints and refuses lone generic URLs', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => { calls.push({ url, ...init }); return { ok: true, json: async () => ({ output: { images: [b, a] }, layer_names: ['B', 'A'] }) }; });
  assert.deepEqual((await decomposeLayers(key, { image_url: a })).images, [b, a]);
  await decomposeLayers(key, { model: 'seedream-5.0-flash-layerize', image_url: a });
  assert.ok(calls[0].url.endsWith('/bytedance-seedream-5.0-pro-layer')); assert.ok(calls[1].url.endsWith('/seedream-5.0-flash-layerize'));
  assert.throws(() => normalizeAdvancedImageResult({ url: a }, 'layers'), { code: 'IMAGE_LAYER_RESULT_INVALID' });
  const bridge = createExecutionBridge({ runtime: { remote: async () => ({ status: 'completed', url: a }) } });
  const result = await bridge.execute({ workflow: workflow('seedream-5.0-flash-layerize', 'i2i', { image_url: a }), nodeId: 'image' }, { allowExecution: true });
  assert.equal(result.diagnostics[0].code, 'IMAGE_LAYER_RESULT_INVALID');
});
test('Topaz nested output.image and Gemini character metadata are retained', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ output: { image: b, character_id: 'character-1', character_name: 'Hero' } }) }));
  const result = await generateI2I(key, { model: 'topaz-upscale-image-creative', image_url: a });
  assert.equal(result.url, b); assert.deepEqual(result.outputs, [b]); assert.equal(result.output.character_id, 'character-1');
  const nested = normalizeAdvancedImageResult({ output: { outputs: [b, a], character_id: 'character-2' } });
  assert.deepEqual(nested.outputs, [b, a]); assert.equal(nested.output.character_id, 'character-2');
});

test('mixed project image references and URL entries retain order, roles and project integrity', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'image-contract-')), root = path.join(directory, 'project');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { project } = await createProject(root, { title: 'Reference fixture' });
  const assets = [];
  for (const id of ['one', 'two']) {
    const sourcePath = path.join(directory, `${id}.png`); await fs.writeFile(sourcePath, id);
    const imported = await project.importAsset({ sourcePath, assetId: id, contentType: 'image/png' }); assert.equal(imported.status, 'imported'); assets.push(imported.asset);
  }
  const w = workflow('vidu-q2-reference-to-image', 'i2i', { prompt: 'Two subjects in order' });
  w.assets = assets.map(x => ({ id: x.assetId, type: 'image', localPath: x.path }));
  w.nodes[0].inputs = [{ id: 'images_list', type: 'image', required: true }]; w.nodes[0].assetRefs = ['one', 'two'];
  assert.equal((await project.addWorkflowToProject(w)).status, 'added');
  const before = JSON.stringify(w), manifest = JSON.stringify((await project.getManifest()).manifest), calls = fake(t), uploads = [];
  const runtime = createApplicationRuntime({ getApiKey: () => key }); runtime.canUpload = () => true;
  runtime.upload = async asset => { uploads.push(asset.assetId); return `https://example.com/${asset.assetId}.png`; };
  const bridge = createExecutionBridge({ runtime }), req = { workflow: w, nodeId: 'image', project, assetBindings: { images_list: ['two', a, 'one'] } };
  const plan = await bridge.plan(req); assert.equal(plan.status, 'planned', JSON.stringify(plan));
  assert.deepEqual(plan.requiredUploads.map(x => [x.assetId, x.index]), [['two', 0], ['one', 2]]); assert.equal(calls.length, 0); assert.equal(uploads.length, 0);
  assert.equal(plan.request.image.media[0].role, 'ordered-subject-references'); assert.ok(!JSON.stringify(plan).includes(root));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  assert.deepEqual(uploads, ['two', 'one']); assert.deepEqual(JSON.parse(calls[0].body).images_list, ['https://example.com/two.png', a, 'https://example.com/one.png']);
  assert.equal(JSON.stringify(w), before); assert.equal(JSON.stringify((await project.getManifest()).manifest), manifest);
  for (const bindings of [{ images_list: [] }, { mask_image_url: ['one'] }, { images_list: ['../one'] }, { images_list: ['missing'] }, { images_list: 'one' }]) assert.equal((await bridge.plan({ ...req, assetBindings: bindings })).status, 'rejected');
  const badType = structuredClone(w); badType.assets[0].type = 'audio'; assert.equal((await bridge.plan({ ...req, workflow: badType })).status, 'rejected');
  await fs.writeFile(path.join(root, assets[0].path), 'corrupted'); assert.equal((await bridge.plan(req)).status, 'rejected'); assert.equal(calls.length, 1);
});
for (const [id, mode, parameters, expected] of [
  ['nano-banana', 't2i', { prompt: 'Basic still' }, { prompt: 'Basic still' }],
  ['nano-banana-edit', 'i2i', { image_url: a, prompt: 'Basic edit' }, { images_list: [a], prompt: 'Basic edit' }],
  ['ai-object-eraser', 'i2i', { image_url: a, mask_image_url: b }, { image_url: a, mask_image_url: b }],
  ['ai-dress-change', 'i2i', { image_url: a, garment_image_url: b }, { model_image_url: a, garment_image_url: b }],
  ['add-image-watermark', 'i2i', { image_url: a, watermark_image_url: b }, { image_url: a, watermark_image_url: b }],
  ['ai-product-shot', 'i2i', { image_url: a, prompt: 'Product scene' }, { image_url: a, scene_description: 'Product scene' }],
]) test(`${id}: existing base/auxiliary roles remain intact`, async t => {
  const calls = fake(t), method = mode === 't2i' ? generateImage : generateI2I;
  await method(key, { model: id, ...parameters });
  const payload = JSON.parse(calls[0].body); for (const [field, value] of Object.entries(expected)) assert.deepEqual(payload[field], value);
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key }) });
  assert.equal((await bridge.plan({ workflow: workflow(id, mode, parameters), nodeId: 'image' })).status, 'planned');
});

for (const status of ['failed', 'cancelled', 'queued', 'running']) test(`layer result preserves existing ${status} lifecycle without fabricating completed artifacts`, async () => {
  const bridge = createExecutionBridge({ runtime: { remote: async () => ({ status, request_id: 'layer-state', cost: { refunded: true } }) } });
  const result = await bridge.execute({ workflow: workflow('seedream-5.0-flash-layerize', 'i2i', { image_url: a }), nodeId: 'image' }, { allowExecution: true });
  assert.equal(result.status, status); assert.equal(result.requestId, 'layer-state'); assert.equal(result.upstream.cost.refunded, true); assert.deepEqual(result.outputs, []);
});

test('shared layer failure retains upstream request/refund metadata', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ status: 'failed', cost: { refunded: true }, error: 'Fixture failure' }) }));
  const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key }) });
  const result = await bridge.execute({ workflow: workflow('seedream-5.0-flash-layerize', 'i2i', { image_url: a }), nodeId: 'image' }, { allowExecution: true });
  assert.equal(result.status, 'failed'); assert.equal(result.upstream.cost.refunded, true); assert.equal(result.diagnostics[0].code, 'UPSTREAM_FAILED');
});

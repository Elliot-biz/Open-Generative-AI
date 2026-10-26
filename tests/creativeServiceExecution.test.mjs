import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createWorkflow, createProject, hashWorkflow } from 'whihm-workflow-core';
import { buildCreativeServiceRequest, getCreativeServiceModel } from '../packages/studio/src/creativeServiceInputContracts.js';
import { runClipping, runMotionGraphics, runMotionGraphicsEdit } from '../packages/studio/src/muapi.js';
import { createApplicationRuntime, findRemote, remoteMethods } from '../lib/whihm-execution/runtime.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { assessProjectWorkflowReadiness } from '../lib/whihm-execution/readiness.mjs';
const image = 'https://example.com/picture.png', video = 'https://example.com/source.mp4', key = 'mock-key-only';
const cases = [
  ['ai-clipping', 'clipping', runClipping, { video_url: video, num_highlights: 60, aspect_ratio: '4:5', return_coordinates_only: true }],
  ['motion-graphics', 'motion_graphics', runMotionGraphics, { operation: 'create', prompt: '  Animate this product  ', category: 'showcase', images_list: [image, image], video_files: [video], duration_seconds: 30, aspect_ratio: '9:16' }],
  ['motion-graphics-edit', 'motion_graphics', runMotionGraphicsEdit, { operation: 'edit', request_id: 'completed-generation', edit_prompt: '  Turn the bars gold  ', duration_seconds: 5, aspect_ratio: '1:1' }],
];
function workflow(id, mode, parameters) {
  return createWorkflow({ workflowId: 'creative_services', name: 'Independent creative services', nodes: [{ id: 'creative', title: 'Creative intent', kind: 'video-generation',
    inputs: [], outputs: [{ id: 'result', type: 'video' }], parameters: structuredClone(parameters), metadata: { oga: { mode } },
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model: id, mayCostMoney: true, requiresConfirmation: true } }] });
}
function fake(t, result, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'fixture-job' } : result };
  }); return calls;
}
for (const [id, mode, service, params] of cases) {
  test(`${id}: authoritative shared helper validates and retains payload through submission/polling`, async t => {
    const result = id === 'ai-clipping' ? { status: 'completed', coordinates: [{ start: 1, end: 3, score: 0.9 }], timings: { inference: 4 } }
      : { status: 'completed', output: { video: 'https://example.com/result.mp4' }, animation_id: 'provider-metadata' };
    const calls = fake(t, result, true), ids = [];
    const expected = buildCreativeServiceRequest(id, params), before = structuredClone(params);
    const actual = await service(key, { ...params, onRequestId: id => ids.push(id) });
    assert.equal(calls.length, 2); assert.ok(calls[0].url.endsWith('/api/v1/' + id));
    assert.deepEqual(JSON.parse(calls[0].body), expected.payload); assert.deepEqual(ids, ['fixture-job']);
    assert.equal(actual.request_id, 'fixture-job'); assert.equal(actual.status, 'completed');
    if (result.output) assert.deepEqual(actual.output, result.output); else assert.deepEqual(actual.coordinates, result.coordinates);
    assert.deepEqual(params, before); assert.equal(Object.hasOwn(expected.payload, 'operation'), false); assert.equal(Object.hasOwn(expected.payload, 'model'), false);
  });
  test(`${id}: plan/readiness are passive, exact route is authorized, result metadata survives`, async t => {
    const response = id === 'ai-clipping' ? { status: 'completed', output: { coordinates: [{ start_time: 2, end_time: 5, crop: { x: 0.5 } }] }, metadata: { method: 'ai-selection' } }
      : { status: 'completed', outputs: [], output: { video: 'https://example.com/result.mp4' }, animation_id: 'saved-code-id' };
    const calls = fake(t, response); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(id, mode, params), before = hashWorkflow(w), request = { workflow: w, nodeId: 'creative' }, plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.request.creativeService.operation, id === 'ai-clipping' ? 'highlights' : id.endsWith('-edit') ? 'edit' : 'create');
    assert.equal(plan.runtime, 'studio.' + service.name); assert.equal(plan.model, id);
    assert.deepEqual(plan.request.creativeService.providerRequest.payload, buildCreativeServiceRequest(id, params).payload);
    const evidence = await assessProjectWorkflowReadiness({ workflow: w, evaluatedAt: '2026-10-26T20:00:00Z' });
    assert.equal(evidence.provenance.executors.creative.state, 'AVAILABLE');
    assert.equal(auth, 0); assert.equal(calls.length, 0);
    assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await bridge.execute(request, { allowExecution: true }); assert.equal(result.status, 'succeeded', JSON.stringify(result));
    assert.equal(result.model, id); assert.equal(auth, 1); assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].body), plan.request.creativeService.providerRequest.payload);
    assert.deepEqual(result.upstream.output, response.output);
    if (id === 'ai-clipping') { assert.equal(result.resultKind, 'clipping'); assert.equal(result.clipping.outputMode, 'coordinates'); assert.deepEqual(result.clipping.coordinates, response.output.coordinates); assert.equal(result.outputs.length, 0); }
    else { assert.equal(result.resultKind, 'motion-graphics'); assert.equal(result.outputs[0].value, response.output.video); assert.equal(result.operation, params.operation); }
    assert.equal(hashWorkflow(w), before); assert.ok(!JSON.stringify({ plan, result }).includes(key));
  });
}
const invalid = [
  ['ai-clipping', {}, 'video_url'],
  ['ai-clipping', { video_url: '' }, 'video_url'],
  ...[0, 61, 1.5, '3', null].map(num_highlights => ['ai-clipping', { video_url: video, num_highlights }, 'num_highlights']),
  ['ai-clipping', { video_url: video, aspect_ratio: '21:9' }, 'aspect_ratio'],
  ['ai-clipping', { video_url: video, return_coordinates_only: 'false' }, 'return_coordinates_only'],
  ['ai-clipping', { video_url: video, prompt: 'best moments' }, 'prompt'],
  ['ai-clipping', { video_url: video, duration_seconds: 6 }, 'duration_seconds'],
  ['motion-graphics', {}, 'prompt'], ['motion-graphics', { prompt: ' ' }, 'prompt'],
  ['motion-graphics', { prompt: 'Create', category: 'unknown' }, 'category'],
  ['motion-graphics', { prompt: 'Create', category: 'slideshow', images_list: [] }, 'images_list'],
  ['motion-graphics', { prompt: 'Create', category: 'reel', video_files: [video] }, 'images_list'],
  ['motion-graphics', { prompt: 'Create', images_list: Array(7).fill(image) }, 'images_list'],
  ['motion-graphics', { prompt: 'Create', images_list: [{ assetId: 'unresolved' }] }, 'images_list'],
  ['motion-graphics', { prompt: 'Create', video_files: Array(3).fill(video) }, 'video_files'],
  ['motion-graphics', { prompt: 'Create', resolution: '1080p' }, 'resolution'],
  ['motion-graphics', { prompt: 'Create', request_id: 'prior' }, 'request_id'],
  ['motion-graphics', { prompt: 'Create', operation: 'edit' }, 'operation'],
  ['motion-graphics-edit', { edit_prompt: 'Change' }, 'request_id'],
  ['motion-graphics-edit', { request_id: 'prior' }, 'edit_prompt'],
  ['motion-graphics-edit', { request_id: ' ', edit_prompt: 'Change' }, 'request_id'],
  ['motion-graphics-edit', { request_id: 'prior', edit_prompt: 'Change', prompt: 'Create' }, 'prompt'],
  ['motion-graphics-edit', { request_id: 'prior', edit_prompt: 'Change', images_list: [image] }, 'images_list'],
  ['motion-graphics-edit', { request_id: 'prior', edit_prompt: 'Change', category: 'auto' }, 'category'],
  ['motion-graphics-edit', { request_id: 'prior', edit_prompt: 'Change', operation: 'regenerate' }, 'operation'],
  ...[4, 31, 6.5, '6'].map(duration_seconds => ['motion-graphics', { prompt: 'Create', duration_seconds }, 'duration_seconds']),
  ['motion-graphics-edit', { request_id: 'prior', edit_prompt: 'Change', aspect_ratio: '4:3' }, 'aspect_ratio'],
  ...['provider_options', 'raw', 'payload', 'model'].map(field => ['ai-clipping', { video_url: video, [field]: field === 'model' ? 'another-service' : {} }, field]),
];
for (const [id, params, expectedPath] of invalid) test(`${id}: invalid ${expectedPath} rejects before authentication or transport`, async t => {
  const calls = fake(t, {}); let auth = 0;
  const mode = id === 'ai-clipping' ? 'clipping' : 'motion_graphics', bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
  const request = { workflow: workflow(id, mode, params), nodeId: 'creative' }, plan = await bridge.plan(request);
  assert.equal(plan.status, 'rejected', JSON.stringify(plan));
  if (expectedPath === 'model') assert.equal(plan.diagnostics[0].code, 'IDENTITY_OVERRIDE'); else assert.equal(plan.diagnostics[0].path, expectedPath);
  assert.equal((await bridge.execute(request, { allowExecution: true })).status, 'rejected');
  const service = cases.find(([name]) => name === id)[2]; await assert.rejects(service(key, params), e => e.path === expectedPath);
  assert.equal(auth, 0); assert.equal(calls.length, 0);
});
test('edit omissions inherit provider settings, while explicit Studio settings remain unchanged', () => {
  const showcase = buildCreativeServiceRequest('motion-graphics', { prompt: 'Show images', category: 'showcase', images_list: [image] });
  assert.deepEqual(showcase.creativeService.requiredInputs, ['prompt', 'images_list']);
  const minimal = buildCreativeServiceRequest('motion-graphics-edit', { request_id: 'prior', edit_prompt: 'New colors' });
  assert.deepEqual(minimal.payload, { request_id: 'prior', edit_prompt: 'New colors' });
  assert.deepEqual(minimal.creativeService.inheritedOptions, ['aspect_ratio', 'duration_seconds']);
  const explicit = buildCreativeServiceRequest('motion-graphics-edit', { request_id: 'prior', edit_prompt: 'New colors', duration_seconds: 6, aspect_ratio: '16:9' });
  assert.equal(explicit.payload.duration_seconds, 6); assert.equal(explicit.payload.aspect_ratio, '16:9');
  assert.deepEqual(buildCreativeServiceRequest('ai-clipping', { video_url: video }).payload, { video_url: video, num_highlights: 3, aspect_ratio: '9:16', return_coordinates_only: false });
});
test('service admission and fixed method allowlist do not expose arbitrary providers/routes', async () => {
  for (const [id, mode, method] of cases) {
    assert.equal(findRemote(id, mode).method, method.name); assert.ok(remoteMethods.includes(method.name));
    assert.equal(findRemote(id, 'v2v'), null); assert.equal(findRemote(id, mode === 'clipping' ? 'motion_graphics' : 'clipping'), null);
  }
  assert.equal(getCreativeServiceModel('constructor'), null); assert.equal(findRemote('unknown-service', 'motion_graphics'), null);
  const bridge = createExecutionBridge(); assert.equal((await bridge.plan({ workflow: workflow('unknown-service', 'clipping', {}), nodeId: 'creative' })).status, 'rejected');
  assert.throws(() => buildCreativeServiceRequest('unknown-service', {}), { code: 'CREATIVE_SERVICE_UNSUPPORTED' });
});
for (const [result, expected] of [
  [{ status: 'completed', outputs: ['https://example.com/two.mp4', 'https://example.com/one.mp4'], coordinates: [{ start: 2, end: 4 }] }, [{ start: 2, end: 4 }]],
  [{ status: 'completed', output: { timings: [{ start: 5, end: 7 }] } }, [{ start: 5, end: 7 }]],
  [{ status: 'completed', timings: { inference: 3 }, output: { clips: [{ label: 'ambiguous' }] } }, null],
]) test('clipping preserves real multi-clip/selection data and never fabricates coordinates', async t => {
  fake(t, result); const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => key }) });
  const actual = await bridge.execute({ workflow: workflow('ai-clipping', 'clipping', { video_url: video, return_coordinates_only: true }), nodeId: 'creative' }, { allowExecution: true });
  assert.equal(actual.status, 'succeeded'); assert.deepEqual(actual.clipping.coordinates, expected);
  assert.deepEqual(actual.clipping.clips, result.outputs ?? []); if (result.outputs) assert.deepEqual(actual.outputs.map(o => o.value), result.outputs);
  assert.deepEqual(actual.upstream, result);
});
test('project clipping video and motion graphics ordered mixed references use existing integrity checks', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-creative-')), root = path.join(directory, 'project');
  t.after(() => fs.rm(directory, { recursive: true, force: true })); const { project } = await createProject(root, { title: 'Creative assets' });
  const assets = [];
  for (const [id, type] of [['clip', 'video'], ['photo', 'image']]) {
    const sourcePath = path.join(directory, id); await fs.writeFile(sourcePath, id);
    const imported = await project.importAsset({ sourcePath, assetId: id, contentType: type + '/fixture' });
    assets.push({ id, type, localPath: imported.asset.path });
  }
  const calls = fake(t, { status: 'completed', outputs: ['https://example.com/result.mp4'] }), uploaded = [];
  const runtime = createApplicationRuntime({ getApiKey: () => key }); runtime.canUpload = () => true;
  runtime.upload = async r => { uploaded.push(r.assetId); return `https://example.com/upload-${uploaded.length}`; };
  const bridge = createExecutionBridge({ runtime });
  const w = workflow('ai-clipping', 'clipping', {}); w.assets = assets; w.nodes[0].assetRefs = ['clip', 'photo']; w.nodes[0].inputs = [{ id: 'video_url', type: 'video' }];
  let req = { workflow: w, project, nodeId: 'creative', assetBindings: { video_url: 'clip' } };
  const plan = await bridge.plan(req); assert.equal(plan.status, 'planned'); assert.equal(plan.requiredUploads[0].relativePath, assets[0].localPath);
  assert.ok(!JSON.stringify(plan).includes(root)); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0);
  assert.equal((await bridge.plan({ ...req, assetBindings: { video_url: 'photo' } })).status, 'rejected');
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded'); assert.equal(JSON.parse(calls[0].body).video_url, 'https://example.com/upload-1');
  const motion = workflow('motion-graphics', 'motion_graphics', { prompt: 'Show photos', category: 'slideshow' }); motion.assets = assets;
  motion.nodes[0].assetRefs = ['clip', 'photo']; motion.nodes[0].inputs = [{ id: 'images_list', type: 'image' }, { id: 'video_files', type: 'video' }];
  req = { workflow: motion, project, nodeId: 'creative', assetBindings: { images_list: ['photo', image, 'photo'], video_files: ['clip'] } };
  const before = hashWorkflow(motion), motionPlan = await bridge.plan(req); assert.equal(motionPlan.status, 'planned'); assert.ok(!JSON.stringify(motionPlan).includes(root));
  assert.equal((await bridge.execute(req, { allowExecution: true })).status, 'succeeded');
  const payload = JSON.parse(calls[1].body); assert.deepEqual(payload.images_list, ['https://example.com/upload-2', image, 'https://example.com/upload-3']); assert.deepEqual(payload.video_files, ['https://example.com/upload-4']);
  assert.equal(hashWorkflow(motion), before);
  for (const assetBindings of [{ images_list: ['clip'] }, { video_files: ['photo'] }, { images_list: ['../photo'] }, { prompt: 'photo' }]) assert.equal((await bridge.plan({ ...req, assetBindings })).status, 'rejected');
  await fs.writeFile(path.join(root, assets[0].localPath), 'tampered'); assert.equal((await bridge.plan(req)).status, 'rejected');
});

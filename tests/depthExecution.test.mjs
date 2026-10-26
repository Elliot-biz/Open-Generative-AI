import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject } from 'whihm-workflow-core';
import { buildDepthRequest, getDepthModel } from '../packages/studio/src/depthInputContracts.js';
import { processV2V } from '../packages/studio/src/muapi.js';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { buildWorkflowReadinessContext } from '../lib/whihm-execution/readiness.mjs';
import { buildV2VRequest } from '../packages/studio/src/v2vInputContracts.js';
const image = 'https://example.com/source.png', video = 'https://example.com/source.mp4';
function workflow(parameters = {}, mode = 'depth', model = 'depth-anything') {
  return createWorkflow({ workflowId: 'depth_workflow', name: 'Depth', nodes: [{ id: 'depth_node', title: 'Depth artifact', kind: 'generation',
    executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true },
    parameters, metadata: { oga: { mode } }, inputs: [], outputs: [{ id: 'output', type: 'file' }] }] });
}
function setup(t, raw) {
  const calls = []; let auth = 0;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => { calls.push({ url, ...init }); return { ok: true, json: async () => raw }; });
  const runtime = createApplicationRuntime({ getApiKey: () => { auth++; return 'fixture-key'; } });
  return { calls, runtime, bridge: createExecutionBridge({ runtime }), auth: () => auth };
}
for (const kind of ['image', 'video']) {
  const field = kind + '_url', url = kind === 'image' ? image : video;
  test(`${kind}: exact scoped admission, passive plan/readiness, authorization and native typed results`, async t => {
    const output = `https://example.com/depth.${kind === 'image' ? 'png' : 'mp4'}`;
    const f = setup(t, { status: 'completed', output: { video: output, timings: { inference: 1 } } });
    const w = workflow({ [field]: url }), request = { workflow: w, nodeId: 'depth_node' };
    assert.equal(getDepthModel('depth-anything').endpoint, 'depth-anything');
    assert.equal(findRemote('depth-anything', 'depth').method, 'processV2V');
    assert.equal(findRemote('depth-anything', 'v2v'), null);
    const plan = await f.bridge.plan(request);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.mediaType, kind);
    assert.equal(plan.request.depth.sourceKind, kind); assert.equal(plan.request.depth.resultKind, 'depth-' + kind);
    assert.equal(plan.request.depth.runtimeVerification, 'UNVERIFIED'); assert.match(plan.request.depth.caveat, /no metric distance/);
    assert.deepEqual(plan.request.depth.providerRequest.payload, { [field]: url });
    const ready = await buildWorkflowReadinessContext({ workflow: w, evaluatedAt: '2026-10-26T20:00:00Z' });
    assert.equal(ready.provenance.executors.depth_node.state, 'AVAILABLE');
    assert.equal(f.calls.length, 0); assert.equal(f.auth(), 0);
    assert.equal((await f.bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await f.bridge.execute(request, { allowExecution: true });
    assert.equal(result.status, 'succeeded'); assert.equal(result.model, 'depth-anything'); assert.equal(result.sourceKind, kind);
    assert.equal(result.resultKind, 'depth-' + kind); assert.deepEqual(result.outputs, [{ mediaType: kind, value: output }]);
    assert.equal(result.upstream.output.video, output); assert.equal(result.upstream.output.timings.inference, 1);
    assert.equal(Object.hasOwn(result, 'image_url'), false); assert.equal(Object.hasOwn(result, 'video_url'), false);
    assert.deepEqual(JSON.parse(f.calls[0].body), { [field]: url }); assert.equal(f.auth(), 1);
    assert.ok(f.calls[0].url.endsWith('/api/v1/depth-anything'));
  });
  test(`${kind}: ordered actual generic outputs survive; unknown shape is preserved without synthetic artifacts`, async t => {
    const f = setup(t, { status: 'completed', output: { outputs: [image, video], metadata: { source: 'fixture' } } });
    const request = { workflow: workflow({ [field]: url }), nodeId: 'depth_node' };
    let result = await f.bridge.execute(request, { allowExecution: true });
    assert.deepEqual(result.outputs.map(r => r.value), [image, video]);
    f.runtime.remote = async () => ({ status: 'completed', unknown: { opaque: 'preserve' } });
    result = await f.bridge.execute(request, { allowExecution: true });
    assert.deepEqual(result.outputs, []); assert.deepEqual(result.upstream.unknown, { opaque: 'preserve' });
  });
  test(`${kind}: typed project assets retain logical plans, upload only on authorized execution, enforce integrity`, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'depth-contract-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const root = path.join(directory, 'project'), { project } = await createProject(root, { title: 'Depth assets' });
    const sourcePath = path.join(directory, 'fixture'); await fs.writeFile(sourcePath, 'fake media');
    const imported = await project.importAsset({ sourcePath, assetId: 'source', contentType: kind + '/fixture' });
    const w = workflow(); w.assets = [{ id: 'source', type: kind, localPath: imported.asset.path }];
    Object.assign(w.nodes[0], { assetRefs: ['source'], inputs: [{ id: field, type: kind }] });
    const f = setup(t, { output: { video: url } }), uploads = [];
    f.runtime.canUpload = () => true; f.runtime.upload = async asset => { uploads.push(asset); return url; };
    const request = { workflow: w, nodeId: 'depth_node', project, assetBindings: { [field]: 'source' } };
    const plan = await f.bridge.plan(request); assert.equal(plan.status, 'planned', JSON.stringify(plan));
    assert.equal(plan.request.depth.providerRequest.payload[field], 'https://project-asset.invalid/source');
    assert.equal(plan.requiredUploads[0].relativePath, imported.asset.path); assert.ok(!JSON.stringify(plan).includes(root));
    assert.equal(f.calls.length, 0); assert.equal(uploads.length, 0); assert.equal(f.auth(), 0);
    assert.equal((await f.bridge.execute(request, { allowExecution: true })).status, 'succeeded');
    assert.equal(uploads.length, 1); assert.deepEqual(JSON.parse(f.calls[0].body), { [field]: url });
    for (const assetBindings of [{ [field]: ['source'] }, { [kind === 'image' ? 'video_url' : 'image_url']: 'source' }, { [field]: '../source' }]) assert.equal((await f.bridge.plan({ ...request, assetBindings })).status, 'rejected');
    w.assets[0].type = kind === 'image' ? 'video' : 'image'; assert.equal((await f.bridge.plan(request)).status, 'rejected'); w.assets[0].type = kind;
    await fs.writeFile(path.join(root, imported.asset.path), 'corrupt'); assert.equal((await f.bridge.plan(request)).status, 'rejected');
  });
}
const invalid = [
  {}, { image_url: image, video_url: video }, { image_url: null }, { image_url: '' }, { image_url: [] }, { video_url: 123 },
  { image_url: '/tmp/private.png' }, { image_url: 'file:///tmp/private.png' }, { image_url: 'not a url' },
  { image_url: 'https://user:pass@example.com/a' }, { video_url: 'https://example.com/a#private' },
  { image_url: 'https://example.com/a?token=secret' }, { image_url: image, prompt: 'depth' },
  { video_url: video, provider_options: {} }, { image_url: image, model: 'other' },
  { image_url: image, options: { model: 'other' } }, { video_url: video, raw: { x: true } },
];
for (const [index, params] of invalid.entries()) test(`invalid request ${index}: rejects before credentials/upload/transport`, async t => {
  const f = setup(t, {}), w = workflow(); w.nodes[0].parameters = params;
  const request = { workflow: w, nodeId: 'depth_node' };
  assert.equal((await f.bridge.plan(request)).status, 'rejected');
  assert.equal((await f.bridge.execute(request, { allowExecution: true })).status, 'rejected');
  assert.equal(f.auth(), 0); assert.equal(f.calls.length, 0);
});
for (const params of [{}, { image_url: image, video_url: video }, { image_url: null }, { video_url: 1 }, { image_url: 'file:///tmp/a' }, { video_url: video, prompt: 'x' }]) test(`shared Depth service validates ${JSON.stringify(params)}`, async t => {
  const f = setup(t, {}); await assert.rejects(processV2V('fixture', { model: 'depth-anything', ...params })); assert.equal(f.calls.length, 0);
});
test('shared depth path preserves existing request-ID, poll and URL consumer lifecycle', async t => {
  const calls = [], ids = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => { calls.push({ url, ...init }); return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'depth-job' } : { status: 'completed', output: { video: image, metadata: { untouched: true } } } }; });
  const result = await processV2V('fixture', { model: 'depth-anything', image_url: image, onRequestId: id => ids.push(id) });
  assert.deepEqual(ids, ['depth-job']); assert.equal(result.request_id, 'depth-job'); assert.equal(result.url, image);
  assert.equal(result.output.video, image); assert.equal(result.output.metadata.untouched, true);
  assert.ok(calls[1].url.endsWith('/predictions/depth-job/result'));
});
test('generic V2V remains video-only; exact depth admission is not a wildcard', () => {
  assert.throws(() => buildV2VRequest({ model: 'seedance-2.5-video-edit', image_url: image, prompt: 'edit' }));
  assert.throws(() => buildDepthRequest({ model: 'depth-other', image_url: image }));
  assert.equal(findRemote('depth-anything', 'i2i'), null); assert.equal(findRemote('depth-other', 'depth'), null);
});
test('project registry MIME cannot be relabeled by a forged workflow image declaration', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'depth-role-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { project } = await createProject(path.join(directory, 'project'), { title: 'Roles' });
  const sourcePath = path.join(directory, 'fixture'); await fs.writeFile(sourcePath, 'fake video');
  const imported = await project.importAsset({ sourcePath, assetId: 'source', contentType: 'video/fixture' });
  const w = workflow(); w.assets = [{ id: 'source', type: 'image', localPath: imported.asset.path }];
  Object.assign(w.nodes[0], { assetRefs: ['source'], inputs: [{ id: 'image_url', type: 'image' }] });
  const f = setup(t, {}), result = await f.bridge.plan({ workflow: w, nodeId: 'depth_node', project, assetBindings: { image_url: 'source' } });
  assert.equal(result.status, 'rejected'); assert.equal(result.diagnostics[0].code, 'ASSET_BINDING_INVALID');
  assert.equal(f.auth(), 0); assert.equal(f.calls.length, 0);
});
test('failure metadata remains failed without manufactured artifacts; structured native outputs stay JSON', async t => {
  const f = setup(t, { status: 'failed', error: 'fixture failure', cost: 0 });
  const request = { workflow: workflow({ image_url: image }), nodeId: 'depth_node' };
  let result = await f.bridge.execute(request, { allowExecution: true });
  assert.equal(result.status, 'failed'); assert.deepEqual(result.outputs, []); assert.equal(result.cost, 0);
  assert.equal(result.upstream.error, 'fixture failure'); assert.equal(result.resultKind, 'depth-image');
  f.runtime.remote = async () => ({ status: 'completed', output: { video: { provider_supplied: true } } });
  result = await f.bridge.execute(request, { allowExecution: true });
  assert.deepEqual(result.outputs, [{ mediaType: 'json', value: { provider_supplied: true } }]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { File } from 'node:buffer';
import { createProject, createWorkflow, hashWorkflow } from 'whihm-workflow-core';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { connectWhihmHost } from '../src/lib/whihmHostRuntime.mjs';
const require = createRequire(import.meta.url);
const { register } = require('../electron/lib/whihm-host.js');
const repo = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-host-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'project');
  const created = await createProject(root, { title: 'Host fixture' });
  assert.equal(created.status, 'created');
  const source = path.join(directory, 'small.txt'); await fs.writeFile(source, 'tiny upload fixture');
  const imported = await created.project.importAsset({ sourcePath: source, assetId: 'reference', contentType: 'text/plain' });
  const makeNode = (id, executor, parameters, metadata, extra = {}) => ({ id, title: id, kind: 'generation', inputs: [], outputs: [{ id: 'output', type: 'image' }], executor, parameters, metadata, ...extra });
  const remote = { type: 'remote-model', id: 'studio', provider: 'muapi', model: 'nano-banana', mayCostMoney: true, requiresConfirmation: true };
  const workflow = createWorkflow({ workflowId: 'selected_workflow', name: 'Host workflow', assets: [{ id: 'reference', type: 'file', localPath: imported.asset.path }], nodes: [
    makeNode('remote', remote, { prompt: 'Fixture only', aspect_ratio: '1:1' }, { oga: { mode: 't2i' } }),
    makeNode('upload', { ...remote, model: 'ai-image-upscaler' }, {}, { oga: { mode: 'i2i' } }, { inputs: [{ id: 'image_url', type: 'image' }], assetRefs: ['reference'] }),
    makeNode('local', { type: 'local-ai', id: 'local', provider: 'sdcpp', model: 'z-image-turbo', mayCostMoney: false, requiresConfirmation: false }, { prompt: 'Fixture only' }, {}),
  ] });
  assert.equal((await created.project.addWorkflowToProject(workflow)).status, 'added');
  return { root, project: created.project, workflow, source };
}
async function transport(t, options = {}) {
  const handlers = new Map(), events = new EventEmitter(), sender = new EventEmitter();
  sender.id = 17; sender.isDestroyed = () => false;
  sender.mainFrame = { url: pathToFileURL(path.join(repo, 'dist/index.html')).href };
  sender.send = (channel, value) => events.emit(channel, {}, structuredClone(value));
  const event = { sender, senderFrame: sender.mainFrame };
  const ipcMain = { handle: (channel, fn) => { assert.ok(!handlers.has(channel)); handlers.set(channel, fn); } };
  const ipcRenderer = { invoke: async (channel, value) => structuredClone(await handlers.get(channel)(event, structuredClone(value))),
    on: (...args) => events.on(...args), removeListener: (...args) => events.removeListener(...args) };
  const exposed = {};
  vm.runInNewContext(await fs.readFile(path.join(repo, 'electron/preload.js'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer, contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } } }; },
  });
  register({ ipcMain, getWindow: () => ({ webContents: sender, isDestroyed: () => false }), ...(options.useDefaultLoader ? {} : { load: async () => ({ createWorkflowHost }) }), timeoutMs: options.timeoutMs ?? 5000 });
  const localCalls = [];
  handlers.set('local-ai:generate', async (_event, parameters) => {
    localCalls.push(parameters);
    events.emit('local-ai:progress', {}, { status: 'generating', progress: 0.5, step: 1, totalSteps: 2 });
    return { url: 'data:image/png;base64,AA==', seed: 12 };
  });
  const previousWindow = globalThis.window; globalThis.window = { localAI: exposed.localAI };
  let authReads = 0;
  const stop = connectWhihmHost({ host: exposed.whihmHost, getApiKey: () => { authReads++; return 'test-placeholder'; }, makeFile: (bytes, name, type) => new File([bytes], name, { type }), ...options });
  const statuses = []; const off = exposed.whihmHost.onStatus(value => statuses.push(value));
  t.after(() => { stop(); off(); sender.emit('destroyed'); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  return { host: exposed.whihmHost, handlers, event, sender, statuses, localCalls, authReads: () => authReads, events };
}
const request = (opened, nodeId = 'remote') => ({ projectHandle: opened.projectHandle, workflowId: 'selected_workflow', nodeId });
const errorCode = result => result.diagnostics?.[0]?.code;

test('real preload-facing project, workflow, asset and dry-run flow submits nothing', async t => {
  const f = await fixture(t), h = await transport(t, { remote: new Proxy({}, { get() { throw Error('Remote must not be touched'); } }) });
  const opened = await h.host.openProject({ projectRoot: f.root }); assert.equal(opened.status, 'opened');
  assert.equal((await h.host.getWorkflow(request(opened))).workflow.workflowId, f.workflow.workflowId);
  const asset = await h.host.getAsset({ projectHandle: opened.projectHandle, assetId: 'reference' }); assert.equal(asset.status, 'ok'); assert.ok(asset.asset.path.startsWith('assets/'));
  const plan = await h.host.planNode({ ...request(opened, 'upload'), assetBindings: { image_url: 'reference' } });
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.generateI2I'); assert.equal(plan.requiredUploads.length, 1);
  assert.ok(!JSON.stringify([opened, asset, plan]).includes(f.root)); assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(request(opened))), 'EXECUTION_NOT_AUTHORIZED');
  assert.equal(h.authReads(), 0);
});
test('project traversal, missing IDs, missing project and foreign handles reject safely', async t => {
  const f = await fixture(t), h = await transport(t);
  assert.equal(errorCode(await h.host.openProject({ projectRoot: `${f.root}/../project` })), 'PROJECT_PATH_UNSAFE');
  assert.equal(errorCode(await h.host.openProject({ projectRoot: 'relative/path' })), 'PROJECT_PATH_UNSAFE');
  assert.equal(errorCode(await h.host.openProject({ projectRoot: path.join(f.root, 'absent') })), 'PROJECT_NOT_FOUND');
  const opened = await h.host.openProject({ projectRoot: f.root });
  assert.equal(errorCode(await h.host.getAsset({ projectHandle: opened.projectHandle, assetId: '../outside' })), 'ASSET_ID_INVALID');
  assert.equal(errorCode(await h.host.getWorkflow({ ...request(opened), workflowId: 'missing' })), 'WORKFLOW_NOT_FOUND');
  assert.equal(errorCode(await h.host.planNode(request(opened, 'missing'))), 'NODE_UNAVAILABLE');
  assert.equal(errorCode(await h.host.planNode({ ...request(opened), projectHandle: 'foreign' })), 'PROJECT_HANDLE_INVALID');
});
test('sender window, frame and URL checks reject foreign or navigated renderer', async t => {
  const h = await transport(t);
  const handler = h.handlers.get('whihm:openProject');
  for (const event of [{ ...h.event, sender: {} }, { ...h.event, senderFrame: { url: h.sender.mainFrame.url } }]) assert.equal(errorCode(await handler(event, {})), 'HOST_SENDER_REJECTED');
  h.sender.mainFrame.url = 'https://example.com/';
  assert.equal(errorCode(await handler(h.event, {})), 'HOST_SENDER_REJECTED');
});
test('actual MuAPI submission and existing polling lifecycle run over fake fetch through host', async t => {
  const f = await fixture(t), h = await transport(t); const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method }); return { ok: true, json: async () => calls.length === 1 ? { request_id: 'host_job' } : { status: 'completed', outputs: ['https://example.com/test.png'], cost: { amount_credits: 2 } } }; };
  t.after(() => { globalThis.fetch = original; });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const result = await h.host.executeNode({ ...request(opened), allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.nodeId, 'remote'); assert.equal(result.requestId, 'host_job'); assert.equal(result.cost.amount_credits, 2);
  assert.equal(calls.length, 2); assert.ok(calls[1].url.endsWith('/predictions/host_job/result'));
  assert.ok(h.statuses.some(s => s.status === 'running' && s.requestId === 'host_job'));
  assert.ok(h.statuses.some(s => s.status === 'succeeded')); assert.ok(!JSON.stringify(result).includes('test-placeholder'));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test('actual shared XHR uploader receives a File built from validated project bytes', async t => {
  const f = await fixture(t), h = await transport(t), originalXHR = globalThis.XMLHttpRequest, originalFetch = globalThis.fetch;
  const files = []; let body;
  globalThis.XMLHttpRequest = class {
    constructor() { this.upload = {}; }
    open(method, url) { assert.equal(method, 'POST'); assert.ok(url.endsWith('/upload_file')); }
    setRequestHeader() {}
    send(form) { files.push(form.get('file')); this.status = 200; this.responseText = JSON.stringify({ url: 'https://example.com/upload.txt' }); this.onload(); }
  };
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ url: 'https://example.com/result.png' }) }; };
  t.after(() => { if (originalXHR === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = originalXHR; globalThis.fetch = originalFetch; });
  const before = JSON.stringify((await f.project.getManifest()).manifest);
  const opened = await h.host.openProject({ projectRoot: f.root });
  const result = await h.host.executeNode({ ...request(opened, 'upload'), assetBindings: { image_url: 'reference' }, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(files.length, 1); assert.equal(await files[0].text(), 'tiny upload fixture');
  assert.equal(body.image_url, 'https://example.com/upload.txt'); assert.equal(await fs.readFile(f.source, 'utf8'), 'tiny upload fixture');
  assert.equal(JSON.stringify((await f.project.getManifest()).manifest), before); assert.ok(!JSON.stringify(result).includes(f.root));
});
test('local client routes through real preload wrappers and forwards existing progress without inference', async t => {
  const f = await fixture(t), h = await transport(t); const opened = await h.host.openProject({ projectRoot: f.root });
  const plan = await h.host.planNode(request(opened, 'local')); assert.equal(plan.runtime, 'localAI.generate'); assert.equal(h.localCalls.length, 0);
  const result = await h.host.executeNode({ ...request(opened, 'local'), allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(h.localCalls[0].model, 'z-image-turbo'); assert.equal(h.authReads(), 0);
  assert.ok(h.statuses.some(s => s.status === 'generating' && s.progress === 0.5));
});
test('upstream error, refund and request ID are serializable and sanitized across preload', async t => {
  const f = await fixture(t), h = await transport(t, { remote: { generateImage: async () => {
    throw Object.assign(new Error('Never send provider diagnostic with key'), { requestId: 'failed_job', generationResult: { status: 'failed', cost: { refunded: true }, apiKey: 'sensitive' } });
  } } });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const result = await h.host.executeNode({ ...request(opened), allowExecution: true });
  assert.equal(result.status, 'failed'); assert.equal(errorCode(result), 'UPSTREAM_ERROR'); assert.equal(result.requestId, 'failed_job'); assert.equal(result.upstream.cost.refunded, true);
  assert.ok(!JSON.stringify(result).includes('sensitive')); assert.ok(!JSON.stringify(result).includes('Never send')); assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test('preload surface has no arbitrary IPC/fs/shell API and unsolicited replies reject', async t => {
  const h = await transport(t);
  assert.deepEqual(Object.keys(h.host).sort(), ['assessWorkflowReadiness', 'executeNode', 'getAsset', 'getWorkflow', 'onRuntimeRequest', 'onStatus', 'openProject', 'planNode', 'runtimeProgress', 'runtimeReady', 'runtimeResult'].sort());
  assert.equal(errorCode(await h.host.runtimeResult({ requestId: 'unrequested', ok: true, value: {} })), 'HOST_RESPONSE_UNEXPECTED');
  const main = await fs.readFile(path.join(repo, 'electron/main.js'), 'utf8');
  assert.match(main, /webSecurity: true/); assert.match(main, /contextIsolation: true/); assert.match(main, /nodeIntegration: false/);
});
test('symlinked project asset cannot be read through host', async t => {
  const f = await fixture(t), h = await transport(t), asset = (await f.project.getProjectAsset('reference')).asset;
  const opened = await h.host.openProject({ projectRoot: f.root });
  await fs.unlink(path.join(f.root, asset.path)); await fs.symlink(f.source, path.join(f.root, asset.path));
  assert.equal(errorCode(await h.host.getAsset({ projectHandle: opened.projectHandle, assetId: 'reference' })), 'PROJECT_PATH_UNSAFE');
});
test('real registration bootstrap loads bridge through Electron-compatible ESM shim', async t => {
  const f = await fixture(t), h = await transport(t, { useDefaultLoader: true });
  const opened = await h.host.openProject({ projectRoot: f.root }); assert.equal(opened.status, 'opened');
  assert.equal((await h.host.planNode(request(opened))).runtime, 'studio.generateImage'); assert.equal(h.authReads(), 0);
});
test('unsupported local model is rejected before local IPC/authentication', async t => {
  const f = await fixture(t), h = await transport(t);
  const original = await f.project.getProjectWorkflow(f.workflow.workflowId);
  const changed = structuredClone(original.workflow); changed.nodes.find(n => n.id === 'local').executor.model = 'missing-model';
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: original.hash })).status, 'updated');
  const opened = await h.host.openProject({ projectRoot: f.root });
  assert.equal(errorCode(await h.host.planNode(request(opened, 'local'))), 'LOCAL_MODEL_UNSUPPORTED');
  assert.equal(h.localCalls.length, 0); assert.equal(h.authReads(), 0);
});
test('renderer disconnect rejects pending request without retry or corrupting project', async t => {
  const f = await fixture(t); let started;
  const begin = new Promise(resolve => { started = resolve; });
  const h = await transport(t, { remote: { generateImage: async () => { started(); return new Promise(() => {}); } } });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const execution = h.host.executeNode({ ...request(opened), allowExecution: true });
  await begin; h.sender.emit('destroyed');
  const result = await execution; assert.equal(result.status, 'failed'); assert.equal(errorCode(result), 'UPSTREAM_ERROR');
  assert.equal((await f.project.verifyProjectIntegrity()).status, 'valid');
});
test('host refuses simultaneous executions without creating a queue', async t => {
  const f = await fixture(t); let started, finish;
  const begin = new Promise(resolve => { started = resolve; });
  const h = await transport(t, { remote: { generateImage: async () => { started(); return new Promise(resolve => { finish = resolve; }); } } });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const first = h.host.executeNode({ ...request(opened), allowExecution: true }); await begin;
  assert.equal(errorCode(await h.host.executeNode({ ...request(opened), allowExecution: true })), 'HOST_EXECUTION_BUSY');
  finish({ url: 'https://example.com/fixture.png' }); assert.equal((await first).status, 'succeeded');
});
test('runtime inputs cannot introduce absolute machine paths or credential fields', async t => {
  const f = await fixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  assert.equal(errorCode(await h.host.planNode({ ...request(opened), inputs: { prompt: '/private/external.txt' } })), 'PROJECT_PATH_UNSAFE');
  assert.equal(errorCode(await h.host.planNode({ ...request(opened), inputs: { apiKey: 'fixture-secret' } })), 'HOST_REQUEST_INVALID');
  assert.equal(h.authReads(), 0);
});

test('fixed preload readiness operation assesses a supplied canonical workflow without runtime activity', async t => {
  const f = await fixture(t), h = await transport(t), oldFetch = globalThis.fetch; let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls++; throw Error('Network forbidden'); }; t.after(() => { globalThis.fetch = oldFetch; });
  const result = await h.host.assessWorkflowReadiness({ workflow: f.workflow, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.equal(result.status, 'assessed'); assert.equal(result.workflowId, f.workflow.workflowId);
  assert.ok(result.report.nodes.remote.status === 'READY' || result.report.nodes.remote.status === 'MANUAL_PENDING');
  assert.equal(fetchCalls, 0); assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
  assert.ok(h.handlers.has('whihm:assessWorkflowReadiness'));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('fixed readiness operation loads the selected workflow from a validated project handle', async t => {
  const f = await fixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  const result = await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.equal(result.status, 'assessed'); assert.equal(result.workflowHash, hashWorkflow(f.workflow));
  assert.equal(result.report.workflowId, f.workflow.workflowId); assert.equal(result.provenance.project.state, 'VERIFIED');
  assert.ok(!JSON.stringify(result).includes(f.root)); assert.equal(h.authReads(), 0);
});

test('readiness rejects missing project/workflow handles and corrupted projects fail closed', async t => {
  const f = await fixture(t), h = await transport(t);
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-25T12:00:00Z' })), 'WORKFLOW_SOURCE_MISSING');
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ projectHandle: 'missing', workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-25T12:00:00Z' })), 'PROJECT_HANDLE_INVALID');
  const opened = await h.host.openProject({ projectRoot: f.root });
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: 'not_here', evaluatedAt: '2026-10-25T12:00:00Z' })), 'WORKFLOW_NOT_FOUND');
  const record = (await f.project.getProjectAsset('reference')).asset;
  await fs.writeFile(path.join(f.root, record.path), 'tampered project asset');
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-25T12:00:00Z' })), 'ASSET_HASH_MISMATCH');
});

test('readiness propagates missing assets, unsupported executors and pending manual gates', async t => {
  const f = await fixture(t), h = await transport(t);
  const missingAsset = structuredClone(f.workflow); missingAsset.assets[0].localPath = 'assets/not-registered.txt';
  missingAsset.nodes[0].assetRefs = ['reference'];
  const missing = await h.host.assessWorkflowReadiness({ projectHandle: (await h.host.openProject({ projectRoot: f.root })).projectHandle, workflow: missingAsset, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.ok(missing.report.blockers.some(item => item.code === 'ASSET_MISSING'));
  const unsupported = structuredClone(f.workflow); unsupported.nodes = [unsupported.nodes[0]]; unsupported.edges = []; unsupported.nodes[0].executor.model = 'not-in-catalog';
  const unsupportedResult = await h.host.assessWorkflowReadiness({ workflow: unsupported, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.equal(unsupportedResult.report.nodes.remote.status, 'UNSUPPORTED');
  const manual = createWorkflow({ workflowId: 'manual_host_check', name: 'Manual gate', nodes: [{ id: 'approval', title: 'Review', kind: 'control', executor: { id: 'control', type: 'control', tool: 'approval-gate', mayCostMoney: false, requiresConfirmation: true }, inputs: [], outputs: [], parameters: {} }] });
  const manualResult = await h.host.assessWorkflowReadiness({ workflow: manual, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.deepEqual(manualResult.report.manualGates, ['approval']);
});

test('readiness passes quote/budget evidence, preserves stale hash state and leaves local runtime unverified', async t => {
  const f = await fixture(t), h = await transport(t), workflow = structuredClone(f.workflow);
  workflow.nodes = workflow.nodes.filter(node => ['remote', 'local'].includes(node.id)); workflow.edges = [];
  const remote = workflow.nodes.find(node => node.id === 'remote');
  const quoteContext = { schemaVersion: 1, workflowId: workflow.workflowId, workflowHash: hashWorkflow(workflow), quotes: [{ nodeId: 'remote', amount: 0.25, currency: 'USD', quotedAt: '2026-10-25T11:00:00Z', provider: 'muapi', model: remote.executor.model, source: 'mock-estimator' }] };
  const request = { workflow, evaluatedAt: '2026-10-25T12:00:00Z', quoteContext, budget: { maximumSpend: 1, currency: 'USD' } };
  const current = await h.host.assessWorkflowReadiness(request);
  assert.equal(current.report.cost.budgetStatus, 'WITHIN_BUDGET'); assert.equal(current.report.nodes.local.status, 'UNVERIFIED');
  const stale = await h.host.assessWorkflowReadiness({ ...request, quoteContext: { ...quoteContext, workflowHash: 'f'.repeat(64) } });
  assert.equal(stale.report.nodes.remote.cost.status, 'STALE'); assert.equal(stale.report.cost.budgetStatus, 'BUDGET_UNKNOWN');
  assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
});

test('readiness host rejects arbitrary path/channel/function input and exposes only one fixed method', async t => {
  const h = await transport(t);
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ projectRoot: '/tmp/untrusted', workflow: {} })), 'HOST_REQUEST_INVALID');
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ operation: 'executeNode', workflow: {} })), 'HOST_REQUEST_INVALID');
  assert.equal(errorCode(await h.host.assessWorkflowReadiness({ channel: 'local-ai:generate', workflow: {} })), 'HOST_REQUEST_INVALID');
  assert.ok(Object.hasOwn(h.host, 'assessWorkflowReadiness'));
  const main = await fs.readFile(path.join(repo, 'electron/main.js'), 'utf8');
  assert.match(main, /webSecurity: true/); assert.match(main, /contextIsolation: true/); assert.match(main, /nodeIntegration: false/);
});

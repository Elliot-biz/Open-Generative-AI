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
import { createProject, createWorkflow, hashWorkflow, setNodeApproval, applyEditBatch, recordNodeOutput } from 'whihm-workflow-core';
import { assessCurrentWorkflowReadiness } from '../src/lib/whihmReadinessClient.mjs';
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
  assert.deepEqual(Object.keys(h.host).sort(), ['applyWorkflowApproval', 'applyWorkflowInvalidation', 'assessWorkflowReadiness', 'executeNode', 'getAsset', 'getWorkflow', 'onRuntimeRequest', 'onStatus', 'openProject', 'planNode', 'runtimeProgress', 'runtimeReady', 'runtimeResult'].sort());
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

test('renderer consumer reaches fixed readiness host with persisted approval semantics and no execution', async t => {
  const h = await transport(t);
  const w = createWorkflow({ workflowId: 'approved_host_gate', name: 'Mock approval', nodes: [{ id: 'review', title: 'Review', kind: 'control', executor: { id: 'control', type: 'control', tool: 'approval-gate', mayCostMoney: false, requiresConfirmation: false }, inputs: [], outputs: [], parameters: {} }] });
  const pending = await assessCurrentWorkflowReadiness({ workflow: w, evaluatedAt: '2026-10-25T12:00:00Z', nodeStates: { review: { manualResolved: true } } }, { host: h.host });
  assert.equal(pending.report.nodes.review.approval, 'PENDING');
  const approved = setNodeApproval(w, { nodeId: 'review', decision: 'APPROVED', timestamp: '2026-10-25T12:00:00Z', expectedWorkflowHash: hashWorkflow(w) });
  const result = await assessCurrentWorkflowReadiness({ workflow: approved.workflow, evaluatedAt: '2026-10-25T12:00:00Z' }, { host: h.host });
  assert.equal(result.report.status, 'READY'); assert.equal(result.report.nodes.review.approval, 'APPROVED');
  assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
});

async function productionFixture(t) {
  const f = await fixture(t);
  const media = id => ({ id, title: id, kind: 'fixture', executor: { id: 'local-tool', type: 'utility', tool: 'fixture', mayCostMoney: false, requiresConfirmation: false }, inputs: [], outputs: [{ id: 'result', type: 'video' }], parameters: { trim: 1 } });
  let workflow = createWorkflow({ workflowId: 'production', name: 'Dynamic fixture', nodes: [media('left'), media('sibling'), { ...media('review'), dependencies: ['left'], executor: { id: 'manual', type: 'control', tool: 'review', mayCostMoney: false, requiresConfirmation: false } }] });
  for (const node of workflow.nodes) workflow = recordNodeOutput(workflow, { nodeId: node.id, outputHash: 'a'.repeat(64), timestamp: '2026-10-25T12:00:00Z', expectedWorkflowHash: hashWorkflow(workflow) }).workflow;
  assert.equal((await f.project.addWorkflowToProject(workflow)).status, 'added');
  const history = (await f.project.getProjectHistory(workflow.workflowId)).store;
  return { ...f, workflow, history };
}
const approvalRequest = (opened, workflow, extra = {}) => ({ projectHandle: opened.projectHandle, workflowId: workflow.workflowId, nodeId: 'review', decision: 'APPROVED', timestamp: '2026-10-25T12:00:00Z', expectedWorkflowHash: hashWorkflow(workflow), ...extra });

test('fixed approval channel persists approved/rejected decisions and their history without runtime calls', async t => {
  const f = await productionFixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  const originalFetch = globalThis.fetch; globalThis.fetch = () => { assert.fail('Network forbidden'); }; t.after(() => { globalThis.fetch = originalFetch; });
  const approved = await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow, { expectedLatestRecordId: null, actor: { source: 'test' }, note: 'Local mock review' }));
  assert.equal(approved.status, 'applied', JSON.stringify(approved)); assert.equal(approved.workflow.nodes[2].metadata.production.approval.decision, 'APPROVED');
  const record = await f.history.getHistoryRecord(f.workflow.workflowId, approved.recordId); assert.equal(record.status, 'ok'); assert.equal(record.record.beforeHash, hashWorkflow(f.workflow));
  assert.deepEqual((await f.project.getProjectWorkflow(f.workflow.workflowId)).workflow, approved.workflow);
  const rejected = await h.host.applyWorkflowApproval(approvalRequest(opened, approved.workflow, { decision: 'REJECTED', expectedLatestRecordId: approved.recordId }));
  assert.equal(rejected.status, 'applied');
  const readiness = await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.ok(readiness.report.blockers.some(d => d.code === 'APPROVAL_REJECTED'));
  assert.equal((await f.history.listHistory(f.workflow.workflowId)).records.length, 2); assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
  assert.ok(!JSON.stringify([approved, rejected]).includes(f.root));
});

test('production host rejects stale hashes/history heads, missing nodes/workflows and unsafe requests before writing', async t => {
  const f = await productionFixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow, { expectedWorkflowHash: 'f'.repeat(64) }))), 'WORKFLOW_HASH_MISMATCH');
  assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow, { nodeId: 'absent' }))), 'NODE_NOT_FOUND');
  assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow, { workflowId: 'absent' }))), 'WORKFLOW_NOT_FOUND');
  for (const extra of [{ projectRoot: '/tmp/outside' }, { channel: 'local-ai:generate' }, { functionName: 'executeNode' }, { actor: { assetId: 'unregistered' } }]) {
    assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow, extra))), 'HOST_REQUEST_INVALID');
  }
  await assert.rejects(h.host.applyWorkflowApproval({ ...approvalRequest(opened, f.workflow), callback() { assert.fail('Must not execute'); } }), /clone/i);
  const approved = await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow)); assert.equal(approved.status, 'applied');
  assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, approved.workflow, { expectedLatestRecordId: null }))), 'STALE_WORKFLOW_STATE');
  assert.equal((await f.history.listHistory(f.workflow.workflowId)).records.length, 1);
});

test('invalidation uses a verified current history transition and preserves sibling/media/old snapshots', async t => {
  const f = await productionFixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  const originalFetch = globalThis.fetch; globalThis.fetch = () => { assert.fail('Network forbidden'); }; t.after(() => { globalThis.fetch = originalFetch; });
  const approved = await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow)); assert.equal(approved.status, 'applied');
  const batch = { commandVersion: 1, expectedWorkflowHash: approved.afterHash, commands: [{ type: 'set-node-parameter', targetId: 'left', parameterPath: '/trim', value: 2 }] };
  const edit = applyEditBatch(approved.workflow, batch), transition = await f.history.recordEdit({ before: approved.workflow, batch, result: edit }); assert.equal(transition.status, 'recorded');
  assert.equal((await f.project.updateWorkflowInProject({ workflow: edit.workflow, expectedHash: approved.afterHash })).status, 'updated');
  const asset = (await f.project.getProjectAsset('reference')).asset, bytes = await fs.readFile(path.join(f.root, asset.path));
  const result = await h.host.applyWorkflowInvalidation({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, transitionRecordId: transition.recordId, expectedWorkflowHash: edit.afterHash, evaluatedAt: '2026-10-25T12:00:00Z' });
  assert.equal(result.status, 'applied', JSON.stringify(result)); assert.deepEqual(result.affectedNodeIds, ['left', 'review']);
  assert.equal(result.workflow.nodes[2].metadata.production.approval.decision, 'STALE');
  assert.deepEqual(result.workflow.nodes[1], f.workflow.nodes[1]);
  assert.deepEqual(await fs.readFile(path.join(f.root, asset.path)), bytes);
  const old = (await f.history.getWorkflowAtRecord(f.workflow.workflowId, approved.recordId)).workflow;
  assert.equal(old.nodes[2].metadata.production.approval.decision, 'APPROVED'); assert.equal((await f.history.listHistory(f.workflow.workflowId)).records.length, 3);
  assert.equal((await f.project.verifyProjectIntegrity()).status, 'valid'); assert.equal(h.authReads(), 0); assert.equal(h.localCalls.length, 0);
  assert.equal(errorCode(await h.host.applyWorkflowInvalidation({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, transitionRecordId: transition.recordId, expectedWorkflowHash: result.afterHash, evaluatedAt: '2026-10-25T12:00:00Z' })), 'STALE_WORKFLOW_STATE');
});

test('corrupted project blocks both production operations and fixed channels reject foreign senders', async t => {
  const f = await productionFixture(t), h = await transport(t), opened = await h.host.openProject({ projectRoot: f.root });
  const asset = (await f.project.getProjectAsset('reference')).asset;
  await fs.writeFile(path.join(f.root, asset.path), 'tampered');
  assert.equal(errorCode(await h.host.applyWorkflowApproval(approvalRequest(opened, f.workflow))), 'ASSET_HASH_MISMATCH');
  const request = { projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, transitionRecordId: '00000000-0000-4000-8000-000000000000', expectedWorkflowHash: hashWorkflow(f.workflow), evaluatedAt: '2026-10-25T12:00:00Z' };
  assert.equal(errorCode(await h.host.applyWorkflowInvalidation(request)), 'ASSET_HASH_MISMATCH');
  assert.equal(errorCode(await h.host.applyWorkflowInvalidation({ ...request, commands: [] })), 'HOST_REQUEST_INVALID');
  for (const name of ['applyWorkflowApproval', 'applyWorkflowInvalidation']) assert.equal(errorCode(await h.handlers.get(`whihm:${name}`)({ ...h.event, sender: {} }, {})), 'HOST_SENDER_REJECTED');
});

for (const [model, endpoint, options, wireVideo] of [
  ['kling-v3.0-pro-recast', 'kling-v3.0-pro-motion-control', { character_orientation: 'video', keep_original_sound: false }, 'video_url'],
  ['runway-act-two-recast', 'runway-act-two-i2v', { aspect_ratio: '9:16' }, 'reference_video_url'],
  ['wan2.2-animate-recast', 'wan2.2-animate', { mode: 'replace', resolution: '720p' }, 'video_url'],
]) test(`fixed host routes authorized ${model} through shared Recast and lifecycle`, async t => {
  const f = await fixture(t), h = await transport(t), calls = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId);
  const changed = structuredClone(f.workflow), node = changed.nodes[0];
  node.executor.model = model; node.metadata.oga.mode = 'recast'; node.outputs[0].type = 'video';
  node.parameters = { image_url: 'https://example.com/character.png', video_url: 'https://example.com/driving.mp4', ...options };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => init.method === 'POST'
      ? { request_id: 'host-recast' }
      : { status: 'completed', outputs: ['https://example.com/recast.mp4'] } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = request(opened);
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processRecast');
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.model, model); assert.equal(result.requestId, 'host-recast');
  assert.equal(calls.length, 2); assert.ok(calls[0].url.endsWith(`/api/v1/${endpoint}`));
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload[wireVideo], node.parameters.video_url); assert.equal(payload.image_url, node.parameters.image_url);
  for (const [key, value] of Object.entries(options)) assert.equal(payload[key], value);
  if (wireVideo !== 'video_url') assert.equal(Object.hasOwn(payload, 'video_url'), false);
  assert.ok(calls[1].url.endsWith('/predictions/host-recast/result'));
  assert.ok(h.statuses.some(s => s.requestId === 'host-recast'));
  assert.ok(!JSON.stringify(result).includes('test-placeholder'));
});

for (const [model, mode, options] of [
  ['seedance-2.5-motion-control', 'objects_swap', { duration: 30, seed: 42, high_bitrate: true }],
  ['seedance-2-motion-control', 'motion_transfer', { duration: 15, quality: 'basic' }],
]) test(`fixed host plans and authorizes ${model} with ordered project references`, async t => {
  const f = await fixture(t), calls = [], uploads = [];
  const second = path.join(path.dirname(f.root), 'second.txt'); await fs.writeFile(second, 'second reference');
  const imported = await f.project.importAsset({ sourcePath: second, assetId: 'second_ref', contentType: 'text/plain' });
  assert.equal(imported.status, 'imported');
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  changed.assets.push({ id: 'second_ref', type: 'file', localPath: imported.asset.path });
  const node = changed.nodes[0]; node.executor.model = model; node.metadata.oga.mode = 'motion_control';
  node.outputs[0].type = 'video'; node.inputs = [{ id: 'images_list', type: 'image' }]; node.assetRefs = ['reference', 'second_ref'];
  node.parameters = { mode, video_url: 'https://example.com/driving.mp4', ...options };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processMotionControl } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processMotionControl, async uploadFile(_key, file) {
    const content = await file.text(); uploads.push(content);
    return content === 'second reference' ? 'https://example.com/second.png' : 'https://example.com/first.png';
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-motion' }
      : { status: 'completed', outputs: ['https://example.com/motion.mp4'] } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { images_list: ['second_ref', 'reference'] } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processMotionControl');
  assert.equal(plan.request.motionControl.intentMode, mode); assert.equal(plan.request.motionControl.imageCount, 2);
  assert.equal(uploads.length, 0); assert.equal(h.authReads(), 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  assert.equal(uploads.length, 0); assert.equal(calls.length, 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.model, model); assert.equal(result.requestId, 'host-motion');
  assert.deepEqual(uploads, ['second reference', 'tiny upload fixture']);
  assert.equal(calls.length, 2); assert.ok(calls[0].url.endsWith(`/api/v1/${model}`));
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.images_list, ['https://example.com/second.png', 'https://example.com/first.png']);
  for (const [key, value] of Object.entries(options)) assert.equal(payload[key], value);
  assert.equal((await h.host.getWorkflow(request(opened))).workflow.nodes[0].parameters.mode, mode);
  assert.ok(!JSON.stringify(result).includes(f.root));
});

for (const [model, parameters] of [
  ['runway-act-two-v2v', { reference_video_url: 'https://example.com/performance.mp4', aspect_ratio: '9:16' }],
  ['heygen-video-translate', { language: 'French' }],
]) test(`fixed preload/host V2V: ${model} reuses shared service and authorization`, async t => {
  const f = await fixture(t), h = await transport(t), calls = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  const node = changed.nodes[0]; node.executor.model = model; node.metadata.oga.mode = 'v2v'; node.outputs[0].type = 'video';
  node.parameters = { video_url: 'https://example.com/source.mp4', ...parameters };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-v2v' }
      : { status: 'completed', outputs: ['https://example.com/v2v.mp4'] } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = request(opened);
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processV2V');
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.requestId, 'host-v2v'); assert.equal(result.model, model);
  assert.equal(calls.length, 2); assert.ok(calls[0].url.endsWith(`/api/v1/${model}`));
  assert.deepEqual(JSON.parse(calls[0].body), node.parameters);
  assert.ok(calls[1].url.endsWith('/predictions/host-v2v/result'));
  assert.ok(h.statuses.some(s => s.requestId === 'host-v2v'));
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

test('fixed host V2V preserves ordered registered references through the existing uploader', async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  const node = changed.nodes[0]; node.executor.model = 'seedance-2.5-video-edit'; node.metadata.oga.mode = 'v2v';
  node.outputs[0].type = 'video'; node.inputs = [{ id: 'images_list', type: 'image' }]; node.assetRefs = ['reference'];
  node.parameters = { video_url: 'https://example.com/source.mp4', prompt: 'Restyle', duration: 4, resolution: '720p' };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processV2V } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processV2V, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return 'https://example.com/reference.png';
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => ({ status: 'completed', url: 'https://example.com/result.mp4' }) };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { images_list: ['reference', 'reference'] } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.requiredUploads.length, 2);
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(calls.length, 1);
  assert.deepEqual(uploaded, ['tiny upload fixture', 'tiny upload fixture']);
  assert.deepEqual(JSON.parse(calls[0].body).images_list, Array(2).fill('https://example.com/reference.png'));
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

test('fixed host Wave 1 preserves native Seedance 2.0 project source array and endpoint', async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  const node = changed.nodes[0]; node.executor.model = 'seedance-2-video-edit'; node.metadata.oga.mode = 'v2v';
  node.outputs[0].type = 'video'; node.inputs = [{ id: 'video_urls', type: 'video' }]; node.assetRefs = ['reference'];
  node.parameters = { prompt: 'Restyle', duration: 4, quality: 'high', aspect_ratio: '9:16' };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processV2V } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processV2V, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return 'https://example.com/source.mp4';
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => ({ status: 'completed', url: 'https://example.com/result.mp4' }) };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { video_urls: ['reference'] } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.request.requiredMedia[0].maximum, 1);
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.model, 'seedance-2-video-edit');
  assert.ok(calls[0].url.endsWith('/api/v1/seedance-v2.0-video-edit'));
  assert.deepEqual(JSON.parse(calls[0].body), { ...node.parameters, video_urls: ['https://example.com/source.mp4'] });
  assert.deepEqual(uploaded, ['tiny upload fixture']);
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

for (const [model, parameters] of [
  ['gemini-omni-flash-1-1-edit', { prompt: '  Restyle  ', resolution: '1080p' }],
  ['flux-3-video-upscaler', { upscale_factor: 1.25, creativity: 1, prompt: 'Reconstruct detail' }],
]) test(`fixed host Wave 2 resolves project source for ${model} without automatic execution`, async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  const node = changed.nodes[0]; node.executor.model = model; node.metadata.oga.mode = 'v2v'; node.outputs[0].type = 'video';
  node.parameters = parameters; node.inputs = [{ id: 'video_url', type: 'video' }]; node.assetRefs = ['reference'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processV2V } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processV2V, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return 'https://example.com/source.mp4';
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => ({ status: 'completed', url: 'https://example.com/result.mp4' }) };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { video_url: 'reference' } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.runtime, 'studio.processV2V');
  assert.equal(h.authReads(), 0); assert.equal(uploaded.length, 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.model, model);
  assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${model}`);
  assert.deepEqual(JSON.parse(calls[0].body), { ...parameters, video_url: 'https://example.com/source.mp4' });
  assert.deepEqual(uploaded, ['tiny upload fixture']);
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

for (const [model, parameters, engine] of [
  ['topaz-upscale-video-generative', { topaz_model: 'Starlight HQ', upscale_factor: 1.25, target_fps: 30, H264_output: true }, 'Starlight HQ'],
  ['topaz-upscale-video-precision', { topaz_model: 'Gaia CG', upscale_factor: 2, grain: 0.1 }, 'Gaia CG'],
]) test(`fixed host Wave 3 keeps ${model} distinct from provider engine ${engine}`, async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  const node = changed.nodes[0]; node.executor.model = model; node.metadata.oga.mode = 'v2v'; node.outputs[0].type = 'video';
  node.parameters = parameters; node.inputs = [{ id: 'video_url', type: 'video' }]; node.assetRefs = ['reference'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processV2V } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processV2V, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return 'https://example.com/source.mp4';
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => ({ status: 'completed', url: 'https://example.com/result.mp4', model: engine }) };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { video_url: 'reference' } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned'); assert.equal(plan.model, model);
  assert.equal(plan.request.v2v.providerModel, engine); assert.equal(plan.request.effectiveOptions.topaz_model, engine);
  assert.equal(Object.hasOwn(plan.request.effectiveOptions, 'model'), false);
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.model, model); assert.equal(result.upstream.model, engine);
  assert.equal(calls[0].url, `https://api.muapi.ai/api/v1/${model}`);
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload.model, engine); assert.equal(Object.hasOwn(payload, 'topaz_model'), false);
  for (const [field, value] of Object.entries(parameters).filter(([k]) => k !== 'topaz_model')) assert.equal(payload[field], value);
  assert.deepEqual(uploaded, ['tiny upload fixture']);
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

test('Audio Wave 1 fixed host preserves ordered project tracks and reviewed provider options', async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const audio = await f.project.importAsset({ sourcePath: f.source, assetId: 'track', contentType: 'audio/wav' });
  assert.equal(audio.status, 'imported');
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
  changed.assets.push({ id: 'track', type: 'audio', localPath: audio.asset.path });
  const node = changed.nodes[0]; node.executor.model = 'suno-generate-mashup'; node.metadata.oga.mode = 'audio';
  node.outputs[0].type = 'audio'; node.inputs = [{ id: 'audios_list', type: 'audio', required: true }]; node.assetRefs = ['track'];
  node.parameters = { style: 'Jazz', model: 'V5' };
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { generateAudio } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { generateAudio, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return `https://example.com/track-${uploaded.length}.wav`;
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-audio' }
      : { status: 'completed', outputs: ['https://example.com/mix.wav'] } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root });
  const args = { ...request(opened), assetBindings: { audios_list: ['track', 'track'] } };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.request.audio.capability, 'MASHUP_MUSIC');
  assert.equal(h.authReads(), 0); assert.equal(uploaded.length, 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded'); assert.equal(result.requestId, 'host-audio'); assert.equal(result.model, 'suno-generate-mashup');
  assert.equal(uploaded.length, 2); assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].body).audios_list, ['https://example.com/track-1.wav', 'https://example.com/track-2.wav']);
  assert.equal(JSON.parse(calls[0].body).model, 'V5'); assert.ok(!Object.hasOwn(JSON.parse(calls[0].body), '_modelId'));
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
});

test('Audio Wave 1 host rejects malformed dialogue and leaves Suno clone unavailable without execution', async t => {
  const f = await fixture(t), h = await transport(t);
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('Readiness/planning must not use network'); });
  for (const [model, parameters] of [['gemini-3-1-flash-tts', { speakers: [], dialogue_turns: [] }], ['suno-voice-clone', { audio_url: 'https://example.com/sample.wav' }]]) {
    const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow);
    changed.nodes[0].executor.model = model; changed.nodes[0].metadata.oga.mode = 'audio'; changed.nodes[0].parameters = parameters;
    assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
    const opened = await h.host.openProject({ projectRoot: f.root }), args = request(opened);
    assert.equal((await h.host.planNode(args)).status, 'rejected');
    assert.equal((await h.host.executeNode({ ...args, allowExecution: true })).status, 'rejected');
    if (model === 'suno-voice-clone') {
      const evidence = await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-26T12:00:00Z' });
      assert.equal(evidence.provenance.executors.remote.state, 'UNAVAILABLE');
    }
  }
  assert.equal(h.authReads(), 0);
});

for (const [model, parameters, bindings, layer] of [
  ['vidu-q2-reference-to-image', { prompt: 'Keep subjects in supplied order' }, { images_list: ['picture', 'https://example.com/public.png', 'picture'] }, false],
  ['topaz-upscale-image-generative', { topaz_model: 'Wonder 3.5', sharpen: 0.5, upscale_factor: 1.5 }, { image_url: 'picture' }, false],
  ['seedream-5.0-flash-layerize', { resolution: 'auto' }, { image_url: 'picture' }, true],
]) test(`advanced image host: ${model} preserves reviewed request/result without automatic execution`, async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const image = await f.project.importAsset({ sourcePath: f.source, assetId: 'picture', contentType: 'image/png' });
  assert.equal(image.status, 'imported');
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow), node = changed.nodes[0];
  changed.assets.push({ id: 'picture', type: 'image', localPath: image.asset.path });
  node.executor.model = model; node.metadata.oga.mode = 'i2i'; node.parameters = parameters;
  node.inputs = Object.keys(bindings).map(id => ({ id, type: 'image', required: true })); node.assetRefs = ['picture'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { generateI2I } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { generateI2I, async uploadFile(_key, file) {
    uploaded.push(await file.text()); return `https://example.com/image-${uploaded.length}.png`;
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init });
    return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-image' }
      : { status: 'completed', ...(layer ? { output: { images: ['https://example.com/layer2.png', 'https://example.com/layer1.png'] }, labels: ['provider metadata'] } : { outputs: ['https://example.com/result.png'] }) } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = { ...request(opened), assetBindings: bindings };
  const plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.request.image.modelId, model);
  assert.equal(h.authReads(), 0); assert.equal(uploaded.length, 0); assert.equal(calls.length, 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(result.model, model); assert.equal(result.requestId, 'host-image');
  const payload = JSON.parse(calls[0].body);
  if (model === 'vidu-q2-reference-to-image') assert.deepEqual(payload.images_list, ['https://example.com/image-1.png', 'https://example.com/public.png', 'https://example.com/image-2.png']);
  if (parameters.topaz_model) { assert.equal(payload.model, parameters.topaz_model); assert.equal(Object.hasOwn(payload, 'topaz_model'), false); }
  if (layer) { assert.equal(result.resultKind, 'layers'); assert.deepEqual(result.outputs.map(o => o.value), ['https://example.com/layer2.png', 'https://example.com/layer1.png']); assert.deepEqual(result.upstream.labels, ['provider metadata']); }
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
});

for (const [model, mode, parameters, bindings] of [
  ['seedance-2.5-omni-reference', 'i2v', { prompt: 'Use ordered references', duration: 5 }, { images_list: ['picture', 'https://example.com/public.png', 'picture'], videos_list: ['clip'], audios_list: ['speech'] }],
  ['flux-3-start-end-to-video', 'i2v', { prompt: 'Connect the named frames', duration: 8 }, { image_url: 'picture', end_image_url: 'picture' }],
  ['volcengine-video-to-video-lip-sync', 'lipsync', { mode: 'basic', open_scenedet: true, separate_vocal: true }, { video_url: 'clip', audio_url: 'speech' }],
  ['omnihuman-1-5', 'lipsync', { prompt: 'Speak naturally', output_resolution: '720', seed: -1, pe_fast_mode: true }, { image_url: 'picture', audio_url: 'speech' }],
]) test(`advanced video fixed host: ${model} preserves media roles and authorization`, async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow), node = changed.nodes[0];
  for (const [id, type] of [['picture', 'image'], ['clip', 'video'], ['speech', 'audio']]) {
    const imported = await f.project.importAsset({ sourcePath: f.source, assetId: id, contentType: `${type}/fixture` });
    assert.equal(imported.status, 'imported'); changed.assets.push({ id, type, localPath: imported.asset.path });
  }
  node.executor.model = model; node.metadata.oga.mode = mode; node.parameters = parameters; node.outputs[0].type = 'video';
  const { getVideoInputMedia } = await import('../packages/studio/src/videoInputContracts.js');
  const roles = getVideoInputMedia(model, mode);
  node.inputs = Object.keys(bindings).map(id => ({ id, type: roles.find(r => r.field === id).type }));
  node.assetRefs = ['picture', 'clip', 'speech'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { generateI2V, processLipSync } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { generateI2V, processLipSync, async uploadFile(_key, file) {
    uploaded.push(file.type); return `https://example.com/asset-${uploaded.length}`;
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => init.method === 'POST'
      ? { request_id: 'host-video-inputs' } : { status: 'completed', outputs: ['https://example.com/result.mp4'] } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = { ...request(opened), assetBindings: bindings };
  const plan = await h.host.planNode(args); assert.equal(plan.status, 'planned', JSON.stringify(plan));
  assert.equal(plan.request.videoInput.modelId, model); assert.equal(plan.request.videoInput.mode, mode);
  assert.equal(calls.length, 0); assert.equal(uploaded.length, 0); assert.equal(h.authReads(), 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  const missing = { ...args, assetBindings: {} };
  assert.equal((await h.host.executeNode({ ...missing, allowExecution: true })).status, 'rejected');
  assert.equal(h.authReads(), 0); assert.equal(calls.length, 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(result.model, model); assert.equal(result.requestId, 'host-video-inputs');
  const payload = JSON.parse(calls[0].body);
  if (model === 'seedance-2.5-omni-reference') {
    assert.deepEqual(payload.images_list, ['https://example.com/asset-1', 'https://example.com/public.png', 'https://example.com/asset-2']);
    assert.deepEqual(payload.videos_list, ['https://example.com/asset-3']); assert.deepEqual(payload.audios_list, ['https://example.com/asset-4']);
  } else if (model === 'flux-3-start-end-to-video') {
    assert.equal(payload.image_url, 'https://example.com/asset-1'); assert.equal(payload.end_image_url, 'https://example.com/asset-2');
  } else if (model === 'volcengine-video-to-video-lip-sync') {
    assert.equal(payload.mode, 'basic'); assert.equal(payload.open_scenedet, true); assert.equal(payload.align_audio, undefined);
  } else { assert.equal(payload.output_resolution, '720'); assert.equal(payload.pe_fast_mode, true); assert.equal(payload.seed, -1); }
  assert.equal(calls.length, 2); assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
});

for (const [model, mode, parameters, bindings] of [
  ['ai-clipping', 'clipping', { num_highlights: 2, aspect_ratio: '4:5', return_coordinates_only: true }, { video_url: 'clip' }],
  ['motion-graphics', 'motion_graphics', { operation: 'create', prompt: 'Animate a showcase', category: 'showcase', duration_seconds: 8 }, { images_list: ['picture', 'https://example.com/public.png', 'picture'], video_files: ['clip'] }],
  ['motion-graphics-edit', 'motion_graphics', { operation: 'edit', request_id: 'completed-motion-generation', edit_prompt: 'Make the title gold' }, {}],
]) test(`creative service host: ${model} uses fixed methods, passive plans and explicit authorization`, async t => {
  const f = await fixture(t), calls = [], uploaded = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow), node = changed.nodes[0];
  for (const [id, type] of [['clip', 'video'], ['picture', 'image']]) {
    const imported = await f.project.importAsset({ sourcePath: f.source, assetId: id, contentType: type + '/fixture' });
    changed.assets.push({ id, type, localPath: imported.asset.path });
  }
  node.executor.model = model; node.metadata.oga.mode = mode; node.parameters = parameters; node.outputs[0].type = 'video';
  node.inputs = Object.keys(bindings).map(id => ({ id, type: id === 'images_list' ? 'image' : 'video' })); node.assetRefs = ['clip', 'picture'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { runClipping, runMotionGraphics, runMotionGraphicsEdit } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { runClipping, runMotionGraphics, runMotionGraphicsEdit, async uploadFile(_key, file) {
    uploaded.push(file.type); return `https://example.com/creative-${uploaded.length}`;
  } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-creative-job' }
      : { status: 'completed', ...(mode === 'clipping' ? { output: { coordinates: [{ start: 2, end: 5, label: 'Actual selection' }] } } : { output: { video: 'https://example.com/animation.mp4' } }) } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = { ...request(opened), assetBindings: bindings };
  const plan = await h.host.planNode(args); assert.equal(plan.status, 'planned', JSON.stringify(plan));
  assert.equal(plan.request.creativeService.modelId, model); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0); assert.equal(h.authReads(), 0);
  const readiness = await h.host.assessWorkflowReadiness({ projectHandle: opened.projectHandle, workflowId: f.workflow.workflowId, evaluatedAt: '2026-10-26T20:00:00Z' });
  assert.equal(readiness.provenance.executors.remote.state, 'AVAILABLE'); assert.equal(h.authReads(), 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  if (bindings.video_url) assert.equal((await h.host.executeNode({ ...args, assetBindings: { video_url: 'picture' }, allowExecution: true })).status, 'rejected');
  assert.equal(h.authReads(), 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true });
  assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(result.model, model); assert.equal(result.requestId, 'host-creative-job');
  assert.ok(calls[0].url.endsWith('/api/v1/' + model)); const payload = JSON.parse(calls[0].body);
  if (mode === 'clipping') { assert.equal(payload.video_url, 'https://example.com/creative-1'); assert.equal(result.clipping.coordinates[0].label, 'Actual selection'); assert.equal(result.outputs.length, 0); }
  else if (model === 'motion-graphics') { assert.deepEqual(payload.images_list, ['https://example.com/creative-1', 'https://example.com/public.png', 'https://example.com/creative-2']); assert.deepEqual(payload.video_files, ['https://example.com/creative-3']); }
  else { assert.equal(payload.request_id, parameters.request_id); assert.equal(Object.hasOwn(payload, 'aspect_ratio'), false); assert.equal(Object.hasOwn(payload, 'duration_seconds'), false); assert.equal(uploaded.length, 0); }
  assert.equal(calls.length, 2); assert.ok(!JSON.stringify({ plan, result }).includes(f.root));
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
});

for (const [model, parameters, bindings] of [
  ['add-video-watermark', { position: 'center', opacity: 0, scale: 0.25 }, { video_url: 'clip', watermark_image_url: 'logo' }],
  ['ai-captions', { language: 'Spanish', theme: 'Hormozi_2' }, { video_url: 'clip' }],
]) test(`V2V utility host: ${model} validates typed media, preserves native result and requires authorization`, async t => {
  const f = await fixture(t), uploaded = [], calls = [];
  const current = await f.project.getProjectWorkflow(f.workflow.workflowId), changed = structuredClone(current.workflow), node = changed.nodes[0];
  for (const [id, type] of [['clip', 'video'], ['logo', 'image']]) {
    const imported = await f.project.importAsset({ sourcePath: f.source, assetId: id, contentType: type + '/fixture' });
    changed.assets.push({ id, type, localPath: imported.asset.path });
  }
  node.executor.model = model; node.metadata.oga.mode = 'v2v'; node.parameters = parameters; node.outputs[0].type = 'video';
  node.inputs = Object.keys(bindings).map(id => ({ id, type: id === 'video_url' ? 'video' : 'image' })); node.assetRefs = ['clip', 'logo'];
  assert.equal((await f.project.updateWorkflowInProject({ workflow: changed, expectedHash: current.hash })).status, 'updated');
  const { processV2V } = await import('../packages/studio/src/muapi.js');
  const h = await transport(t, { remote: { processV2V, async uploadFile(_key, file) { uploaded.push(file.type); return `https://example.com/utility-${uploaded.length}`; } } });
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => init.method === 'POST' ? { request_id: 'host-v2v-utility' }
      : { status: 'completed', output: { video: 'https://example.com/utility.mp4', metadata: { provider_value: 'preserved' } } } };
  });
  const opened = await h.host.openProject({ projectRoot: f.root }), args = { ...request(opened), assetBindings: bindings }, plan = await h.host.planNode(args);
  assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(calls.length, 0); assert.equal(uploaded.length, 0); assert.equal(h.authReads(), 0);
  assert.equal(errorCode(await h.host.executeNode(args)), 'EXECUTION_NOT_AUTHORIZED');
  assert.equal((await h.host.executeNode({ ...args, assetBindings: { ...bindings, video_url: 'logo' }, allowExecution: true })).status, 'rejected');
  assert.equal(h.authReads(), 0);
  const result = await h.host.executeNode({ ...args, allowExecution: true }); assert.equal(result.status, 'succeeded', JSON.stringify(result));
  assert.equal(result.model, model); assert.equal(result.requestId, 'host-v2v-utility'); assert.equal(result.resultKind, 'v2v-utility'); assert.equal(result.upstream.output.metadata.provider_value, 'preserved');
  assert.equal(result.outputs[0].value, 'https://example.com/utility.mp4'); assert.ok(calls[0].url.endsWith('/api/v1/' + model));
  const payload = JSON.parse(calls[0].body); assert.equal(payload.video_url, 'https://example.com/utility-1');
  if (model === 'add-video-watermark') { assert.equal(payload.watermark_image_url, 'https://example.com/utility-2'); assert.equal(payload.opacity, 0); } else assert.equal(payload.theme, 'Hormozi_2');
  assert.ok(!JSON.stringify({ plan, result }).includes(f.root)); assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow, changed);
});

for (const [model, mode, parameters, bindings] of [
  ['seedance-2.5-spicy-video-edit','v2v',{prompt:'Change lighting',resolution:'4k',generate_audio:false,seed:0},{video_url:'clip',images_list:['picture','https://example.com/public.png','picture'],audios_list:['sound','sound']}],
  ['seedance-2.5-spicy-video-extend','v2v',{prompt:'Continue',resolution:'1080p',duration:4,generate_audio:false},{video_url:'clip',last_image:'picture'}],
  ['gemini-omni-video-edit','v2v',{prompt:'Edit',trim_start:1,trim_end:7,audio_ids:['sound'],character_ids:['picture']},{video_url:'clip',image_urls:['picture','picture']}],
  ['seedance-2.5-spicy-first-last-frame','i2v',{prompt:'Transition',resolution:'4k',seed:0},{images_list:['picture','picture']}],
]) test(`final remote video host: ${model} retains exact roles/options and fixed authorization`,async t=>{
  const f=await fixture(t),calls=[],uploaded=[];const current=await f.project.getProjectWorkflow(f.workflow.workflowId),changed=structuredClone(current.workflow),node=changed.nodes[0];
  for(const[id,type]of [['clip','video'],['picture','image'],['sound','audio']]){const imported=await f.project.importAsset({sourcePath:f.source,assetId:id,contentType:type+'/fixture'});changed.assets.push({id,type,localPath:imported.asset.path});}
  node.executor.model=model;node.metadata.oga.mode=mode;node.parameters=parameters;node.outputs[0].type='video';node.assetRefs=['clip','picture','sound'];
  node.inputs=Object.keys(bindings).map(id=>({id,type:id==='video_url'?'video':id==='audios_list'?'audio':'image'}));
  assert.equal((await f.project.updateWorkflowInProject({workflow:changed,expectedHash:current.hash})).status,'updated');
  const {processV2V,generateI2V}=await import('../packages/studio/src/muapi.js');
  const h=await transport(t,{remote:{processV2V,generateI2V,async uploadFile(_key,file){uploaded.push(file.type);return `https://example.com/final-${uploaded.length}`;}}});
  t.mock.method(globalThis,'fetch',async(url,init={})=>{calls.push({url,...init});return{ok:true,json:async()=>init.method==='POST'?{request_id:'host-final-video'}:{status:'completed',output:{video:'https://example.com/final.mp4',metadata:{native:true}}}};});
  const opened=await h.host.openProject({projectRoot:f.root}),args={...request(opened),assetBindings:bindings},plan=await h.host.planNode(args);
  assert.equal(plan.status,'planned',JSON.stringify(plan));assert.equal(h.authReads(),0);assert.equal(calls.length,0);assert.equal(uploaded.length,0);
  assert.equal(errorCode(await h.host.executeNode(args)),'EXECUTION_NOT_AUTHORIZED');
  const result=await h.host.executeNode({...args,allowExecution:true});assert.equal(result.status,'succeeded',JSON.stringify(result));assert.equal(result.model,model);assert.equal(result.requestId,'host-final-video');assert.equal(result.outputs[0].value,'https://example.com/final.mp4');
  const payload=JSON.parse(calls[0].body);assert.ok(calls[0].url.endsWith('/api/v1/'+model));
  if(model.endsWith('spicy-video-edit')){assert.deepEqual(payload.images_list,['https://example.com/final-2','https://example.com/public.png','https://example.com/final-3']);assert.deepEqual(payload.audios_list,['https://example.com/final-4','https://example.com/final-5']);assert.equal(payload.seed,0);assert.equal(payload.generate_audio,false);}
  if(model.endsWith('spicy-video-extend'))assert.equal(payload.last_image,'https://example.com/final-2');
  if(model==='gemini-omni-video-edit'){assert.deepEqual(payload.audio_ids,['sound']);assert.deepEqual(payload.character_ids,['picture']);assert.equal(uploaded.length,3);assert.equal((await h.host.planNode({...args,assetBindings:{...bindings,audio_ids:['sound']}})).status,'rejected');}
  if(mode==='i2v')assert.deepEqual(payload.images_list,['https://example.com/final-1','https://example.com/final-2']);
  assert.deepEqual((await h.host.getWorkflow(request(opened))).workflow,changed);assert.ok(!JSON.stringify({plan,result}).includes(f.root));
});

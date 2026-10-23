import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWorkflowNavigation, parseWorkflowRoute } from '../src/lib/workflow-desktop/routes.mjs';
import { adaptWorkflowRequest, createWorkflowTransport } from '../src/lib/workflow-desktop/transport.mjs';
import { workflowDesktopCompatibility } from '../src/lib/workflow-desktop/vite.mjs';

test('list, selection, builder, playground and back use only local workflow state', () => {
  const router = createWorkflowNavigation(), original = router.getSnapshot();
  const changes = [], off = router.subscribe(() => changes.push(router.getSnapshot().path));
  router.push('/workflow/workflow-a/playground');
  assert.deepEqual(router.getSnapshot().params, { id: 'workflow-a', tab: 'playground' });
  router.push('/workflow/workflow-a/builder');
  router.replace('/workflow/workflow-b');
  assert.deepEqual(router.getSnapshot().params, { id: 'workflow-b', tab: 'builder' });
  router.back();
  assert.equal(router.getSnapshot().params.id, 'workflow-a');
  router.push('/workflow');
  assert.deepEqual(router.getSnapshot(), original);
  off(); router.push('/workflow/new/builder');
  assert.equal(changes.length, 5);
  assert.deepEqual(original.params, {});
});

test('routing rejects arbitrary URLs, file navigation and malformed IDs', () => {
  for (const route of ['file:///etc/passwd', 'https://other.example/', '/workflow/../secret', '/workflow/a/unknown', '/agents']) {
    assert.throws(() => parseWorkflowRoute(route), /Unsupported/);
  }
  const router = createWorkflowNavigation();
  assert.throws(() => router.push('/workflow/a/../../secret'));
  assert.equal(router.getSnapshot().path, '/studio/workflows');
});

test('workflow and app routes preserve request semantics and resolve outside file://', async () => {
  const calls = [], client = createWorkflowTransport({ getKey: () => 'fake-test-key', adapter: async config => {
    calls.push(config);
    return { data: { workflow_id: 'test-workflow' }, status: 200, statusText: 'OK', config, headers: {} };
  } });
  const params = { filename: 'tiny.png' };
  await client.get('/api/app/get_file_upload_url', { params });
  await client.post('/api/workflow/create', { name: 'Fixture', data: { nodes: [] } });
  await client.get('/api/workflow/run/run-a/status?verbose=1');
  await client.post('/api/app/calculate_dynamic_cost', { model: 'fixture' });
  assert.equal(calls[0].url, 'https://api.muapi.ai/app/get_file_upload_url');
  assert.deepEqual(calls[0].params, params);
  assert.equal(calls[1].url, 'https://api.muapi.ai/workflow/create');
  assert.equal(JSON.parse(calls[1].data).name, 'Fixture');
  assert.equal(calls[2].url, 'https://api.muapi.ai/workflow/run/run-a/status?verbose=1');
  assert.equal(calls[3].url, 'https://api.muapi.ai/app/calculate_dynamic_cost');
  assert.ok(calls.every(call => call.headers.get('x-api-key') === 'fake-test-key'));
  assert.ok(calls.every(call => call.withCredentials === false));
});

test('presigned multipart upload retains data/progress and never gets the MuAPI key', async () => {
  let authReads = 0;
  const calls = [], client = createWorkflowTransport({ getKey: () => { authReads++; return 'fake-key'; }, adapter: async config => {
    calls.push(config);
    config.onUploadProgress?.({ loaded: 1, total: 1 });
    return { data: {}, status: 204, statusText: 'OK', config, headers: {} };
  } });
  const body = new FormData(); body.append('file', new Blob(['tiny']), 'tiny.txt');
  let progress;
  await client.post('https://storage.example/upload?signature=fake', body, {
    headers: { 'x-api-key': 'must-not-leak', Authorization: 'must-not-leak' },
    onUploadProgress: value => { progress = value.loaded; },
  });
  assert.equal(authReads, 0);
  assert.equal(calls[0].data, body);
  assert.equal(calls[0].url, 'https://storage.example/upload?signature=fake');
  assert.equal(calls[0].headers.has('x-api-key'), false);
  assert.equal(calls[0].headers.has('Authorization'), false);
  assert.equal(progress, 1);
});

test('missing authentication rejects before the adapter; config and payload stay unchanged', async () => {
  let submitted = 0;
  const client = createWorkflowTransport({ getKey: () => null, adapter: async () => { submitted++; } });
  await assert.rejects(client.get('/api/workflow/get-workflow-defs'), /API Key missing/);
  assert.equal(submitted, 0);
  const config = { url: '/api/workflow/create', headers: { cookie: 'never-forward', 'X-API-Key': 'old' }, data: { workflow_id: 'a' } };
  const before = structuredClone(config);
  const request = adaptWorkflowRequest(config, 'fake-key');
  assert.deepEqual(config, before);
  assert.deepEqual(request.data, config.data);
  assert.equal(request.headers.cookie, undefined);
  assert.ok(!JSON.stringify(request.data).includes('fake-key'));
  for (const url of ['/api/unknown', '/api/workflow/../../unknown', 'file:///tmp/input', 'https://key@api.muapi.ai/workflow/a', 'http://storage.example']) {
    assert.throws(() => adaptWorkflowRequest({ url }, 'fake-key'));
  }
});

test('compatibility aliases affect workflow imports only and use upstream builder source', async () => {
  const plugin = workflowDesktopCompatibility();
  const studio = fileURLToPath(new URL('../packages/studio/src/components/WorkflowUI.jsx', import.meta.url));
  const node = fileURLToPath(new URL('../packages/Vibe-Workflow/packages/workflow-builder/src/components/NodeFlow.jsx', import.meta.url));
  const other = fileURLToPath(new URL('../src/lib/muapi.js', import.meta.url));
  assert.match(plugin.resolveId('workflow-builder', studio), /workflow-builder\/src\/index.js$/);
  assert.match(plugin.resolveId('next/navigation', node), /workflow-desktop\/navigation.jsx$/);
  assert.match(plugin.resolveId('axios', node), /workflow-desktop\/transport.mjs$/);
  assert.equal(plugin.resolveId('axios', other), undefined);
  assert.equal(plugin.resolveId('next/navigation', other), undefined);
  const upstream = await readFile(node, 'utf8');
  const adapted = plugin.transform(upstream, node).code;
  assert.ok(adapted.includes('desktopWorkflowNavigation.push(`/workflow/${response.data.workflow_id}`)'));
  assert.ok(!adapted.includes('window.location.href ='));
  assert.throws(() => plugin.transform(upstream.replace('window.location.href =', 'changed ='), node), /Upstream.*changed/);
});

test('upstream error logging cannot reveal credential-bearing Axios config', async () => {
  const client = createWorkflowTransport({ getKey: () => 'fake-private-key', adapter: async config => {
    throw Object.assign(new Error('Request rejected fake-private-key'), {
      config, request: { secret: 'fake-private-key' }, code: 'ERR_BAD_REQUEST',
      response: { status: 403, data: { detail: 'Permission denied', echo: 'fake-private-key' }, config },
    });
  } });
  await assert.rejects(client.post('/api/workflow/create', { data: { nodes: [] } }), error => {
    assert.equal(error.code, 'ERR_BAD_REQUEST');
    assert.equal(error.response.status, 403);
    assert.equal(error.response.data.detail, 'Permission denied');
    assert.equal(error.config, undefined); assert.equal(error.request, undefined);
    assert.ok(!JSON.stringify(error).includes('fake-private-key'));
    assert.ok(!error.message.includes('fake-private-key'));
    return true;
  });
});

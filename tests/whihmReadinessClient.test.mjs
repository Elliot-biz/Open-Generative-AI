import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCurrentWorkflowReadiness } from '../src/lib/whihmReadinessClient.mjs';

test('renderer readiness client uses only the fixed host method, snapshots request and detaches result', async () => {
  const request = { projectHandle: 'handle', workflowId: 'job', evaluatedAt: '2026-10-25T12:00:00Z' }, calls = [];
  const result = { status: 'assessed', report: { status: 'READY', ready: true }, diagnostics: [] };
  const originalWindow = globalThis.window; globalThis.window = { whihmHost: { async assessWorkflowReadiness(value) { calls.push(value); return result; }, executeNode() { assert.fail('Execution forbidden'); } } };
  try {
    const received = await assessCurrentWorkflowReadiness(request);
    assert.deepEqual(calls, [request]); assert.notEqual(calls[0], request); assert.deepEqual(received, result); assert.notEqual(received, result);
  } finally { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
});
test('renderer client preserves structured host failure and sanitizes thrown errors', async () => {
  const failure = { status: 'rejected', diagnostics: [{ code: 'PROJECT_HANDLE_INVALID', path: '', message: 'Invalid handle' }] };
  assert.deepEqual(await assessCurrentWorkflowReadiness({}, { host: { assessWorkflowReadiness: async () => failure } }), failure);
  const r = await assessCurrentWorkflowReadiness({}, { host: { assessWorkflowReadiness() { throw Error('private credential-bearing diagnostic'); } } });
  assert.equal(r.diagnostics[0].code, 'READINESS_HOST_FAILED'); assert.ok(!JSON.stringify(r).includes('private credential'));
  assert.equal((await assessCurrentWorkflowReadiness({}, { host: null })).diagnostics[0].code, 'READINESS_HOST_UNAVAILABLE');
});
test('renderer rejects unknown capabilities/non-JSON requests and malformed results before forwarding', async () => {
  let calls = 0; const host = { async assessWorkflowReadiness() { calls++; return {}; } };
  const cyclic = {}; cyclic.workflow = cyclic;
  for (const input of [{ projectRoot: '/arbitrary' }, { channel: 'execute' }, { workflow: { callback() {} } }, { budget: { amount: Infinity } }, cyclic]) {
    assert.equal((await assessCurrentWorkflowReadiness(input, { host })).diagnostics[0].code, 'READINESS_REQUEST_INVALID');
  }
  assert.equal(calls, 0);
  assert.equal((await assessCurrentWorkflowReadiness({}, { host })).diagnostics[0].code, 'READINESS_HOST_RESULT_INVALID');
});

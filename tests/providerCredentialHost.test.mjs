import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';

const require = createRequire(import.meta.url);
const { register } = require('../electron/lib/whihm-host.js');
const repo = fileURLToPath(new URL('../', import.meta.url));

function safeStorage() {
  const marker = Buffer.from('WHIHM-ENC-v1:');
  const crypt = value => Buffer.concat([marker, Buffer.from(value, 'utf8').map(byte => byte ^ 0xa5)]);
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => crypt(value),
    decryptString: bytes => Buffer.from(Buffer.from(bytes).subarray(marker.length).map(byte => byte ^ 0xa5)).toString('utf8'),
  };
}

async function harness(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-provider-host-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { createProviderCredentialStore } = require('../electron/lib/provider-credentials.js');
  const providerCredentials = createProviderCredentialStore({ app: { getPath: () => directory }, safeStorage: safeStorage() });
  const handlers = new Map();
  const sender = new EventEmitter(); sender.id = 17; sender.isDestroyed = () => false; sender.mainFrame = { url: pathToFileURL(path.join(repo, 'dist/index.html')).href }; sender.send = () => {};
  const event = { sender, senderFrame: sender.mainFrame };
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const ipcRenderer = { invoke: (channel, value) => handlers.get(channel)(event, structuredClone(value)), on: () => {}, removeListener: () => {} };
  const exposed = {};
  vm.runInNewContext(await fs.readFile(path.join(repo, 'electron/preload.js'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer, contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } } }; },
  });
  register({ ipcMain, getWindow: () => ({ webContents: sender, isDestroyed: () => false }), load: async () => ({ createWorkflowHost }), providerCredentials });
  t.after(() => sender.emit('destroyed'));
  return { host: exposed.whihmHost, store: providerCredentials };
}

test('fixed host/preload credential controls are write-only and sanitized', async t => {
  const { host, store } = await harness(t);
  assert.equal(typeof host.setProviderCredential, 'function');
  assert.equal(typeof host.removeProviderCredential, 'function');
  assert.equal(Object.keys(host).some(key => /get.*Credential|Secret|ApiKey/i.test(key)), false);

  const secret = 'fixture-higgsfield-secret-9876';
  const keyId = 'fixture-higgsfield-id';
  const saved = await host.setProviderCredential({ providerId: 'higgsfield', credentials: { key_id: keyId, key_secret: secret } });
  assert.equal(saved.status, 'saved');
  assert.ok(!JSON.stringify(saved).includes(secret));
  assert.ok(!JSON.stringify(saved).includes(keyId));

  const status = await host.getProviderStatus({ providerId: 'higgsfield' });
  assert.equal(status.provider.credential.presence, 'present');
  assert.equal(status.provider.credential.source, 'host_store');
  assert.equal(status.provider.readiness.state, 'UNVERIFIED');
  assert.ok(status.provider.bindings.filter(binding => binding.capabilityId === 'PERFORMANCE_TRANSFER').every(binding => binding.catalogAvailable === true));
  assert.ok(!JSON.stringify(status).includes(secret));
  assert.ok(!JSON.stringify(status).includes(keyId));
  assert.deepEqual(store.resolve('higgsfield'), { HF_API_KEY_ID: keyId, HF_API_KEY_SECRET: secret });

  const removed = await host.removeProviderCredential({ providerId: 'higgsfield' });
  assert.equal(removed.status, 'removed');
  assert.equal((await host.getProviderStatus({ providerId: 'higgsfield' })).provider.credential.presence, 'missing');
});

test('fixed host control rejects unsupported credential schemas without echoing values', async t => {
  const { host } = await harness(t);
  const result = await host.setProviderCredential({ providerId: 'unknown', credentials: { api_key: 'fixture-secret-value-1234' } });
  assert.equal(result.status, 'rejected');
  assert.equal(result.diagnostics[0].code, 'PROVIDER_CREDENTIAL_PROVIDER_UNSUPPORTED');
  assert.ok(!JSON.stringify(result).includes('fixture-secret-value-1234'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveProviderEnvironment, effectiveProviderEnvironment, providerCredentialView } from '../lib/whihm-execution/provider-credentials.mjs';
import { createHiggsfieldNative } from '../lib/whihm-execution/higgsfield-native.mjs';

const require = createRequire(import.meta.url);
const { createProviderCredentialStore } = require('../electron/lib/provider-credentials.js');

function fakeSafeStorage(available = true) {
  const marker = Buffer.from('WHIHM-ENC-v1:');
  const crypt = value => Buffer.concat([marker, Buffer.from(value, 'utf8').map(byte => byte ^ 0xa5)]);
  return {
    isEncryptionAvailable: () => available,
    encryptString: value => crypt(value),
    decryptString: bytes => {
      const raw = Buffer.from(bytes);
      assert.deepEqual(raw.subarray(0, marker.length), marker);
      return Buffer.from(raw.subarray(marker.length).map(byte => byte ^ 0xa5)).toString('utf8');
    },
  };
}

async function storeFixture(t, available = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-provider-credentials-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return createProviderCredentialStore({ app: { getPath: () => directory }, safeStorage: fakeSafeStorage(available), now: () => '2026-10-28T00:00:00.000Z' });
}

const hf = { key_id: 'fixture-key-id', key_secret: 'fixture-secret-value' };
const meta = { api_key: 'fixture-meta-api-key-1234' };

test('allowlisted credentials are encrypted at rest and never returned by store status', async t => {
  const store = await storeFixture(t);
  const saved = store.set('higgsfield', hf);
  assert.deepEqual(saved, { schemaVersion: 1, status: 'saved', providerId: 'higgsfield', credential: { presence: 'present', source: 'host_store', verification: 'unverified' } });
  store.set('meta', meta);
  const body = await fs.readFile(store.storagePath(), 'utf8');
  assert.ok(!body.includes(hf.key_id) && !body.includes(hf.key_secret) && !body.includes(meta.api_key));
  assert.deepEqual(store.getStatus('higgsfield'), { schemaVersion: 1, providerId: 'higgsfield', storage: 'available', presence: 'present', source: 'host_store' });
  assert.deepEqual(store.getStatus('meta'), { schemaVersion: 1, providerId: 'meta', storage: 'available', presence: 'present', source: 'host_store' });
  assert.deepEqual(store.resolve('higgsfield'), { HF_API_KEY_ID: hf.key_id, HF_API_KEY_SECRET: hf.key_secret });
});

test('schema allowlist rejects unknown, partial and malformed payloads', async t => {
  const store = await storeFixture(t);
  assert.throws(() => store.set('unknown', { api_key: meta.api_key }), error => error.code === 'PROVIDER_CREDENTIAL_PROVIDER_UNSUPPORTED');
  assert.throws(() => store.set('meta', {}), error => error.code === 'PROVIDER_CREDENTIAL_FIELDS_INVALID');
  assert.throws(() => store.set('meta', { api_key: 'short' }), error => error.code === 'PROVIDER_CREDENTIAL_VALUE_INVALID');
  assert.throws(() => store.set('meta', { api_key: meta.api_key, extra: 'not-allowed' }), error => error.code === 'PROVIDER_CREDENTIAL_FIELDS_INVALID');
  assert.throws(() => store.set('higgsfield', { key_id: hf.key_id }), error => error.code === 'PROVIDER_CREDENTIAL_FIELDS_INVALID');
});

test('encryption unavailable fails closed without creating plaintext storage', async t => {
  const store = await storeFixture(t, false);
  assert.throws(() => store.set('meta', meta), error => error.code === 'PROVIDER_CREDENTIAL_ENCRYPTION_UNAVAILABLE');
  assert.equal(store.encryptionAvailable(), false);
  await assert.rejects(fs.access(store.storagePath()));
});

test('replace and remove affect only the host-owned credential and expose safe status', async t => {
  const store = await storeFixture(t);
  store.set('meta', meta);
  store.set('meta', { api_key: 'fixture-meta-api-key-replaced' });
  assert.equal(store.resolve('meta').WHIHM_META_API_KEY, 'fixture-meta-api-key-replaced');
  const removed = store.remove('meta');
  assert.deepEqual(removed.credential, { presence: 'missing', source: 'unavailable', verification: 'unverified' });
  assert.equal(store.getStatus('meta').presence, 'missing');
});

test('host credentials win as a complete set and malformed host data blocks environment merging', async t => {
  const store = await storeFixture(t);
  const env = { HF_API_KEY_ID: 'environment-id', HF_API_KEY_SECRET: 'environment-secret' };
  store.set('higgsfield', hf);
  const host = resolveProviderEnvironment('higgsfield', { env, store });
  assert.equal(host.source, 'host_store');
  assert.deepEqual({ HF_API_KEY_ID: host.env.HF_API_KEY_ID, HF_API_KEY_SECRET: host.env.HF_API_KEY_SECRET }, { HF_API_KEY_ID: hf.key_id, HF_API_KEY_SECRET: hf.key_secret });

  await fs.writeFile(store.storagePath(), JSON.stringify({ schemaVersion: 1, providers: { higgsfield: { schemaVersion: 1, fields: { key_id: 'partial' } } } }));
  const malformed = resolveProviderEnvironment('higgsfield', { env, store });
  assert.equal(malformed.presence, 'malformed');
  assert.equal(malformed.source, 'host_store');
  assert.notEqual(malformed.env.HF_API_KEY_ID, env.HF_API_KEY_ID);
  assert.notEqual(malformed.env.HF_API_KEY_SECRET, env.HF_API_KEY_SECRET);
  assert.equal(providerCredentialView('higgsfield', { env, store }).presence, 'malformed');
});

test('environment credentials remain compatible when no host credential exists', async t => {
  const store = await storeFixture(t);
  const env = { HF_API_KEY_ID: hf.key_id, HF_API_KEY_SECRET: hf.key_secret, WHIHM_META_API_KEY: meta.api_key };
  assert.equal(resolveProviderEnvironment('higgsfield', { env, store }).source, 'environment');
  assert.equal(resolveProviderEnvironment('meta', { env, store }).source, 'environment');
  const effective = effectiveProviderEnvironment({ env, store });
  assert.equal(effective.HF_API_KEY_SECRET, hf.key_secret);
  assert.equal(effective.WHIHM_META_API_KEY, meta.api_key);
});

test('trusted Higgsfield adapter resolves host credentials internally for request authentication', async t => {
  const store = await storeFixture(t);
  store.set('higgsfield', hf);
  const env = effectiveProviderEnvironment({ env: {}, store });
  let requestHeaders;
  const native = createHiggsfieldNative({ env, fetchImpl: async (_url, init) => {
    requestHeaders = init.headers;
    return new Response(JSON.stringify({ request_id: '11111111-1111-4111-8111-111111111111', status: 'queued', status_url: 'https://api.higgsfield.ai/requests/11111111-1111-4111-8111-111111111111/status' }), { headers: { 'content-type': 'application/json' } });
  } });
  const result = await native.submit({ model: 'higgsfield/genjutsu/motion-transfer/v1.0', input: { video_url: 'https://media.example/source.mp4', image_urls: ['https://media.example/reference.png'] }, facts: { durationSeconds: 4, width: 640, height: 640 }, allowExecution: true });
  assert.equal(result.status, 'processing');
  assert.equal(requestHeaders.Authorization, `Key ${hf.key_id}:${hf.key_secret}`);
});

// Host-only credential resolution. This module never returns credential values
// to a caller-facing result; values are used only to construct trusted provider
// environments inside the Electron/Node host.
const schemas = Object.freeze({
  higgsfield: Object.freeze({
    fields: Object.freeze({ key_id: 'HF_API_KEY_ID', key_secret: 'HF_API_KEY_SECRET' }),
    validate: value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,512}$/.test(value),
  }),
  meta: Object.freeze({
    fields: Object.freeze({ api_key: 'WHIHM_META_API_KEY' }),
    validate: value => typeof value === 'string' && /^[\x21-\x7e]{16,4096}$/.test(value),
  }),
});

const invalid = '__WHIHM_INVALID_STORED_CREDENTIAL__';

export const supportedProviderCredentialIds = Object.freeze(Object.keys(schemas));

function schemaFor(providerId) {
  return schemas[providerId] ?? null;
}

function environmentState(providerId, env) {
  const schema = schemaFor(providerId);
  if (!schema) return { presence: 'unavailable', source: 'unavailable', code: 'PROVIDER_CREDENTIAL_PROVIDER_UNSUPPORTED' };
  const values = Object.values(schema.fields).map(name => env?.[name]);
  const present = values.every(value => schema.validate(value));
  const absent = values.every(value => value === undefined || value === '');
  return present
    ? { presence: 'present', source: 'environment', code: null }
    : absent
      ? { presence: 'missing', source: 'unavailable', code: null }
      : { presence: 'malformed', source: 'environment', code: providerId === 'higgsfield' ? 'HIGGSFIELD_CONFIGURATION_INVALID' : 'META_CONFIGURATION_INVALID' };
}

function storeState(providerId, store) {
  if (!store || typeof store.getStatus !== 'function') return null;
  try { return store.getStatus(providerId); } catch { return { presence: 'unavailable', source: 'unavailable', storage: 'unavailable' }; }
}

/**
 * Resolve one provider's effective environment. A complete valid host-store
 * record wins; an absent host record falls back to environment variables. A
 * malformed stored record deliberately blocks fallback rather than merging a
 * partial credential across sources.
 */
export function resolveProviderEnvironment(providerId, { env = process.env, store } = {}) {
  const base = { ...env };
  const schema = schemaFor(providerId);
  if (!schema) return { env: base, presence: 'unavailable', source: 'unavailable', code: 'PROVIDER_CREDENTIAL_PROVIDER_UNSUPPORTED', storage: 'unavailable' };
  const stored = storeState(providerId, store);
  if (stored?.presence === 'present') {
    try {
      const values = store.resolve(providerId);
      if (!values || Object.values(schema.fields).some(name => !schema.validate(values[name]))) throw Error('invalid');
      Object.assign(base, values);
      return { env: base, presence: 'present', source: 'host_store', code: null, storage: stored.storage ?? 'available' };
    } catch {
      for (const name of Object.values(schema.fields)) base[name] = invalid;
      return { env: base, presence: 'malformed', source: 'host_store', code: 'PROVIDER_CREDENTIAL_DECRYPTION_FAILED', storage: stored.storage ?? 'corrupt' };
    }
  }
  if (stored?.presence === 'malformed') {
    for (const name of Object.values(schema.fields)) base[name] = invalid;
    return { env: base, presence: 'malformed', source: 'host_store', code: 'PROVIDER_CREDENTIAL_STORE_CORRUPT', storage: stored.storage ?? 'corrupt' };
  }
  const fromEnvironment = environmentState(providerId, env);
  return { env: base, ...fromEnvironment, storage: stored?.storage ?? 'not_available' };
}

/** Build one trusted in-memory environment for provider execution/projection. */
export function effectiveProviderEnvironment({ env = process.env, store } = {}) {
  const merged = { ...env };
  for (const providerId of supportedProviderCredentialIds) {
    const resolved = resolveProviderEnvironment(providerId, { env, store });
    const schema = schemaFor(providerId);
    if (resolved.presence === 'present' && resolved.source === 'host_store') {
      for (const name of Object.values(schema.fields)) merged[name] = resolved.env[name];
    } else if (resolved.presence === 'malformed' && resolved.source === 'host_store') {
      for (const name of Object.values(schema.fields)) merged[name] = invalid;
    }
  }
  return merged;
}

export function providerCredentialView(providerId, { env = process.env, store } = {}) {
  const resolved = resolveProviderEnvironment(providerId, { env, store });
  return {
    presence: resolved.presence,
    source: resolved.source,
    storage: resolved.storage,
    verification: 'unverified',
    ...(resolved.code ? { code: resolved.code } : {}),
  };
}

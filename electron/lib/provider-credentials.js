const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const schemaVersion = 1;
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

function failure(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function providerSchema(providerId) {
    const schema = schemas[providerId];
    if (!schema) throw failure('PROVIDER_CREDENTIAL_PROVIDER_UNSUPPORTED');
    return schema;
}

function validatePayload(providerId, payload) {
    const schema = providerSchema(providerId);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure('PROVIDER_CREDENTIAL_PAYLOAD_INVALID');
    const fields = Object.keys(schema.fields);
    if (Object.keys(payload).length !== fields.length || fields.some(field => !Object.hasOwn(payload, field))) {
        throw failure('PROVIDER_CREDENTIAL_FIELDS_INVALID');
    }
    for (const field of fields) if (!schema.validate(payload[field])) throw failure('PROVIDER_CREDENTIAL_VALUE_INVALID');
    return schema;
}

function encryptedField(value, safeStorage) {
    try {
        const encrypted = safeStorage.encryptString(value);
        if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) throw failure('PROVIDER_CREDENTIAL_ENCRYPTION_FAILED');
        return encrypted.toString('base64');
    } catch (error) {
        if (error?.code?.startsWith('PROVIDER_CREDENTIAL_')) throw error;
        throw failure('PROVIDER_CREDENTIAL_ENCRYPTION_FAILED');
    }
}

function validCiphertext(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 32768 && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0;
}

function createProviderCredentialStore({ app, safeStorage, fsApi = fs, pathApi = path, now = () => new Date().toISOString() } = {}) {
    if (!app || typeof app.getPath !== 'function') throw failure('PROVIDER_CREDENTIAL_STORE_UNAVAILABLE');
    const storagePath = pathApi.join(app.getPath('userData'), 'provider-credentials.json');

    function encryptionAvailable() {
        try { return safeStorage && safeStorage.isEncryptionAvailable() === true; } catch { return false; }
    }
    function requireEncryption() {
        if (!encryptionAvailable()) throw failure('PROVIDER_CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    function empty() { return { schemaVersion, providers: {} }; }
    function validateEnvelope(value) {
        if (!value || value.schemaVersion !== schemaVersion || !value.providers || typeof value.providers !== 'object' || Array.isArray(value.providers)) {
            throw failure('PROVIDER_CREDENTIAL_STORE_CORRUPT');
        }
        for (const [providerId, record] of Object.entries(value.providers)) {
            const schema = providerSchema(providerId);
            if (!record || record.schemaVersion !== schemaVersion || !record.fields || typeof record.fields !== 'object' || Array.isArray(record.fields)) throw failure('PROVIDER_CREDENTIAL_STORE_CORRUPT');
            const fields = Object.keys(schema.fields);
            if (Object.keys(record.fields).length !== fields.length || fields.some(field => !validCiphertext(record.fields[field]))) throw failure('PROVIDER_CREDENTIAL_STORE_CORRUPT');
        }
        return value;
    }
    function readEnvelope() {
        requireEncryption();
        try {
            const bytes = fsApi.readFileSync(storagePath);
            return validateEnvelope(JSON.parse(bytes.toString('utf8')));
        } catch (error) {
            if (error?.code === 'ENOENT') return empty();
            if (error?.code?.startsWith('PROVIDER_CREDENTIAL_')) throw error;
            throw failure('PROVIDER_CREDENTIAL_STORE_CORRUPT');
        }
    }
    function writeEnvelope(value) {
        requireEncryption();
        const body = JSON.stringify(validateEnvelope(value));
        const directory = pathApi.dirname(storagePath);
        const temporary = `${storagePath}.tmp-${crypto.randomUUID()}`;
        try {
            fsApi.mkdirSync(directory, { recursive: true });
            fsApi.writeFileSync(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            fsApi.renameSync(temporary, storagePath);
        } catch {
            try { fsApi.unlinkSync(temporary); } catch { /* best effort cleanup; no secret is present */ }
            throw failure('PROVIDER_CREDENTIAL_STORE_WRITE_FAILED');
        }
    }
    function getStatus(providerId) {
        const schema = providerSchema(providerId);
        try {
            const envelope = readEnvelope();
            const record = envelope.providers[providerId];
            if (!record) return { schemaVersion, providerId, storage: 'available', presence: 'missing', source: 'unavailable' };
            const fields = Object.keys(schema.fields);
            const present = fields.every(field => validCiphertext(record.fields[field]));
            return { schemaVersion, providerId, storage: present ? 'available' : 'corrupt', presence: present ? 'present' : 'malformed', source: present ? 'host_store' : 'unavailable' };
        } catch (error) {
            return error.code === 'PROVIDER_CREDENTIAL_ENCRYPTION_UNAVAILABLE'
                ? { schemaVersion, providerId, storage: 'unavailable', presence: 'unavailable', source: 'unavailable' }
                : { schemaVersion, providerId, storage: 'corrupt', presence: 'malformed', source: 'host_store' };
        }
    }
    function resolve(providerId) {
        const schema = providerSchema(providerId);
        const status = getStatus(providerId);
        if (status.presence === 'missing') return null;
        if (status.presence !== 'present') throw failure(status.storage === 'unavailable' ? 'PROVIDER_CREDENTIAL_ENCRYPTION_UNAVAILABLE' : 'PROVIDER_CREDENTIAL_STORE_CORRUPT');
        const record = readEnvelope().providers[providerId];
        const values = {};
        try {
            for (const [field, envName] of Object.entries(schema.fields)) {
                const value = safeStorage.decryptString(Buffer.from(record.fields[field], 'base64'));
                if (!schema.validate(value)) throw failure('PROVIDER_CREDENTIAL_VALUE_INVALID');
                values[envName] = value;
            }
        } catch (error) {
            if (error?.code?.startsWith('PROVIDER_CREDENTIAL_')) throw error;
            throw failure('PROVIDER_CREDENTIAL_DECRYPTION_FAILED');
        }
        return values;
    }
    function set(providerId, payload) {
        const schema = validatePayload(providerId, payload);
        requireEncryption();
        const envelope = readEnvelope();
        const fields = Object.fromEntries(Object.keys(schema.fields).map(field => [field, encryptedField(payload[field], safeStorage)]));
        envelope.providers[providerId] = { schemaVersion, fields, updatedAt: now() };
        writeEnvelope(envelope);
        return { schemaVersion, status: 'saved', providerId, credential: { presence: 'present', source: 'host_store', verification: 'unverified' } };
    }
    function remove(providerId) {
        providerSchema(providerId);
        requireEncryption();
        const envelope = readEnvelope();
        delete envelope.providers[providerId];
        writeEnvelope(envelope);
        return { schemaVersion, status: 'removed', providerId, credential: { presence: 'missing', source: 'unavailable', verification: 'unverified' } };
    }
    return Object.freeze({
        schemaVersion,
        storagePath: () => storagePath,
        encryptionAvailable,
        getStatus,
        resolve,
        set,
        remove,
    });
}

module.exports = { createProviderCredentialStore, providerCredentialSchemas: schemas };

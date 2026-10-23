import axios from 'axios';

export const getDesktopApiKey = () => globalThis.window?.__MUAPI_KEY__ || globalThis.localStorage?.getItem('muapi_key') || null;

// Only the builder imports this isolated Axios instance. Submission, polling and
// multipart upload logic remain in the upstream components.
export function adaptWorkflowRequest(config, key) {
  const original = config.url;
  const internal = /^\/api\/(workflow|app)(?:\/|\?|$)/.test(original);
  const url = new URL(internal ? `https://api.muapi.ai${original.slice(4)}` : original);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsupported workflow request URL');
  if (internal && !/^\/(workflow|app)(?:\/|$)/.test(url.pathname)) throw new Error('Unsafe workflow endpoint');
  const headers = Object.fromEntries(Object.entries(config.headers?.toJSON?.() || config.headers || {})
    .filter(([name]) => !/^(x-api-key|authorization|cookie)$/i.test(name)));
  if (internal) {
    if (!key) throw new Error('API Key missing. Please set it in Settings.');
    headers['x-api-key'] = key;
  }
  return { ...config, url: url.href, baseURL: undefined, headers, withCredentials: false };
}

export function createWorkflowTransport({ getKey = getDesktopApiKey, adapter } = {}) {
  const client = axios.create(adapter ? { adapter } : {});
  client.interceptors.request.use(config => adaptWorkflowRequest(config,
    /^\/api\/(workflow|app)(?:\/|\?|$)/.test(config.url) ? getKey() : null));
  // Upstream nodes log rejected errors. Omit Axios's raw request configuration,
  // which includes the authentication header.
  client.interceptors.response.use(response => response, error => {
    const key = error.config?.headers?.get?.('x-api-key') || error.config?.headers?.['x-api-key'];
    const redact = value => {
      if (typeof value === 'string') return key ? value.split(key).join('[redacted]') : value;
      if (Array.isArray(value)) return value.map(redact);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item)]));
      return value;
    };
    const safe = Object.assign(new Error(redact(error.message || 'Workflow request failed')), { code: error.code });
    if (error.response) safe.response = { status: error.response.status, data: redact(error.response.data) };
    return Promise.reject(safe);
  });
  return client;
}

export default createWorkflowTransport();

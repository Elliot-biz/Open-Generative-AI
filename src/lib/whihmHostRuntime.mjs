// Nonvisual renderer adapter. All HTTP, polling, uploads and IPC inference are upstream.
import * as studio from '../../packages/studio/src/muapi.js';
import { localAI } from './localInferenceClient.js';
import { remoteMethods } from '../../lib/whihm-execution/runtime.mjs';
const methods = new Set(remoteMethods);

// Sanitize before crossing IPC, where canonical Node validation is unavailable.
export function transportData(value) {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    if (/^(?:file:|\/|[A-Za-z]:[\\/]|\\\\)/.test(value)) return '[local reference omitted]';
    if (/Bearer\s|-----BEGIN .*PRIVATE KEY|\bsk-[\w-]{16,}/i.test(value)) return '[redacted]';
    if (/^https?:/i.test(value)) {
      try { const url = new URL(value); if (url.username || url.password || [...url.searchParams.keys()].some(k => /token|secret|signature|credential|api.?key|^key$|^sig$|^x-amz-|^x-goog-/i.test(k))) return '[redacted]'; } catch { return '[redacted]'; }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(transportData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|authorization|password|passwd|secret|client[-_]?secret|private[-_]?key|credentials|path)$/i.test(key) ? '[redacted]' : transportData(item)]));
  return value;
}
export function connectWhihmHost({ host = globalThis.window?.whihmHost, remote = studio, local = localAI,
  getApiKey = () => window.__MUAPI_KEY__ || localStorage.getItem('muapi_key'),
  makeFile = (bytes, name, type) => new File([bytes], name, { type }),
} = {}) {
  if (!host) return () => {};
  const unsubscribe = host.onRuntimeRequest(async ({ requestId, operation, payload }) => {
    const progress = value => host.runtimeProgress({ requestId, value: transportData(value) });
    let off = () => {};
    try {
      let result;
      if (operation === 'local') {
        off = local.onProgress(value => { void progress(value); });
        result = await local.generate(payload.parameters);
      } else {
        if (operation !== 'upload' && (operation !== 'remote' || !methods.has(payload.method))) throw new Error('Unsupported operation');
        const key = await getApiKey();
        if (!key) throw new Error('Authentication required');
        if (operation === 'upload') result = await remote.uploadFile(key, makeFile(payload.bytes, payload.name, payload.type), percent => { void progress({ status: 'uploading', progress: percent }); });
        else result = await remote[payload.method](key, { ...payload.parameters, onRequestId: id => { void progress({ status: 'running', requestId: id }); } });
      }
      await host.runtimeResult({ requestId, ok: true, value: transportData(result) });
    } catch (error) {
      await host.runtimeResult({ requestId, ok: false, error: {
        code: 'UPSTREAM_ERROR', requestId: transportData(error.requestId), generationResult: transportData(error.generationResult),
      } });
    } finally { off(); }
  });
  void host.runtimeReady();
  return unsubscribe;
}

// Renderer-only consumer: the fixed preload operation owns the host boundary.
const allowed = new Set(['projectHandle', 'workflow', 'workflowId', 'evaluatedAt', 'inputs', 'nodeStates', 'quoteContext', 'quotePolicy', 'budget', 'localState']);
const rejected = code => ({ status: 'rejected', report: null, diagnostics: [{ code, path: '', message: 'Readiness assessment is unavailable or the structured request/result is invalid.' }] });
function jsonData(value, parents = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
  if (!value || typeof value !== 'object' || parents.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) return false;
  parents.add(value);
  const valid = Reflect.ownKeys(value).every(key => {
    if (Array.isArray(value) && key === 'length') return true;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && property.enumerable && Object.hasOwn(property, 'value') && !['__proto__', 'constructor', 'prototype'].includes(key) && jsonData(property.value, parents);
  }) && (!Array.isArray(value) || Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean));
  parents.delete(value); return valid;
}

export async function assessCurrentWorkflowReadiness(request, { host = globalThis.window?.whihmHost } = {}) {
  try {
    if (!request || Array.isArray(request) || !jsonData(request) || Object.keys(request).some(key => !allowed.has(key))) return rejected('READINESS_REQUEST_INVALID');
    if (typeof host?.assessWorkflowReadiness !== 'function') return rejected('READINESS_HOST_UNAVAILABLE');
    const result = await host.assessWorkflowReadiness(structuredClone(request));
    if (!jsonData(result) || !['assessed', 'rejected'].includes(result?.status) || (result.status === 'assessed' && !['READY', 'CONDITIONALLY_READY', 'BLOCKED', 'INVALID'].includes(result.report?.status)) || (result.status === 'rejected' && !Array.isArray(result.diagnostics))) return rejected('READINESS_HOST_RESULT_INVALID');
    return structuredClone(result);
  } catch { return rejected('READINESS_HOST_FAILED'); }
}

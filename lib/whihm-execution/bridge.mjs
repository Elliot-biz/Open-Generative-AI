// Node/application-side orchestration: not imported into the pure canonical core.
import { createWorkflow, validateWorkflow } from 'whihm-workflow-core';
import { unsafeRemoteUrl } from '../../packages/whihm-workflow-core/src/validate.js';
import { getImageInputValidationError, normalizePrimaryImageUrls } from '../../packages/studio/src/imageInputContracts.js';
import { buildMotionControlRequest } from '../../packages/studio/src/motionControlInputContracts.js';
import { buildRecastRequest } from '../../packages/studio/src/recastInputContracts.js';
import { buildV2VRequest, getV2VExecutionModel } from '../../packages/studio/src/v2vInputContracts.js';
import { buildAudioRequest, getAudioMediaInputs } from '../../packages/studio/src/audioInputContracts.js';
import { getModelMediaCapabilities } from '../../packages/studio/src/modelCapabilities.js';
import { resolveExecutionBinding, createApplicationRuntime } from './runtime.mjs';

const reject = (code, path = '') => ({ status: 'rejected', diagnostics: [{ code, path, message: code.replaceAll('_', ' ') }] });
function requireValue(condition, code) { if (!condition) throw Object.assign(new Error(code), { bridgeCode: code }); }
function safe(value) {
  const document = createWorkflow({ workflowId: 'bridge_safety', name: 'Safety' });
  document.metadata = { value };
  return validateWorkflow(document).valid;
}
const unresolved = value => /\{\{[\s\S]*?\}\}/.test(JSON.stringify(value));
function checkInputs(model, params, mode) {
  if (mode === 'audio') {
    try { return buildAudioRequest(model.id, { ...params, _modelId: model.id }); }
    catch (error) { throw Object.assign(error, { bridgeCode: error.code }); }
  }
  if (mode === 'v2v') {
    try { return buildV2VRequest({ ...params, model: model.id }); }
    catch (error) { throw Object.assign(error, { bridgeCode: error.code }); }
  }
  if (mode === 'motion_control') {
    try { return buildMotionControlRequest({ ...params, model: model.id }); }
    catch (error) { throw Object.assign(error, { bridgeCode: error.code }); }
  }
  if (mode === 'recast' || model.id === 'runway-act-two-i2v') {
    try { return buildRecastRequest({ ...params, model: mode === 'recast' ? model.id : 'runway-act-two-recast' }); }
    catch (error) { throw Object.assign(error, { bridgeCode: error.code }); }
  }
  if (mode === 't2i' || mode === 'i2i') requireValue(!getImageInputValidationError(model, mode, {
    prompt: params.prompt, primaryImageUrls: normalizePrimaryImageUrls(params.images_list, params.image_url), auxiliaryImageUrls: params,
  }), 'CAPABILITY_INPUT_INVALID');
  if (model.promptRequired || mode === 't2v') requireValue(typeof params.prompt === 'string' && params.prompt.trim(), 'PROMPT_REQUIRED');
  for (const field of model.required || []) {
    if (field === 'api_key') continue; // supplied by upstream authentication, never canonical data
    requireValue(params[field] !== undefined || model.inputs?.[field]?.default !== undefined || model.inputs?.[field]?.type === 'array', 'REQUIRED_INPUT_MISSING');
  }
  for (const [field, spec] of Object.entries(model.inputs || {})) {
    const value = params[field];
    if (value === undefined || value === null) continue;
    if (spec.enum) requireValue(spec.enum.includes(value), 'CAPABILITY_ENUM_INVALID');
    if (['integer', 'int', 'number'].includes(spec.type)) {
      requireValue(typeof value === 'number' && Number.isFinite(value), 'CAPABILITY_TYPE_INVALID');
      if (spec.type !== 'number' && !(spec.step !== undefined && !Number.isInteger(Number(spec.step)))) requireValue(Number.isInteger(value), 'CAPABILITY_TYPE_INVALID');
      requireValue(value >= (spec.minimum ?? spec.minValue ?? -Infinity) && value <= (spec.maximum ?? spec.maxValue ?? Infinity), 'CAPABILITY_RANGE_INVALID');
    }
    if (spec.type === 'boolean') requireValue(typeof value === 'boolean', 'CAPABILITY_TYPE_INVALID');
    if (spec.type === 'string') requireValue(typeof value === 'string', 'CAPABILITY_TYPE_INVALID');
    if (spec.type === 'array') requireValue(Array.isArray(value) && value.length <= (spec.maxItems ?? spec.max_items ?? Infinity), 'CAPABILITY_TYPE_INVALID');
  }
  for (const [type, cap] of Object.entries(getModelMediaCapabilities(model))) {
    const values = params[`${type}s_list`] ?? params[`${type}_url`];
    if (values !== undefined) requireValue(Boolean(cap.field) && (Array.isArray(values) ? values.length : 1) <= cap.maxItems, 'MEDIA_CAPABILITY_INVALID');
  }
  if (mode === 'i2v') requireValue(params.image_url || params.images_list?.length, 'IMAGE_REQUIRED');
}
// Only sanitized upstream metadata is returned; signed URLs/credentials are never echoed.
function sanitize(value) {
  if (value === undefined) return null;
  if (safe(value)) return structuredClone(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safe({ [key]: 'nonempty' }) ? sanitize(item) : '[redacted]']));
  return '[redacted]';
}
function normalize(raw, plan) {
  requireValue(raw && typeof raw === 'object', 'UPSTREAM_RESULT_INVALID');
  const upstreamStatus = typeof raw.status === 'string' ? raw.status.toLowerCase() : null;
  const output = raw.outputs ?? raw.url ?? raw.output?.url ?? [];
  const outputs = (Array.isArray(output) ? output : [output]).map(value => ({ mediaType: plan.mediaType, value: sanitize(value) }));
  const status = ['failed', 'error'].includes(upstreamStatus) ? 'failed'
    : ['cancelled', 'canceled'].includes(upstreamStatus) ? 'cancelled'
    : ['completed', 'succeeded', 'success', 'done'].includes(upstreamStatus) ? 'succeeded'
    : upstreamStatus || (outputs.length ? 'succeeded' : 'unknown');
  return { status, workflowId: plan.workflowId, nodeId: plan.nodeId, runtime: plan.runtime, provider: plan.provider,
    model: plan.model, tool: plan.tool, upstreamStatus, requestId: sanitize(raw.request_id ?? raw.id ?? null), outputs,
    cost: sanitize(raw.cost ?? null), upstream: sanitize(raw), diagnostics: status === 'failed' ? [{ code: 'UPSTREAM_FAILED', path: '', message: 'Existing runtime reported failure.' }] : [] };
}

export function createExecutionBridge({ runtime = createApplicationRuntime(), utility } = {}) {
  async function prepare({ workflow, nodeId, inputs = {}, assetBindings = {}, project } = {}) {
    requireValue(validateWorkflow(workflow).valid, 'WORKFLOW_INVALID');
    workflow = structuredClone(workflow);
    const node = workflow.nodes.find(item => item.id === nodeId);
    requireValue(node && node.enabled !== false, 'NODE_UNAVAILABLE');
    requireValue(inputs && assetBindings && !Array.isArray(inputs) && !Array.isArray(assetBindings) && safe(inputs) && safe(assetBindings), 'UNSAFE_INPUT');
    inputs = structuredClone(inputs); assetBindings = structuredClone(assetBindings);
    const params = structuredClone(node.parameters || {});
    requireValue(!Object.hasOwn(params, '_modelId') && !Object.hasOwn(inputs, '_modelId') && !Object.hasOwn(params, 'onRequestId') && !Object.hasOwn(inputs, 'onRequestId'), 'IDENTITY_OVERRIDE');
    if (node.metadata?.oga?.mode !== 'audio') requireValue(!Object.hasOwn(params, 'model') && !Object.hasOwn(inputs, 'model'), 'IDENTITY_OVERRIDE');
    for (const [key, value] of Object.entries(inputs)) {
      requireValue(node.inputs.some(port => port.id === key), 'INPUT_PORT_NOT_FOUND');
      requireValue(params[key] === undefined || unresolved(params[key]) || JSON.stringify(params[key]) === JSON.stringify(value), 'INPUT_CONFLICT');
      params[key] = structuredClone(value);
    }
    const uploads = [];
    for (const [field, binding] of Object.entries(assetBindings)) {
      const multiple = Array.isArray(binding);
      const selected = resolveExecutionBinding(node).selected;
      const v2vModel = selected?.mode === 'v2v' ? getV2VExecutionModel(selected.model.id) : null;
      const mediaArray = v2vModel && Object.values(getModelMediaCapabilities(v2vModel)).some(cap => cap.field === field && cap.isArray);
      const audioRole = selected?.mode === 'audio' ? getAudioMediaInputs(selected.model.id).find(role => role.field === field) : null;
      if (selected?.mode === 'audio') requireValue(audioRole && audioRole.isArray === multiple, 'ASSET_BINDING_INVALID');
      requireValue(!multiple || (field === 'images_list' && selected?.mode === 'motion_control') || mediaArray || audioRole?.isArray, 'ASSET_BINDING_INVALID');
      const ids = multiple ? binding : [binding];
      requireValue(ids.length > 0 && node.inputs.some(port => port.id === field) && ids.every(id => node.assetRefs?.includes(id)), 'ASSET_BINDING_INVALID');
      requireValue(params[field] === undefined && project, 'ASSET_BINDING_CONFLICT');
      const values = [];
      for (const [index, assetId] of ids.entries()) {
        const resolved = await project.resolveProjectAssetPath(assetId);
        requireValue(resolved.status === 'ok', 'ASSET_RESOLUTION_FAILED');
        const declared = workflow.assets.find(asset => asset.id === assetId);
        if (audioRole) requireValue(declared?.type === 'audio', 'ASSET_BINDING_INVALID');
        requireValue(declared?.localPath === resolved.relativePath, 'ASSET_IDENTITY_MISMATCH');
        uploads.push({ field, assetId, relativePath: resolved.relativePath, resolvedPath: resolved.resolvedPath, ...(multiple ? { index } : {}) });
        values.push(`https://project-asset.invalid/${encodeURIComponent(assetId)}`);
      }
      params[field] = multiple ? values : values[0];
    }
    requireValue(!unresolved(params), 'UNRESOLVED_DEPENDENCY');
    for (const port of node.inputs) if (port.required) requireValue(params[port.id] !== undefined, 'REQUIRED_INPUT_MISSING');
    const executor = node.executor;
    const binding = resolveExecutionBinding(node, { utility });
    requireValue(!binding.code, binding.code);
    const { selected, runtime: runtimeName, mediaType } = binding;
    let featureRequest;
    if (executor.type === 'remote-model') {
      featureRequest = checkInputs(selected.model, params, selected.mode);
    } else if (executor.type === 'local-ai') {
      requireValue(uploads.length === 0, 'LOCAL_ASSET_BINDING_UNSUPPORTED');
      requireValue(runtime.localAvailable(), 'LOCAL_RUNTIME_UNAVAILABLE');
      requireValue(typeof params.prompt === 'string' && params.prompt.trim(), 'PROMPT_REQUIRED');
      if (params.aspect_ratio && selected.aspectRatios) requireValue(selected.aspectRatios.includes(params.aspect_ratio), 'CAPABILITY_ENUM_INVALID');
    } else if (executor.type === 'utility') {
      requireValue(uploads.length === 0, 'UTILITY_ASSET_BINDING_UNSUPPORTED');
      requireValue(utility.validate(structuredClone(params)) === true, 'CAPABILITY_INPUT_INVALID');
    }
    return { params, uploads, selected, plan: { status: 'planned', workflowId: workflow.workflowId, nodeId: node.id,
      title: node.title, runtime: runtimeName, executorType: executor.type, provider: executor.provider ?? null,
      model: executor.model ?? null, tool: executor.tool ?? null, mediaType, resolvedInputs: structuredClone(params),
      request: { method: runtimeName, parameterKeys: Object.keys(params).sort(), endpoint: selected?.model?.endpoint ?? null,
        ...(featureRequest ? { ...(featureRequest.motionControl ? { motionControl: featureRequest.motionControl } : {}), ...(featureRequest.v2v ? { v2v: featureRequest.v2v } : {}), ...(featureRequest.audio ? { audio: featureRequest.audio } : {}), upstreamParameterKeys: Object.keys(featureRequest.payload).sort(), requiredMedia: featureRequest.requiredMedia,
          supportedOptions: featureRequest.supportedOptions, effectiveOptions: featureRequest.effectiveOptions ?? Object.fromEntries(featureRequest.supportedOptions.filter(key => Object.hasOwn(featureRequest.payload, key)).map(key => [key, featureRequest.payload[key]])) } : {}) },
      requiredUploads: uploads.map(({ field, assetId, relativePath, index }) => ({ field, assetId, relativePath, ...(index !== undefined ? { index } : {}) })),
      capabilityValidation: 'passed', estimatedCost: null, mayCostMoney: executor.type === 'remote-model' || executor.mayCostMoney === true,
      diagnostics: [], warnings: ['Single-node only; no scheduler, history writes, cost enforcement or output persistence.', 'Catalog validation is partial; upstream remains authoritative.'] } };
  }
  return {
    async plan(request) { try { return (await prepare(request)).plan; } catch (e) { return reject(e.bridgeCode || 'PLANNING_FAILED', e.bridgeCode ? e.path || '' : ''); } },
    async execute(request, { allowExecution = false } = {}) {
      if (!allowExecution) return reject('EXECUTION_NOT_AUTHORIZED');
      let prepared;
      try {
        prepared = await prepare(request);
        const { params, uploads, selected, plan } = prepared;
        if (uploads.length) requireValue(runtime.canUpload(), 'UPLOAD_HOST_REQUIRED');
        for (const asset of uploads) {
          const url = await runtime.upload(asset);
          requireValue(typeof url === 'string' && !unsafeRemoteUrl(url), 'UPLOAD_RESULT_UNSAFE');
          if (asset.index !== undefined) params[asset.field][asset.index] = url;
          else params[asset.field] = url;
        }
        const result = plan.executorType === 'remote-model' ? await runtime.remote(selected.method, selected.mode === 'audio' ? { ...params, _modelId: plan.model } : { ...params, model: plan.model })
          : plan.executorType === 'local-ai' ? await runtime.local({ ...params, model: plan.model }) : await utility.run(structuredClone(params));
        return normalize(result, plan);
      } catch (e) {
        if (e.bridgeCode) return reject(e.bridgeCode, e.path || '');
        return { ...reject('UPSTREAM_ERROR'), status: 'failed', workflowId: prepared?.plan.workflowId ?? null, nodeId: prepared?.plan.nodeId ?? null,
          requestId: sanitize(e.requestId ?? null), upstream: sanitize(e.generationResult ?? null) };
      }
    },
  };
}

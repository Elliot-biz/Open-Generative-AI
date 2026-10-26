// Read-only discovery. No planners, transport, authentication, probes or execution.
import { readFileSync } from 'node:fs';
import * as catalog from '../../packages/studio/src/models.js';
import { routes, findRemote, resolveExecutionBinding } from './runtime.mjs';
import { getModelMediaCapabilities } from '../../packages/studio/src/modelCapabilities.js';
import { getImageInputContract } from '../../packages/studio/src/imageInputContracts.js';
import { getAdvancedImageModel, getAdvancedImageStatus, getAdvancedImageMediaInputs } from '../../packages/studio/src/advancedImageInputContracts.js';
import { getAudioExecutionModel, getAudioContractStatus, getAudioMediaInputs } from '../../packages/studio/src/audioInputContracts.js';
import { getVideoInputModel, getVideoInputStatus, getVideoInputMedia, getVideoReferenceConstraints } from '../../packages/studio/src/videoInputContracts.js';
import { getV2VInputDescription, getV2VContractStatus, getV2VMediaInputs } from '../../packages/studio/src/v2vInputContracts.js';
import { getVideoToolCapabilities } from '../../packages/studio/src/videoToolCapabilities.js';
import { getRecastCompatibilityModel } from '../../packages/studio/src/recastInputContracts.js';
import { getMotionControlInputDescription } from '../../packages/studio/src/motionControlInputContracts.js';
import { getDepthInputDescription } from '../../packages/studio/src/depthInputContracts.js';
import { getSunoCloneInputDescription } from '../../packages/studio/src/sunoCloneInputContracts.js';
import { getCreativeServiceModels, getCreativeServiceMedia } from '../../packages/studio/src/creativeServiceInputContracts.js';
import { LOCAL_MODEL_CATALOG } from '../../src/lib/localModels.js';

const primaryCatalogs = { t2i: 't2iModels', i2i: 'i2iModels', t2v: 't2vModels', i2v: 'i2vModels',
  v2v: 'v2vModels', audio: 'audioModels', lipsync: 'lipsyncModels', recast: 'recastModels', motion_control: 'motionControlModels' };
const specialized = new Set(['recast', 'motion_control', 'lipsync', 'clipping', 'motion_graphics', 'depth', 'voice_clone_guided']);
const baseIntents = { t2i: 'TEXT_TO_IMAGE', i2i: 'IMAGE_EDIT', t2v: 'TEXT_TO_VIDEO', i2v: 'IMAGE_TO_VIDEO',
  v2v: 'VIDEO_PROCESS', audio: 'GENERATE_AUDIO', lipsync: 'LIP_SYNC', recast: 'TRANSFER_PERFORMANCE',
  motion_control: 'MOTION_CONTROL', clipping: 'CLIP_HIGHLIGHTS', motion_graphics: 'MOTION_GRAPHICS', depth: 'DEPTH_ESTIMATION', voice_clone_guided: 'CLONE_VOICE_GUIDED' };
const operations = { edit: 'VIDEO_EDIT', extend: 'VIDEO_EXTEND', upscale: 'UPSCALE_VIDEO', translate: 'TRANSLATE_VIDEO' };
const aliases = { ESTIMATE_DEPTH: 'DEPTH_ESTIMATION', CREATE_REVISE_MOTION_GRAPHICS: 'MOTION_GRAPHICS' };
const secret = /^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|authorization|password|secret|client[-_]?secret|private[-_]?key|credentials|onRequestId|_modelId|_sampleIdentity|_validateOnly)$/i;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const clone = value => structuredClone(value);
// Sort every object key as well as semantic collections; preserve meaningful enum/media order.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare).filter(k => value[k] !== undefined).map(k => [k, stable(value[k])]));
  return value;
}
function schema(spec = {}, reviewed = false) {
  const result = {};
  if (spec.type) result.type = ['int', 'integer', 'float'].includes(spec.type)
    ? spec.type === 'float' || spec.step !== undefined && !Number.isInteger(spec.step) ? 'number' : 'integer' : spec.type;
  for (const k of ['title', 'description', 'default', 'minLength', 'maxLength', 'providerField', 'providerIdentifier']) if (Object.hasOwn(spec, k) && !(reviewed && k === 'default' && spec[k] === null)) result[k] = clone(spec[k]);
  for (const [target, fields] of Object.entries({ minimum: ['minimum', 'minValue'], maximum: ['maximum', 'maxValue'], minItems: ['minItems'], maxItems: ['maxItems', 'max_items'], multipleOf: ['multipleOf'] })) {
    const field = fields.find(k => Object.hasOwn(spec, k)); if (field) result[target] = spec[field];
  }
  if (spec.enum) result[spec.typing || spec.enum.some(v => v && typeof v === 'object') ? 'suggestions' : 'enum'] = clone(reviewed ? spec.enum.filter(v => v !== null) : spec.enum);
  if (reviewed) result.nullable = false;
  else if (Object.hasOwn(spec, 'nullable')) result.nullable = spec.nullable;
  if (spec.items) result.items = schema(spec.items, reviewed);
  if (spec.properties) result.properties = Object.fromEntries(Object.entries(spec.properties).filter(([k]) => !secret.test(k)).map(([k, v]) => [k, schema(v, reviewed)]));
  if (Array.isArray(spec.required)) result.required = spec.required.filter(k => !secret.test(k)).sort(compare);
  return result;
}
function controls(inputs, roles, required, reviewed) {
  return Object.fromEntries(Object.entries(inputs || {}).filter(([field]) => !secret.test(field) && !roles.some(r => r.field === field)).map(([field, spec]) => [field, { ...schema(spec, reviewed), required: required.includes(field), projectAsset: false }]));
}
function rolesFromModel(model, mode) {
  const caps = getModelMediaCapabilities(model), roles = new Map();
  for (const [type, cap] of Object.entries(caps)) if (cap.field) {
    roles.set(cap.field, { field: cap.field, type, role: type === 'image' && cap.lastField ? 'start-frame' : `reference-${type}`,
      required: (model.required || []).includes(cap.field), isArray: cap.isArray,
      ...(cap.isArray ? { maximum: cap.maxItems } : {}) });
    if (cap.lastField) roles.set(cap.lastField, { field: cap.lastField, type, role: 'end-frame', required: Boolean(model.endImageRequired), isArray: false });
  }
  for (const [field, spec] of Object.entries(model.inputs || {})) if (['image', 'video', 'audio'].includes(spec.field)) roles.set(field, { field, type: spec.field, role: field, required: (model.required || []).includes(field), isArray: spec.type === 'array' });
  if (['t2i', 'i2i'].includes(mode)) {
    const image = getImageInputContract(model, mode), primary = caps.image.field || 'image_url';
    if (image.primaryImageRequired) roles.set(primary, { ...(roles.get(primary) || {}), field: primary, type: 'image', role: 'primary-image', required: true, isArray: Boolean(caps.image.isArray) });
    for (const auxiliary of image.auxiliaryImages) roles.set(auxiliary.field, { ...auxiliary, type: 'image', role: auxiliary.label, isArray: false });
  }
  // Generic arrays are not registered-project arrays in bridge.prepare.
  return [...roles.values()].map(role => ({ ...role, projectAsset: !role.isArray, projectAssetValidation: !role.isArray ? 'generic-scalar-binding' : 'not-supported' }));
}
function describe(mode, original) {
  let model = clone(original), inputs = model.inputs || {}, required = [...(model.required || [])], roles = [],
    capability = model.capability, review = { status: 'UNREVIEWED' }, constraints = [], result = null, lifecycle;
  if (mode === 'v2v') {
    model = getVideoToolCapabilities(model);
    const description = getV2VInputDescription(model.id); review = getV2VContractStatus(model.id);
    if (description) {
      model = description.model; inputs = description.inputs; required = description.required;
      roles = getV2VMediaInputs(model.id).map(r => ({ ...r, role: r.field === model.videoField ? 'source-video' : r.field, required: required.includes(r.field) && (inputs[r.field]?.type !== 'array' || (inputs[r.field]?.minItems ?? 1) > 0), projectAsset: true }));
    } else inputs = model.inputs || {};
    capability ||= review.capability || model.utility?.capability || operations[model.operation];
    result = description ? { kind: 'video', ...(model.utility ? { role: model.utility.outputRole, classification: model.utility.classification } : {}) } : null;
  } else if (['i2v', 'lipsync'].includes(mode)) {
    review = getVideoInputStatus(model.id, mode);
    const reviewedModel = getVideoInputModel(model.id, mode), recast = getRecastCompatibilityModel(model.id, mode);
    if (reviewedModel) {
      model = reviewedModel; inputs = model.inputs; required = model.required; roles = getVideoInputMedia(model.id, mode);
      capability ||= review.capability; result = { kind: 'video' };
      constraints.push(...getVideoReferenceConstraints(model.id, mode));
    } else if (recast) {
      review = { status: 'REVIEWED', code: 'RECAST_COMPATIBILITY_ROUTE' }; capability ||= 'TRANSFER_PERFORMANCE';
      inputs = recast.inputs || {}; required = ['video_url', 'image_url'];
      roles = recastRoles(recast).map(r => ({ ...r, projectAssetValidation: 'generic-scalar-binding' }));
      constraints.push({ kind: 'specialized_contract', mode: 'recast', alias: recast.id });
      result = { kind: 'video' };
    }
  } else if (['t2i', 'i2i'].includes(mode)) {
    review = getAdvancedImageStatus(model.id);
    const reviewedModel = getAdvancedImageModel(model.id, mode);
    if (reviewedModel) { model = reviewedModel; inputs = model.inputs; required = model.required; roles = getAdvancedImageMediaInputs(model.id, mode); capability ||= review.capability; result = { kind: review.resultKind }; }
  } else if (mode === 'audio') {
    review = getAudioContractStatus(model.id);
    const reviewedModel = getAudioExecutionModel(model.id);
    if (reviewedModel) { model = reviewedModel; inputs = model.inputs; required = model.required; roles = getAudioMediaInputs(model.id); capability ||= review.capability; result = { kind: 'audio', limitation: 'Canonical audio normalization does not certify a media artifact for every provider response.' }; }
  } else if (mode === 'recast') {
    review = { status: 'REVIEWED' }; inputs = model.inputs || {}; required = ['video_url', 'image_url']; roles = recastRoles(model); result = { kind: 'video' };
  } else if (mode === 'motion_control') {
    const description = getMotionControlInputDescription(model.id);
    if (description) { inputs = description.inputs; required = description.required; roles = [
      { field: 'video_url', type: 'video', role: 'source-motion', required: true, isArray: false, projectAsset: true },
      { field: 'images_list', type: 'image', role: 'reference-images', required: true, isArray: true, minimum: 1, maximum: model.maxImages, ordered: true, projectAsset: true }]; }
    review = { status: 'UNREVIEWED' }; // upgraded only when the existing binding admits it
    result = { kind: 'video' };
  } else if (mode === 'depth') {
    const description = getDepthInputDescription(model.id);
    review = { status: 'REVIEWED' }; capability = description.capability; inputs = {}; roles = description.roles;
    constraints = description.constraints; result = { kind: 'source-dependent', variants: description.results };
  } else if (mode === 'voice_clone_guided') {
    lifecycle = getSunoCloneInputDescription(model.id); review = { status: 'REVIEWED' }; capability = lifecycle.capability;
    inputs = {}; required = []; result = lifecycle.result;
  } else if (['clipping', 'motion_graphics'].includes(mode)) {
    review = { status: 'REVIEWED' }; inputs = model.inputs; required = model.required; roles = getCreativeServiceMedia(model.id); capability ||= model.capability;
    if (model.conditionalRequired) constraints.push({ kind: 'conditional_required', ...model.conditionalRequired });
    result = { kind: mode === 'clipping' ? 'clipping-selection-or-clips' : 'motion-graphics', operation: model.operation };
  } else if (['t2v', 't2i', 'i2i'].includes(mode)) review = getVideoInputStatus(model.id, mode);
  if (!roles.length && !['depth', 'voice_clone_guided'].includes(mode)) roles = rolesFromModel(model, mode);
  if (['t2i', 'i2i'].includes(mode) && review.status !== 'REVIEWED') {
    const contract = getImageInputContract(model, mode);
    if (contract.promptRequired) { required.push(contract.promptField); inputs = { ...inputs, [contract.promptField]: inputs[contract.promptField] || { type: 'string' } }; }
  }
  if (mode === 'i2v' && review.status === 'UNREVIEWED') constraints.push({ kind: 'canonical_image_alias_required', fields: ['image_url', 'images_list'], minimum: 1, source: 'bridge.checkInputs' });
  if (mode === 't2v') { required.push('prompt'); inputs = { ...inputs, prompt: inputs.prompt || { type: 'string' } }; }
  return { model, inputs, required: required.filter(k => !secret.test(k)), roles, review, constraints, result, lifecycle,
    capability: typeof capability === 'string' && /^[A-Z][A-Z_0-9]*$/.test(capability) ? aliases[capability] || capability : baseIntents[mode] };
}
function recastRoles(model) {
  return [{ field: 'video_url', upstreamField: model.videoField, type: 'video', role: 'driving-performance', required: true, isArray: false, projectAsset: true },
    { field: 'image_url', upstreamField: model.imageField, type: 'image', role: 'target-character', required: true, isArray: false, projectAsset: true }];
}
function projectEntry(original, mode, binding) {
  const d = describe(mode, original), bound = Boolean(binding?.selected), reviewed = bound && (d.review.status === 'REVIEWED' || mode === 'motion_control'),
    model = d.model;
  let availability = bound ? 'available' : 'deferred';
  if (d.review.status === 'PROVIDER_BLOCKED' || /FIXED_PROFILE|VIEW_CONTRACT_CONFLICT|REFERENCE_CONTRACT_CONFLICT/.test(d.review.code || '')) availability = 'provider_blocked';
  if (model.enabled === false || model.is_enabled === false || model.is_enabled === 0 || model.status === 'disabled') availability = 'disabled';
  if (model.deprecated === true || model.status === 'deprecated') availability = 'deprecated';
  const available = availability === 'available' && bound;
  const roles = d.roles.map(role => {
    const spec = { ...(d.inputs[role.field] || {}) };
    if (spec.default === undefined && model.payloadDefaults?.[role.field] !== undefined) spec.default = model.payloadDefaults[role.field];
    return { ...role, schema: schema(spec, reviewed), ...(role.isArray ? { ...(role.minimum !== undefined || spec.minItems !== undefined || reviewed ? { minimum: role.minimum ?? spec.minItems ?? (role.required ? 1 : 0) } : {}),
      ...(role.maximum !== undefined || spec.maxItems !== undefined ? { maximum: role.maximum ?? spec.maxItems } : {}),
      ...(reviewed ? { ordered: role.ordered ?? true, duplicates: 'preserved' } : {}) } : {}) };
  }).sort((a, b) => compare(a.field, b.field));
  const knownIdentifiers = Object.entries(d.inputs).filter(([, s]) => s.providerIdentifier).map(([field, s]) => ({ field, kind: s.providerIdentifier, isArray: s.type === 'array', maximum: s.maxItems, projectAsset: false })).sort((a, b) => compare(a.field, b.field));
  let lifecycle;
  if (d.lifecycle) lifecycle = { ...d.lifecycle, operations: d.lifecycle.operations.map(op => ({ action: op.action, required: op.required,
    inputs: op.mediaRole ? [{ field: 'audio_url', type: 'audio', role: op.mediaRole, required: true, isArray: false, projectAsset: true, projectAssetRequired: op.projectAssetRequired }] : [],
    controls: controls(op.inputs, op.mediaRole ? [{ field: 'audio_url' }] : [], op.required, true) })) };
  const limitations = ['Binding evidence is static; plan validates actual inputs. Execution still requires current authorization; no quote/budget approval is implied.',
    'Provider runtime, fidelity, uptime, latency and precise output properties are unverified.',
    ...(reviewed ? ['Cross-field and conditional rules remain authoritative in the existing plan/contract validator.'] : ['Generic upstream metadata is not a deeply reviewed contract; controls and media compatibility may be incomplete.']),
    ...(model.resultSemantics?.caveat ? [model.resultSemantics.caveat] : []), ...(model.utility?.caveat ? [model.utility.caveat] : []), ...(model.caveat ? [model.caveat] : []),
    ...(mode === 'depth' ? ['No metric depth, calibration, masks, segmentation, sequences or 3D geometry guarantee.'] : []),
    ...(d.result?.kind === 'layers' ? ['Layer list transport is confirmed; masks, transparency, stacking and editable relationships are unverified.'] : []),
    ...(d.lifecycle?.limitations || [])];
  return { capability: d.capability, entry: { key: `remote:${mode}:${model.id}`, id: model.id, label: model.name || model.id,
    mode, provider: 'muapi', endpoint: model.endpoint || model.id, runtime: { class: 'remote', method: binding?.runtime ?? null },
    availability, available, assurance: reviewed ? 'reviewed' : bound ? 'generic' : 'unreviewed', route: specialized.has(mode) ? 'specialized' : 'canonical',
    binding: { available: bound, source: 'resolveExecutionBinding', code: binding?.code || 'BRIDGE_ROUTE_PLANNABLE' },
    ...(d.review.code || !bound ? { reason: { code: d.review.code || binding?.code || 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS', requiresProviderClarification: /CONFLICT|UNVERIFIED/.test(d.review.code) } } : {}),
    ...(d.review.mustRevisit ? { mustRevisit: true } : {}),
    operation: model.operation ?? null, inputs: roles, requiredFields: lifecycle ? ['action'] : [...new Set(d.required)].sort(compare),
    controls: lifecycle ? { action: { type: 'string', enum: lifecycle.actions, required: true, projectAsset: false } } : controls(d.inputs, roles, d.required, reviewed), constraints: d.constraints,
    projectAssets: roles.filter(r => r.projectAsset).map(r => ({ field: r.field, type: r.type, role: r.role, array: r.isArray, ...(r.projectAssetValidation ? { validation: r.projectAssetValidation } : {}) })),
    ...(lifecycle ? { projectAssets: lifecycle.operations.flatMap(op => op.inputs.map(r => ({ action: op.action, field: r.field, type: r.type, role: r.role, array: false, required: true }))) } : {}),
    providerIdentifiers: knownIdentifiers, result: d.result || (bound ? { kind: ['t2i', 'i2i'].includes(mode) ? 'image' : ['t2v', 'i2v'].includes(mode) ? 'video' : 'unknown', evidence: 'canonical-normalization-only' } : { kind: 'unknown' }),
    ...(lifecycle ? { lifecycle } : {}), runtimeVerification: 'unverified', partial: !reviewed || d.result?.kind === 'layers' || mode === 'clipping',
    limitations, evidence: { contractStatus: reviewed ? 'REVIEWED' : d.review.status, inputValidation: 'not_evaluated', authorization: 'not_granted' } } };
}
function localEntry(model) {
  const binding = resolveExecutionBinding({ executor: { type: 'local-ai', provider: model.provider, model: model.id } });
  const video = model.type === 'video';
  return { capability: video ? model.needsImage ? 'IMAGE_TO_VIDEO' : 'TEXT_TO_VIDEO' : 'TEXT_TO_IMAGE', entry: {
    key: `local:local:${model.provider}:${model.id}`, id: model.id, label: model.name || model.id, mode: 'local', provider: model.provider,
    modelRequirement: { id: model.id, backend: model.provider, ...(model.filename ? { weightFilename: model.filename } : {}), verification: 'unverified' },
    runtime: { class: 'local', backend: model.provider, method: binding.runtime ?? null, requirements: ['Electron host', 'configured engine', 'model weights', 'compatible hardware'] },
    binding: { available: !binding.code, source: 'resolveExecutionBinding', code: binding.code || 'LOCAL_RUNTIME_UNVERIFIED' },
    available: false, availability: 'local_constrained', assurance: 'generic', route: 'local', runtimeVerification: 'unverified', partial: true,
    inputs: model.needsImage ? [{ field: null, type: 'image', role: 'start-frame', required: true, projectAsset: false, constraint: 'canonical_local_staging_unavailable' }] : [],
    requiredFields: ['prompt'], controls: { prompt: { type: 'string', required: true, projectAsset: false }, ...(model.aspectRatios ? { aspect_ratio: { type: 'string', enum: clone(model.aspectRatios), required: false, projectAsset: false } } : {}) },
    projectAssets: [], providerIdentifiers: [], result: { kind: video ? 'video' : 'image', limitation: 'Local paths/artifact reuse require trusted staging; no result readiness guarantee.' },
    limitations: ['Source configuration is not proof of installed/usable runtime; no probing or downloads performed.', 'Canonical project uploads are unsupported for local execution; Wan2GP start-frame/output staging is constrained.', 'Wan2GP may use a configured remote MCP backend; local/private/offline behavior is not guaranteed.'] } };
}

function environmentConstraints() {
  const files = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).build?.files;
  const knownOmission = Array.isArray(files) && files.length === 2 && files.includes('dist/**/*') && files.includes('electron/**/*');
  return { scope: 'source_development', packagedExecution: knownOmission ? 'shipping_blocker_only' : 'unverified',
    limitation: knownOmission ? 'Electron package inclusion omits the WHIHM source closure; packaged production readiness is not certified.' : 'Package closure requires independent verification; configuration alone is not a production certificate.' };
}

export function projectCapabilities() {
  const byId = new Map(), candidates = new Map();
  for (const [mode, name] of Object.entries(primaryCatalogs)) for (const model of catalog[name]) {
    if (!byId.has(model.id)) byId.set(model.id, []);
    byId.get(model.id).push({ mode, model });
  }
  for (const service of getCreativeServiceModels()) byId.set(service.id, [{ mode: service.mode, model: service }]);
  // Mode-aware lookup is essential: mode-less null also means ambiguity.
  for (const [id, sourceRows] of byId) {
    const bindings = Object.keys(routes).map(mode => ({ mode, binding: resolveExecutionBinding({ executor: { type: 'remote-model', provider: 'muapi', model: id }, metadata: { oga: { mode } } }) })).filter(r => r.binding.selected);
    if (bindings.length) for (const { mode, binding } of bindings) candidates.set(`${mode}:${id}`, projectEntry(binding.selected.model, mode, binding));
    else for (const { mode, model } of sourceRows) candidates.set(`${mode}:${id}`, projectEntry(model, mode, { code: 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS' }));
  }
  // Derive redirects from existing endpoint aliases; never silently change the selected route.
  for (const { entry } of candidates.values()) if (!entry.binding.available) {
    const redirects = [...candidates.values()].map(v => v.entry).filter(e => e.available && e.route === 'specialized' && e.endpoint === entry.endpoint);
    if (redirects.length) { entry.route = 'specialized'; entry.specializedRoutes = redirects.map(e => ({ id: e.id, mode: e.mode })).sort((a, b) => compare(`${a.mode}:${a.id}`, `${b.mode}:${b.id}`)); entry.reason = { code: 'SPECIALIZED_ROUTE_REQUIRED', requiresProviderClarification: false }; }
  }
  const groups = new Map();
  for (const { capability, entry } of [...candidates.values(), ...LOCAL_MODEL_CATALOG.map(localEntry)]) {
    if (!groups.has(capability)) groups.set(capability, []);
    groups.get(capability).push(entry);
  }
  const capabilities = [...groups].sort(([a], [b]) => compare(a, b)).map(([id, executors]) => ({ id, purpose: id.toLowerCase().replaceAll('_', ' '), executors: executors.sort((a, b) => compare(a.key, b.key)) }));
  const entries = capabilities.flatMap(c => c.executors);
  return stable({ schemaVersion: 1, capabilities, counts: { capabilities: capabilities.length, executorEntries: entries.length,
    availableReviewed: entries.filter(e => e.available && e.assurance === 'reviewed').length,
    availableGeneric: entries.filter(e => e.available && e.assurance === 'generic').length,
    specialized: entries.filter(e => e.route === 'specialized').length, deferred: entries.filter(e => e.availability === 'deferred').length,
    availableSpecialized: entries.filter(e => e.available && e.route === 'specialized').length,
    providerClarificationRequired: entries.filter(e => e.reason?.requiresProviderClarification).length,
    disabled: entries.filter(e => e.availability === 'disabled').length, deprecated: entries.filter(e => e.availability === 'deprecated').length,
    providerBlocked: entries.filter(e => e.availability === 'provider_blocked').length, localConstrained: entries.filter(e => e.availability === 'local_constrained').length,
    runtimeUnverified: entries.filter(e => e.runtimeVerification === 'unverified').length },
    environment: environmentConstraints(),
    limitations: ['Discovery only: no ranking, recommendation, scoring, fallback, workflow/agent execution or permission to spend.',
      'Provider-blocked/deferred/catalog-only entries are not executable through this projection.', 'Fast/Turbo/Draft/Mini names imply no preference or quality/cost superiority.', 'Provider descriptions are metadata, not measured preservation or fidelity guarantees.'] });
}

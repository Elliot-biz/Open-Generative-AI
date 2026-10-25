import { getV2VModelById } from './models.js';
import { getModelMediaCapabilities, mapReferenceParams } from './modelCapabilities.js';
import { buildSupplementalInputPayload } from './modelParameters.js';
import { buildVideoToolPayload, getVideoToolCapabilities } from './videoToolCapabilities.js';

// Reviewed execution eligibility only. Schemas, endpoints and defaults remain in
// the existing Studio catalog/overrides. Other Studio models retain their paths.
const reviewed = new Set([
  'runway-aleph-v2v', 'seedance-2.5-video-edit', 'wan2.2-edit-video',
  'runway-act-two-v2v', 'ai-video-face-swap', 'video-background-remover',
  'ai-video-upscaler', 'topaz-video-upscale', 'heygen-video-translate',
  'seedance-2.5-video-extend',
  'seedance-2-video-edit', 'wan2.7-video-edit', 'wan2.7-video-extend',
  'kling-o1-video-edit', 'kling-o1-video-edit-fast', 'kling-o1-standard-video-edit',
  'gemini-omni-flash-1-1-edit', 'flux-3-video-extend',
  'flux-3-video-extend-draft', 'flux-3-video-upscaler',
  'topaz-upscale-video-creative', 'topaz-upscale-video-generative', 'topaz-upscale-video-precision',
]);
export function getV2VExecutionModel(id) {
  return reviewed.has(id) ? getVideoToolCapabilities(getV2VModelById(id)) : null;
}
function need(condition, code, path) {
  if (!condition) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
const media = value => typeof value === 'string' && value.trim().length > 0;

// Pure, feature-scoped validation/projection for shared execution and planning.
// No raw provider payload escape hatch and no discovery/network/auth side effects.
export function buildV2VRequest(params = {}) {
  need(params && typeof params === 'object' && !Array.isArray(params), 'V2V_REQUEST_INVALID', '');
  const model = getV2VExecutionModel(params.model);
  need(model, 'V2V_MODEL_UNSUPPORTED', 'model');
  const capabilities = getModelMediaCapabilities(model);
  // Existing Studio media helpers emit logical aliases. Normalize only these
  // established roles, preserving native array shape/order and rejecting conflicts.
  for (const [alias, cap, singular] of [
    ['image_url', capabilities.image, true],
    ['videos_list', capabilities.video, false],
    ['audios_list', capabilities.audio, false],
  ]) {
    if (!cap.field || cap.field === alias || !Object.hasOwn(params, alias)) continue;
    if (!singular && !cap.isArray) continue;
    need(!Object.hasOwn(params, cap.field), 'V2V_INPUT_CONFLICT', cap.field);
    const value = params[alias];
    params = Object.fromEntries(Object.entries(params).filter(([field]) => field !== alias));
    params[cap.field] = singular && cap.isArray ? [value] : value;
  }
  if (capabilities.video.isArray && Object.hasOwn(params, 'video_url')) {
    need(!Object.hasOwn(params, capabilities.video.field), 'V2V_INPUT_CONFLICT', capabilities.video.field);
    need(false, 'V2V_OPTION_UNSUPPORTED', 'video_url'); // Never flatten/coerce source-video arrays.
  }
  const inputs = { ...model.inputs }, mediaFields = new Map();
  for (const [type, cap] of Object.entries(capabilities)) {
    if (!cap.field) continue;
    mediaFields.set(cap.field, type);
    inputs[cap.field] ||= { type: cap.isArray ? 'array' : 'string', ...(cap.isArray ? { maxItems: cap.maxItems, items: { type: 'string' } } : {}) };
  }
  for (const [field, spec] of Object.entries(inputs)) {
    if (['image', 'video', 'audio'].includes(spec.field)) mediaFields.set(field, spec.field);
  }
  if (model.hasPrompt) inputs.prompt ||= { type: 'string' };
  const options = params.options === undefined ? {} : params.options;
  need(options && typeof options === 'object' && !Array.isArray(options), 'V2V_OPTION_INVALID', 'options');
  const values = {};
  for (const [field, value] of Object.entries(options)) {
    need(inputs[field]?.configurable, 'V2V_OPTION_UNSUPPORTED', `options.${field}`);
    need(!Object.hasOwn(params, field) || params[field] === value, 'V2V_INPUT_CONFLICT', field);
    values[field] = value;
  }
  for (const [field, value] of Object.entries(params)) {
    if (['model', 'onRequestId', 'options'].includes(field)) continue;
    need(Object.hasOwn(inputs, field), 'V2V_OPTION_UNSUPPORTED', field);
    values[field] = value;
  }
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'V2V_OPTION_INVALID', 'onRequestId');
  const required = new Set([model.videoField, ...(model.required || []).filter(k => k !== 'api_key'),
    ...(model.promptRequired ? ['prompt'] : []), ...(model.imageField && !model.imageOptional ? [model.imageField] : [])]);
  for (const field of required) {
    // Kling requires the wire list field, not a nonempty reference set.
    if (!Object.hasOwn(values, field) && model.payloadDefaults?.[field] !== undefined) {
      values[field] = structuredClone(model.payloadDefaults[field]);
    }
    const value = values[field];
    need(inputs[field]?.type === 'array'
      ? Array.isArray(value) && value.length >= (inputs[field].minItems ?? 1) && [...value].every(media)
      : media(value), 'V2V_REQUIRED_INPUT_MISSING', field);
  }
  for (const [field, spec] of Object.entries(inputs)) {
    const value = values[field];
    if (value === undefined && !Object.hasOwn(values, field)) {
      if (spec.default !== undefined) values[field] = structuredClone(spec.default);
      continue;
    }
    let valid = value !== null && value !== undefined;
    if (spec.enum) valid &&= spec.enum.includes(value);
    if (['int', 'integer', 'number'].includes(spec.type)) {
      valid &&= typeof value === 'number' && Number.isFinite(value) && (spec.type === 'number' || Number.isInteger(value)) &&
        value >= (spec.minimum ?? spec.minValue ?? -Infinity) && value <= (spec.maximum ?? spec.maxValue ?? Infinity);
    } else if (spec.type === 'array') {
      valid &&= Array.isArray(value) && value.length >= (spec.minItems ?? 0) && value.length <= (spec.maxItems ?? spec.max_items ?? Infinity) &&
        [...value].every(item => typeof item === spec.items?.type && (!mediaFields.has(field) || media(item)));
    } else if (spec.type === 'string') valid &&= typeof value === 'string' && [...value].length <= (spec.maxLength ?? Infinity);
    else if (spec.type === 'boolean') valid &&= typeof value === 'boolean';
    else valid = false; // Unreviewed nested/object schemas do not gain generic access.
    if (mediaFields.has(field) && spec.type !== 'array') valid &&= media(value);
    need(valid, 'V2V_OPTION_INVALID', field);
  }
  if (model.id === 'topaz-upscale-video-generative' && values.softness !== undefined) {
    need(values.topaz_model === 'Starlight Precise 2.6', 'V2V_OPTION_INVALID', 'softness');
  }
  // Reuse existing mappings; forward validated declared fields exactly so common
  // controls (Wan resolution, Act Two aspect) cannot disappear or be coerced.
  const payload = { ...buildSupplementalInputPayload(model, values),
    ...buildVideoToolPayload(model, values), ...mapReferenceParams(model, values), ...values };
  const supportedOptions = Object.keys(inputs).filter(field => !mediaFields.has(field)).sort();
  const effectiveOptions = Object.fromEntries(supportedOptions.filter(field => Object.hasOwn(values, field)).map(field => [field, values[field]]));
  // Only these reviewed catalog controls declare this fixed wire alias. The
  // caller cannot supply a schema, wire field, or arbitrary provider options.
  const providerModel = inputs.topaz_model?.providerField === 'model';
  if (providerModel) {
    payload.model = values.topaz_model;
    delete payload.topaz_model;
  }
  const mediaRequired = field => required.has(field) && (inputs[field].type !== 'array' || (inputs[field].minItems ?? 1) > 0);
  return { endpoint: model.endpoint, payload, supportedOptions, effectiveOptions,
    requiredMedia: [...mediaFields].filter(([field]) => mediaRequired(field)).map(([field, type]) => ({ role: field === model.videoField ? 'source-video' : field, field, upstreamField: field, type,
      ...(inputs[field].type === 'array' ? { minimum: inputs[field].minItems ?? 1, maximum: inputs[field].maxItems, ordered: true } : {}) })),
    v2v: { family: model.family, purpose: model.description, operation: model.operation ?? null,
      ...(providerModel ? { providerModel: values.topaz_model, providerModelField: 'model' } : {}),
      fixedParameters: { ...model.fixedParameters },
      controls: structuredClone(Object.fromEntries(supportedOptions.map(field => [field, inputs[field]]))),
      requiredInputs: [...required].sort(), suppliedInputs: Object.keys(values).sort(),
      media: [...mediaFields].map(([field, type]) => ({
      field, type, required: mediaRequired(field), supplied: values[field] !== undefined,
      ...(inputs[field].type === 'array' ? { count: values[field]?.length ?? 0, minimum: inputs[field].minItems ?? (required.has(field) ? 1 : 0), maximum: inputs[field].maxItems, ordered: true } : {}),
    })), acceptedOptions: supportedOptions },
  };
}

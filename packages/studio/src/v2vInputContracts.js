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
  // Older desktop callers use image_url for a single reference even when the
  // selected model's existing imageField is an array. Preserve that one explicit
  // compatibility mapping; never merge competing representations silently.
  const imageCap = getModelMediaCapabilities(model).image;
  if (imageCap.isArray && imageCap.field !== 'image_url' && Object.hasOwn(params, 'image_url')) {
    need(!Object.hasOwn(params, imageCap.field), 'V2V_INPUT_CONFLICT', imageCap.field);
    const { image_url, ...rest } = params;
    params = { ...rest, [imageCap.field]: [image_url] };
  }
  const inputs = { ...model.inputs }, mediaFields = new Map();
  for (const [type, cap] of Object.entries(getModelMediaCapabilities(model))) {
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
  for (const field of required) need(media(values[field]), 'V2V_REQUIRED_INPUT_MISSING', field);
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
    } else if (['string', 'boolean'].includes(spec.type)) valid &&= typeof value === spec.type;
    else valid = false; // Unreviewed nested/object schemas do not gain generic access.
    if (mediaFields.has(field) && spec.type !== 'array') valid &&= media(value);
    need(valid, 'V2V_OPTION_INVALID', field);
  }
  // Reuse existing mappings; forward validated declared fields exactly so common
  // controls (Wan resolution, Act Two aspect) cannot disappear or be coerced.
  const payload = { ...buildSupplementalInputPayload(model, values),
    ...buildVideoToolPayload(model, values), ...mapReferenceParams(model, values), ...values };
  const supportedOptions = Object.keys(inputs).filter(field => !mediaFields.has(field)).sort();
  return { endpoint: model.endpoint, payload, supportedOptions,
    requiredMedia: [...mediaFields].filter(([field]) => required.has(field)).map(([field, type]) => ({ role: field === model.videoField ? 'source-video' : field, field, upstreamField: field, type })),
    v2v: { family: model.family, purpose: model.description,
      requiredInputs: [...required].sort(), suppliedInputs: Object.keys(values).sort(),
      media: [...mediaFields].map(([field, type]) => ({
      field, type, required: required.has(field), supplied: values[field] !== undefined,
      ...(inputs[field].type === 'array' ? { count: values[field]?.length ?? 0, maximum: inputs[field].maxItems } : {}),
    })), acceptedOptions: supportedOptions },
  };
}

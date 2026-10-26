import { getModelById, getI2IModelById } from './models.js';
import { getImageInputContract } from './imageInputContracts.js';
import { getModelMediaCapabilities } from './modelCapabilities.js';

// Reviewed eligibility/intent only. Schemas and endpoint IDs remain upstream.
const reviewed = Object.freeze({
  'flux-pulid': ['REFERENCE_GUIDED_IMAGE', 'identity-reference'],
  'flux-redux': ['REFERENCE_GUIDED_IMAGE', 'composition-style-reference'],
  'minimax-image-01-subject-reference': ['REFERENCE_GUIDED_IMAGE', 'subject-reference'],
  'ideogram-character': ['REFERENCE_GUIDED_IMAGE', 'character-reference'],
  'vidu-q2-reference-to-image': ['REFERENCE_GUIDED_IMAGE', 'ordered-subject-references'],
  'gemini-omni-character': ['REFERENCE_GUIDED_IMAGE', 'character-reference'],
  'topaz-image-upscale': ['UPSCALE_IMAGE', 'source-image'],
  'topaz-upscale-image-creative': ['ENHANCE_IMAGE', 'source-image'],
  'topaz-upscale-image-generative': ['ENHANCE_IMAGE', 'source-image'],
  'topaz-upscale-image-precision': ['ENHANCE_IMAGE', 'source-image'],
  'seedvr2-image-upscale': ['UPSCALE_IMAGE', 'source-image'],
  'ai-skin-enhancer': ['ENHANCE_IMAGE', 'source-image'],
  'bytedance-seedream-5.0-pro-layer': ['DECOMPOSE_IMAGE', 'source-image'],
  'seedream-5.0-flash-layerize': ['DECOMPOSE_IMAGE', 'source-image'],
  'face-expression-change': ['CHANGE_IMAGE_EXPRESSION_POSE', 'source-view-references'],
});
export function getAdvancedImageStatus(id) {
  if (id === 'qwen-image-edit-plus-lora') return { status: 'DEFERRED', code: 'IMAGE_VIEW_CONTRACT_CONFLICT' };
  return Object.hasOwn(reviewed, id) ? { status: 'REVIEWED', capability: reviewed[id][0], resultKind: reviewed[id][0] === 'DECOMPOSE_IMAGE' ? 'layers' : 'images' } : { status: 'UNREVIEWED' };
}
export function getAdvancedImageModel(id, mode = 'i2i') {
  if (!Object.hasOwn(reviewed, id) || !['t2i', 'i2i'].includes(mode)) return null;
  const original = mode === 't2i' ? getModelById(id) : getI2IModelById(id);
  if (original?.id !== id) return null;
  const model = structuredClone(original), cap = getModelMediaCapabilities(model).image;
  const field = cap.field || model.imageField || 'image_url';
  model.inputs ||= {};
  model.inputs[field] ||= cap.isArray ? { type: 'array', field: 'image', items: { type: 'string' }, maxItems: cap.maxItems } : { type: 'string', field: 'image' };
  if (model.inputs[field].type === 'array') {
    model.inputs[field].minItems = 1;
    model.inputs[field].maxItems ||= cap.maxItems;
  }
  model.required = [field];
  const contract = getImageInputContract(model, mode);
  if (reviewed[id][0] === 'REFERENCE_GUIDED_IMAGE') model.required.push(id === 'gemini-omni-character' ? 'descriptions' : 'prompt');
  else if (contract.promptRequired) model.required.push(contract.promptField);
  if (id.startsWith('topaz-upscale-image-')) {
    Object.assign(model.inputs.upscale_factor, { minimum: 1, maximum: 4 });
    for (const key of ['face_enhancement_strength', 'face_enhancement_creativity', 'sharpen', 'denoise', 'detail', 'fix_compression']) {
      if (model.inputs[key]) Object.assign(model.inputs[key], { minimum: 0, maximum: 1 });
    }
    if (model.inputs.strength) Object.assign(model.inputs.strength, { minimum: 0.01, maximum: 1 });
    if (model.inputs.prompt) model.inputs.prompt.maxLength = 1024;
  }
  if (id === 'topaz-image-upscale') model.inputs.upscale_factor.type = 'integer'; // Source enum/default are numeric, not strings.
  if (id === 'flux-pulid' || id === 'flux-redux') model.inputs.prompt.maxLength = 1500;
  return model;
}
export function getAdvancedImageMediaInputs(id, mode) {
  const model = getAdvancedImageModel(id, mode);
  if (!model) return [];
  const field = getModelMediaCapabilities(model).image.field || model.imageField || 'image_url', spec = model.inputs[field];
  return [{ field, type: 'image', role: reviewed[id][1], required: true, isArray: spec.type === 'array', projectAsset: true,
    ...(spec.type === 'array' ? { minimum: 1, maximum: spec.maxItems, ordered: true } : {}) }];
}
function need(value, code, path = '') {
  if (!value) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
export function isImageReferenceUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value) return false;
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && Boolean(u.hostname) && !u.username && !u.password; }
  catch { return false; }
}

/** Pure request contract. model selects the executor; topaz_model alone selects
 * a provider engine. Only reviewed explicit fields can become wire payload. */
export function buildAdvancedImageRequest(id, mode, params = {}) {
  need(params && typeof params === 'object' && !Array.isArray(params), 'IMAGE_REQUEST_INVALID');
  need(params.model === undefined || params.model === id, 'IMAGE_IDENTITY_OVERRIDE', 'model');
  const model = getAdvancedImageModel(id, mode);
  need(model, 'IMAGE_MODEL_UNSUPPORTED', 'model');
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'IMAGE_OPTION_INVALID', 'onRequestId');
  const values = { ...params }; delete values.model; delete values.onRequestId;
  const [role] = getAdvancedImageMediaInputs(id, mode);
  // Existing Image Studio sends both the primary alias and its reference list.
  // Accept only equivalent redundant aliases, never merge/drop a distinct input.
  if (role.isArray) {
    if (values.image_url !== undefined && role.field !== 'image_url') {
      need(values[role.field] === undefined || Array.isArray(values[role.field]) && values[role.field][0] === values.image_url, 'IMAGE_REFERENCE_CONFLICT', role.field);
      values[role.field] ??= [values.image_url]; delete values.image_url;
    }
  } else if (values.images_list !== undefined) {
    need(Array.isArray(values.images_list) && values.images_list.length === 1 && (values[role.field] === undefined || values[role.field] === values.images_list[0]), 'IMAGE_REFERENCE_CONFLICT', 'images_list');
    values[role.field] ??= values.images_list[0]; delete values.images_list;
  }
  for (const key of Object.keys(values)) need(Object.hasOwn(model.inputs, key), 'IMAGE_OPTION_UNSUPPORTED', key);
  const payload = {};
  for (const [key, spec] of Object.entries(model.inputs)) {
    let value = values[key];
    if (value === undefined && spec.default !== undefined) value = structuredClone(spec.default);
    const required = model.required.includes(key);
    need(!required || value !== undefined && value !== null && (typeof value !== 'string' || value.trim()), 'IMAGE_REQUIRED_INPUT_MISSING', key);
    if (value === undefined) continue;
    let valid = value !== null;
    if (spec.enum) valid &&= spec.enum.includes(value);
    if (spec.type === 'string') valid &&= typeof value === 'string' && [...value].length <= (spec.maxLength ?? Infinity);
    else if (spec.type === 'boolean') valid &&= typeof value === 'boolean';
    else if (['number', 'int', 'integer'].includes(spec.type)) {
      const integer = spec.type !== 'number' && !(spec.step !== undefined && !Number.isInteger(spec.step));
      valid &&= typeof value === 'number' && Number.isFinite(value) && (!integer || Number.isInteger(value)) && value >= (spec.minimum ?? spec.minValue ?? -Infinity) && value <= (spec.maximum ?? spec.maxValue ?? Infinity);
    } else if (spec.type === 'array') valid &&= Array.isArray(value) && value.length >= (spec.minItems ?? 0) && value.length <= (spec.maxItems ?? Infinity) && Array.from(value).every(item => typeof item === spec.items?.type && (spec.items?.type !== 'string' || item.trim()));
    else valid = false;
    need(valid, 'IMAGE_OPTION_INVALID', key);
    payload[key] = structuredClone(value);
  }
  const refs = role.isArray ? payload[role.field] : [payload[role.field]];
  need(refs.every(isImageReferenceUrl), 'IMAGE_MEDIA_INVALID', role.field);
  const effectiveOptions = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== role.field));
  if (Object.hasOwn(payload, 'topaz_model')) { payload.model = payload.topaz_model; delete payload.topaz_model; }
  const status = getAdvancedImageStatus(id);
  return { endpoint: model.endpoint || id, payload, requiredMedia: [role], supportedOptions: Object.keys(model.inputs).filter(key => key !== role.field).sort(), effectiveOptions,
    image: { ...status, ...(id === 'face-expression-change' ? { operation: 'view-angle-change' } : {}), modelId: id, providerModel: payload.model ?? null, requiredInputs: model.required,
      media: [{ ...role, ...(role.isArray ? { count: refs.length } : {}) }],
      fidelity: 'AI transformation; exact identity, pixels, camera and body pose are not guaranteed.',
      providerRequest: { endpoint: model.endpoint || id, payload: structuredClone(payload) } },
  };
}

// Existing helper guarantees an image-list shape, not masks/names/front-to-back
// order. Preserve any returned metadata; never fabricate editable layer meaning.
export function normalizeAdvancedImageResult(result, kind = 'images') {
  need(result && typeof result === 'object', 'IMAGE_RESULT_INVALID');
  if (kind === 'layers') {
    const status = typeof result.status === 'string' ? result.status.toLowerCase() : null;
    if (['failed', 'error', 'cancelled', 'canceled', 'queued', 'pending', 'running', 'processing'].includes(status)) return { ...result, resultKind: 'layers' };
    const images = result.images ?? result.output?.images ?? result.outputs;
    need(Array.isArray(images) && images.length > 0 && Array.from(images).every(isImageReferenceUrl), 'IMAGE_LAYER_RESULT_INVALID');
    return { ...result, images: [...images], resultKind: 'layers' };
  }
  const output = result.outputs ?? result.output?.outputs ?? result.output?.image ?? result.url ?? result.output?.url;
  if (output === undefined) return result;
  const outputs = Array.isArray(output) ? output : [output];
  return { ...result, outputs, url: outputs[0] };
}

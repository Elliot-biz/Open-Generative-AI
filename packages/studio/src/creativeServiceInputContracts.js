// Fixed Studio service contracts: these three endpoints are outside the model catalogs.
// No discovery, transport, credentials or execution happens in this module.
import { isVideoInputUrl } from './videoInputContracts.js';
const aspect = { type: 'string', enum: ['16:9', '9:16', '1:1'] };
const duration = { type: 'integer', minimum: 5, maximum: 30 };
const media = (type, maximum) => maximum
  ? { type: 'array', mediaType: type, maximum, ordered: true }
  : { type: 'string', mediaType: type };
const services = {
  'ai-clipping': { mode: 'clipping', method: 'runClipping', capability: 'CLIP_HIGHLIGHTS', operation: 'highlights', required: ['video_url'],
    inputs: { video_url: media('video'), num_highlights: { type: 'integer', minimum: 1, maximum: 60, default: 3 },
      aspect_ratio: { type: 'string', enum: ['9:16', '16:9', '1:1', '4:5', '4:3', '3:4'], default: '9:16' },
      return_coordinates_only: { type: 'boolean', default: false } },
    caveat: 'AI-assisted highlight selection; not deterministic exact trimming. Selection metadata is preserved only if returned.' },
  'motion-graphics': { mode: 'motion_graphics', method: 'runMotionGraphics', capability: 'CREATE_REVISE_MOTION_GRAPHICS', operation: 'create', required: ['prompt'],
    conditionalRequired: { field: 'category', values: ['slideshow', 'showcase', 'reel'], required: ['images_list'] },
    inputs: { prompt: { type: 'string', nonempty: true }, aspect_ratio: { ...aspect, default: '16:9' }, duration_seconds: { ...duration, default: 6 },
      category: { type: 'string', enum: ['auto', 'infographics', 'text-animation', 'social-media', 'presentation', 'logo', 'product', '3d', 'slideshow', 'showcase', 'reel'], default: 'auto' },
      images_list: media('image', 6), video_files: media('video', 2) },
    caveat: 'AI-generated motion design; no deterministic timeline, editable-code or fidelity guarantee.' },
  'motion-graphics-edit': { mode: 'motion_graphics', method: 'runMotionGraphicsEdit', capability: 'CREATE_REVISE_MOTION_GRAPHICS', operation: 'edit', required: ['request_id', 'edit_prompt'],
    inputs: { request_id: { type: 'string', nonempty: true }, edit_prompt: { type: 'string', nonempty: true }, aspect_ratio: aspect, duration_seconds: duration },
    caveat: 'Revision of a completed motion-graphics request with saved animation code; omitted aspect/duration inherit provider-side. Target editability is unverified until execution.' },
};
export const getCreativeServiceModels = () => Object.keys(services).map(id => getCreativeServiceModel(id));
export const creativeServiceMethods = Object.freeze(Object.values(services).map(s => s.method));
export function getCreativeServiceModel(id, mode) {
  const value = Object.hasOwn(services, id) ? services[id] : null;
  return value && (!mode || value.mode === mode) ? { id, endpoint: id, ...structuredClone(value) } : null;
}
export function getCreativeServiceMedia(id) {
  const model = getCreativeServiceModel(id); if (!model) return [];
  return Object.entries(model.inputs).filter(([, s]) => s.mediaType).map(([field, s]) => ({ field, type: s.mediaType,
    role: id === 'ai-clipping' ? 'source-video' : 'reference-' + s.mediaType, required: model.required.includes(field),
    isArray: s.type === 'array', projectAsset: true, ...(s.type === 'array' ? { minimum: 0, maximum: s.maximum, ordered: true } : {}) }));
}
function need(condition, code, path = '') {
  if (!condition) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
export function buildCreativeServiceRequest(id, params = {}) {
  const model = getCreativeServiceModel(id); need(model, 'CREATIVE_SERVICE_UNSUPPORTED', 'model');
  need(params && typeof params === 'object' && !Array.isArray(params), 'CREATIVE_SERVICE_REQUEST_INVALID');
  need(params.model === undefined || params.model === id, 'CREATIVE_SERVICE_IDENTITY_OVERRIDE', 'model');
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'CREATIVE_SERVICE_OPTION_INVALID', 'onRequestId');
  need(params.operation === undefined || model.mode === 'motion_graphics' && params.operation === model.operation, 'CREATIVE_SERVICE_OPERATION_INVALID', 'operation');
  for (const field of Object.keys(params)) need(['model', 'onRequestId', 'operation'].includes(field) || Object.hasOwn(model.inputs, field), 'CREATIVE_SERVICE_OPTION_UNSUPPORTED', field);
  const payload = {};
  for (const [field, s] of Object.entries(model.inputs)) {
    const value = params[field] === undefined ? s.default : params[field];
    need(!model.required.includes(field) || value !== undefined, 'CREATIVE_SERVICE_INPUT_REQUIRED', field);
    if (value === undefined) continue;
    let valid = s.type === 'string' ? typeof value === 'string' && (!s.nonempty || Boolean(value.trim()))
      : s.type === 'boolean' ? typeof value === 'boolean'
      : s.type === 'integer' ? Number.isSafeInteger(value) && value >= s.minimum && value <= s.maximum
      : s.type === 'array' && Array.isArray(value) && value.length <= s.maximum && Array.from(value).every(isVideoInputUrl);
    if (s.enum) valid &&= s.enum.includes(value);
    if (s.mediaType && s.type === 'string') valid &&= isVideoInputUrl(value);
    need(valid, 'CREATIVE_SERVICE_OPTION_INVALID', field);
    payload[field] = structuredClone(value);
  }
  if (id === 'motion-graphics' && ['slideshow', 'showcase', 'reel'].includes(payload.category)) need(payload.images_list?.length > 0, 'CREATIVE_SERVICE_INPUT_REQUIRED', 'images_list');
  const requiredMedia = getCreativeServiceMedia(id);
  if (id === 'motion-graphics' && ['slideshow', 'showcase', 'reel'].includes(payload.category)) Object.assign(requiredMedia.find(r => r.field === 'images_list'), { required: true, minimum: 1 });
  const supportedOptions = Object.keys(model.inputs).filter(k => !requiredMedia.some(r => r.field === k)).sort();
  const effectiveOptions = Object.fromEntries(supportedOptions.filter(k => Object.hasOwn(payload, k)).map(k => [k, payload[k]]));
  return { endpoint: id, payload, requiredMedia, supportedOptions, effectiveOptions,
    creativeService: { mode: model.mode, modelId: id, operation: model.operation, capability: model.capability,
      outputMode: id === 'ai-clipping' ? payload.return_coordinates_only ? 'coordinates' : 'clips' : 'video',
      requiredInputs: [...new Set([...model.required, ...requiredMedia.filter(r => r.required).map(r => r.field)])], media: requiredMedia.map(r => ({ ...r, supplied: payload[r.field] !== undefined, ...(r.isArray ? { count: payload[r.field]?.length ?? 0 } : {}) })),
      ...(model.operation === 'edit' ? { revisionTarget: payload.request_id, inheritedOptions: ['aspect_ratio', 'duration_seconds'].filter(k => payload[k] === undefined) } : {}),
      providerRequest: { endpoint: id, payload: structuredClone(payload) }, caveat: model.caveat },
  };
}

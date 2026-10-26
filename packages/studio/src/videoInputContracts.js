import { getI2VModelById, getLipSyncModelById } from './models.js';
import { getModelMediaCapabilities } from './modelCapabilities.js';
import { getVideoWorkflowMediaSlots } from './videoWorkflows.js';

// Admission/intent, not model discovery. Schemas/endpoints remain in Studio.
const references = new Set([
  'seedance-lite-reference-video', 'seedance-2-omni-reference',
  'seedance-2-omni-reference-no-video', 'seedance-2-omni-reference-no-video-fast',
  'seedance-2-vip-omni-reference', 'seedance-2-vip-omni-reference-fast', 'seedance-2.5-omni-reference',
  'kling-v3.0-omni-standard-image-to-video', 'kling-v3.0-omni-pro-image-to-video', 'kling-v3.0-omni-4k-image-to-video',
  'vidu-q1-reference', 'vidu-q2-reference', 'vidu-q4-reference-to-video',
  'gemini-omni-image-to-video', 'gemini-omni-flash-1-1-reference-to-video',
  'minimax-h3-reference-to-video', 'minimax-h3-open-reference-to-video',
  'wan2.1-reference-video', 'wan2.7-reference-to-video', 'wan3.0-reference-to-video',
  'seedance-2.5-spicy-omni-reference', 'wan3.0-spicy-reference-to-video',
]);
const keyframes = new Set([
  'seedance-2-first-last-frame', 'seedance-2-first-last-frame-fast',
  'seedance-2-vip-first-last-frame', 'seedance-2-vip-first-last-frame-fast', 'seedance-2.5-first-last-frame',
  'vidu-q2-pro-start-end-video', 'vidu-q2-turbo-start-end-video',
  'vidu-q3-pro-first-last-frames', 'vidu-q3-turbo-first-last-frames',
  'flux-3-start-end-to-video', 'gemini-omni-flash-1-1-image-to-video', 'seedance-2.5-spicy-first-last-frame',
]);
const animations = new Set(['wan2.2-spicy-image-to-video', 'minimax-h3-image-to-video-spicy']);
const wave = new Set([...animations, 'seedance-2.5-spicy-first-last-frame', 'seedance-2.5-spicy-omni-reference', 'wan3.0-spicy-reference-to-video']);
const lipSync = new Set([
  'infinitetalk-image-to-video', 'wan2.2-speech-to-video', 'ltx-2.3-lipsync', 'ltx-2-19b-lipsync',
  'sync-lipsync', 'latent-sync', 'creatify-lipsync', 'veed-lipsync', 'infinitetalk-video-to-video',
  'volcengine-video-to-video-lip-sync', 'kling-v1-avatar-standard', 'kling-v1-avatar-pro',
  'kling-v2-avatar-standard', 'kling-v2-avatar-pro', 'omnihuman-1-5',
]);
export function getVideoInputStatus(id, mode = 'i2v') {
  if (['i2v', 't2v'].includes(mode) && /^seedance-2\.5-spicy-(text-to-video|image-to-video|first-last-frame|omni-reference)-(480p|1080p|4k)$/.test(id)) return { status: 'DEFERRED', code: 'VIDEO_FIXED_PROFILE_UNVERIFIED' };
  if ((mode === 't2v' && id === 'seedance-2.5-spicy-text-to-video') || (mode === 'i2v' && id === 'seedance-2.5-spicy-image-to-video')) return { status: 'DEFERRED', code: 'VIDEO_AUDIO_CONTRACT_CONFLICT' };
  if (mode === 'lipsync') return { status: lipSync.has(id) ? 'REVIEWED' : 'UNREVIEWED', capability: 'LIP_SYNC' };
  if (mode !== 'i2v') return { status: 'UNREVIEWED' };
  if (['kling-o1-reference-to-video', 'kling-o1-standard-reference-to-video'].includes(id)) return { status: 'DEFERRED', code: 'VIDEO_REFERENCE_CONTRACT_CONFLICT' };
  return references.has(id) || keyframes.has(id) || animations.has(id)
    ? { status: 'REVIEWED', capability: references.has(id) ? 'REFERENCE_GUIDED_VIDEO' : animations.has(id) ? 'ANIMATE_IMAGE' : 'CONTROL_VIDEO_KEYFRAMES' }
    : { status: 'UNREVIEWED' };
}
const mediaSpec = (type, array = false, maximum) => array
  ? { type: 'array', field: type, items: { type: 'string' }, ...(maximum ? { maxItems: maximum } : {}) }
  : { type: 'string', field: type };

export function getVideoInputModel(id, mode = 'i2v') {
  if (getVideoInputStatus(id, mode).status !== 'REVIEWED') return null;
  const original = mode === 'lipsync' ? getLipSyncModelById(id) : getI2VModelById(id);
  if (original?.id !== id) return null;
  const model = structuredClone(original); model.inputs ||= {};
  const inputs = model.inputs;
  if (mode === 'lipsync') {
    const field = model.category === 'image' ? 'image_url' : 'video_url';
    inputs[field] = mediaSpec(model.category); inputs.audio_url = mediaSpec('audio');
    model.required = [field, 'audio_url'];
    if (model.hasPrompt) inputs.prompt = { type: 'string', default: '' }; // Existing service's explicit empty default.
    if (model.hasSeed || id === 'omnihuman-1-5') inputs.seed = { type: 'integer', default: -1 };
    if (id === 'omnihuman-1-5') inputs.pe_fast_mode = { type: 'boolean', default: false };
    if (id === 'volcengine-video-to-video-lip-sync') {
      for (const [key, value] of Object.entries({ separate_vocal: false, open_scenedet: false, align_audio: true, align_audio_reverse: false })) inputs[key] = { type: 'boolean', default: value };
      inputs.templ_start_seconds = { type: 'number', minimum: 0, maximum: 60, default: 0 };
    }
    return model;
  }
  model.required = id === 'minimax-h3-image-to-video-spicy' ? [] : ['prompt'];
  if (wave.has(id)) model.resultSemantics = { mediaType: 'video', caveat: 'AI generation from explicit media roles; no frame, identity, camera or exact timing guarantee.' };
  const caps = getModelMediaCapabilities(model);
  for (const [type, cap] of Object.entries(caps)) {
    if (!cap.field) continue;
    inputs[cap.field] ||= mediaSpec(type, cap.isArray, cap.isArray ? cap.maxItems : undefined);
    if (cap.isArray) inputs[cap.field].maxItems ||= cap.maxItems;
  }
  if (keyframes.has(id)) {
    const first = caps.image.field;
    model.required.push(first);
    if (caps.image.isArray) {
      inputs[first].minItems = model.endImageRequired ? 2 : 1; inputs[first].maxItems = 2;
    } else {
      const last = model.lastImageField;
      inputs[last] ||= mediaSpec('image');
      if (id !== 'gemini-omni-flash-1-1-image-to-video') model.required.push(last);
    }
  } else if (animations.has(id)) {
    model.required.push(caps.image.field);
  } else if (!model.imageOptional && !id.startsWith('minimax-h3-') && !id.startsWith('wan2.7-') && !id.startsWith('wan3.0-') && !id.startsWith('seedance-2-omni-') && !id.startsWith('seedance-2-vip-') && id !== 'gemini-omni-flash-1-1-reference-to-video') {
    model.required.push(caps.image.field);
  }
  if (/^seedance-2(?:\.5)?-/.test(id) && !id.includes('no-video')) inputs.resolution ||= {
    type: 'string', enum: id.startsWith('seedance-2.5-') || id === 'seedance-2-omni-reference' ? ['480p', '720p', '1080p', '4k'] : ['720p', '1080p', '4k'], default: '720p',
  };
  if (id === 'vidu-q4-reference-to-video') inputs.audios_list = mediaSpec('audio', true, 3);
  if (['seedance-2.5-omni-reference', 'seedance-2.5-spicy-omni-reference'].includes(id)) inputs.omni_reference_task_type.enum = ['auto', 'reference']; // No V2V edit/extend admission here.
  return model;
}
export function getVideoInputMedia(id, mode = 'i2v') {
  const model = getVideoInputModel(id, mode); if (!model) return [];
  const caps = getModelMediaCapabilities(model);
  const result = [];
  for (const [field, spec] of Object.entries(model.inputs)) {
    const type = ['image', 'video', 'audio'].find(t => [t, `${t}s_list`].includes(spec.field) || caps[t].field === field || t === 'image' && model.lastImageField === field);
    if (!type) continue;
    const frames = (keyframes.has(id) || animations.has(id)) && mode === 'i2v';
    result.push({ field, type, role: mode === 'lipsync' ? type === 'audio' ? 'speech-audio' : 'source-' + type
      : frames ? field === caps.image.field ? 'start-frame' : 'end-frame'
      : id === 'wan2.7-reference-to-video' && field === 'image_url' ? 'anchor-frame' : 'reference-' + type,
    required: model.required.includes(field), isArray: spec.type === 'array', projectAsset: true,
    ...(spec.type === 'array' ? { minimum: spec.minItems ?? (model.required.includes(field) ? 1 : 0), maximum: spec.maxItems, ordered: true,
      ...(frames ? { frameOrder: ['start', 'end'], endRequired: Boolean(model.endImageRequired) } : {}) } : {}) });
  }
  return result;
}
function need(value, code, path = '') {
  if (!value) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
export function isVideoInputUrl(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && Boolean(u.hostname) && !u.username && !u.password; }
  catch { return false; }
}

// Shared pure contract for i2v/lipsync, not a free-form schema framework.
export function buildVideoInputRequest(mode, params = {}) {
  need(['i2v', 'lipsync'].includes(mode), 'VIDEO_INPUT_MODE_UNSUPPORTED', 'mode');
  need(params && typeof params === 'object' && !Array.isArray(params), 'VIDEO_INPUT_REQUEST_INVALID');
  const model = getVideoInputModel(params.model, mode); need(model, 'VIDEO_INPUT_MODEL_UNSUPPORTED', 'model');
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'VIDEO_INPUT_OPTION_INVALID', 'onRequestId');
  const values = { ...params }; delete values.model; delete values.onRequestId;
  const roles = getVideoInputMedia(model.id, mode), caps = getModelMediaCapabilities(model);
  if (mode === 'i2v') {
    const frameArray = keyframes.has(model.id) && caps.image.isArray;
    if (frameArray && values.last_image !== undefined) {
      if (values[caps.image.field] === undefined && values.image_url !== undefined) { values[caps.image.field] = [values.image_url]; delete values.image_url; }
      const frames = values[caps.image.field];
      need(Array.isArray(frames) && (frames.length === 1 || frames.length === 2 && frames[1] === values.last_image), 'VIDEO_INPUT_REFERENCE_CONFLICT', 'last_image');
      if (frames.length === 1) values[caps.image.field] = [...frames, values.last_image];
      delete values.last_image;
    }
    for (const [type, cap] of Object.entries(caps)) {
      if (!cap.field) continue;
      for (const alias of [`${type}_url`, `${type}s_list`]) {
        if (alias === cap.field || model.inputs[alias] || values[alias] === undefined) continue;
        const source = values[alias], asArray = Array.isArray(source) ? source : [source];
        const native = values[cap.field];
        need(cap.isArray || asArray.length === 1, 'VIDEO_INPUT_REFERENCE_CONFLICT', alias);
        const normalized = cap.isArray ? asArray : asArray[0];
        need(native === undefined || JSON.stringify(native) === JSON.stringify(normalized) || alias === `${type}_url` && Array.isArray(native) && native[0] === source, 'VIDEO_INPUT_REFERENCE_CONFLICT', alias);
        values[cap.field] ??= normalized; delete values[alias];
      }
    }
    const last = model.lastImageField;
    if (!frameArray && last && last !== 'last_image' && values.last_image !== undefined) {
      need(values[last] === undefined || values[last] === values.last_image, 'VIDEO_INPUT_REFERENCE_CONFLICT', 'last_image');
      values[last] = values.last_image; delete values.last_image;
    }
  }
  for (const key of Object.keys(values)) need(Object.hasOwn(model.inputs, key), 'VIDEO_INPUT_OPTION_UNSUPPORTED', key);
  const payload = {};
  for (const [field, spec] of Object.entries(model.inputs)) {
    // Basic mode does not accept Lite-only alignment/template settings.
    if (model.id === 'volcengine-video-to-video-lip-sync' && values.mode === 'basic' && ['align_audio', 'align_audio_reverse', 'templ_start_seconds'].includes(field)) {
      need(values[field] === undefined, 'VIDEO_INPUT_OPTION_UNSUPPORTED', field); continue;
    }
    let value = values[field];
    if (value === undefined && spec.default !== undefined) value = structuredClone(spec.default);
    const required = model.required.includes(field);
    need(!required || value !== undefined && value !== null && (typeof value !== 'string' || value.trim()), 'VIDEO_INPUT_REQUIRED', field);
    if (value === undefined) continue;
    let valid = value !== null;
    if (spec.enum) valid &&= spec.enum.includes(value);
    if (spec.type === 'string') valid &&= typeof value === 'string' && [...value].length <= (spec.maxLength ?? Infinity);
    else if (spec.type === 'boolean') valid &&= typeof value === 'boolean';
    else if (['int', 'integer', 'number'].includes(spec.type)) {
      const integer = spec.type !== 'number' && !(spec.step !== undefined && !Number.isInteger(spec.step));
      valid &&= typeof value === 'number' && Number.isFinite(value) && (!integer || Number.isSafeInteger(value)) && value >= (spec.minimum ?? spec.minValue ?? -Infinity) && value <= (spec.maximum ?? spec.maxValue ?? Infinity);
    } else if (spec.type === 'array') valid &&= Array.isArray(value) && value.length >= (spec.minItems ?? (required ? 1 : 0)) && value.length <= (spec.maxItems ?? Infinity) && Array.from(value).every(item => typeof item === spec.items?.type && (typeof item !== 'string' || item.trim()));
    else valid = false;
    need(valid, 'VIDEO_INPUT_OPTION_INVALID', field);
    payload[field] = structuredClone(value);
  }
  for (const role of roles) if (payload[role.field] !== undefined) need((role.isArray ? payload[role.field] : [payload[role.field]]).every(value => isVideoInputUrl(value) && (!wave.has(model.id) || value.length <= 2083)), 'VIDEO_INPUT_MEDIA_INVALID', role.field);
  if (references.has(model.id) && mode === 'i2v') {
    const slots = getVideoWorkflowMediaSlots(model, 'references');
    const constraint = slots.find(slot => slot.combinedLimit);
    const count = slot => { const v = payload[slot.field]; return Array.isArray(v) ? v.length : v ? 1 : 0; };
    const requiredSlots = slots.filter(s => (constraint?.requiredSlotIds ?? ['referenceImages', 'referenceVideos', 'referenceAudios']).includes(s.id));
    // Workflow slots can use UI aliases (e.g. Gemini images_list); contracts use native wire roles.
    need((constraint ? requiredSlots : roles).some(s => count(s) > 0), 'VIDEO_INPUT_REFERENCE_REQUIRED', 'references');
    if (constraint) need(slots.filter(s => constraint.combinedSlotIds.includes(s.id)).reduce((n, s) => n + count(s) * (constraint.slotWeights?.[s.id] ?? 1), 0) <= constraint.combinedLimit, 'VIDEO_INPUT_REFERENCE_LIMIT', 'references');
  }
  if (model.id === 'volcengine-video-to-video-lip-sync') {
    need(payload.mode === 'basic' || !payload.open_scenedet, 'VIDEO_INPUT_OPTION_INVALID', 'open_scenedet');
    need(!payload.align_audio_reverse || payload.align_audio, 'VIDEO_INPUT_OPTION_INVALID', 'align_audio_reverse');
  }
  const supportedOptions = Object.keys(model.inputs).filter(f => !roles.some(r => r.field === f)).sort();
  return { endpoint: model.endpoint || model.id, payload, requiredMedia: roles, supportedOptions,
    effectiveOptions: Object.fromEntries(supportedOptions.filter(f => Object.hasOwn(payload, f)).map(f => [f, payload[f]])),
    videoInput: { ...getVideoInputStatus(model.id, mode), mode, modelId: model.id, requiredInputs: model.required, ...(model.resultSemantics ? { resultSemantics: model.resultSemantics } : {}),
      media: roles.map(r => ({ ...r, ...(r.isArray ? { count: payload[r.field]?.length ?? 0 } : {}), supplied: payload[r.field] !== undefined })),
      providerRequest: { endpoint: model.endpoint || model.id, payload: structuredClone(payload) },
      caveat: 'Role/order validation does not measure media duration or guarantee frame, identity or motion preservation.' },
  };
}

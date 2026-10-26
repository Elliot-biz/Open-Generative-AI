import { getAudioModelById } from './models.js';

// Eligibility/intent only: endpoint identities, controls and schemas stay in the
// existing Studio catalog. This is not another audio catalog or transport.
const intents = Object.freeze({
  'suno-create-music': 'GENERATE_MUSIC',
  'suno-remix-music': 'REMIX_MUSIC',
  'suno-extend-music': 'EXTEND_MUSIC',
  'suno-generate-mashup': 'MASHUP_MUSIC',
  'suno-add-vocals': 'ADD_VOCALS',
  'suno-add-instrumental': 'ADD_INSTRUMENTAL',
  'suno-generate-sounds': 'GENERATE_SOUND',
  'mmaudio-v2-text-to-audio': 'GENERATE_SOUND',
  'minimax-voice-clone': 'CLONE_VOICE',
  'minimax-speech-2.6-hd': 'SYNTHESIZE_SPEECH',
  'minimax-speech-2.6-turbo': 'SYNTHESIZE_SPEECH',
  'elevenlabs-tts-turbo-2-5': 'SYNTHESIZE_SPEECH',
  'elevenlabs-v4': 'SYNTHESIZE_SPEECH',
  'fish-s2-1-pro': 'SYNTHESIZE_SPEECH',
  'elevenlabs-text-to-dialogue-v3': 'SYNTHESIZE_DIALOGUE',
  'gemini-3-1-flash-tts': 'SYNTHESIZE_DIALOGUE',
  'gemini-2-5-pro-tts': 'SYNTHESIZE_DIALOGUE',
  'suno-convert-to-wav': 'CONVERT_SUNO_WAV',
  'minimax-music-3.0': 'GENERATE_MUSIC',
  'lyria-3-pro': 'GENERATE_MUSIC',
  'lyria-3': 'GENERATE_MUSIC',
  'lyria-2': 'GENERATE_MUSIC',
});
export function getAudioContractStatus(id) {
  if (id === 'suno-voice-clone') return { status: 'DEFERRED', capability: 'CLONE_VOICE', multiStep: true, code: 'AUDIO_CLONE_LIFECYCLE_UNSUPPORTED' };
  return Object.hasOwn(intents, id) ? { status: 'REVIEWED', capability: intents[id], multiStep: false } : { status: 'UNREVIEWED' };
}

// Small source/OpenAPI corrections and description-level constraints verified
// 2026-10-26. Keep existing accepted catalog defaults, including Suno V5: newly
// advertised V6 options are not implicitly admitted. See bridge documentation.
export function getAudioExecutionModel(id) {
  if (!Object.hasOwn(intents, id)) return null;
  const original = getAudioModelById(id);
  if (!original) return null;
  const model = structuredClone(original), inputs = model.inputs;
  if (['suno-create-music', 'suno-remix-music', 'suno-extend-music'].includes(id)) inputs.title.maxLength = 80;
  if (['suno-remix-music', 'suno-extend-music'].includes(id)) inputs.prompt.maxLength = 3000;
  if (id === 'suno-generate-sounds') inputs.prompt.maxLength = 500;
  if (id === 'minimax-voice-clone') {
    model.required = [...new Set([...model.required, 'prompt'])];
    inputs.prompt.maxLength = 2000;
    inputs.custom_voice_id.minLength = 8;
  }
  if (id.startsWith('minimax-speech-2.6-')) delete inputs.voice_id.enum; // Custom cloned voice IDs are valid in OpenAPI.
  if (id === 'elevenlabs-tts-turbo-2-5') {
    inputs.prompt.maxLength = 40000;
    Object.assign(inputs.stability, { minimum: 0, maximum: 1 });
    Object.assign(inputs.similarity_boost, { minimum: 0, maximum: 1 });
    Object.assign(inputs.speed, { minimum: 0.7, maximum: 1.2 });
  }
  if (id === 'elevenlabs-text-to-dialogue-v3') Object.assign(inputs.stability, { minimum: 0, maximum: 1 });
  if (id.startsWith('gemini-')) inputs.dialogue_turns.items.properties.text.maxLength = 10000;
  if (id === 'minimax-music-3.0') Object.assign(inputs.lyrics, { minLength: 10, maxLength: 3000 });
  return model;
}

export function getAudioMediaInputs(id) {
  const model = getAudioExecutionModel(id);
  return Object.entries(model?.inputs || {}).filter(([, spec]) => ['audio', 'audios_list'].includes(spec.field)).map(([field, spec]) => ({
    field, role: field === 'audios_list' ? 'source-tracks' : 'source-audio', type: 'audio', projectAsset: true,
    required: model.required.includes(field), isArray: spec.type === 'array',
    ...(spec.type === 'array' ? { minimum: spec.minItems ?? 1, maximum: spec.maxItems, ordered: true } : {}),
  }));
}
function need(condition, code, path) {
  if (!condition) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
function audioUrl(value) {
  if (!text(value) || value !== value.trim()) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}

// Audio-scoped recursive validation: schemas are trusted catalog data, never
// caller-supplied. No coercion, clamping, truncation or unknown nested fields.
function validate(value, spec, path, required = false) {
  if (value === undefined) value = spec.default == null ? undefined : structuredClone(spec.default);
  if (value === undefined) {
    need(!required, 'AUDIO_REQUIRED_INPUT_MISSING', path);
    return undefined;
  }
  need(value !== null, 'AUDIO_OPTION_INVALID', path);
  const choices = spec.enum;
  // {label,value} arrays / typing:true are UI suggestions (custom voice IDs),
  // not provider enums. Primitive enum lists remain exact and case sensitive.
  if (choices && !spec.typing && choices.every(item => typeof item !== 'object')) need(choices.includes(value), 'AUDIO_OPTION_INVALID', path);
  if (spec.type === 'string') {
    need(typeof value === 'string' && (!required || text(value)) && [...value].length >= (spec.minLength ?? 0) && [...value].length <= (spec.maxLength ?? Infinity), 'AUDIO_OPTION_INVALID', path);
  } else if (['number', 'int', 'integer', 'float'].includes(spec.type)) {
    const integer = ['int', 'integer'].includes(spec.type) && !(spec.step !== undefined && !Number.isInteger(spec.step));
    need(typeof value === 'number' && Number.isFinite(value) && (!integer || Number.isInteger(value)) &&
      value >= (spec.minimum ?? spec.minValue ?? -Infinity) && value <= (spec.maximum ?? spec.maxValue ?? Infinity), 'AUDIO_OPTION_INVALID', path);
  } else if (spec.type === 'boolean') need(typeof value === 'boolean', 'AUDIO_OPTION_INVALID', path);
  else if (spec.type === 'array') {
    need(Array.isArray(value) && value.length >= (spec.minItems ?? (required ? 1 : 0)) && value.length <= (spec.maxItems ?? Infinity), 'AUDIO_OPTION_INVALID', path);
    value = Array.from(value, (item, i) => validate(item, spec.items, `${path}[${i}]`, true));
  } else if (spec.type === 'object') {
    need(object(value), 'AUDIO_OPTION_INVALID', path);
    for (const key of Object.keys(value)) need(Object.hasOwn(spec.properties, key), 'AUDIO_OPTION_UNSUPPORTED', `${path}.${key}`);
    const result = {};
    for (const [key, child] of Object.entries(spec.properties)) {
      const v = validate(value[key], child, `${path}.${key}`, spec.required?.includes(key));
      if (v !== undefined) result[key] = v;
    }
    value = result;
  } else need(false, 'AUDIO_OPTION_INVALID', path);
  return value;
}

/** Selected executor is a separate argument; params.model is only a declared
 * provider option (Suno version / MiniMax preview engine). _modelId is transport
 * identity, not a provider payload field. */
export function buildAudioRequest(modelId, params = {}) {
  need(object(params), 'AUDIO_REQUEST_INVALID', '');
  need(modelId !== 'suno-voice-clone', 'AUDIO_CLONE_LIFECYCLE_UNSUPPORTED', 'model');
  const model = getAudioExecutionModel(modelId);
  need(model, 'AUDIO_MODEL_UNSUPPORTED', 'model');
  need(params._modelId === undefined || params._modelId === modelId, 'AUDIO_IDENTITY_OVERRIDE', '_modelId');
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'AUDIO_OPTION_INVALID', 'onRequestId');
  const values = { ...params };
  delete values._modelId; delete values.onRequestId;
  // Backward-compatible application caller: model alone selects an endpoint.
  // With _modelId supplied, model must instead be an actual provider option.
  if (params._modelId === undefined && values.model === modelId) delete values.model;
  for (const key of Object.keys(values)) need(Object.hasOwn(model.inputs, key), 'AUDIO_OPTION_UNSUPPORTED', key);
  const payload = {};
  for (const [field, schema] of Object.entries(model.inputs)) {
    let value = values[field];
    const required = model.required.includes(field);
    // Existing Studio initializes unselected optional controls to ''/null.
    // Their explicit catalog defaults apply; no meaningful value is discarded.
    if (!required && (value === null || value === '' && schema.enum)) value = undefined;
    const normalized = validate(value, schema, field, required);
    if (normalized !== undefined) payload[field] = normalized;
  }
  const media = getAudioMediaInputs(modelId);
  for (const role of media) {
    if (payload[role.field] === undefined) continue;
    const urls = role.isArray ? payload[role.field] : [payload[role.field]];
    need(urls.every(audioUrl), 'AUDIO_MEDIA_INVALID', role.field);
  }
  if (modelId === 'suno-generate-mashup') {
    need(text(payload.style), 'AUDIO_REQUIRED_INPUT_MISSING', 'style');
    if (!payload.instrumental) need(text(payload.prompt), 'AUDIO_REQUIRED_INPUT_MISSING', 'prompt');
  }
  if (payload.persona_model === 'voice_persona') need(['V5', 'V5_5'].includes(payload.model), 'AUDIO_OPTION_INVALID', 'persona_model');
  if (modelId === 'minimax-voice-clone') need(/^[A-Za-z][A-Za-z0-9_-]{7,}$/.test(payload.custom_voice_id) && /\d/.test(payload.custom_voice_id), 'AUDIO_OPTION_INVALID', 'custom_voice_id');
  if (modelId.startsWith('gemini-')) {
    const ids = payload.speakers.map(s => s.speaker_id);
    need(ids.every(id => /^Speaker [1-9]\d*$/.test(id)) && new Set(ids).size === ids.length, 'AUDIO_SPEAKER_INVALID', 'speakers');
    need(payload.dialogue_turns.every(turn => ids.includes(turn.speaker_id)), 'AUDIO_SPEAKER_INVALID', 'dialogue_turns');
  }
  const supportedOptions = Object.keys(model.inputs).filter(field => !media.some(role => role.field === field)).sort();
  return { endpoint: model.endpoint || model.id, payload, requiredMedia: media,
    supportedOptions, effectiveOptions: Object.fromEntries(supportedOptions.filter(field => Object.hasOwn(payload, field)).map(field => [field, payload[field]])),
    audio: { ...getAudioContractStatus(modelId), modelId, providerModel: payload.model ?? null,
      requiredInputs: [...model.required], media: media.map(role => ({ ...role, ...(role.isArray ? { count: payload[role.field]?.length ?? 0 } : {}) })),
      providerRequest: { endpoint: model.endpoint || model.id, payload: structuredClone(payload) } },
  };
}

// Guided singing-voice clone only; ordinary audio generation stays separate.
import { getAudioModelById } from './models.js';
import { isVideoInputUrl } from './videoInputContracts.js';
const actions = ['start', 'confirm', 'poll'];
export const SUNO_CLONE_CAPABILITY = 'CLONE_VOICE_GUIDED';
export function getSunoCloneModel(id) { return id === 'suno-voice-clone' ? getAudioModelById(id) : null; }
export function cloneNeed(condition, code, path = '') {
  if (!condition) throw Object.assign(new Error(code.replaceAll('_', ' ')), { code, path });
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const opaqueVoice = value => typeof value === 'string' && Boolean(value.trim()) && !/[\\/\x00-\x1f]/.test(value) && !/^https?:/i.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
export function validateCloneState(state) {
  cloneNeed(object(state), 'SUNO_CLONE_STATE_REQUIRED', 'state');
  const fields = ['capability', 'modelId', 'requestId', 'continuationId', 'stage', 'phrase', 'sourceSample', 'voiceId', 'userActionRequired', 'nextAction', 'phase'];
  cloneNeed(Object.keys(state).every(k => fields.includes(k)) && state.capability === SUNO_CLONE_CAPABILITY && state.modelId === 'suno-voice-clone' && id(state.requestId) && id(state.continuationId), 'SUNO_CLONE_STATE_INVALID', 'state');
  cloneNeed(state.stage === null || typeof state.stage === 'string', 'SUNO_CLONE_STATE_INVALID', 'state.stage');
  cloneNeed(state.phrase === null || typeof state.phrase === 'string', 'SUNO_CLONE_STATE_INVALID', 'state.phrase');
  cloneNeed(object(state.sourceSample) && Object.keys(state.sourceSample).every(k => ['reference', 'checksum'].includes(k)) && isVideoInputUrl(state.sourceSample.reference) && (state.sourceSample.checksum === undefined || /^[a-f0-9]{64}$/.test(state.sourceSample.checksum)), 'SUNO_CLONE_STATE_INVALID', 'state.sourceSample');
  cloneNeed(state.voiceId === null || opaqueVoice(state.voiceId), 'SUNO_CLONE_STATE_INVALID', 'state.voiceId');
  cloneNeed(typeof state.userActionRequired === 'boolean' && [null, 'confirm', 'poll'].includes(state.nextAction) && typeof state.phase === 'string', 'SUNO_CLONE_STATE_INVALID', 'state');
  return state;
}
export function buildSunoCloneRequest(params = {}) {
  cloneNeed(object(params) && getSunoCloneModel(params.model), 'SUNO_CLONE_MODEL_UNSUPPORTED', 'model');
  cloneNeed(actions.includes(params.action), 'SUNO_CLONE_ACTION_INVALID', 'action');
  cloneNeed(params._validateOnly === undefined || params._validateOnly === true && params.action !== 'start', 'SUNO_CLONE_OPTION_INVALID', '_validateOnly');
  const model = getSunoCloneModel(params.model), start = params.action === 'start';
  const fields = start ? Object.keys(model.inputs) : params.action === 'confirm' ? ['audio_url', 'recording_origin', 'state'] : ['state'];
  for (const field of Object.keys(params)) cloneNeed(['model', 'action', 'onRequestId', '_sampleIdentity', '_validateOnly'].includes(field) || fields.includes(field), 'SUNO_CLONE_OPTION_UNSUPPORTED', field);
  cloneNeed(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'SUNO_CLONE_OPTION_INVALID', 'onRequestId');
  const payload = {};
  if (params.action !== 'poll') {
    cloneNeed(isVideoInputUrl(params.audio_url) && params.audio_url.length <= 2083, 'SUNO_CLONE_AUDIO_REQUIRED', 'audio_url');
    payload.audio_url = params.audio_url;
  }
  if (start) {
    for (const [field, spec] of Object.entries(model.inputs)) {
      if (field === 'audio_url') continue;
      const value = params[field] ?? spec.default;
      if (value === undefined) continue;
      cloneNeed(params[field] !== null, 'SUNO_CLONE_OPTION_INVALID', field);
      cloneNeed(spec.type === 'int' ? Number.isSafeInteger(value) && value >= spec.minValue && value <= spec.maxValue : typeof value === 'string', 'SUNO_CLONE_OPTION_INVALID', field);
      if (spec.enum) cloneNeed(spec.enum.includes(value), 'SUNO_CLONE_OPTION_INVALID', field);
      payload[field] = value;
    }
    cloneNeed(payload.vocal_end_s > payload.vocal_start_s, 'SUNO_CLONE_RANGE_INVALID', 'vocal_end_s');
  } else {
    validateCloneState(params.state);
    if (params.action === 'confirm') {
      cloneNeed(params.state.stage === 'awaiting_phrase' && params.state.phrase?.trim() && params.state.nextAction === 'confirm', 'SUNO_CLONE_NOT_AWAITING_PHRASE', 'state');
      cloneNeed(params.recording_origin === 'user_recorded_challenge', 'SUNO_CLONE_HUMAN_RECORDING_REQUIRED', 'recording_origin');
      cloneNeed(params.audio_url !== params.state.sourceSample.reference, 'SUNO_CLONE_DISTINCT_RECORDING_REQUIRED', 'audio_url');
    }
  }
  if (params._sampleIdentity !== undefined) {
    const identity = params._sampleIdentity;
    cloneNeed(object(identity) && Object.keys(identity).every(k => ['reference', 'checksum'].includes(k)) && isVideoInputUrl(identity.reference) && (identity.checksum === undefined || /^[a-f0-9]{64}$/.test(identity.checksum)), 'SUNO_CLONE_SAMPLE_IDENTITY_INVALID');
    if (params.action === 'confirm') cloneNeed(identity.reference !== params.state.sourceSample.reference && (!identity.checksum || identity.checksum !== params.state.sourceSample.checksum), 'SUNO_CLONE_DISTINCT_RECORDING_REQUIRED', 'audio_url');
  }
  const endpoint = start ? model.endpoint : params.action === 'confirm' ? `${model.endpoint}/${params.state.requestId}/confirm` : `predictions/${params.state.requestId}/result`;
  const requiredMedia = params.action === 'poll' ? [] : [{ field: 'audio_url', type: 'audio', role: start ? 'initial-voice-sample' : 'user-challenge-recording', isArray: false, required: true, projectAsset: true }];
  const supportedOptions = fields.filter(k => !['audio_url', 'state'].includes(k));
  return { endpoint, payload, requiredMedia, supportedOptions, effectiveOptions: Object.fromEntries(supportedOptions.filter(k => payload[k] !== undefined).map(k => [k, payload[k]])),
    sunoClone: { capability: SUNO_CLONE_CAPABILITY, action: params.action, userConfirmationRequired: true,
      providerRequest: { method: params.action === 'poll' ? 'GET' : 'POST', endpoint, payload },
      lifecycle: ['start', 'awaiting_phrase', 'confirm', 'generating', 'completed'],
      caveat: 'A fresh human recording of the provider phrase is mandatory. Approval is not liveness verification. Provider verifies content; sample duration and runtime success are unverified.' } };
}
export function normalizeSunoCloneResult(raw, state) {
  const data = raw?.output && typeof raw.output === 'object' ? raw.output : raw;
  const stage = typeof data?.stage === 'string' ? data.stage : null;
  const phrase = typeof data?.phrase === 'string' ? data.phrase : state.phrase ?? null;
  const voiceId = opaqueVoice(data?.voice_id) ? data.voice_id : null;
  const failed = stage === 'failed' || ['failed', 'error', 'cancelled', 'canceled'].includes(raw?.status);
  const waiting = !failed && stage === 'awaiting_phrase' && Boolean(phrase?.trim());
  const status = failed ? 'failed' : stage === 'completed' ? voiceId ? 'succeeded' : 'blocked' : waiting ? 'awaiting_user' : stage === 'generating' ? 'processing' : 'blocked';
  return { status, request_id: state.requestId, operationState: { ...state, stage, phrase, voiceId,
    phase: waiting ? 'AWAITING_PHRASE_RECORDING' : stage === 'completed' && voiceId ? 'COMPLETED' : failed ? 'FAILED' : state.phase,
    userActionRequired: waiting, nextAction: waiting ? 'confirm' : failed || stage === 'completed' && voiceId ? null : 'poll' },
    upstream: raw, diagnostics: status === 'blocked' ? [{ code: stage === 'completed' ? 'SUNO_CLONE_VOICE_ID_MISSING' : 'SUNO_CLONE_STAGE_UNVERIFIED' }] : [] };
}

export function getSunoCloneInputDescription(id) {
  const model = getSunoCloneModel(id); if (!model) return null;
  return { capability: SUNO_CLONE_CAPABILITY, multiStage: true, humanActionRequired: true, providerLivenessRequired: true,
    automaticLiveness: false, continuation: 'same_live_runtime_session', actions: [...actions],
    operations: [
      { action: 'start', inputs: structuredClone(model.inputs), required: [...model.required], mediaRole: 'initial-voice-sample', projectAssetRequired: false },
      { action: 'confirm', inputs: { audio_url: { type: 'string', field: 'audio' }, state: { type: 'object' },
        recording_origin: { type: 'string', enum: ['user_recorded_challenge'] } }, required: ['audio_url', 'state', 'recording_origin'], mediaRole: 'user-challenge-recording', projectAssetRequired: true },
      { action: 'poll', inputs: { state: { type: 'object' } }, required: ['state'] },
    ], result: { kind: 'provider-voice-identity', field: 'voiceId', providerField: 'voice_id', projectAsset: false },
    stages: ['awaiting_phrase', 'generating', 'completed', 'failed'],
    limitations: ['Exact provider challenge phrase must be recorded by the user; no TTS or approval substitute.',
      'Lost continuation blocks safely; no automatic retry/restart. Provider verifies content and liveness.'] };
}

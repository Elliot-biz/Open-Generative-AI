import { getPerformanceTransformation } from './performanceTransformationContracts.js';
import { getRecastModelById } from './models.js';

function requireInput(condition, code, path, message) {
  if (!condition) throw Object.assign(new Error(message), { code, path });
}
const hasMedia = value => typeof value === 'string' && value.trim().length > 0;

// One pure request contract for the existing service and non-executing planners.
// video_url is the application role; videoField is the model-specific wire field.
export function buildRecastRequest(params = {}) {
  requireInput(params && typeof params === 'object' && !Array.isArray(params), 'RECAST_REQUEST_INVALID', '', 'Recast request must be an object.');
  const model = getRecastModelById(params.model);
  requireInput(model, 'RECAST_MODEL_UNSUPPORTED', 'model', 'Unsupported Recast alias.');
  const video = params.video_url ?? params[model.videoField];
  requireInput(hasMedia(video), 'RECAST_VIDEO_REQUIRED', 'video_url', 'A driving/performance video is required.');
  requireInput(hasMedia(params.image_url), 'RECAST_IMAGE_REQUIRED', 'image_url', 'A target character image is required.');
  if (model.videoField !== 'video_url' && params.video_url !== undefined && params[model.videoField] !== undefined) {
    requireInput(params.video_url === params[model.videoField], 'RECAST_INPUT_CONFLICT', model.videoField, 'Driving-video inputs disagree.');
  }

  const options = Object.entries(model.inputs || {}).filter(([, spec]) => !spec.field);
  const allowed = new Set(['model', 'onRequestId', 'video_url', model.videoField, 'image_url', ...options.map(([key]) => key), ...(model.hasPrompt ? ['prompt'] : [])]);
  for (const key of Object.keys(params)) {
    requireInput(allowed.has(key), 'RECAST_OPTION_UNSUPPORTED', key, 'Unsupported Recast input or option.');
  }
  requireInput(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'RECAST_OPTION_INVALID', 'onRequestId', 'Request callback must be a function.');
  const payload = { [model.videoField]: video, [model.imageField]: params.image_url };
  if (params.prompt !== undefined) {
    requireInput(typeof params.prompt === 'string', 'RECAST_OPTION_INVALID', 'prompt', 'Prompt must be text.');
    payload.prompt = params.prompt;
  }
  for (const [field, spec] of options) {
    // Wan's default is explicit; other optional settings retain existing behavior.
    const value = params[field] ?? (field === 'mode' ? spec.default : undefined);
    if (value === undefined) continue;
    requireInput(params[field] !== null && typeof value === spec.type && (!spec.enum || spec.enum.includes(value)),
      'RECAST_OPTION_INVALID', field, 'Invalid Recast option.');
    payload[field] = value;
  }
  return {
    endpoint: model.endpoint, payload, transformation: getPerformanceTransformation(model, 'recast', payload),
    requiredMedia: [
      { role: 'target-character', field: 'image_url', upstreamField: model.imageField },
      { role: 'driving-performance', field: 'video_url', upstreamField: model.videoField },
    ],
    supportedOptions: [...options.map(([field]) => field), ...(model.hasPrompt ? ['prompt'] : [])].sort(),
  };
}

// Existing shared generateI2V/checkInputs compatibility branch; no new admission.
export function getRecastCompatibilityModel(id, mode) {
  return mode === 'i2v' && id === 'runway-act-two-i2v' ? getRecastModelById('runway-act-two-recast') : null;
}

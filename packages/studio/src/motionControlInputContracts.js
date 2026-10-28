import { getPerformanceTransformation } from './performanceTransformationContracts.js';
import { getMotionControlModelById } from './models.js';

function need(condition, code, path, message) {
  if (!condition) throw Object.assign(new Error(message), { code, path });
}
const qualityValues = ['high', 'basic'];
const seedSchema = { type: 'integer', minimum: -1, maximum: 4294967295 };
const media = value => typeof value === 'string' && value.trim().length > 0;
// Existing creative instructions express intent, not measured preservation guarantees.
const instructions = Object.freeze({
  motion_transfer: 'Extract motion from the reference video and rebuild the scene with the new characters and assets, preserving the original motion, choreography, and camera movements.',
  objects_swap: 'Keep the rest of the scene as filmed, swap the characters, products, or clothes with the reference images.',
});

export function getMotionControlExecutionModel(id) { const model = getMotionControlModelById(id); return model?.id === id && model.executionReviewed === true ? model : null; }

export function getMotionControlInputDescription(id) {
  const model = getMotionControlModelById(id); if (model?.id !== id) return null;
  return structuredClone({ inputs: { mode: { type: 'string', enum: Object.keys(instructions) }, prompt: { type: 'string' },
    video_url: { type: 'string', field: 'video' }, images_list: { type: 'array', field: 'image', minItems: 1, maxItems: model.maxImages, items: { type: 'string' } },
    duration: { type: 'integer', minimum: model.minDuration, maximum: model.maxDuration, default: model.defaultDuration },
    aspect_ratio: { type: 'string', enum: model.aspectRatios, default: model.defaultAspectRatio },
    ...(model.supportsAudio ? { generate_audio: { type: 'boolean', default: false } } : {}),
    ...(model.supportsBitrate ? { high_bitrate: { type: 'boolean', default: false } } : {}),
    ...(model.supportsQuality ? { quality: { type: 'string', enum: qualityValues, default: 'high' } } : {}),
    ...(model.supportsSeed ? { seed: seedSchema } : {}) }, required: ['mode', 'video_url', 'images_list'] });
}

// Feature-specific contract only; model limits stay in the existing Studio catalog.
export function buildMotionControlRequest(params = {}) {
  need(params && typeof params === 'object' && !Array.isArray(params), 'MOTION_REQUEST_INVALID', '', 'Motion Control request must be an object.');
  const model = getMotionControlModelById(params.model);
  need(model?.id === params.model, 'MOTION_MODEL_UNSUPPORTED', 'model', 'Unsupported Motion Control model.');
  need(typeof params.mode === 'string' && Object.hasOwn(instructions, params.mode), 'MOTION_MODE_INVALID', 'mode', 'Select motion_transfer or objects_swap.');
  need(media(params.video_url), 'MOTION_VIDEO_REQUIRED', 'video_url', 'A source/reference video is required.');

  const forms = ['images_list', 'images', 'image_url'].filter(key => params[key] !== undefined);
  need(forms.length <= 1, 'MOTION_REFERENCE_CONFLICT', 'images_list', 'Supply one reference-image representation.');
  const field = forms[0];
  const images = field === 'images_list' ? params.images_list : field === 'images'
    ? (Array.isArray(params.images) ? params.images : [params.images]) : field ? [params.image_url] : [];
  need(Array.isArray(images) && images.length >= 1 && images.length <= model.maxImages,
    'MOTION_REFERENCE_COUNT_INVALID', 'images_list', `Supply 1 to ${model.maxImages} image references.`);
  need([...images].every(media), 'MOTION_REFERENCE_INVALID', 'images_list', 'Every reference must be a nonempty media URL.');

  const allowed = new Set(['model', 'mode', 'onRequestId', 'video_url', 'images_list', 'images', 'image_url', 'prompt', 'duration', 'aspect_ratio',
    ...(model.supportsAudio ? ['generate_audio'] : []), ...(model.supportsBitrate ? ['high_bitrate'] : []),
    ...(model.supportsQuality ? ['quality'] : []), ...(model.supportsSeed ? ['seed'] : [])]);
  for (const key of Object.keys(params)) need(allowed.has(key), 'MOTION_OPTION_UNSUPPORTED', key, 'Unsupported Motion Control input or option.');
  need(params.onRequestId === undefined || typeof params.onRequestId === 'function', 'MOTION_OPTION_INVALID', 'onRequestId', 'Request callback must be a function.');
  need(params.prompt === undefined || typeof params.prompt === 'string', 'MOTION_OPTION_INVALID', 'prompt', 'Prompt must be text.');
  const duration = params.duration === undefined ? model.defaultDuration : params.duration;
  need(Number.isInteger(duration) && duration >= model.minDuration && duration <= model.maxDuration,
    'MOTION_DURATION_INVALID', 'duration', `Duration must be an integer from ${model.minDuration} to ${model.maxDuration}.`);
  const aspectRatio = params.aspect_ratio === undefined ? model.defaultAspectRatio : params.aspect_ratio;
  need(model.aspectRatios.includes(aspectRatio), 'MOTION_OPTION_INVALID', 'aspect_ratio', 'Unsupported aspect ratio.');
  const prompt = params.prompt?.trim();
  const payload = { video_url: params.video_url, images_list: [...images], aspect_ratio: aspectRatio, duration,
    prompt: prompt ? `${instructions[params.mode]} ${prompt}` : instructions[params.mode] };
  for (const [field, supported] of [['generate_audio', model.supportsAudio], ['high_bitrate', model.supportsBitrate]]) {
    if (!supported) continue;
    const value = params[field] === undefined ? false : params[field];
    need(typeof value === 'boolean', 'MOTION_OPTION_INVALID', field, 'Option must be a boolean.');
    payload[field] = value;
  }
  if (model.supportsQuality) {
    const quality = params.quality === undefined ? 'high' : params.quality;
    need(qualityValues.includes(quality), 'MOTION_OPTION_INVALID', 'quality', 'Quality must be high or basic.');
    payload.quality = quality;
  }
  if (params.seed !== undefined) {
    need(Number.isInteger(params.seed) && params.seed >= seedSchema.minimum && params.seed <= seedSchema.maximum,
      'MOTION_OPTION_INVALID', 'seed', 'Seed must be an integer from -1 to 4294967295.');
    payload.seed = params.seed;
  }
  return { endpoint: model.endpoint, payload,
    requiredMedia: [{ role: 'source-motion', field: 'video_url', upstreamField: 'video_url' },
      { role: 'reference-images', field: 'images_list', upstreamField: 'images_list', minimum: 1, maximum: model.maxImages }],
    supportedOptions: ['mode', 'prompt', 'duration', 'aspect_ratio', ...['generate_audio', 'high_bitrate', 'quality', 'seed'].filter(key => allowed.has(key))].sort(),
    transformation: getPerformanceTransformation(model, 'motion_control', params),
    motionControl: { intentMode: params.mode, imageCount: images.length, minimumImages: 1, maximumImages: model.maxImages,
      duration, minimumDuration: model.minDuration, maximumDuration: model.maxDuration,
      suppliedOptions: Object.keys(params).filter(key => !['model', 'onRequestId', 'video_url', ...forms].includes(key)).sort() },
  };
}

// Local project read utility. No provider, renderer, subprocess or arbitrary-path API.
import path from 'node:path';
import { fields, ensure, validId, readBytes, hashBytes, MAX_IMPORT_BYTES } from '../../packages/whihm-workflow-core/src/project/io.js';
import { probeMediaBytes } from './media-header-probe.mjs';

const profileSchema = {
  expectedMediaKind: { type: 'string', enum: ['image','video','audio'] },
  minDuration: { type: 'number', minimum: 0 }, maxDuration: { type: 'number', minimum: 0 },
  minWidth: { type: 'integer', minimum: 1 }, minHeight: { type: 'integer', minimum: 1 },
  aspectRatios: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'number', exclusiveMinimum: 0 } },
  aspectTolerance: { type: 'number', minimum: 0 },
  minFrameRate: { type: 'number', exclusiveMinimum: 0 }, maxFrameRate: { type: 'number', exclusiveMinimum: 0 },
  allowedCodecs: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', pattern: '^[A-Za-z0-9_. -]{1,32}$' } },
  allowedContainers: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', enum: ['png','jpeg','webp','gif','tiff','wav','mp4','mov'] } },
  expectedAudio: { type: 'boolean' }, maxFileSize: { type: 'integer', minimum: 0 },
};
const limitations = [
  'Registered project assets only; existing 64 MiB import bound and project integrity rules apply.',
  'Raster images: PNG/JPEG/WebP/GIF/TIFF through existing Sharp metadata. SVG/HEIF/AVIF and other containers are unsupported in v1.',
  'Audio: RIFF/WAVE PCM or IEEE float; non-fragmented MP4/MOV audio/video with one sample description per media track. Other formats, fragmented files and extended QuickTime audio entries reject.',
  'Header facts do not prove successful full decoding, playable samples, frame accuracy, calibrated color or media fidelity. Embedded metadata and external references are never followed.',
  'Movie/track duration is header-reported; frame rate is a sample-timing-table average, not a constant-rate guarantee. MP4/MOV bitrate is a calculated file-level estimate, not stream bitrate.',
  'Video displayDimensions are rotation-adjusted coded pixel dimensions; displayAspectRatio additionally uses a declared pixel-aspect box. Missing pixel aspect stays unknown. Audio sample-entry values are not codec-configuration or decoded-output verification.',
  'No semantic analysis, quality scores, media transformation, provider calls or universal technical quality thresholds.',
];
function fail(code) { throw Object.assign(new Error(code), { inspectionCode: code }); }
function validateValue(value, spec) {
  if (spec.type === 'array') return Array.isArray(value) && value.length >= spec.minItems && value.length <= spec.maxItems && Array.from(value).every(v => validateValue(v, spec.items));
  if (spec.type === 'string') return typeof value === 'string' && (!spec.enum || spec.enum.includes(value)) && (!spec.pattern || new RegExp(spec.pattern).test(value));
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value) && (spec.type !== 'integer' || Number.isSafeInteger(value)) && value >= (spec.minimum ?? -Infinity) && value > (spec.exclusiveMinimum ?? -Infinity);
}
export function validateInspectionRequirements(input = {}) {
  fields(input, [], Object.keys(profileSchema), 'MEDIA_PROFILE_INVALID');
  for (const [key, value] of Object.entries(input)) if (!validateValue(value, profileSchema[key])) fail('MEDIA_PROFILE_INVALID');
  for (const [min, max] of [['minDuration','maxDuration'],['minFrameRate','maxFrameRate']]) if (input[min] !== undefined && input[max] !== undefined && input[min] > input[max]) fail('MEDIA_PROFILE_INVALID');
  if (input.aspectTolerance !== undefined && !input.aspectRatios) fail('MEDIA_PROFILE_INVALID');
  return Object.fromEntries(Object.entries(structuredClone(input)).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
}
function sourceOf(record) {
  const extension = path.extname(record.originalFilename).slice(1).toLowerCase();
  return { assetId: record.assetId, path: record.path, checksum: record.checksum, declaredMime: record.contentType,
    extension: /^[a-z0-9]{1,10}$/.test(extension) ? extension : null };
}
async function registered(project, assetId) {
  ensure(validId(assetId), 'ASSET_ID_INVALID', 'Expected a registered asset ID.');
  const result = await project.getProjectAsset(assetId);
  if (result.status !== 'ok') throw Object.assign(new Error('Asset rejected'), { result });
  const record = result.asset, kind = record.contentType.split('/')[0];
  if (!['image','video','audio'].includes(kind) || !/^(image|video|audio)\/[a-z0-9.+-]{1,100}$/i.test(record.contentType)) fail('MEDIA_TYPE_UNSUPPORTED');
  ensure(record.size <= MAX_IMPORT_BYTES, 'ASSET_TOO_LARGE', 'Asset exceeds the existing project import bound.');
  return { record, kind };
}
function unavailable(facts) {
  const out = {};
  function walk(v, field) {
    if (v === null) out[field] = field === 'image' || facts.mediaKind === 'image' && (field === 'bitrate' || field === 'durationSeconds' && facts.image.pages === 1) ? 'not_applicable' : 'not_reported';
    else if (Array.isArray(v)) v.forEach((value, i) => walk(value, `${field}[${i}]`));
    else if (v && typeof v === 'object') for (const [key, value] of Object.entries(v)) walk(value, field ? `${field}.${key}` : key);
  }
  walk(facts, ''); return out;
}
export function validateTechnicalFacts(facts, requirements = {}) {
  const r = validateInspectionRequirements(requirements), warnings = [], intrinsic = [];
  const warn = (code, field, expected, actual) => warnings.push({ code, field, expected, actual });
  function check(field, actual, expected, valid, code) {
    if (actual === null || actual === undefined) warn('REQUIREMENT_UNEVALUABLE', field, expected, null);
    else if (!valid(actual)) warn(code, field, expected, actual);
  }
  if (r.expectedMediaKind !== undefined) check('mediaKind', facts.mediaKind, r.expectedMediaKind, v => v === r.expectedMediaKind, 'MEDIA_KIND_MISMATCH');
  if (r.maxFileSize !== undefined) check('fileSize', facts.fileSize, r.maxFileSize, v => v <= r.maxFileSize, 'FILE_SIZE_EXCEEDED');
  if (r.expectedAudio !== undefined) check('hasAudio', facts.hasAudio, r.expectedAudio, v => v === r.expectedAudio, 'AUDIO_PRESENCE_MISMATCH');
  if (r.allowedContainers) check('container', facts.container, r.allowedContainers, v => r.allowedContainers.includes(v), 'CONTAINER_NOT_ALLOWED');
  for (const [key, test, code] of [['minDuration',v => v >= r.minDuration,'DURATION_BELOW_MINIMUM'],['maxDuration',v => v <= r.maxDuration,'DURATION_ABOVE_MAXIMUM']]) if (r[key] !== undefined) check('durationSeconds', facts.durationSeconds, r[key], test, code);
  if (facts.durationSeconds !== null && facts.durationSeconds <= 0) intrinsic.push({ code: 'NONPOSITIVE_DURATION', field: 'durationSeconds' });
  const visuals = facts.image ? [{ field: 'image', dimensions: facts.image.displayDimensions, aspectRatio: facts.image.displayDimensions.aspectRatio }]
    : facts.streams.flatMap((s,i) => s.type === 'video' ? [{ field: `streams[${i}]`, dimensions: s.displayDimensions, aspectRatio: s.displayAspectRatio?.value ?? null }] : []);
  if (!visuals.length && ['minWidth','minHeight','aspectRatios'].some(k => r[k] !== undefined)) warn('REQUIREMENT_UNEVALUABLE', 'visualStreams', 'visual dimensions', null);
  for (const visual of visuals) {
    for (const [key, axis] of [['minWidth','width'],['minHeight','height']]) if (r[key] !== undefined) check(`${visual.field}.displayDimensions.${axis}`, visual.dimensions?.[axis], r[key], v => v >= r[key], 'DIMENSION_BELOW_MINIMUM');
    if (r.aspectRatios) check(`${visual.field}.aspectRatio`, visual.aspectRatio, r.aspectRatios, v => r.aspectRatios.some(target => Math.abs(v - target) <= (r.aspectTolerance ?? 0)), 'ASPECT_MISMATCH');
    if (visual.dimensions && (visual.dimensions.width <= 0 || visual.dimensions.height <= 0)) intrinsic.push({ code: 'NONPOSITIVE_DIMENSIONS', field: `${visual.field}.displayDimensions` });
  }
  const mediaStreams = facts.streams.filter(s => ['video','audio'].includes(s.type));
  if (r.allowedCodecs && !mediaStreams.length) warn('REQUIREMENT_UNEVALUABLE', 'streams.codec', r.allowedCodecs, null);
  for (const [i, s] of facts.streams.entries()) {
    if (s.dimensions && (s.dimensions.width <= 0 || s.dimensions.height <= 0) && !s.displayDimensions) intrinsic.push({ code: 'NONPOSITIVE_DIMENSIONS', field: `streams[${i}].dimensions` });
    if (r.allowedCodecs && ['video','audio'].includes(s.type)) check(`streams[${i}].codec`, s.codec, r.allowedCodecs, v => r.allowedCodecs.includes(v), 'CODEC_NOT_ALLOWED');
    if (s.type === 'video') for (const [key, test] of [['minFrameRate',v => v >= r.minFrameRate],['maxFrameRate',v => v <= r.maxFrameRate]]) if (r[key] !== undefined) check(`streams[${i}].frameRate`, s.frameRate?.value, r[key], test, 'FRAME_RATE_OUT_OF_RANGE');
  }
  if (!facts.streams.some(s => s.type === 'video') && (r.minFrameRate !== undefined || r.maxFrameRate !== undefined)) warn('REQUIREMENT_UNEVALUABLE', 'streams.frameRate', 'video frame rate', null);
  return { status: warnings.some(w => w.code !== 'REQUIREMENT_UNEVALUABLE') ? 'fail' : warnings.length ? 'unknown' : Object.keys(r).length ? 'pass' : 'not_requested',
    requirements: r, warnings, technicalWarnings: intrinsic };
}
async function capture(action) {
  try { return await action(); }
  catch (error) { return error.result ? { schemaVersion: 1, ...error.result } : { schemaVersion: 1, status: 'rejected', diagnostics: [{ code: error.inspectionCode || error.diagnostic?.code || 'MEDIA_UNREADABLE' }] }; }
}
export function planMediaInspection({ project, assetId, requirements } = {}) {
  return capture(async () => {
    const profile = validateInspectionRequirements(requirements), { record, kind } = await registered(project, assetId);
    return { schemaVersion: 1, status: 'planned', capability: 'INSPECT_MEDIA', tool: 'media-inspection', mode: 'inspect_media', source: sourceOf(record),
      declaredMediaKind: kind, backend: { id: 'whihm-media-headers-v1', selection: 'content_signature_at_execution', candidates: kind === 'image' ? ['sharp-metadata'] : ['node-riff-wave-header','node-iso-bmff-header'] }, requirements: profile,
      expectedResultKind: 'media-inspection', providerCost: 0, remoteTransport: false, limitations: [...limitations],
      expectedFields: ['mediaKind','container','fileSize','durationSeconds','bitrate','hasAudio','image','streams','streamCounts','unavailable','validation'], diagnostics: [] };
  });
}
export function inspectMedia({ project, root, assetId, requirements } = {}) {
  return capture(async () => {
    const profile = validateInspectionRequirements(requirements), { record, kind } = await registered(project, assetId);
    const bytes = await readBytes(root, record.path, 'ASSET_NOT_FOUND');
    ensure(bytes.length === record.size && hashBytes(bytes) === record.checksum, 'ASSET_HASH_MISMATCH', 'Asset differs from its registry identity.');
    const inspected = await inspectMediaBuffer(bytes, kind), { facts } = inspected;
    return { schemaVersion: 1, status: 'succeeded', capability: 'INSPECT_MEDIA', tool: 'media-inspection', mode: 'inspect_media',
      source: sourceOf(record), facts, unavailable: inspected.unavailable, validation: validateTechnicalFacts(facts, profile),
      inspection: inspected.inspection, limitations: [...limitations], diagnostics: [] };
  });
}

// Trusted internal bytes only; no path/URL access. Also verifies finishing output before registration.
export async function inspectMediaBuffer(bytes, kind) {
  const { backend, ...facts } = await probeMediaBytes(bytes, kind);
  if (facts.mediaKind !== kind) fail('MEDIA_TYPE_MISMATCH');
  facts.fileSize = bytes.length;
  facts.streamCounts = { video: facts.streams.filter(s => s.type === 'video').length, audio: facts.streams.filter(s => s.type === 'audio').length, other: facts.streams.filter(s => s.type === 'other').length };
  return { schemaVersion: 1, facts, unavailable: unavailable(facts), inspection: { backend, evidence: 'headers_only', decoded: false, remoteTransport: false } };
}

export function getMediaInspectionDescription() {
  return structuredClone({ capability: 'INSPECT_MEDIA', entry: {
    key: 'local:inspect_media:whihm:media-inspection', id: 'media-inspection', label: 'Media Inspection', mode: 'inspect_media', provider: 'whihm', operation: 'inspect',
    runtime: { class: 'local', method: 'inspectMedia', backend: 'whihm-media-headers-v1', requirements: ['Node.js host', 'Existing Sharp dependency for raster images'] },
    binding: { available: true, source: 'host.inspectMedia', code: 'LOCAL_INSPECTION_BOUND', planOperation: 'planMediaInspection', executeOperation: 'inspectMedia', requiresAllowExecution: true, deterministic: true, readOnly: true }, availability: 'available', available: true, assurance: 'reviewed', route: 'local',
    inputs: [{ field: 'assetId', type: 'media', acceptedTypes: ['image','video','audio'], role: 'inspection-source', required: true, isArray: false, projectAsset: true, projectAssetRequired: true }],
    requiredFields: ['assetId'], controls: { requirements: { type: 'object', properties: profileSchema, additionalProperties: false, required: false, projectAsset: false } }, constraints: [{ kind: 'registered_project_asset_only' }],
    projectAssets: [{ field: 'assetId', type: 'media', acceptedTypes: ['image','video','audio'], role: 'inspection-source', array: false }], providerIdentifiers: [],
    result: { kind: 'media-inspection', schemaVersion: 1 }, runtimeVerification: 'unverified', partial: true, limitations,
    evidence: { contractStatus: 'REVIEWED', inputValidation: 'not_evaluated', authorization: 'not_granted', determinism: 'technical_headers_only' },
  } });
}

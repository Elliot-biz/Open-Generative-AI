// Bounded deterministic finishing over registered assets; publication follows verification.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fields, readBytes, hashBytes, MAX_IMPORT_BYTES } from '../../packages/whihm-workflow-core/src/project/io.js';
import { inspectMedia, inspectMediaBuffer } from './media-inspection.mjs';
import { createImageFinisher, FINISH_MAX_PIXELS } from './image-finishing-backend.mjs';
import { createMultimediaFinisher } from './multimedia-finishing-backend.mjs';
import { prepareMultimediaOperation, verifyMultimediaOutput, multimediaOperations, multimediaSpecs, multimediaExportFields, multimediaLimitations, videoWriterSettings, getMultimediaParameterSpecs } from './multimedia-finishing-contract.mjs';
import { getMultimediaRuntimeRequirement } from './multimedia-runtime.mjs';

const dimension = { type: 'integer', minimum: 1, maximum: 8192 };
const specs = {
  outputFormat: { type: 'string', enum: ['png','jpeg','webp'] },
  metadata: { type: 'string', enum: ['strip','preserve'], default: 'strip' },
  width: dimension, height: dimension, left: { type: 'integer', minimum: 0, maximum: 8192 }, top: { type: 'integer', minimum: 0, maximum: 8192 },
  fit: { type: 'string', enum: ['fill','cover'] },
  background: { type: 'string', pattern: '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$' },
  flattenBackground: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  quality: { type: 'integer', minimum: 1, maximum: 100, default: 80 },
  compressionLevel: { type: 'integer', minimum: 0, maximum: 9, default: 6 },
};
const operations = {
  resize: { required: ['width','height','fit'], allowed: ['width','height','fit'] },
  crop: { required: ['left','top','width','height'], allowed: ['left','top','width','height'] },
  contain: { required: ['width','height','background'], allowed: ['width','height','background'] },
  convert: { required: [], allowed: [] },
};
const writers = { png: ['compressionLevel'], jpeg: ['quality','flattenBackground'], webp: ['quality'] };
const limitations = [
  ...multimediaLimitations,
  'Single-page PNG/JPEG/WebP/GIF/TIFF sources; PNG/JPEG/WebP output. Source/output limited to 16,777,216 pixels; output axes at most 8192 and output bytes at most the existing 64 MiB import bound.',
  'EXIF orientation is applied before crop/resize; coordinates use upright display pixels. Cover is fixed centre geometry, not semantic crop. Contain requires explicit background; JPEG alpha removal requires explicit opaque flattenBackground.',
  'Metadata strips by default using Sharp standard sRGB behavior. Explicit preserve keeps metadata supported by the writer, potentially including sensitive EXIF/XMP; orientation/dimensions may be updated. Not every tag is exhaustively verified.',
  'Reproducibility is scoped to identical source bytes, normalized parameters and Sharp/native-library versions. No cross-version/platform byte-identity guarantee. Distinct calls create distinct immutable assets, not cache reuse.',
  '20-second libvips processing timeout plus a 30-second worker wall timer requesting termination; native cancellation/worker shutdown can delay return. Worker owns no output paths. No hard OS process-isolation or real-time deadline guarantee.',
  'No loudness processing, named export presets, max-file-size targeting, semantic editing or provider transport.',
];
const fail = code => { throw Object.assign(new Error(code), { finishingCode: code }); };
function need(value, code) { if (!value) fail(code); }
function checked(result, status) { if (result.status !== status) throw Object.assign(new Error('Existing project/inspection rejected'), { result }); return result; }
function parameterValid(value, spec) {
  return spec.type === 'integer' ? Number.isSafeInteger(value) && value >= spec.minimum && value <= spec.maximum
    : typeof value === 'string' && (!spec.enum || spec.enum.includes(value)) && (!spec.pattern || new RegExp(spec.pattern).test(value));
}
export function validateFinishingRequest(operation, parameters) {
  need(typeof operation === 'string' && Object.hasOwn(operations, operation), 'FINISH_OPERATION_UNSUPPORTED');
  const rule = operations[operation];
  fields(parameters, ['outputFormat', ...rule.required], ['metadata', ...rule.allowed.filter(k => !rule.required.includes(k)), 'quality','compressionLevel','flattenBackground'], 'FINISH_PARAMETERS_INVALID');
  for (const [key, value] of Object.entries(parameters)) need(Object.hasOwn(specs, key) && parameterValid(value, specs[key]), 'FINISH_PARAMETERS_INVALID');
  const format = parameters.outputFormat;
  for (const field of ['quality','compressionLevel','flattenBackground']) need(parameters[field] === undefined || writers[format].includes(field), 'FINISH_WRITER_OPTION_UNSUPPORTED');
  const p = { ...structuredClone(parameters), metadata: parameters.metadata ?? 'strip',
    ...(format === 'png' ? { compressionLevel: parameters.compressionLevel ?? 6 } : { quality: parameters.quality ?? 80 }) };
  for (const key of ['background','flattenBackground']) if (p[key]) p[key] = p[key].toLowerCase();
  need(!(format === 'jpeg' && p.background?.length === 9 && !p.background.endsWith('ff')), 'FINISH_JPEG_BACKGROUND_INVALID');
  return Object.fromEntries(Object.entries(p).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0));
}
async function prepare({ project, root, assetId, operation, parameters }) {
  const source = checked(await inspectMedia({ project, root, assetId }), 'succeeded');
  if(source.facts.mediaKind!=='image') {
    const normalized=prepareMultimediaOperation(source.facts.mediaKind,operation,parameters,source.facts),runtime=getMultimediaRuntimeRequirement();
    return {schemaVersion:1,status:'planned',capability:'FINISH_MEDIA',tool:'media-finishing',mode:'finish_media',source:source.source,
      sourceInspection:source,operation,...normalized,backend:{id:'ffmpeg-media-finishing',profileId:runtime.profileId},runtime,
      execution:{executable:runtime.snapshot.availability==='ready',requiresFreshRuntimeCheck:true,blockingReasons:runtime.snapshot.blockingReasons},
      requiredRuntimeFeatures:runtime.snapshot.baseline.features.filter(f=>f.required).map(f=>f.id),providerCost:0,remoteTransport:false,limitations:[...multimediaLimitations],diagnostics:[]};
  }
  const p = validateFinishingRequest(operation, parameters);
  need(source.facts.mediaKind === 'image', 'FINISH_MEDIA_KIND_UNSUPPORTED');
  const image = source.facts.image, original = image.displayDimensions;
  need(image.pages === 1, 'FINISH_MULTIPAGE_UNSUPPORTED');
  need(original.width * original.height <= FINISH_MAX_PIXELS, 'FINISH_PIXEL_LIMIT');
  const expected = operation === 'convert' ? { width: original.width, height: original.height } : { width: p.width, height: p.height };
  need(expected.width <= 8192 && expected.height <= 8192 && expected.width * expected.height <= FINISH_MAX_PIXELS, 'FINISH_PIXEL_LIMIT');
  if (operation === 'crop') need(p.left + p.width <= original.width && p.top + p.height <= original.height, 'FINISH_CROP_OUT_OF_BOUNDS');
  need(!(p.outputFormat === 'jpeg' && image.hasAlphaChannel !== false && !p.flattenBackground), 'FINISH_JPEG_FLATTEN_REQUIRED');
  return { schemaVersion: 1, status: 'planned', capability: 'FINISH_MEDIA', tool: 'media-finishing', mode: 'finish_media', source: source.source,
    sourceInspection: source, operation, parameters: p, backend: { id: 'sharp-image-finishing', sharpVersion: source.inspection.backend.version },
    expectedOutput: { mediaKind: 'image', container: p.outputFormat, ...expected }, providerCost: 0, remoteTransport: false,
    limitations: [...limitations], diagnostics: [] };
}
async function capture(action) {
  try { return await action(); }
  catch (error) { return error.result ? { schemaVersion: 1, ...error.result } : { schemaVersion: 1, status: 'rejected', diagnostics: [{ code: error.finishingCode || error.inspectionCode || error.diagnostic?.code || 'FINISH_FAILED' }], ...(error.runtime ? { runtime: error.runtime } : {}) }; }
}
export function createMediaFinishing({ transform = createImageFinisher(), multimediaTransform = createMultimediaFinisher() } = {}) {
  return {
    plan: args => capture(() => prepare(args)),
    finish: args => capture(async () => {
      need(args?.allowExecution === true, 'EXECUTION_NOT_AUTHORIZED');
      const plan = await prepare(args), { project, root } = args;
      const bytes = await readBytes(root, plan.source.path, 'ASSET_NOT_FOUND');
      need(hashBytes(bytes) === plan.source.checksum, 'ASSET_HASH_MISMATCH');
      const kind=plan.expectedOutput.mediaKind;
      const transformed = kind==='image' ? await transform(bytes, plan.operation, plan.parameters) : await multimediaTransform(bytes,plan);
      need(Buffer.isBuffer(transformed?.bytes) && transformed.bytes.length > 0 && transformed.bytes.length <= MAX_IMPORT_BYTES && (kind==='image'?transformed.backend?.versions?.sharp:transformed.backend?.versions?.ffmpeg), 'FINISH_BACKEND_OUTPUT_INVALID');
      const inspected = await inspectMediaBuffer(transformed.bytes, kind);
      let checks;
      if(kind==='image') {
        const actual=inspected.facts.image;
        need(inspected.facts.container === plan.expectedOutput.container && actual.pages === 1 && actual.displayDimensions.width === plan.expectedOutput.width && actual.displayDimensions.height === plan.expectedOutput.height, 'FINISH_OUTPUT_VERIFICATION_FAILED');
        need(actual.exifOrientation === null || actual.exifOrientation === 1, 'FINISH_OUTPUT_VERIFICATION_FAILED');
        need(!(plan.parameters.outputFormat === 'jpeg' && actual.hasAlphaChannel), 'FINISH_OUTPUT_VERIFICATION_FAILED');
        checks=['container','dimensions','single_page','normalized_orientation', ...(plan.parameters.outputFormat === 'jpeg' ? ['no_alpha_channel'] : [])];
      } else checks=verifyMultimediaOutput(plan,inspected.facts);
      const lineage = { assetId: plan.source.assetId, checksum: plan.source.checksum };
      const verification={status:'verified',checks,...(plan.verificationTolerance?{tolerances:plan.verificationTolerance}:{})};
      const recipe = { schemaVersion: 1, tool: plan.tool, operation: plan.operation, parameters: plan.parameters, backend: transformed.backend,
        ...(kind!=='image'?{outputInspection:inspected,verification}:{}) };
      // Only verified bytes reach an internal private temporary file and the existing importer.
      let directory, response;
      try {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-finish-'));
        const filename = path.join(directory, `output.${plan.expectedOutput.container}`);
        await fs.writeFile(filename, transformed.bytes, { flag: 'wx', mode: 0o600 });
        const imported = checked(await project.importAsset({ sourcePath: filename, contentType: kind==='image'?`image/${plan.parameters.outputFormat}`:kind==='audio'?'audio/wav':plan.parameters.container==='mov'?'video/quicktime':'video/mp4', role: `derived-${kind}`, source: lineage, metadata: { deterministicFinishing: recipe } }), 'imported');
        need(imported.asset.checksum === hashBytes(transformed.bytes) && imported.asset.size === transformed.bytes.length, 'FINISH_OUTPUT_IDENTITY_MISMATCH');
        response = { schemaVersion: 1, status: 'succeeded', capability: plan.capability, tool: plan.tool, mode: plan.mode, source: plan.source,
          operation: plan.operation, parameters: plan.parameters, backend: transformed.backend,
          output: { assetId: imported.asset.assetId, path: imported.asset.path, contentType: imported.asset.contentType, checksum: imported.asset.checksum, size: imported.asset.size,
            inspection: inspected, verification },
          lineage, diagnostics: [], warnings: imported.warnings ?? [] };
        return response;
      } finally {
        if (directory) try { await fs.rm(directory, { recursive: true, force: true }); }
        catch { if (response) response.warnings.push({ code: 'FINISH_TEMP_CLEANUP_REQUIRED' }); else fail('FINISH_TEMP_CLEANUP_REQUIRED'); }
      }
    }),
  };
}
const finishing = createMediaFinishing();
export const planMediaFinishing = args => finishing.plan(args);
export const finishMedia = args => finishing.finish(args);

function multimediaScope(kind) {
  const runtime=getMultimediaRuntimeRequirement();
  return {implemented:true,availability:runtime.snapshot.availability==='ready'?'runtime_gated':'runtime_blocked',backend:'ffmpeg-media-finishing',
    requiredRuntime:runtime.id,profileId:runtime.profileId,requiresFreshRuntimeCheck:true,operations:multimediaOperations[kind],exportFields:multimediaExportFields[kind],parameterProperties:getMultimediaParameterSpecs(kind),...(kind==='video'?{writerSettings:videoWriterSettings}:{})};
}
export function getMediaFinishingDescription() {
  return structuredClone({ capability: 'FINISH_MEDIA', entry: {
    key: 'local:finish_media:whihm:media-finishing', id: 'media-finishing', label: 'Deterministic Media Finishing', mode: 'finish_media', provider: 'whihm', operation: 'finish',
    runtime: { class: 'local', method: 'finishMedia', backend: 'media-kind-selected', requirements: ['Node.js/Electron trusted host', 'Backend requirements depend on selected media scope'],
      scopes: { image: { implemented: true, availability: 'available', backend: 'sharp-image-finishing', requirements:['worker_threads','Existing Sharp and native libraries'] }, video: multimediaScope('video'), audio: multimediaScope('audio') },
      multimedia: getMultimediaRuntimeRequirement() },
    binding: { available: true, source: 'host.finishMedia', code: 'LOCAL_FINISHING_BOUND', planOperation: 'planMediaFinishing', executeOperation: 'finishMedia', requiresAllowExecution: true, deterministic: true, readOnly: false },
    available: true, availability: 'available', assurance: 'reviewed', route: 'local', runtimeVerification: 'unverified', partial: true,
    inputs: [{ field: 'assetId', type: 'media', acceptedTypes: ['image','video','audio'], role: 'finishing-source', required: true, isArray: false, projectAsset: true, projectAssetRequired: true }],
    requiredFields: ['assetId','operation','parameters'], controls: { operation: { type: 'string', enum: [...new Set([...Object.keys(operations),...Object.keys(multimediaOperations.video),...Object.keys(multimediaOperations.audio)])], required: true, projectAsset: false },
      parameters: { type: 'object', properties: { ...multimediaSpecs, ...specs }, additionalProperties: false, required: true, projectAsset: false } },
    constraints: [{kind:'media_operation_parameters',mediaKind:'video',properties:getMultimediaParameterSpecs('video'),operations:multimediaOperations.video,exports:multimediaExportFields.video},{kind:'media_operation_parameters',mediaKind:'audio',properties:getMultimediaParameterSpecs('audio'),operations:multimediaOperations.audio,exports:multimediaExportFields.audio},{ kind: 'operation_parameters', mediaKind:'image', properties:specs, commonRequired: ['outputFormat'], operations, writers }, { kind: 'registered_project_asset_only' }, { kind: 'single_page_only', mediaKind:'image' }, { kind: 'pixel_limit', mediaKinds:['image','video'], maximum: FINISH_MAX_PIXELS }],
    projectAssets: [{ field: 'assetId', type: 'media', acceptedTypes: ['image','video','audio'], role: 'finishing-source', array: false }], providerIdentifiers: [], result: { kind: 'derived-project-media', variants: ['derived-project-image','derived-project-video','derived-project-audio'], inspectionSchemaVersion: 1 },
    limitations, evidence: { contractStatus: 'REVIEWED', inputValidation: 'not_evaluated', authorization: 'not_granted' },
  } });
}

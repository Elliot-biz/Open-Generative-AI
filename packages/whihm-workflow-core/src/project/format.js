import { ensure, fields, object, validId, uuid, validHash, iso, safeData, relative } from './io.js';
export const PROJECT_VERSION = 1;
export const DIRECTORIES = Object.freeze(Object.fromEntries(['workflows', 'history', 'assets', 'presets', 'review', 'exports'].map(name => [name, name])));
const collections = ['workflows', 'assets', 'presets', 'reviews', 'exports'];
export function validateManifest(manifest, expectedProjectId) {
  ensure(object(manifest), 'PROJECT_MANIFEST_INVALID', 'Expected a project manifest object.');
  ensure(manifest.projectSchemaVersion === PROJECT_VERSION, 'PROJECT_VERSION_UNSUPPORTED', 'Only project schema version 1 is supported.');
  fields(manifest, ['projectSchemaVersion', 'projectId', 'title', 'description', 'createdAt', 'updatedAt', 'tags', 'directories', 'compatibility', 'mainWorkflowId', 'workflows', 'assets', 'presets', 'reviews', 'exports', 'metadata']);
  safeData(manifest);
  ensure(uuid(manifest.projectId) && (!expectedProjectId || expectedProjectId === manifest.projectId), 'PROJECT_ID_MISMATCH', 'Project identity is invalid or differs from the opened project.');
  ensure(typeof manifest.title === 'string' && manifest.title.trim() && typeof manifest.description === 'string' && iso(manifest.createdAt) && iso(manifest.updatedAt) && manifest.updatedAt >= manifest.createdAt && Array.isArray(manifest.tags) && manifest.tags.every(t => typeof t === 'string') && object(manifest.metadata), 'PROJECT_MANIFEST_INVALID', 'Invalid project properties.');
  fields(manifest.directories, Object.keys(DIRECTORIES));
  ensure(Object.entries(DIRECTORIES).every(([key, value]) => manifest.directories[key] === value), 'PROJECT_PATH_UNSAFE', 'V1 requires the standard relative directory declarations.');
  fields(manifest.compatibility, ['workflowSchemaVersion', 'historySchemaVersion']);
  ensure(manifest.compatibility.workflowSchemaVersion === 1 && manifest.compatibility.historySchemaVersion === 1, 'PROJECT_VERSION_UNSUPPORTED', 'Unsupported workflow/history compatibility version.');
  const paths = new Set();
  for (const group of collections) {
    ensure(Array.isArray(manifest[group]), 'PROJECT_MANIFEST_INVALID', 'Registries must be arrays.');
    const ids = new Set(), singular = { workflows: 'workflow', assets: 'asset', presets: 'preset', reviews: 'review', exports: 'export' }[group];
    const code = { workflows: 'WORKFLOW_DUPLICATE', assets: 'ASSET_DUPLICATE', presets: 'PRESET_DUPLICATE', reviews: 'REVIEW_DUPLICATE', exports: 'EXPORT_DUPLICATE' }[group];
    for (const record of manifest[group]) {
      if (group === 'assets') validateAsset(record);
      else if (group === 'exports') validateExport(record);
      else {
        fields(record, [`${singular}Id`, 'path', 'hash']);
        ensure(validId(record[`${singular}Id`]) && validHash(record.hash), 'PROJECT_MANIFEST_INVALID', 'Invalid registry identity or hash.');
        relative(record.path, group === 'reviews' ? 'review' : group);
      }
      ensure(!ids.has(record[`${singular}Id`]), code, 'Duplicate registry identity.'); ids.add(record[`${singular}Id`]);
      // Assets may share byte-identical files only via reuse of their original record.
      ensure(!paths.has(record.path), 'PROJECT_MANIFEST_INVALID', 'Multiple registry entries cannot own the same path.'); paths.add(record.path);
    }
  }
  ensure(manifest.mainWorkflowId === null || manifest.workflows.some(w => w.workflowId === manifest.mainWorkflowId), 'WORKFLOW_REFERENCED_REMOVE_BLOCKED', 'Main workflow must be registered.');
}
export function validateAsset(record) {
  fields(record, ['assetId', 'path', 'contentType', 'role', 'originalFilename', 'checksum', 'size', 'source', 'metadata'], [], 'ASSET_INVALID');
  ensure(validId(record.assetId) && typeof record.contentType === 'string' && typeof record.role === 'string' && typeof record.originalFilename === 'string' && !/[\\/]/.test(record.originalFilename) && validHash(record.checksum) && Number.isSafeInteger(record.size) && record.size >= 0 && object(record.source) && object(record.metadata), 'ASSET_INVALID', 'Malformed asset registry record.');
  relative(record.path, 'assets'); safeData(record, 'ASSET_INVALID');
}
export function validatePreset(record) {
  fields(record, ['presetId', 'title', 'type', 'version', 'data', 'metadata'], [], 'PRESET_INVALID');
  ensure(validId(record.presetId) && typeof record.title === 'string' && record.title.trim() && typeof record.type === 'string' && record.type.trim() && Number.isSafeInteger(record.version) && record.version > 0 && object(record.metadata), 'PRESET_INVALID', 'Malformed preset.');
  safeData(record, 'PRESET_INVALID');
}
export function validateReview(record) {
  fields(record, ['reviewId', 'workflowId', 'runId', 'outputId', 'assetIds', 'presetIds', 'status', 'notes', 'timestamp', 'metadata'], [], 'REVIEW_INVALID');
  ensure(validId(record.reviewId) && ['workflowId', 'runId', 'outputId'].every(k => record[k] === null || validId(record[k])) && ['assetIds', 'presetIds'].every(k => Array.isArray(record[k]) && record[k].every(validId)) && typeof record.status === 'string' && record.status.trim() && typeof record.notes === 'string' && iso(record.timestamp) && object(record.metadata), 'REVIEW_INVALID', 'Malformed review record.');
  safeData(record, 'REVIEW_INVALID');
}
export function validateExport(record) {
  fields(record, ['exportId', 'path', 'workflowId', 'contentType', 'checksum', 'size', 'timestamp', 'metadata'], [], 'EXPORT_INVALID');
  ensure(validId(record.exportId) && (record.workflowId === null || validId(record.workflowId)) && typeof record.contentType === 'string' && validHash(record.checksum) && Number.isSafeInteger(record.size) && record.size >= 0 && iso(record.timestamp) && object(record.metadata), 'EXPORT_INVALID', 'Malformed export metadata.');
  relative(record.path, 'exports'); safeData(record, 'EXPORT_INVALID');
}
// Explicit conventional reference fields only; arbitrary strings are not inferred.
export function references(value) {
  const found = [];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    for (const [key, child] of Object.entries(v)) {
      const types = { assetId: 'asset', assetIds: 'asset', assetRefs: 'asset', presetId: 'preset', presetIds: 'preset', workflowId: 'workflow', reviewId: 'review', exportId: 'export' };
      const type = Object.hasOwn(types, key) ? types[key] : null;
      if (type) for (const id of Array.isArray(child) ? child : [child]) if (typeof id === 'string') found.push({ type, id });
      walk(child);
    }
  }
  walk(value); return found;
}

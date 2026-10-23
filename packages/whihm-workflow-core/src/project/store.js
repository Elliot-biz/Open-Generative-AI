import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exportWorkflow, importWorkflow } from '../index.js';
import { validateWorkflow } from '../validate.js';
import { hashWorkflow } from '../diff.js';
import { createHistoryStore } from '../history/store.js';
import { PROJECT_VERSION, DIRECTORIES, validateManifest, validateAsset, validatePreset, validateReview, validateExport, references } from './format.js';
import { ensure, capture, hashBytes, encode, fields, safeData, relative, exists, rootLocation, local, readBytes, readJSON, atomic, locked, safeFileContent, MAX_IMPORT_BYTES } from './io.js';

const ok = (data = {}, status = 'ok') => ({ status, ...data, diagnostics: [] });
const withId = (prefix, value) => value ?? `${prefix}_${randomUUID()}`;
const registries = { workflow: 'workflows', asset: 'assets', preset: 'presets', review: 'reviews', export: 'exports' };
function checkReferences(data, manifest, code = 'PROJECT_REFERENCE_INVALID', additionalAssets = []) {
  for (const { type, id } of references(data)) ensure(manifest[registries[type]].some(item => item[`${type}Id`] === id) || (type === 'asset' && additionalAssets.includes(id)), code, 'A declared project reference does not exist.');
}
function checkWorkflow(doc, manifest) {
  ensure(validateWorkflow(doc).valid, 'WORKFLOW_INVALID', 'Invalid canonical workflow.');
  safeData(doc, 'WORKFLOW_INVALID');
  for (const asset of doc.assets) {
    if (!asset.localPath) continue;
    relative(asset.localPath, 'assets');
    const registered = manifest.assets.find(a => a.assetId === asset.id && a.path === asset.localPath);
    ensure(registered, 'ASSET_NOT_FOUND', 'Workflow local assets must reference matching registered project assets.');
    if (asset.checksum) ensure(asset.checksum.value.toLowerCase() === registered.checksum, 'ASSET_HASH_MISMATCH', 'Workflow asset checksum differs from registry.');
  }
  checkReferences(doc, manifest, 'PROJECT_REFERENCE_INVALID', doc.assets.map(a => a.id));
}
async function openHistory(root) {
  ensure(await exists(await local(root, 'history/store.json')), 'HISTORY_INTEGRITY_FAILED', 'Project history store metadata is missing.');
  const opened = await createHistoryStore(await local(root, 'history'));
  ensure(opened.status === 'ready', opened.diagnostics?.some(d => d.code === 'HISTORY_STORE_BUSY') ? 'PROJECT_BUSY' : 'HISTORY_INTEGRITY_FAILED', 'Existing history store could not be opened.');
  return opened.store;
}
async function inspect(root, expectedId, options = {}) {
  ensure(!await exists(await local(root, '.project-incomplete')) || options.allowIncomplete, 'PROJECT_INTEGRITY_FAILED', 'Project initialization/copy did not finish.');
  const manifest = await readJSON(root, 'project.json', 'PROJECT_NOT_FOUND', 'PROJECT_MANIFEST_INVALID');
  validateManifest(manifest, expectedId);
  for (const name of Object.values(DIRECTORIES)) {
    const dir = await local(root, name);
    ensure(await exists(dir) && (await fs.lstat(dir)).isDirectory(), name === 'history' ? 'HISTORY_INTEGRITY_FAILED' : 'PROJECT_INTEGRITY_FAILED', 'Required project directory is missing.');
  }
  const files = new Set(['project.json', 'history/store.json']), docs = { workflows: new Map(), presets: new Map(), reviews: new Map() };
  for (const asset of manifest.assets) {
    const bytes = await readBytes(root, asset.path, 'ASSET_NOT_FOUND');
    ensure(bytes.length === asset.size && hashBytes(bytes) === asset.checksum, 'ASSET_HASH_MISMATCH', 'Asset content differs from its registered checksum/size.');
    safeFileContent(bytes, asset.originalFilename); checkReferences(asset.source, manifest); checkReferences(asset.metadata, manifest); files.add(asset.path);
  }
  for (const group of ['workflows', 'presets', 'reviews']) {
    const identity = { workflows: 'workflowId', presets: 'presetId', reviews: 'reviewId' }[group];
    const invalid = { workflows: 'WORKFLOW_INVALID', presets: 'PRESET_INVALID', reviews: 'REVIEW_INVALID' }[group];
    for (const ref of manifest[group]) {
      const bytes = await readBytes(root, ref.path, group === 'workflows' ? 'WORKFLOW_NOT_FOUND' : invalid);
      let doc;
      try { doc = group === 'workflows' ? importWorkflow(bytes.toString('utf8')) : JSON.parse(bytes.toString('utf8')); }
      catch { ensure(false, invalid, 'Invalid registered JSON document.'); }
      if (group === 'workflows') checkWorkflow(doc, manifest);
      else { (group === 'presets' ? validatePreset : validateReview)(doc); checkReferences(doc, manifest); }
      ensure(doc[identity] === ref[identity], invalid, 'File identity does not match manifest identity.');
      ensure((group === 'workflows' ? hashWorkflow(doc) : hashBytes(encode(doc))) === ref.hash, invalid, 'Registered document hash differs from manifest.');
      docs[group].set(ref[identity], doc); files.add(ref.path);
    }
  }
  for (const record of manifest.exports) {
    checkReferences(record, manifest);
    const bytes = await readBytes(root, record.path, 'EXPORT_NOT_FOUND');
    ensure(bytes.length === record.size && hashBytes(bytes) === record.checksum, 'EXPORT_HASH_MISMATCH', 'Registered export content differs.');
    safeFileContent(bytes, record.path); files.add(record.path);
  }
  checkReferences(manifest.metadata, manifest);
  const history = options.history ?? await openHistory(root), historyRecords = new Map(), historicalWorkflows = [], warnings = [];
  for (const ref of manifest.workflows) {
    const result = await history.listHistory(ref.workflowId);
    ensure(result.status === 'ok', 'HISTORY_INTEGRITY_FAILED', 'Workflow history failed integrity verification.');
    historyRecords.set(ref.workflowId, result.records); warnings.push(...result.warnings);
    const latest = result.records.at(-1);
    ensure(!latest || latest.afterHash === ref.hash || options.ignoreHistoryDrift === ref.workflowId, 'HISTORY_WORKFLOW_STATE_MISMATCH', 'Stored workflow differs from history head; reconcile using an explicit expected-hash workflow update.');
    if (latest && latest.afterHash !== ref.hash) warnings.push({ code: 'HISTORY_WORKFLOW_STATE_MISMATCH', path: '', message: 'Explicit reconciliation requested; update the workflow to the verified history head before normal use.' });
    // Existing documented history v1 namespace; records/snapshots are verified by its API.
    const base = `history/workflows/${hashBytes(ref.workflowId)}`;
    if (await exists(await local(root, `${base}/manifest.json`))) files.add(`${base}/manifest.json`);
    for (const record of result.records) {
      files.add(`${base}/records/${record.recordId}.json`);
      for (const side of ['before', 'after']) {
        const snapshot = await history.getWorkflowAtRecord(ref.workflowId, record.recordId, side);
        ensure(snapshot.status === 'ok', 'HISTORY_INTEGRITY_FAILED', 'Historical workflow cannot be reconstructed.');
        checkWorkflow(snapshot.workflow, manifest); historicalWorkflows.push(snapshot.workflow);
        files.add(`${base}/${record[`${side}Snapshot`]}`);
      }
    }
  }
  const namespaces = await local(root, 'history/workflows');
  if (await exists(namespaces)) for (const name of await fs.readdir(namespaces)) ensure(manifest.workflows.some(w => hashBytes(w.workflowId) === name), 'HISTORY_INTEGRITY_FAILED', 'History exists for an unregistered workflow; preserve and reconcile it.');
  return { manifest, docs, files, history, historyRecords, historicalWorkflows, warnings };
}
function referenced(state, type, id, exclude) {
  const contents = [state.manifest.metadata, ...state.manifest.assets.map(a => a.metadata), ...state.manifest.assets.map(a => a.source), ...state.manifest.exports, ...state.historicalWorkflows, ...state.docs.workflows.values(), ...state.docs.presets.values(), ...state.docs.reviews.values()];
  return contents.filter(value => value !== exclude).some(value => references(value).some(ref => ref.type === type && ref.id === id));
}
function attach(root, projectId, history) {
  const load = options => inspect(root, projectId, { history, ...options });
  async function commit(state) {
    state.manifest.updatedAt = new Date(Math.max(Date.now(), Date.parse(state.manifest.updatedAt))).toISOString();
    validateManifest(state.manifest, projectId);
    return atomic(root, 'project.json', encode(state.manifest), { replace: true });
  }
  const read = fn => capture(null, async () => fn(await load()));
  const write = (input, fn, options = {}) => capture(input, value => locked(root, () => locked(path.join(root, 'history'), async () => {
    const state = await load(options);
    return fn(value, state);
  }, '.write-lock')));
  async function saveJSON(state, group, idKey, doc, update, expectedHash) {
    const refs = state.manifest[group], existing = refs.find(ref => ref[idKey] === doc[idKey]);
    const code = group === 'workflows' ? 'WORKFLOW' : group === 'presets' ? 'PRESET' : 'REVIEW';
    ensure(update ? existing : !existing, update ? `${code}_NOT_FOUND` : `${code}_DUPLICATE`, 'Registry identity already exists or is missing.');
    if (update) ensure(expectedHash === existing.hash, 'PROJECT_STALE_STATE', 'Expected document hash does not match the current registry.');
    const bytes = group === 'workflows' ? exportWorkflow(doc) : encode(doc);
    const ref = { [idKey]: doc[idKey], path: `${group === 'reviews' ? 'review' : group}/${randomUUID()}.json`, hash: group === 'workflows' ? hashWorkflow(doc) : hashBytes(bytes) };
    if (update) refs.splice(refs.indexOf(existing), 1, ref); else refs.push(ref);
    if (group === 'workflows') {
      checkWorkflow(doc, state.manifest);
      const latest = state.historyRecords.get(doc.workflowId)?.at(-1);
      ensure(!latest || latest.afterHash === ref.hash, 'HISTORY_WORKFLOW_STATE_MISMATCH', 'Record the matching edit/rollback in history before updating the registered workflow.');
    } else checkReferences(doc, state.manifest);
    const warnings = await atomic(root, ref.path, bytes);
    warnings.push(...await commit(state));
    return ok({ projectId, ...ref, warnings }, update ? 'updated' : 'added');
  }
  const api = {
    getManifest() { return read(state => ok({ manifest: state.manifest })); },
    updateProjectMetadata(input) { return write(input, async (value, state) => {
      fields(value, [], ['title', 'description', 'tags', 'metadata', 'mainWorkflowId']); safeData(value);
      Object.assign(state.manifest, value); validateManifest(state.manifest, projectId); checkReferences(state.manifest.metadata, state.manifest);
      return ok({ projectId, manifest: state.manifest, warnings: await commit(state) }, 'updated');
    }); },
    addWorkflowToProject(workflow) { return write(workflow, (doc, state) => {
      ensure(validateWorkflow(doc).valid, 'WORKFLOW_INVALID', 'Invalid canonical workflow.');
      return saveJSON(state, 'workflows', 'workflowId', doc, false);
    }); },
    updateWorkflowInProject(input) { return write(input, (value, state) => {
      fields(value, ['workflow', 'expectedHash']);
      ensure(validateWorkflow(value.workflow).valid, 'WORKFLOW_INVALID', 'Invalid canonical workflow.');
      return saveJSON(state, 'workflows', 'workflowId', value.workflow, true, value.expectedHash);
    }, { ignoreHistoryDrift: input?.workflow?.workflowId }); },
    getProjectWorkflow(id) { return read(state => {
      const workflow = state.docs.workflows.get(id); ensure(workflow, 'WORKFLOW_NOT_FOUND', 'Workflow is not registered.');
      return ok({ workflow, hash: hashWorkflow(workflow) });
    }); },
    listProjectWorkflows() { return read(state => ok({ workflows: state.manifest.workflows })); },
    removeWorkflowFromProject(id) { return write(id, async (value, state) => {
      const doc = state.docs.workflows.get(value); ensure(doc, 'WORKFLOW_NOT_FOUND', 'Workflow is not registered.');
      ensure(state.manifest.mainWorkflowId !== value && !referenced(state, 'workflow', value, doc) && !state.historyRecords.get(value)?.length, 'WORKFLOW_REFERENCED_REMOVE_BLOCKED', 'Workflow has active project references or durable history.');
      state.manifest.workflows = state.manifest.workflows.filter(w => w.workflowId !== value);
      return ok({ workflowId: value, warnings: await commit(state) }, 'removed');
    }); },
    getProjectHistory(id) { return read(state => {
      ensure(state.docs.workflows.has(id), 'WORKFLOW_NOT_FOUND', 'Workflow is not registered.');
      return ok({ workflowId: id, relativeRoot: 'history', store: history });
    }); },
    importAsset(input) { return write(input, async (value, state) => {
      fields(value, ['sourcePath'], ['assetId', 'contentType', 'role', 'source', 'metadata']);
      ensure(typeof value.sourcePath === 'string', 'PROJECT_PATH_UNSAFE', 'A source file is required.');
      const source = path.resolve(value.sourcePath);
      ensure(!source.split(/[\\/]/).some(segment => /^(?:\.git|node_modules|\.next|credentials?|tokens?|\.aws|\.ssh)$/i.test(segment)), 'ASSET_UNSAFE_CONTENT', 'Source belongs to excluded credential/development data.');
      const stat = await fs.lstat(source);
      ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_IMPORT_BYTES, 'ASSET_INVALID', 'V1 import requires a regular file no larger than 64 MiB.');
      const bytes = await fs.readFile(source); ensure(bytes.length <= MAX_IMPORT_BYTES, 'ASSET_INVALID', 'Asset grew beyond the import limit.');
      const filename = path.basename(source); safeFileContent(bytes, filename);
      const record = { assetId: withId('asset', value.assetId), path: `assets/${randomUUID()}.bin`, contentType: value.contentType ?? 'application/octet-stream', role: value.role ?? 'generic', originalFilename: filename, checksum: hashBytes(bytes), size: bytes.length, source: value.source ?? {}, metadata: value.metadata ?? {} };
      validateAsset(record);
      ensure(!state.manifest.assets.some(a => a.assetId === record.assetId), 'ASSET_DUPLICATE', 'Asset ID already exists.');
      // Distinct logical roles are retained even for identical bytes; no surprising metadata merge.
      const warnings = await atomic(root, record.path, bytes);
      state.manifest.assets.push(record); checkReferences(record.source, state.manifest); checkReferences(record.metadata, state.manifest); warnings.push(...await commit(state));
      return ok({ asset: record, assetId: record.assetId, warnings }, 'imported');
    }); },
    listProjectAssets() { return read(state => ok({ assets: state.manifest.assets })); },
    getProjectAsset(id) { return read(state => { const asset = state.manifest.assets.find(a => a.assetId === id); ensure(asset, 'ASSET_NOT_FOUND', 'Asset is not registered.'); return ok({ asset }); }); },
    resolveProjectAssetPath(id) { return read(async state => {
      const asset = state.manifest.assets.find(a => a.assetId === id); ensure(asset, 'ASSET_NOT_FOUND', 'Asset is not registered.');
      return ok({ assetId: id, relativePath: asset.path, resolvedPath: await local(root, asset.path) });
    }); },
    removeProjectAsset(id) { return write(id, async (value, state) => {
      const asset = state.manifest.assets.find(a => a.assetId === value); ensure(asset, 'ASSET_NOT_FOUND', 'Asset is not registered.');
      let used = referenced(state, 'asset', value);
      for (const doc of state.docs.workflows.values()) used ||= doc.assets.some(a => a.id === value || a.localPath === asset.path);
      for (const doc of state.historicalWorkflows) used ||= doc.assets.some(a => a.id === value || a.localPath === asset.path);
      ensure(!used, 'ASSET_REFERENCED_REMOVE_BLOCKED', 'Asset is referenced by active or historical project data.');
      state.manifest.assets = state.manifest.assets.filter(a => a.assetId !== value);
      return ok({ assetId: value, warnings: await commit(state) }, 'removed');
    }); },
    addPreset(input) { return write(input, (value, state) => {
      const doc = { ...value, presetId: withId('preset', value.presetId), metadata: value.metadata ?? {} }; validatePreset(doc);
      return saveJSON(state, 'presets', 'presetId', doc, false);
    }); },
    updatePreset(input) { return write(input, (value, state) => {
      fields(value, ['preset', 'expectedHash']); validatePreset(value.preset);
      return saveJSON(state, 'presets', 'presetId', value.preset, true, value.expectedHash);
    }); },
    getPreset(id) { return read(state => { const preset = state.docs.presets.get(id); ensure(preset, 'PRESET_NOT_FOUND', 'Preset is not registered.'); return ok({ preset, hash: state.manifest.presets.find(p => p.presetId === id).hash }); }); },
    listPresets() { return read(state => ok({ presets: [...state.docs.presets.values()] })); },
    removePreset(id) { return write(id, async (value, state) => {
      const doc = state.docs.presets.get(value); ensure(doc, 'PRESET_NOT_FOUND', 'Preset is not registered.');
      ensure(!referenced(state, 'preset', value, doc), 'PRESET_REFERENCED_REMOVE_BLOCKED', 'Preset has active project references.');
      state.manifest.presets = state.manifest.presets.filter(p => p.presetId !== value);
      return ok({ presetId: value, warnings: await commit(state) }, 'removed');
    }); },
    addReview(input) { return write(input, (value, state) => {
      const record = { reviewId: withId('review', value.reviewId), workflowId: null, runId: null, outputId: null, assetIds: [], presetIds: [], notes: '', timestamp: new Date().toISOString(), metadata: {}, ...value };
      validateReview(record); return saveJSON(state, 'reviews', 'reviewId', record, false);
    }); },
    getReview(id) { return read(state => { const review = state.docs.reviews.get(id); ensure(review, 'REVIEW_NOT_FOUND', 'Review is not registered.'); return ok({ review }); }); },
    listReviews() { return read(state => ok({ reviews: [...state.docs.reviews.values()] })); },
    generateExportPath(extension = 'bin') { return read(async () => {
      ensure(typeof extension === 'string' && /^[a-zA-Z0-9]{1,10}$/.test(extension), 'PROJECT_PATH_UNSAFE', 'Expected a short extension, not a filename/path.');
      const exportId = withId('export'), relativePath = `exports/${randomUUID()}.${extension.toLowerCase()}`;
      return ok({ exportId, relativePath, resolvedPath: await local(root, relativePath) });
    }); },
    recordExport(input) { return write(input, async (value, state) => {
      fields(value, ['path'], ['exportId', 'workflowId', 'contentType', 'metadata']); relative(value.path, 'exports');
      const bytes = await readBytes(root, value.path, 'EXPORT_NOT_FOUND'); safeFileContent(bytes, value.path);
      const record = { exportId: withId('export', value.exportId), path: value.path, workflowId: value.workflowId ?? null, contentType: value.contentType ?? 'application/octet-stream', checksum: hashBytes(bytes), size: bytes.length, timestamp: new Date().toISOString(), metadata: value.metadata ?? {} };
      validateExport(record); ensure(!state.manifest.exports.some(e => e.exportId === record.exportId || e.path === record.path), 'EXPORT_DUPLICATE', 'Export identity/path already exists.');
      state.manifest.exports.push(record); checkReferences(record, state.manifest);
      return ok({ export: record, warnings: await commit(state) }, 'recorded');
    }); },
    listExports() { return read(state => ok({ exports: state.manifest.exports })); },
    verifyProjectIntegrity() { return verifyProjectIntegrity(root, { expectedProjectId: projectId }); },
  };
  return api;
}

export function createProject(rootPath, options = {}) {
  return capture({ rootPath, options }, async input => {
    const root = await rootLocation(input.rootPath, false), value = input.options;
    fields(value, ['title'], ['description', 'tags', 'metadata']); safeData(value);
    const now = new Date().toISOString();
    const manifest = { projectSchemaVersion: PROJECT_VERSION, projectId: randomUUID(), title: value.title, description: value.description ?? '', createdAt: now, updatedAt: now, tags: value.tags ?? [], directories: { ...DIRECTORIES }, compatibility: { workflowSchemaVersion: 1, historySchemaVersion: 1 }, mainWorkflowId: null, workflows: [], assets: [], presets: [], reviews: [], exports: [], metadata: value.metadata ?? {} };
    validateManifest(manifest);
    await fs.mkdir(path.dirname(root), { recursive: true });
    try { await fs.mkdir(root); } catch (e) { if (e.code === 'EEXIST') ensure(false, 'PROJECT_ALREADY_EXISTS', 'Creation requires a new directory; existing data is never overwritten.'); throw e; }
    await atomic(root, '.project-incomplete', 'initializing\n');
    for (const name of Object.values(DIRECTORIES)) await fs.mkdir(await local(root, name));
    const opened = await createHistoryStore(await local(root, 'history'));
    ensure(opened.status === 'ready', 'HISTORY_INTEGRITY_FAILED', 'Could not initialize project history.');
    const warnings = await atomic(root, 'project.json', encode(manifest));
    await inspect(root, manifest.projectId, { history: opened.store, allowIncomplete: true });
    await fs.unlink(await local(root, '.project-incomplete'));
    return ok({ projectId: manifest.projectId, manifest, project: attach(root, manifest.projectId, opened.store), warnings }, 'created');
  });
}
export function openProject(rootPath, { expectedProjectId, reconcileWorkflowId } = {}) {
  return capture({ rootPath, expectedProjectId, reconcileWorkflowId }, async input => {
    const root = await rootLocation(input.rootPath), state = await inspect(root, input.expectedProjectId, { ignoreHistoryDrift: input.reconcileWorkflowId });
    return ok({ projectId: state.manifest.projectId, manifest: state.manifest, project: attach(root, state.manifest.projectId, state.history), warnings: state.warnings }, 'opened');
  });
}
export async function verifyProjectIntegrity(rootPath, options = {}) {
  const result = await openProject(rootPath, { expectedProjectId: options.expectedProjectId });
  return result.status === 'opened' ? ok({ projectId: result.projectId, warnings: result.warnings }, 'valid') : { ...result, status: 'invalid' };
}

/** Directory-only transfer. An incomplete destination is never opened as valid. */
export function exportProjectData(sourceRoot, destinationRoot) {
  return capture({ sourceRoot, destinationRoot }, async input => {
    const source = await rootLocation(input.sourceRoot), destination = await rootLocation(input.destinationRoot, false);
    const within = (a, b) => { const p = path.relative(a, b); return p === '' || (!p.startsWith(`..${path.sep}`) && p !== '..' && !path.isAbsolute(p)); };
    ensure(!within(source, destination) && !within(destination, source), 'PROJECT_PATH_UNSAFE', 'Source and destination must be separate project trees.');
    ensure(!await exists(destination), 'PROJECT_DESTINATION_EXISTS', 'Destination must not already exist.');
    const initial = await inspect(source);
    return locked(source, () => locked(path.join(source, 'history'), async () => {
      const state = await inspect(source, initial.manifest.projectId, { history: initial.history });
      await fs.mkdir(path.dirname(destination), { recursive: true });
      try { await fs.mkdir(destination); } catch (e) { if (e.code === 'EEXIST') ensure(false, 'PROJECT_DESTINATION_EXISTS', 'Destination was created by another writer.'); throw e; }
      await atomic(destination, '.project-incomplete', 'copying\n');
      const warnings = [];
      try {
        for (const name of Object.values(DIRECTORIES)) await fs.mkdir(await local(destination, name));
        for (const file of [...state.files].filter(f => f !== 'project.json').sort()) warnings.push(...await atomic(destination, file, await readBytes(source, file)));
        warnings.push(...await atomic(destination, 'project.json', encode(state.manifest)));
        await inspect(destination, state.manifest.projectId, { allowIncomplete: true });
        await fs.unlink(await local(destination, '.project-incomplete'));
        const reopened = await openProject(destination, { expectedProjectId: state.manifest.projectId });
        ensure(reopened.status === 'opened', 'PROJECT_COPY_FAILED', 'Destination failed final integrity verification.');
        return ok({ projectId: state.manifest.projectId, manifest: reopened.manifest, warnings: [...warnings, ...reopened.warnings] }, 'copied');
      } catch { ensure(false, 'PROJECT_COPY_FAILED', 'Copy did not finish; source is unchanged. Preserve the destination for inspection.'); }
    }, '.write-lock'));
  });
}
export const importProjectData = exportProjectData;
export { PROJECT_VERSION };

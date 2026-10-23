import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  createProject, openProject, verifyProjectIntegrity, exportProjectData, importProjectData,
  createWorkflow, applyEditBatch, hashWorkflow, exportWorkflow, diffWorkflows,
} from '../src/index.js';
const good = (result, status = 'ok') => { assert.equal(result.status, status, JSON.stringify(result)); return result; };
const bad = (result, code) => { assert.ok(['rejected', 'invalid'].includes(result.status), JSON.stringify(result)); assert.ok(result.diagnostics.some(d => d.code === code), JSON.stringify(result)); return result; };
const hash = value => createHash('sha256').update(value).digest('hex');
const workflow = () => createWorkflow({ workflowId: 'portable_job', name: 'Portable job' });
const node = { id: 'clip', title: 'Clip', kind: 'media', executor: { type: 'utility', id: 'whihm.trim', tool: 'trim', mayCostMoney: false, requiresConfirmation: false }, inputs: [], outputs: [], parameters: {} };
async function setup(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-project-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'project');
  const created = good(await createProject(root, { title: 'Portable test', description: 'Local only', tags: ['test'], metadata: { purpose: 'fixtures' } }), 'created');
  return { temporary, root, project: created.project, projectId: created.projectId };
}
async function readManifest(c) { return JSON.parse(await fs.readFile(path.join(c.root, 'project.json'), 'utf8')); }
async function changeJSON(file, operation) {
  const value = JSON.parse(await fs.readFile(file, 'utf8')); operation(value); await fs.writeFile(file, JSON.stringify(value));
}
async function source(c, name = 'reference.txt', content = 'Harmless reference content') {
  const filename = path.join(c.temporary, name); await fs.writeFile(filename, content); return filename;
}
async function imported(c, assetId = 'reference', name, content) {
  const filename = await source(c, name, content);
  return good(await c.project.importAsset({ sourcePath: filename, assetId, contentType: 'text/plain', role: 'reference', metadata: { label: 'Example' } }), 'imported').asset;
}
async function populated(t) {
  const c = await setup(t);
  c.asset = await imported(c);
  c.other = await imported(c, 'other', 'second.txt', 'Another reference');
  c.workflow = workflow();
  c.workflow.assets.push({ id: c.asset.assetId, type: 'file', localPath: c.asset.path, checksum: { algorithm: 'sha256', value: c.asset.checksum } });
  good(await c.project.addWorkflowToProject(c.workflow), 'added');
  good(await c.project.addPreset({ presetId: 'export_settings', title: 'Draft', type: 'export', version: 1, data: { fps: 24 } }), 'added');
  good(await c.project.addReview({ reviewId: 'review_one', workflowId: c.workflow.workflowId, status: 'pending', notes: 'Check result', assetIds: [c.asset.assetId], presetIds: ['export_settings'] }), 'added');
  const exportPath = good(await c.project.generateExportPath('txt'));
  await fs.writeFile(exportPath.resolvedPath, 'Synthetic export fixture; no media execution');
  good(await c.project.recordExport({ exportId: exportPath.exportId, path: exportPath.relativePath, workflowId: c.workflow.workflowId, contentType: 'text/plain' }), 'recorded');
  c.history = good(await c.project.getProjectHistory(c.workflow.workflowId)).store;
  c.batch = { commandVersion: 1, commands: [{ type: 'add-node', value: node }] };
  c.edit = applyEditBatch(c.workflow, c.batch);
  c.first = good(await c.history.recordEdit({ before: c.workflow, result: c.edit, batch: c.batch }), 'recorded');
  good(await c.project.updateWorkflowInProject({ workflow: c.edit.workflow, expectedHash: hashWorkflow(c.workflow) }), 'updated');
  c.batch2 = { commandVersion: 1, commands: [{ type: 'rename-node-title', targetId: 'clip', value: 'Second version' }] };
  c.edit2 = applyEditBatch(c.edit.workflow, c.batch2);
  c.second = good(await c.history.recordEdit({ before: c.edit.workflow, result: c.edit2, batch: c.batch2 }), 'recorded');
  good(await c.project.updateWorkflowInProject({ workflow: c.edit2.workflow, expectedHash: c.first.afterHash }), 'updated');
  return c;
}

test('create/open project preserves identity, metadata and standard relative directories', async t => {
  const c = await setup(t), m = await readManifest(c);
  assert.equal(m.projectSchemaVersion, 1); assert.equal(m.projectId, c.projectId); assert.equal(m.description, 'Local only');
  assert.deepEqual(m.tags, ['test']); assert.deepEqual(m.metadata, { purpose: 'fixtures' });
  for (const name of ['workflows', 'history', 'assets', 'presets', 'review', 'exports']) assert.equal((await fs.stat(path.join(c.root, name))).isDirectory(), true);
  assert.ok(!JSON.stringify(m).includes(c.root));
  const opened = good(await openProject(c.root, { expectedProjectId: c.projectId }), 'opened');
  assert.equal(opened.projectId, c.projectId);
  bad(await createProject(c.root, { title: 'Overwrite' }), 'PROJECT_ALREADY_EXISTS');
  assert.deepEqual(await readManifest(c), m);
  good(await verifyProjectIntegrity(c.root), 'valid');
});
test('creation rejects unsafe metadata and missing title without creating project', async t => {
  const c = await setup(t), target = path.join(c.temporary, 'invalid');
  bad(await createProject(target, { title: 'x', metadata: { apiKey: 'fake-secret' } }), 'PROJECT_MANIFEST_INVALID');
  bad(await createProject(target, {}), 'PROJECT_MANIFEST_INVALID');
  await assert.rejects(fs.stat(target), { code: 'ENOENT' });
});
test('workflow add/list/get/update uses canonical bytes, stable IDs and stale protection', async t => {
  const c = await setup(t), doc = workflow(), copy = structuredClone(doc);
  const added = good(await c.project.addWorkflowToProject(doc), 'added');
  assert.deepEqual(doc, copy); assert.equal(await fs.readFile(path.join(c.root, added.path), 'utf8'), exportWorkflow(doc));
  assert.equal(good(await c.project.listProjectWorkflows()).workflows.length, 1);
  assert.deepEqual(good(await c.project.getProjectWorkflow(doc.workflowId)).workflow, doc);
  bad(await c.project.addWorkflowToProject(doc), 'WORKFLOW_DUPLICATE');
  const changed = { ...doc, name: 'Changed title' };
  const updated = good(await c.project.updateWorkflowInProject({ workflow: changed, expectedHash: added.hash }), 'updated');
  assert.equal(updated.workflowId, doc.workflowId); assert.notEqual(updated.path, added.path);
  assert.equal(await fs.readFile(path.join(c.root, added.path), 'utf8'), exportWorkflow(doc));
  bad(await c.project.updateWorkflowInProject({ workflow: doc, expectedHash: added.hash }), 'PROJECT_STALE_STATE');
  bad(await c.project.addWorkflowToProject({ ...doc, schemaVersion: 100 }), 'WORKFLOW_INVALID');
  good(await c.project.removeWorkflowFromProject(doc.workflowId), 'removed');
  bad(await c.project.getProjectWorkflow(doc.workflowId), 'WORKFLOW_NOT_FOUND');
});
test('main workflow removal blocked until reference explicitly cleared', async t => {
  const c = await setup(t), doc = workflow(); good(await c.project.addWorkflowToProject(doc), 'added');
  good(await c.project.updateProjectMetadata({ mainWorkflowId: doc.workflowId }), 'updated');
  bad(await c.project.removeWorkflowFromProject(doc.workflowId), 'WORKFLOW_REFERENCED_REMOVE_BLOCKED');
  good(await c.project.updateProjectMetadata({ mainWorkflowId: null }), 'updated');
  good(await c.project.removeWorkflowFromProject(doc.workflowId), 'removed');
});
test('workflow local asset references must be registered and checksums match', async t => {
  const c = await setup(t), doc = workflow(); doc.assets.push({ id: 'missing', type: 'file', localPath: 'assets/missing.txt' });
  bad(await c.project.addWorkflowToProject(doc), 'ASSET_NOT_FOUND');
  const asset = await imported(c);
  doc.assets = [{ id: asset.assetId, type: 'file', localPath: asset.path, checksum: { algorithm: 'sha256', value: '0'.repeat(64) } }];
  bad(await c.project.addWorkflowToProject(doc), 'ASSET_HASH_MISMATCH');
  doc.assets[0].checksum.value = asset.checksum.toUpperCase();
  good(await c.project.addWorkflowToProject(doc), 'added');
});
test('asset import preserves source, IDs, relative paths, hash, metadata and filename collision safety', async t => {
  const c = await setup(t), filename = await source(c);
  const bytes = await fs.readFile(filename);
  const a = good(await c.project.importAsset({ sourcePath: filename, assetId: 'first', role: 'logo', source: { url: 'https://example.com/reference' } }), 'imported').asset;
  const b = good(await c.project.importAsset({ sourcePath: filename, assetId: 'second' }), 'imported').asset;
  assert.notEqual(a.path, b.path); assert.equal(a.checksum, hash(bytes)); assert.equal(a.size, bytes.length);
  assert.deepEqual(await fs.readFile(filename), bytes); assert.ok(a.path.startsWith('assets/')); assert.ok(!a.path.includes(c.temporary));
  assert.equal(good(await c.project.listProjectAssets()).assets.length, 2);
  assert.equal(good(await c.project.getProjectAsset('first')).asset.role, 'logo');
  assert.equal(good(await c.project.resolveProjectAssetPath('first')).resolvedPath, path.join(c.root, a.path));
  bad(await c.project.importAsset({ sourcePath: filename, assetId: 'first' }), 'ASSET_DUPLICATE');
  good(await c.project.removeProjectAsset('second'), 'removed');
  // Unregistering does not delete physical data; portability copy excludes it.
  assert.equal((await fs.stat(path.join(c.root, b.path))).isFile(), true);
});
test('asset removal blocked by workflow, review, project metadata and historical snapshots', async t => {
  const c = await populated(t);
  bad(await c.project.removeProjectAsset(c.asset.assetId), 'ASSET_REFERENCED_REMOVE_BLOCKED');
  good(await c.project.updateProjectMetadata({ metadata: { assetId: c.other.assetId } }), 'updated');
  bad(await c.project.removeProjectAsset(c.other.assetId), 'ASSET_REFERENCED_REMOVE_BLOCKED');
  good(await c.project.updateProjectMetadata({ metadata: {} }), 'updated');
  good(await c.project.removeProjectAsset(c.other.assetId), 'removed');
  bad(await c.project.removeWorkflowFromProject(c.workflow.workflowId), 'WORKFLOW_REFERENCED_REMOVE_BLOCKED');
});
test('asset referenced only by historical state still cannot be removed', async t => {
  const c = await setup(t), asset = await imported(c), doc = workflow();
  doc.assets.push({ id: asset.assetId, type: 'file', localPath: asset.path });
  good(await c.project.addWorkflowToProject(doc), 'added');
  const store = good(await c.project.getProjectHistory(doc.workflowId)).store;
  const batch = { commandVersion: 1, commands: [{ type: 'remove-asset', targetId: asset.assetId }] }, result = applyEditBatch(doc, batch);
  good(await store.recordEdit({ before: doc, batch, result }), 'recorded');
  good(await c.project.updateWorkflowInProject({ workflow: result.workflow, expectedHash: hashWorkflow(doc) }), 'updated');
  bad(await c.project.removeProjectAsset(asset.assetId), 'ASSET_REFERENCED_REMOVE_BLOCKED');
});
for (const [name, content] of [['.env', 'NOT_A_REAL_KEY=value'], ['credentials.json', '{}'], ['harmless.json', '{"password":"fake-secret"}'], ['note.txt', 'Bearer fake-token']]) test(`import refuses credential-like file ${name}`, async t => {
  const c = await setup(t), filename = await source(c, name, content);
  bad(await c.project.importAsset({ sourcePath: filename }), 'ASSET_UNSAFE_CONTENT');
  assert.equal(good(await c.project.listProjectAssets()).assets.length, 0);
});
test('preset CRUD and immutable files with reference and stale-hash checks', async t => {
  const c = await setup(t), preset = { presetId: 'look', title: 'Look', type: 'custom-look', version: 1, data: { contrast: 1 }, metadata: {} };
  const added = good(await c.project.addPreset(preset), 'added');
  assert.deepEqual(good(await c.project.getPreset('look')).preset, preset);
  bad(await c.project.addPreset(preset), 'PRESET_DUPLICATE');
  const next = { ...preset, version: 2, data: { contrast: 2 } };
  good(await c.project.updatePreset({ preset: next, expectedHash: added.hash }), 'updated');
  assert.equal(good(await c.project.listPresets()).presets[0].version, 2);
  bad(await c.project.updatePreset({ preset, expectedHash: added.hash }), 'PROJECT_STALE_STATE');
  good(await c.project.addReview({ status: 'pending', presetIds: ['look'] }), 'added');
  bad(await c.project.removePreset('look'), 'PRESET_REFERENCED_REMOVE_BLOCKED');
  good(await c.project.addPreset({ ...preset, presetId: 'unused' }), 'added');
  good(await c.project.removePreset('unused'), 'removed');
  bad(await c.project.getPreset('unused'), 'PRESET_NOT_FOUND');
  bad(await c.project.addPreset({ ...preset, presetId: 'bad', data: { apiKey: 'fake-secret' } }), 'PRESET_INVALID');
});
test('review record stores generic references, status and notes; invalid references rejected', async t => {
  const c = await setup(t), doc = workflow(); good(await c.project.addWorkflowToProject(doc), 'added');
  good(await c.project.addReview({ reviewId: 'review', workflowId: doc.workflowId, runId: 'future_run', outputId: 'future_output', status: 'pending', notes: 'Check framing' }), 'added');
  const read = good(await c.project.getReview('review')).review;
  assert.equal(read.notes, 'Check framing'); assert.equal(read.runId, 'future_run'); assert.equal(good(await c.project.listReviews()).reviews.length, 1);
  bad(await c.project.addReview({ status: 'pending', workflowId: 'absent' }), 'PROJECT_REFERENCE_INVALID');
  bad(await c.project.addReview({ status: 'pending', metadata: { path: '/outside/file' } }), 'PROJECT_PATH_UNSAFE');
});
test('export helper gives a safe fresh path and records only existing in-project output', async t => {
  const c = await setup(t), target = good(await c.project.generateExportPath('txt'));
  assert.ok(target.relativePath.startsWith('exports/')); assert.ok(target.relativePath.endsWith('.txt'));
  bad(await c.project.generateExportPath('../mp4'), 'PROJECT_PATH_UNSAFE');
  bad(await c.project.recordExport({ path: '../outside' }), 'PROJECT_PATH_UNSAFE');
  bad(await c.project.recordExport({ path: target.relativePath }), 'EXPORT_NOT_FOUND');
  await fs.writeFile(target.resolvedPath, 'Output fixture');
  good(await c.project.recordExport({ exportId: target.exportId, path: target.relativePath }), 'recorded');
  assert.equal(good(await c.project.listExports()).exports.length, 1);
  bad(await c.project.recordExport({ path: target.relativePath }), 'EXPORT_DUPLICATE');
});
test('history integration checks drift, supports explicit restart reconciliation and preserves existing APIs', async t => {
  const c = await setup(t), doc = workflow(); good(await c.project.addWorkflowToProject(doc), 'added');
  const history = good(await c.project.getProjectHistory(doc.workflowId)).store;
  const batch = { commandVersion: 1, commands: [{ type: 'add-node', value: node }] }, result = applyEditBatch(doc, batch);
  good(await history.recordEdit({ before: doc, batch, result }), 'recorded');
  bad(await verifyProjectIntegrity(c.root), 'HISTORY_WORKFLOW_STATE_MISMATCH');
  bad(await openProject(c.root), 'HISTORY_WORKFLOW_STATE_MISMATCH');
  const reopened = good(await openProject(c.root, { reconcileWorkflowId: doc.workflowId }), 'opened');
  assert.ok(reopened.warnings.some(w => w.code === 'HISTORY_WORKFLOW_STATE_MISMATCH'));
  bad(await reopened.project.updateWorkflowInProject({ workflow: doc, expectedHash: hashWorkflow(doc) }), 'HISTORY_WORKFLOW_STATE_MISMATCH');
  good(await reopened.project.updateWorkflowInProject({ workflow: result.workflow, expectedHash: hashWorkflow(doc) }), 'updated');
  good(await verifyProjectIntegrity(c.root), 'valid');
});
test('concurrent project writers cannot silently overwrite one manifest', async t => {
  const c = await setup(t), other = good(await openProject(c.root), 'opened').project;
  const results = await Promise.all([c.project.addWorkflowToProject(workflow()), other.addWorkflowToProject(workflow())]);
  assert.equal(results.filter(r => r.status === 'added').length, 1);
  assert.ok(results.some(r => r.diagnostics.some(d => ['PROJECT_BUSY', 'WORKFLOW_DUPLICATE'].includes(d.code))));
  assert.equal(good(await c.project.listProjectWorkflows()).workflows.length, 1);
});

const corruptions = [
  ['bad JSON', async c => fs.writeFile(path.join(c.root, 'project.json'), '{'), 'PROJECT_MANIFEST_INVALID'],
  ['version', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.projectSchemaVersion = 2; }), 'PROJECT_VERSION_UNSUPPORTED'],
  ['invalid project ID', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.projectId = 'invalid'; }), 'PROJECT_ID_MISMATCH'],
  ['duplicate workflow', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.workflows.push(m.workflows[0]); }), 'WORKFLOW_DUPLICATE'],
  ['missing workflow', async c => { const m = await readManifest(c); await fs.unlink(path.join(c.root, m.workflows[0].path)); }, 'WORKFLOW_NOT_FOUND'],
  ['invalid workflow', async c => { const m = await readManifest(c); await changeJSON(path.join(c.root, m.workflows[0].path), w => { w.schemaVersion = 2; }); }, 'WORKFLOW_INVALID'],
  ['workflow identity', async c => { const m = await readManifest(c); await changeJSON(path.join(c.root, m.workflows[0].path), w => { w.workflowId = 'other'; }); }, 'PROJECT_REFERENCE_INVALID'],
  ['missing asset', async c => fs.unlink(path.join(c.root, c.asset.path)), 'ASSET_NOT_FOUND'],
  ['asset tampering', async c => fs.writeFile(path.join(c.root, c.asset.path), 'tampered'), 'ASSET_HASH_MISMATCH'],
  ['duplicate asset', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.assets.push(m.assets[0]); }), 'ASSET_DUPLICATE'],
  ['malformed asset', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.assets[0].size = -1; }), 'ASSET_INVALID'],
  ['malformed preset', async c => { const m = await readManifest(c); await changeJSON(path.join(c.root, m.presets[0].path), p => { p.version = 0; }); }, 'PRESET_INVALID'],
  ['missing required directory', async c => fs.rm(path.join(c.root, 'review'), { recursive: true }), 'PROJECT_INTEGRITY_FAILED'],
  ['broken history', async c => fs.writeFile(path.join(c.root, 'history', 'store.json'), '{'), 'HISTORY_INTEGRITY_FAILED'],
  ['history directory mismatch', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.directories.history = 'elsewhere'; }), 'PROJECT_PATH_UNSAFE'],
  ['credential metadata', async c => changeJSON(path.join(c.root, 'project.json'), m => { m.metadata = { password: 'fake-secret' }; }), 'PROJECT_MANIFEST_INVALID'],
];
for (const unsafe of ['../escape.json', '/tmp/external.json', 'C:\\Users\\old\\workflow.json', '\\\\server\\share\\asset', 'assets/node_modules/foo', 'assets/.git/config']) corruptions.push([`unsafe reference ${unsafe}`, async c => changeJSON(path.join(c.root, 'project.json'), m => { m.assets[0].path = unsafe; }), 'PROJECT_PATH_UNSAFE']);
for (const [name, corrupt, code] of corruptions) test(`project integrity detects ${name}`, async t => {
  const c = await populated(t); await corrupt(c);
  bad(await verifyProjectIntegrity(c.root), code);
  bad(await exportProjectData(c.root, path.join(c.temporary, 'rejected-copy')), code);
  await assert.rejects(fs.stat(path.join(c.temporary, 'rejected-copy')), { code: 'ENOENT' });
});
test('expected project ID detects swapping a valid manifest identity', async t => {
  const c = await setup(t), another = good(await createProject(path.join(c.temporary, 'another'), { title: 'Other' }), 'created');
  await changeJSON(path.join(c.root, 'project.json'), m => { m.projectId = another.projectId; });
  bad(await openProject(c.root, { expectedProjectId: c.projectId }), 'PROJECT_ID_MISMATCH');
  bad(await c.project.getManifest(), 'PROJECT_ID_MISMATCH');
});
test('symlink file and symlink root cannot reach external paths', async t => {
  const c = await setup(t), asset = await imported(c), external = await source(c, 'outside.txt');
  await fs.unlink(path.join(c.root, asset.path)); await fs.symlink(external, path.join(c.root, asset.path));
  bad(await verifyProjectIntegrity(c.root), 'PROJECT_PATH_UNSAFE');
  const alias = path.join(c.temporary, 'alias'); await fs.symlink(c.root, alias);
  bad(await openProject(alias), 'PROJECT_PATH_UNSAFE');
});
test('copy refuses existing/nested destinations and an abandoned lock', async t => {
  const c = await setup(t);
  bad(await exportProjectData(c.root, c.root), 'PROJECT_PATH_UNSAFE');
  bad(await exportProjectData(c.root, path.join(c.root, 'nested')), 'PROJECT_PATH_UNSAFE');
  const target = path.join(c.temporary, 'existing'); await fs.mkdir(target); await fs.writeFile(path.join(target, 'keep'), 'keep');
  bad(await exportProjectData(c.root, target), 'PROJECT_DESTINATION_EXISTS');
  assert.equal(await fs.readFile(path.join(target, 'keep'), 'utf8'), 'keep');
  await fs.mkdir(path.join(c.root, '.project-lock'));
  bad(await exportProjectData(c.root, path.join(c.temporary, 'copy')), 'PROJECT_BUSY');
});
test('interrupted initialization marker never opens as valid project', async t => {
  const c = await setup(t); await fs.writeFile(path.join(c.root, '.project-incomplete'), 'incomplete');
  bad(await openProject(c.root), 'PROJECT_INTEGRITY_FAILED');
});
test('complete data export/import relocates workflows/history/assets/presets/reviews/exports after original removal', async t => {
  const c = await populated(t), newInstall = await fs.mkdtemp(path.join(os.tmpdir(), 'fresh-whihm-device-'));
  t.after(() => fs.rm(newInstall, { recursive: true, force: true }));
  // Unregistered caches, credentials, stale workflow versions and temp files are NOT project exports.
  await fs.mkdir(path.join(c.root, 'node_modules')); await fs.writeFile(path.join(c.root, '.env'), 'FAKE_TEST_SECRET=do-not-copy');
  await fs.writeFile(path.join(c.root, 'assets', 'unregistered.tmp'), 'not committed');
  const destination = path.join(newInstall, 'restored-project');
  good(await exportProjectData(c.root, destination), 'copied');
  await fs.rm(c.root, { recursive: true });
  const opened = good(await openProject(destination, { expectedProjectId: c.projectId }), 'opened'), project = opened.project;
  assert.deepEqual(good(await project.getProjectWorkflow(c.workflow.workflowId)).workflow, c.edit2.workflow);
  assert.equal(good(await project.listProjectAssets()).assets.length, 2);
  const resolved = good(await project.resolveProjectAssetPath(c.asset.assetId));
  assert.ok(resolved.resolvedPath.startsWith(destination)); assert.equal(hash(await fs.readFile(resolved.resolvedPath)), c.asset.checksum);
  assert.equal(good(await project.getPreset('export_settings')).preset.data.fps, 24);
  assert.equal(good(await project.getReview('review_one')).review.notes, 'Check result');
  assert.equal(good(await project.listExports()).exports.length, 1);
  const history = good(await project.getProjectHistory(c.workflow.workflowId)).store;
  good(await history.verifyHistoryIntegrity(c.workflow.workflowId), 'valid');
  assert.deepEqual(good(await history.compareHistoryRecords(c.workflow.workflowId, c.first.recordId, c.second.recordId)).diff, diffWorkflows(c.edit.workflow, c.edit2.workflow));
  const rollback = good(await history.rollbackToRecord({ current: c.edit2.workflow, workflowId: c.workflow.workflowId, targetRecordId: c.first.recordId, expectedCurrentHash: c.second.afterHash, expectedLatestRecordId: c.second.recordId }), 'restored');
  good(await project.updateWorkflowInProject({ workflow: rollback.workflow, expectedHash: c.second.afterHash }), 'updated');
  good(await verifyProjectIntegrity(destination), 'valid');
  assert.equal(good(await history.listHistory(c.workflow.workflowId)).records.length, 3);
  const thirdRoot = path.join(newInstall, 'imported-again'); good(await importProjectData(destination, thirdRoot), 'copied');
  good(await openProject(thirdRoot), 'opened');
  for (const rel of ['.env', 'node_modules', 'assets/unregistered.tmp']) await assert.rejects(fs.stat(path.join(destination, rel)), { code: 'ENOENT' });
  async function scan(root) {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) await scan(file);
      else { const text = await fs.readFile(file, 'utf8'); assert.ok(!text.includes(c.root)); assert.ok(!text.includes(newInstall)); assert.ok(!text.includes('FAKE_TEST_SECRET')); }
    }
  }
  await scan(thirdRoot);
});

test('asset import refuses development/credential source directories', async t => {
  const c = await setup(t), excluded = path.join(c.temporary, 'node_modules');
  await fs.mkdir(excluded); const file = path.join(excluded, 'example.txt'); await fs.writeFile(file, 'not an asset');
  bad(await c.project.importAsset({ sourcePath: file }), 'ASSET_UNSAFE_CONTENT');
});
test('already-open handle refuses a history directory replaced by an external symlink', async t => {
  const c = await setup(t), outside = path.join(c.temporary, 'outside-history');
  await fs.rename(path.join(c.root, 'history'), outside); await fs.symlink(outside, path.join(c.root, 'history'));
  bad(await c.project.addWorkflowToProject(workflow()), 'PROJECT_PATH_UNSAFE');
  await assert.rejects(fs.stat(path.join(outside, '.write-lock')), { code: 'ENOENT' });
});

test('atomic immutable-file publication refuses collisions without altering existing bytes', async t => {
  const c = await setup(t), { atomic } = await import('../src/project/io.js');
  await atomic(c.root, 'assets/collision.bin', Buffer.from('original'));
  await assert.rejects(atomic(c.root, 'assets/collision.bin', Buffer.from('replacement')), e => e.diagnostic?.code === 'PROJECT_WRITE_FAILED');
  assert.equal(await fs.readFile(path.join(c.root, 'assets/collision.bin'), 'utf8'), 'original');
  assert.deepEqual((await fs.readdir(path.join(c.root, 'assets'))).filter(name => name.includes('.tmp-')), []);
  good(await verifyProjectIntegrity(c.root), 'valid');
});

for (const absolute of ['/home/another-user/source.mov', 'D:\\old-install\\clip.mov', '\\\\server\\share\\clip.mov']) test(`project boundary refuses machine-specific workflow data: ${absolute}`, async t => {
  const c = await setup(t), doc = workflow(); doc.metadata = { originalLocation: absolute };
  bad(await c.project.addWorkflowToProject(doc), 'PROJECT_PATH_UNSAFE');
  assert.equal(good(await c.project.listProjectWorkflows()).workflows.length, 0);
});

test('ordinary metadata keys matching Object prototype names are not mistaken for references', async t => {
  const c = await setup(t);
  good(await c.project.updateProjectMetadata({ metadata: { toString: 'Label', valueOf: 'Value' } }), 'updated');
  assert.deepEqual(good(await c.project.getManifest()).manifest.metadata, { toString: 'Label', valueOf: 'Value' });
});

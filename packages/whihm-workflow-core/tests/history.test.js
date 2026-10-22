import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createHistoryStore, createWorkflow, applyEditBatch, hashWorkflow, diffWorkflows, validateWorkflow } from '../src/index.js';

const empty = () => createWorkflow({ workflowId: 'history_job', name: 'History job' });
const node = { id: 'clip', title: 'Clip', kind: 'media', executor: { type: 'utility', id: 'whihm.trim', tool: 'trim', mayCostMoney: false, requiresConfirmation: false }, inputs: [], outputs: [{ id: 'video', type: 'video' }], parameters: {} };
function edit(before = empty(), title = 'Next') {
  const batch = { commandVersion: 1, expectedWorkflowHash: hashWorkflow(before), reason: 'Local edit', metadata: { source: 'test' }, commands: before.nodes.length ? [{ type: 'rename-node-title', targetId: 'clip', value: title }] : [{ type: 'add-node', value: node }] };
  return { before, batch, result: applyEditBatch(before, batch) };
}
const good = (result, status = 'recorded') => { assert.equal(result.status, status, JSON.stringify(result)); return result; };
const bad = (result, code) => { assert.ok(['rejected', 'invalid'].includes(result.status), JSON.stringify(result)); assert.ok(result.diagnostics.some(d => d.code === code), JSON.stringify(result)); return result; };
async function setup(t, options = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-history-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'portable-data');
  const opened = good(await createHistoryStore(root, options), 'ready');
  const base = path.join(root, 'workflows', createHash('sha256').update('history_job').digest('hex'));
  return { root, temporary, base, store: opened.store };
}
async function sequence(t, options) {
  const context = await setup(t, options), first = edit();
  const a = good(await context.store.recordEdit(first)), second = edit(first.result.workflow, 'Second');
  const b = good(await context.store.recordEdit(second));
  return { ...context, first, second, a, b };
}
async function changeJSON(file, change) {
  const value = JSON.parse(await fs.readFile(file, 'utf8')); change(value); await fs.writeFile(file, JSON.stringify(value));
}
const rollbackRequest = c => ({ current: c.second.result.workflow, workflowId: 'history_job', targetRecordId: c.a.recordId, expectedCurrentHash: c.b.afterHash, expectedLatestRecordId: c.b.recordId, reason: 'Restore first result' });

test('initialize, reopen and list an empty portable store', async t => {
  const c = await setup(t);
  assert.deepEqual(good(await c.store.listHistory('history_job'), 'ok').records, []);
  assert.equal(good(await c.store.getLatestHistoryRecord('history_job'), 'ok').record, null);
  good(await c.store.verifyHistoryIntegrity('history_job'), 'valid');
  good(await createHistoryStore(c.root), 'ready');
});
test('successful edit preserves commands, hashes, diff, metadata and detached input', async t => {
  const c = await setup(t), input = { ...edit(), reason: 'Approved local edit', actor: { source: 'agent' }, metadata: { label: 'checkpoint' } }, copy = structuredClone(input);
  const result = good(await c.store.recordEdit(input));
  assert.deepEqual(input, copy);
  assert.equal(result.beforeHash, hashWorkflow(input.before)); assert.equal(result.afterHash, hashWorkflow(input.result.workflow));
  assert.deepEqual(result.record.commandBatch, input.batch); assert.deepEqual(result.diff, input.result.diff);
  assert.equal(result.record.reason, input.reason); assert.deepEqual(result.record.actor, input.actor); assert.deepEqual(result.record.metadata, input.metadata);
  assert.equal(result.record.sequence, 1); assert.equal(result.record.previousRecordId, null);
  result.record.metadata.label = 'changed caller copy';
  assert.equal(good(await c.store.getHistoryRecord('history_job', result.recordId), 'ok').record.metadata.label, 'checkpoint');
});
test('ordered list, latest, before/after snapshots and comparison reuse canonical diff', async t => {
  const c = await sequence(t), records = good(await c.store.listHistory('history_job'), 'ok').records;
  assert.deepEqual(records.map(r => r.sequence), [1, 2]); assert.equal(records[1].previousRecordId, c.a.recordId);
  assert.equal(good(await c.store.getLatestHistoryRecord('history_job'), 'ok').record.recordId, c.b.recordId);
  assert.deepEqual(good(await c.store.getWorkflowAtRecord('history_job', c.a.recordId, 'before'), 'ok').workflow, c.first.before);
  assert.deepEqual(good(await c.store.getWorkflowAtRecord('history_job', c.b.recordId), 'ok').workflow, c.second.result.workflow);
  assert.deepEqual(good(await c.store.compareHistoryRecords('history_job', c.a.recordId, c.b.recordId), 'ok').diff, diffWorkflows(c.first.result.workflow, c.second.result.workflow));
});
for (const [name, mutate, code] of [
  ['before mismatch', i => { i.before.name = 'changed'; }, 'BEFORE_HASH_MISMATCH'],
  ['after mismatch', i => { i.result.workflow.name = 'changed'; }, 'AFTER_HASH_MISMATCH'],
  ['forged commands', i => { i.batch.commands = []; }, 'HISTORY_RECORD_INVALID'],
  ['forged result diff', i => { i.result.diff = []; }, 'HISTORY_RECORD_INVALID'],
  ['dry run', i => { i.result = applyEditBatch(i.before, { ...i.batch, dryRun: true }); }, 'HISTORY_EDIT_NOT_APPLIED'],
  ['rejected edit', i => { i.result.status = 'rejected'; }, 'HISTORY_EDIT_NOT_APPLIED'],
  ['invalid result', i => { i.result.workflow.nodes[0].id = null; }, 'RESULTING_WORKFLOW_INVALID'],
  ['secret annotation', i => { i.metadata = { apiKey: 'not-a-real-secret' }; }, 'HISTORY_RECORD_INVALID'],
  ['secret actor', i => { i.actor = { password: 'not-a-real-secret' }; }, 'HISTORY_RECORD_INVALID'],
  ['absolute annotation', i => { i.metadata = { root: 'C:\\Users\\example' }; }, 'HISTORY_PATH_UNSAFE'],
  ['absolute named path', i => { i.metadata = { path: '/private/example' }; }, 'HISTORY_RECORD_INVALID'],
]) test(`record rejects ${name} without adding history`, async t => {
  const c = await setup(t), input = edit(); mutate(input);
  const result = bad(await c.store.recordEdit(input), code);
  assert.ok(!JSON.stringify(result).includes('not-a-real-secret'));
  assert.deepEqual(good(await c.store.listHistory('history_job'), 'ok').records, []);
});
test('canonical formatting/key ordering is accepted; mutation during await cannot alter input capture', async t => {
  const c = await setup(t), input = edit();
  input.before = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(input.before).reverse()), null, 5));
  const promise = c.store.recordEdit(input);
  input.result.workflow.name = 'mutation after call'; input.batch.commands = [];
  const result = good(await promise);
  assert.equal(good(await c.store.getWorkflowAtRecord('history_job', result.recordId), 'ok').workflow.name, 'History job');
});
test('stale current state and optional history-head guard reject writes', async t => {
  const c = await sequence(t);
  bad(await c.store.recordEdit(edit(c.first.result.workflow, 'Other branch')), 'STALE_WORKFLOW_STATE');
  bad(await c.store.recordEdit({ ...edit(c.second.result.workflow, 'Third'), expectedLatestRecordId: c.a.recordId }), 'STALE_WORKFLOW_STATE');
  assert.equal(good(await c.store.listHistory('history_job'), 'ok').records.length, 2);
});
test('concurrent writers cannot both commit against one head', async t => {
  const c = await sequence(t), other = good(await createHistoryStore(c.root), 'ready').store;
  const results = await Promise.all([c.store.recordEdit(edit(c.second.result.workflow, 'A')), other.recordEdit(edit(c.second.result.workflow, 'B'))]);
  assert.equal(results.filter(r => r.status === 'recorded').length, 1);
  assert.ok(results.find(r => r.status === 'rejected').diagnostics.some(d => ['HISTORY_STORE_BUSY', 'STALE_WORKFLOW_STATE'].includes(d.code)));
  assert.equal(good(await c.store.verifyHistoryIntegrity('history_job'), 'valid').recordCount, 3);
});
for (const phase of ['snapshot', 'record', 'manifest']) test(`failure before ${phase} publication preserves committed state`, async t => {
  let failPhase;
  const c = await sequence(t, { beforePublish: kind => { if (kind === failPhase) throw Error('Injected'); } });
  const originalManifest = await fs.readFile(path.join(c.base, 'manifest.json'));
  const originalRecord = await fs.readFile(path.join(c.base, 'records', `${c.b.recordId}.json`));
  const originalSnapshot = await fs.readFile(path.join(c.base, c.b.record.afterSnapshot));
  failPhase = phase;
  bad(await c.store.recordEdit(edit(c.second.result.workflow, 'third')), 'HISTORY_WRITE_FAILED');
  assert.deepEqual(await fs.readFile(path.join(c.base, 'manifest.json')), originalManifest);
  assert.deepEqual(await fs.readFile(path.join(c.base, 'records', `${c.b.recordId}.json`)), originalRecord);
  assert.deepEqual(await fs.readFile(path.join(c.base, c.b.record.afterSnapshot)), originalSnapshot);
  assert.equal(good(await c.store.verifyHistoryIntegrity('history_job'), 'valid').recordCount, 2);
  failPhase = null;
  good(await c.store.recordEdit(edit(c.second.result.workflow, 'third')));
});
test('first edit failure leaves empty readable manifest and can be retried', async t => {
  let failOnce = true;
  const c = await setup(t, { beforePublish: kind => { if (kind === 'snapshot' && failOnce) { failOnce = false; throw Error('Injected'); } } });
  bad(await c.store.recordEdit(edit()), 'HISTORY_WRITE_FAILED');
  assert.equal(good(await c.store.verifyHistoryIntegrity('history_job'), 'valid').recordCount, 0);
  good(await c.store.recordEdit(edit()));
});
test('rollback appends a new record, deduplicates snapshots and preserves later history bytes', async t => {
  const c = await sequence(t), input = rollbackRequest(c), original = structuredClone(input);
  const bytes = await fs.readFile(path.join(c.base, 'records', `${c.b.recordId}.json`));
  const snapshots = await fs.readdir(path.join(c.base, 'snapshots'));
  const result = good(await c.store.rollbackToRecord(input), 'restored');
  assert.deepEqual(input, original); assert.notEqual(result.workflow, input.current); assert.equal(validateWorkflow(result.workflow).valid, true);
  assert.deepEqual(result.workflow, c.first.result.workflow); assert.equal(result.afterHash, c.a.afterHash);
  assert.equal(result.record.operation, 'rollback'); assert.equal(result.record.restoredFromRecordId, c.a.recordId); assert.equal(result.record.previousRecordId, c.b.recordId);
  assert.equal(result.record.commandBatch, null); assert.equal(result.record.sequence, 3);
  assert.deepEqual(result.diff, diffWorkflows(input.current, result.workflow));
  assert.deepEqual(await fs.readFile(path.join(c.base, 'records', `${c.b.recordId}.json`)), bytes);
  assert.deepEqual(await fs.readdir(path.join(c.base, 'snapshots')), snapshots);
  good(await c.store.getHistoryRecord('history_job', c.b.recordId), 'ok');
  good(await c.store.verifyHistoryIntegrity('history_job'), 'valid');
  good(await c.store.recordEdit(edit(result.workflow, 'Post rollback')));
});
for (const part of ['current', 'expectedCurrentHash', 'expectedLatestRecordId']) test(`stale rollback ${part} rejected`, async t => {
  const c = await sequence(t), input = rollbackRequest(c);
  if (part === 'current') input.current = c.first.result.workflow;
  else input[part] = part === 'expectedCurrentHash' ? c.a.afterHash : c.a.recordId;
  bad(await c.store.rollbackToRecord(input), 'STALE_WORKFLOW_STATE');
  assert.equal(good(await c.store.listHistory('history_job'), 'ok').records.length, 2);
});
test('ABA history-head change detected even when workflow hash is identical', async t => {
  const c = await sequence(t), request = rollbackRequest(c);
  good(await c.store.recordEdit(edit(c.second.result.workflow, 'Second'))); // valid no-op edit, new head
  bad(await c.store.rollbackToRecord(request), 'STALE_WORKFLOW_STATE');
});

const corruptionCases = [
  ['manifest JSON', async c => fs.writeFile(path.join(c.base, 'manifest.json'), '{'), 'HISTORY_MANIFEST_INVALID'],
  ['manifest version', async c => changeJSON(path.join(c.base, 'manifest.json'), m => { m.historySchemaVersion = 2; }), 'HISTORY_VERSION_UNSUPPORTED'],
  ['manifest shape', async c => changeJSON(path.join(c.base, 'manifest.json'), m => { m.records = null; }), 'HISTORY_MANIFEST_INVALID'],
  ['missing manifest', async c => fs.unlink(path.join(c.base, 'manifest.json')), 'HISTORY_MANIFEST_INVALID'],
  ['duplicate IDs', async c => changeJSON(path.join(c.base, 'manifest.json'), m => { m.records.push(m.records[0]); }), 'HISTORY_RECORD_DUPLICATE'],
  ['wrong manifest workflow', async c => changeJSON(path.join(c.base, 'manifest.json'), m => { m.workflowId = 'other'; }), 'HISTORY_WORKFLOW_ID_MISMATCH'],
  ['missing record', async c => fs.unlink(path.join(c.base, 'records', `${c.b.recordId}.json`)), 'HISTORY_RECORD_NOT_FOUND'],
  ['malformed record', async c => fs.writeFile(path.join(c.base, 'records', `${c.b.recordId}.json`), '{'), 'HISTORY_RECORD_INVALID'],
  ['record version', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.historySchemaVersion = 2; }), 'HISTORY_VERSION_UNSUPPORTED'],
  ['wrong record workflow', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.workflowId = 'other'; }), 'HISTORY_WORKFLOW_ID_MISMATCH'],
  ['broken previous chain', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.previousRecordId = null; }), 'HISTORY_CHAIN_BROKEN'],
  ['broken hash chain', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.beforeHash = '0'.repeat(64); }), 'HISTORY_CHAIN_BROKEN'],
  ['missing snapshot', async c => fs.unlink(path.join(c.base, c.b.record.afterSnapshot)), 'HISTORY_SNAPSHOT_NOT_FOUND'],
  ['tampered snapshot', async c => changeJSON(path.join(c.base, c.b.record.afterSnapshot), s => { s.name = 'tampered'; }), 'HISTORY_SNAPSHOT_HASH_MISMATCH'],
  ['wrong snapshot workflow', async c => changeJSON(path.join(c.base, c.b.record.afterSnapshot), s => { s.workflowId = 'other'; }), 'HISTORY_WORKFLOW_ID_MISMATCH'],
  ['tampered diff', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.diff = []; }), 'HISTORY_RECORD_INVALID'],
  ['tampered commands', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.commandBatch.commands = []; }), 'HISTORY_RECORD_INVALID'],
  ['record secret', async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.metadata = { password: 'fake-secret' }; }), 'HISTORY_RECORD_INVALID'],
];
for (const unsafe of ['../escape.json', '/tmp/escape.json', 'C:\\history\\state.json', 'snapshots/../state.json', 'snapshots/%2e%2e/file.json']) corruptionCases.push([`unsafe path ${unsafe}`, async c => changeJSON(path.join(c.base, 'records', `${c.b.recordId}.json`), r => { r.afterSnapshot = unsafe; }), 'HISTORY_PATH_UNSAFE']);
for (const [label, corrupt, code] of corruptionCases) test(`integrity rejects ${label}`, async t => {
  const c = await sequence(t); await corrupt(c);
  bad(await c.store.verifyHistoryIntegrity('history_job'), code);
  bad(await c.store.rollbackToRecord(rollbackRequest(c)), code);
});
test('symlink snapshot cannot escape portable root', async t => {
  const c = await sequence(t), file = path.join(c.base, c.b.record.afterSnapshot), outside = path.join(c.temporary, 'outside.json');
  await fs.copyFile(file, outside); await fs.unlink(file); await fs.symlink(outside, file);
  bad(await c.store.verifyHistoryIntegrity('history_job'), 'HISTORY_PATH_UNSAFE');
});
test('unsupported store and unknown nonempty directory are refused without overwrites', async t => {
  const c = await setup(t);
  await changeJSON(path.join(c.root, 'store.json'), s => { s.historySchemaVersion = 2; });
  bad(await createHistoryStore(c.root), 'HISTORY_VERSION_UNSUPPORTED');
  const other = path.join(c.temporary, 'unknown'); await fs.mkdir(other); await fs.writeFile(path.join(other, 'keep.txt'), 'untouched');
  bad(await createHistoryStore(other), 'HISTORY_MANIFEST_INVALID');
  assert.equal(await fs.readFile(path.join(other, 'keep.txt'), 'utf8'), 'untouched');
});
test('abandoned lock is refused, never silently stolen', async t => {
  const c = await setup(t); await fs.mkdir(path.join(c.root, '.write-lock'));
  bad(await c.store.recordEdit(edit()), 'HISTORY_STORE_BUSY');
  bad(await createHistoryStore(c.root), 'HISTORY_STORE_BUSY');
  good(await c.store.listHistory('history_job'), 'ok');
});
test('unpublished orphan records are never listed as committed history', async t => {
  const c = await sequence(t);
  await fs.writeFile(path.join(c.base, 'records', 'orphan.json'), '{');
  const result = good(await c.store.verifyHistoryIntegrity('history_job'), 'valid');
  assert.equal(result.recordCount, 2); assert.ok(result.warnings.some(w => w.code === 'HISTORY_UNCOMMITTED_ARTIFACTS'));
});
test('copy to unrelated fresh-install root needs no path rewriting; compare and rollback still work', async t => {
  const c = await sequence(t), destination = await fs.mkdtemp(path.join(os.tmpdir(), 'fresh-whihm-install-'));
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const portable = path.join(destination, 'WHIHM-Project', 'history');
  await fs.cp(c.root, portable, { recursive: true });
  await fs.rm(c.root, { recursive: true }); // original machine no longer exists
  const store = good(await createHistoryStore(portable), 'ready').store;
  assert.equal(good(await store.verifyHistoryIntegrity('history_job'), 'valid').recordCount, 2);
  good(await store.getWorkflowAtRecord('history_job', c.a.recordId), 'ok');
  assert.deepEqual(good(await store.compareHistoryRecords('history_job', c.a.recordId, c.b.recordId), 'ok').diff, c.b.diff);
  good(await store.rollbackToRecord(rollbackRequest(c)), 'restored');
  good(await store.verifyHistoryIntegrity('history_job'), 'valid');
  async function scan(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file);
      else { const text = await fs.readFile(file, 'utf8'); assert.ok(!text.includes(c.root)); assert.ok(!text.includes(destination)); assert.ok(!text.includes('node_modules')); }
    }
  }
  await scan(portable);
});

test('heterogeneous canonical fixture retains every field in before/after snapshots', async t => {
  const c = await setup(t);
  const before = JSON.parse(await fs.readFile(new URL('../fixtures/heterogeneous-media.json', import.meta.url), 'utf8'));
  const batch = { commandVersion: 1, commands: [{ type: 'rename-node-title', targetId: before.nodes[0].id, value: 'New human title' }] };
  const result = applyEditBatch(before, batch);
  const saved = good(await c.store.recordEdit({ before, batch, result }));
  assert.deepEqual(good(await c.store.getWorkflowAtRecord(before.workflowId, saved.recordId, 'before'), 'ok').workflow, before);
  assert.deepEqual(good(await c.store.getWorkflowAtRecord(before.workflowId, saved.recordId), 'ok').workflow, result.workflow);
  good(await c.store.verifyHistoryIntegrity(before.workflowId), 'valid');
});

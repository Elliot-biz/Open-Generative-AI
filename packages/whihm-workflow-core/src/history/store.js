import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { exportWorkflow } from '../index.js';
import { validateWorkflow, portablePath } from '../validate.js';
import { hashWorkflow, diffWorkflows, equalJSON } from '../diff.js';
import { applyEditBatch } from '../edit.js';

export const HISTORY_VERSION = 1;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
class HistoryFailure extends Error {
  constructor(code, message) { super(message); this.diagnostic = { code, path: '', message }; }
}
const fail = (code, message) => { throw new HistoryFailure(code, message); };
const requireThat = (condition, code, message) => { if (!condition) fail(code, message); };
const diagnostic = error => error instanceof HistoryFailure ? error.diagnostic : { code: 'HISTORY_IO_FAILED', path: '', message: 'Filesystem operation failed; no sensitive system paths are included.' };
const rejected = error => ({ status: 'rejected', diagnostics: [diagnostic(error)] });
const json = value => JSON.stringify(value, null, 2) + '\n';
function fields(value, names, code) {
  requireThat(object(value) && Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value, k)), code, 'Unexpected or missing format fields.');
}
function version(value) { requireThat(value?.historySchemaVersion === HISTORY_VERSION, 'HISTORY_VERSION_UNSUPPORTED', 'Only history schema version 1 is supported.'); }
function workflowId(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value), 'HISTORY_WORKFLOW_ID_MISMATCH', 'Expected a canonical workflow identifier.');
  return value;
}
// This digest is only a safe filesystem namespace for logical IDs, not a second workflow hash.
const directory = id => `workflows/${createHash('sha256').update(workflowId(id)).digest('hex')}`;
function validWorkflow(doc) {
  requireThat(validateWorkflow(doc).valid, 'RESULTING_WORKFLOW_INVALID', 'Workflow is invalid or contains non-portable/secret material.');
}
function safeDetails(details) {
  fields(details, ['reason', 'actor', 'metadata'], 'HISTORY_RECORD_INVALID');
  requireThat((details.reason === null || typeof details.reason === 'string') && (details.actor === null || object(details.actor)) && object(details.metadata), 'HISTORY_RECORD_INVALID', 'Invalid history annotations.');
  const probe = { schemaVersion: 1, workflowId: 'history_check', name: 'History check', nodes: [], edges: [], inputs: [], outputs: [], assets: [], metadata: details };
  requireThat(validateWorkflow(probe).valid, 'HISTORY_RECORD_INVALID', 'History annotations must be plain portable JSON without secrets.');
  function walk(v) {
    if (typeof v === 'string') requireThat(!/^(?:\/|[A-Za-z]:[\\/]|\\\\|file:|~[\\/])/.test(v), 'HISTORY_PATH_UNSAFE', 'Absolute paths are forbidden in history annotations.');
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  }
  walk(details);
}
const detailsOf = request => ({ reason: request.reason ?? null, actor: request.actor ?? null, metadata: request.metadata ?? {} });

/** Open a local data root. All operational failures are structured results.
 * beforePublish is an optional synchronous test-only fault hook, never persisted.
 */
export async function createHistoryStore(rootPath, { beforePublish } = {}) {
  try {
    requireThat(typeof rootPath === 'string' && rootPath.length > 0, 'HISTORY_PATH_UNSAFE', 'A caller-selected local root is required.');
    const root = path.resolve(rootPath);
    await fs.mkdir(root, { recursive: true });
    requireThat((await fs.lstat(root)).isDirectory() && !(await fs.lstat(root)).isSymbolicLink(), 'HISTORY_PATH_UNSAFE', 'History root must be a real directory.');

    async function local(relative) {
      requireThat(portablePath(relative), 'HISTORY_PATH_UNSAFE', 'History references must be safe relative paths.');
      let current = root;
      for (const segment of relative.split('/')) {
        current = path.join(current, segment);
        try { requireThat(!(await fs.lstat(current)).isSymbolicLink(), 'HISTORY_PATH_UNSAFE', 'Symbolic links are not supported in history data.'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return current;
    }
    async function read(relative, missing, malformed) {
      try { return JSON.parse(await fs.readFile(await local(relative), 'utf8')); }
      catch (error) {
        if (error instanceof HistoryFailure) throw error;
        if (error.code === 'ENOENT') fail(missing, 'Required history data is missing.');
        if (error instanceof SyntaxError) fail(malformed, 'History JSON is malformed.');
        throw error;
      }
    }
    async function syncDirectory(dir) {
      // Directory fsync is supported on POSIX; Windows may refuse opening directories.
      let handle;
      try { handle = await fs.open(dir, 'r'); await handle.sync(); }
      catch (error) {
        const unsupported = ['EINVAL', 'ENOTSUP'].includes(error.code) || (process.platform === 'win32' && ['EISDIR', 'EPERM', 'EACCES'].includes(error.code));
        if (!unsupported) throw error;
      }
      finally { await handle?.close(); }
    }
    async function atomic(relative, text, kind) {
      const destination = await local(relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.tmp-${randomUUID()}`;
      let handle;
      try {
        handle = await fs.open(temporary, 'wx', 0o600);
        await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = null;
        // Failure injection occurs only before the atomic visibility boundary.
        beforePublish?.(kind);
        await fs.rename(temporary, destination);
      } catch {
        await handle?.close().catch(() => {});
        await fs.unlink(temporary).catch(() => {});
        fail('HISTORY_WRITE_FAILED', 'Atomic publish failed; previous committed history is unchanged.');
      }
      // Rename is the commit point. Never report a committed write as rejected.
      const warnings = [];
      try {
        // Flush new namespace directories as well as the final file entry.
        for (let dir = path.dirname(destination); ; dir = path.dirname(dir)) {
          await syncDirectory(dir);
          if (dir === root) break;
        }
      }
      catch { warnings.push({ code: 'HISTORY_DURABILITY_UNCERTAIN', path: '', message: 'Published data is visible but directory flush failed; verify storage before shutdown.' }); }
      return warnings;
    }
    async function locked(operation) {
      const lock = await local('.write-lock');
      try { await fs.mkdir(lock); }
      catch (error) { if (error.code === 'EEXIST') fail('HISTORY_STORE_BUSY', 'Another writer or an interrupted writer owns the store lock. Do not automatically break it.'); throw error; }
      let result;
      try { result = await operation(); return result; }
      finally {
        try { await fs.rmdir(lock); }
        catch {
          // A committed record remains committed even if lock cleanup fails.
          if (result) (result.warnings ??= []).push({ code: 'HISTORY_LOCK_CLEANUP_REQUIRED', path: '', message: 'Writer lock remains; inspect it before further writes.' });
        }
      }
    }
    async function rootMetadata() {
      const value = await read('store.json', 'HISTORY_MANIFEST_INVALID', 'HISTORY_MANIFEST_INVALID');
      version(value); fields(value, ['historySchemaVersion', 'kind'], 'HISTORY_MANIFEST_INVALID');
      requireThat(value.kind === 'whihm-workflow-history', 'HISTORY_MANIFEST_INVALID', 'Unrecognized history store.');
    }
    await locked(async () => {
      const entries = await fs.readdir(root);
      if (!entries.includes('store.json')) {
        requireThat(entries.every(name => name === '.write-lock'), 'HISTORY_MANIFEST_INVALID', 'Refusing to initialize an unrecognized nonempty directory.');
        await atomic('store.json', json({ historySchemaVersion: 1, kind: 'whihm-workflow-history' }), 'store');
      }
      await rootMetadata();
    });

    async function load(id) {
      await rootMetadata();
      const base = directory(id);
      let manifest;
      try { manifest = await read(`${base}/manifest.json`, 'HISTORY_MANIFEST_MISSING', 'HISTORY_MANIFEST_INVALID'); }
      catch (error) {
        if (error.diagnostic?.code !== 'HISTORY_MANIFEST_MISSING') throw error;
        // A directory without its commit manifest can only contain unpublished
        // first-write artifacts. Do not adopt them or silently recreate history.
        try { await fs.stat(await local(base)); }
        catch (e) { if (e.code === 'ENOENT') return { base, records: [], snapshots: new Map(), warnings: [] }; throw e; }
        fail('HISTORY_MANIFEST_INVALID', 'Workflow directory exists without a manifest; inspect interrupted publication before recovery.');
      }
      version(manifest); fields(manifest, ['historySchemaVersion', 'workflowId', 'records'], 'HISTORY_MANIFEST_INVALID');
      requireThat(manifest.workflowId === id, 'HISTORY_WORKFLOW_ID_MISMATCH', 'Manifest workflow identity does not match.');
      requireThat(Array.isArray(manifest.records), 'HISTORY_MANIFEST_INVALID', 'Manifest records must be an ordered array.');
      const ids = new Set(), records = [], snapshots = new Map();
      async function snapshot(relative, expectedHash) {
        requireThat(portablePath(relative), 'HISTORY_PATH_UNSAFE', 'Unsafe snapshot reference.');
        requireThat(hash(expectedHash) && relative === `snapshots/${expectedHash}.json`, 'HISTORY_RECORD_INVALID', 'Snapshot reference must match its canonical hash.');
        if (snapshots.has(expectedHash)) return snapshots.get(expectedHash);
        const value = await read(`${base}/${relative}`, 'HISTORY_SNAPSHOT_NOT_FOUND', 'HISTORY_RECORD_INVALID');
        validWorkflow(value);
        requireThat(value.workflowId === id, 'HISTORY_WORKFLOW_ID_MISMATCH', 'Snapshot belongs to a different workflow.');
        requireThat(hashWorkflow(value) === expectedHash, 'HISTORY_SNAPSHOT_HASH_MISMATCH', 'Snapshot canonical hash does not match.');
        snapshots.set(expectedHash, value); return value;
      }
      for (const [index, recordId] of manifest.records.entries()) {
        requireThat(uuid(recordId), 'HISTORY_MANIFEST_INVALID', 'Invalid record identifier.');
        requireThat(!ids.has(recordId), 'HISTORY_RECORD_DUPLICATE', 'Duplicate record identifier.'); ids.add(recordId);
        const record = await read(`${base}/records/${recordId}.json`, 'HISTORY_RECORD_NOT_FOUND', 'HISTORY_RECORD_INVALID');
        version(record);
        fields(record, ['historySchemaVersion', 'recordId', 'workflowId', 'sequence', 'timestamp', 'previousRecordId', 'operation', 'restoredFromRecordId', 'beforeHash', 'afterHash', 'beforeSnapshot', 'afterSnapshot', 'commandBatch', 'diff', 'validation', 'reason', 'actor', 'metadata'], 'HISTORY_RECORD_INVALID');
        requireThat(record.workflowId === id, 'HISTORY_WORKFLOW_ID_MISMATCH', 'Record belongs to a different workflow.');
        requireThat(record.recordId === recordId && record.sequence === index + 1 && typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp)) && new Date(record.timestamp).toISOString() === record.timestamp, 'HISTORY_RECORD_INVALID', 'Record identity, sequence or timestamp is invalid.');
        const previous = records.at(-1);
        requireThat(record.previousRecordId === (previous?.recordId ?? null) && (!previous || record.beforeHash === previous.afterHash), 'HISTORY_CHAIN_BROKEN', 'Previous record or workflow state linkage is broken.');
        safeDetails(detailsOf(record));
        const before = await snapshot(record.beforeSnapshot, record.beforeHash);
        const after = await snapshot(record.afterSnapshot, record.afterHash);
        requireThat(equalJSON(record.diff, diffWorkflows(before, after)), 'HISTORY_RECORD_INVALID', 'Recorded diff does not match snapshots.');
        requireThat(equalJSON(record.validation, { valid: true, warnings: validateWorkflow(after).warnings }), 'HISTORY_RECORD_INVALID', 'Recorded validation metadata does not match.');
        if (record.operation === 'edit') {
          const replay = applyEditBatch(before, record.commandBatch);
          requireThat(record.restoredFromRecordId === null && replay.status === 'applied' && replay.afterHash === record.afterHash, 'HISTORY_RECORD_INVALID', 'Recorded commands do not reproduce the transition.');
        } else if (record.operation === 'rollback') {
          const target = records.find(r => r.recordId === record.restoredFromRecordId);
          requireThat(record.commandBatch === null && target && target.afterHash === record.afterHash, 'ROLLBACK_TARGET_INVALID', 'Rollback target is not an earlier matching record.');
        } else fail('HISTORY_RECORD_INVALID', 'Unknown history operation.');
        records.push(record);
      }
      // Orphans are never adopted. They are harmless unpublished crash artifacts.
      const warnings = [];
      for (const [folder, expected] of [['records', new Set(records.map(r => `${r.recordId}.json`))], ['snapshots', new Set([...snapshots.keys()].map(h => `${h}.json`))]]) {
        let entries = [];
        try { entries = await fs.readdir(await local(`${base}/${folder}`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (entries.some(name => !expected.has(name))) warnings.push({ code: 'HISTORY_UNCOMMITTED_ARTIFACTS', path: folder, message: 'Unreferenced files are ignored; preserve for manual recovery review.' });
      }
      return { base, records, snapshots, warnings };
    }
    const select = (state, recordId) => {
      const record = state.records.find(r => r.recordId === recordId);
      requireThat(record, 'HISTORY_RECORD_NOT_FOUND', 'Requested committed record does not exist.'); return record;
    };
    async function persist(state, before, after, batch, details, target = null) {
      const previous = state.records.at(-1);
      const beforeHash = hashWorkflow(before), afterHash = hashWorkflow(after);
      requireThat(!previous || previous.afterHash === beforeHash, 'STALE_WORKFLOW_STATE', 'Before state differs from the latest committed workflow.');
      // Empty manifest establishes a recoverable commit boundary even for a failed first write.
      if (!state.records.length) await atomic(`${state.base}/manifest.json`, json({ historySchemaVersion: 1, workflowId: before.workflowId, records: [] }), 'initialize-workflow');
      const warnings = [...state.warnings];
      for (const doc of [before, after]) {
        const h = hashWorkflow(doc), relative = `${state.base}/snapshots/${h}.json`;
        if (state.snapshots.has(h)) continue;
        try {
          const existing = await read(relative, 'HISTORY_SNAPSHOT_NOT_FOUND', 'HISTORY_RECORD_INVALID');
          validWorkflow(existing);
          requireThat(hashWorkflow(existing) === h, 'HISTORY_SNAPSHOT_HASH_MISMATCH', 'Existing snapshot cannot be overwritten.');
        } catch (error) {
          if (error.diagnostic?.code !== 'HISTORY_SNAPSHOT_NOT_FOUND') throw error;
          warnings.push(...await atomic(relative, exportWorkflow(doc), 'snapshot'));
        }
      }
      const recordId = randomUUID();
      const record = { historySchemaVersion: 1, recordId, workflowId: before.workflowId, sequence: state.records.length + 1, timestamp: new Date().toISOString(), previousRecordId: previous?.recordId ?? null,
        operation: target ? 'rollback' : 'edit', restoredFromRecordId: target?.recordId ?? null, beforeHash, afterHash,
        beforeSnapshot: `snapshots/${beforeHash}.json`, afterSnapshot: `snapshots/${afterHash}.json`, commandBatch: batch,
        diff: diffWorkflows(before, after), validation: { valid: true, warnings: validateWorkflow(after).warnings }, ...details };
      // A collision must never overwrite an existing immutable record.
      try { await fs.lstat(await local(`${state.base}/records/${recordId}.json`)); fail('HISTORY_RECORD_DUPLICATE', 'Record ID already exists.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      warnings.push(...await atomic(`${state.base}/records/${recordId}.json`, json(record), 'record'));
      warnings.push(...await atomic(`${state.base}/manifest.json`, json({ historySchemaVersion: 1, workflowId: before.workflowId, records: [...state.records.map(r => r.recordId), recordId] }), 'manifest'));
      return { status: target ? 'restored' : 'recorded', workflowId: before.workflowId, recordId, beforeHash, afterHash, diff: record.diff, record, diagnostics: [], warnings, ...(target ? { workflow: structuredClone(after) } : {}) };
    }
    async function capture(request, operation) {
      try { return await operation(structuredClone(request)); } catch (error) { return rejected(error); }
    }
    const store = {
      recordEdit(request) { return capture(request, async input => {
        const { before, result, batch } = input;
        validWorkflow(before);
        requireThat(result?.status === 'applied' && result.validation?.valid === true && Array.isArray(result.errors) && !result.errors.length, 'HISTORY_EDIT_NOT_APPLIED', 'Only successful validated edit results can be recorded.');
        validWorkflow(result.workflow);
        requireThat(hashWorkflow(before) === result.beforeHash, 'BEFORE_HASH_MISMATCH', 'Provided before state does not match the edit result.');
        requireThat(hashWorkflow(result.workflow) === result.afterHash, 'AFTER_HASH_MISMATCH', 'Provided after state does not match the edit result.');
        requireThat(before.workflowId === result.workflow.workflowId, 'HISTORY_WORKFLOW_ID_MISMATCH', 'An edit cannot change history workflow identity.');
        const replay = applyEditBatch(before, batch);
        requireThat(replay.status === 'applied' && replay.afterHash === result.afterHash && equalJSON(replay.commands, result.commands) && equalJSON(replay.diff, result.diff), 'HISTORY_RECORD_INVALID', 'Exact command batch must reproduce the supplied edit result.');
        const details = detailsOf(input); safeDetails(details);
        return locked(async () => {
          const state = await load(before.workflowId);
          if (Object.hasOwn(input, 'expectedLatestRecordId')) requireThat(input.expectedLatestRecordId === (state.records.at(-1)?.recordId ?? null), 'STALE_WORKFLOW_STATE', 'History head changed; refresh before recording.');
          return persist(state, before, result.workflow, batch, details);
        });
      }); },
      listHistory(id) { return capture(id, async value => { const state = await load(value); return { status: 'ok', workflowId: value, records: state.records, diagnostics: [], warnings: state.warnings }; }); },
      getHistoryRecord(id, recordId) { return capture({ id, recordId }, async value => ({ status: 'ok', record: select(await load(value.id), value.recordId), diagnostics: [] })); },
      getLatestHistoryRecord(id) { return capture(id, async value => ({ status: 'ok', record: (await load(value)).records.at(-1) ?? null, diagnostics: [] })); },
      getWorkflowAtRecord(id, recordId, side = 'after') { return capture({ id, recordId, side }, async value => {
        requireThat(['before', 'after'].includes(value.side), 'HISTORY_RECORD_INVALID', 'Snapshot side must be before or after.');
        const state = await load(value.id), record = select(state, value.recordId);
        return { status: 'ok', workflow: structuredClone(state.snapshots.get(record[`${value.side}Hash`])), diagnostics: [] };
      }); },
      compareHistoryRecords(id, recordA, recordB) { return capture({ id, recordA, recordB }, async value => {
        const state = await load(value.id), a = select(state, value.recordA), b = select(state, value.recordB);
        return { status: 'ok', beforeHash: a.afterHash, afterHash: b.afterHash, diff: diffWorkflows(state.snapshots.get(a.afterHash), state.snapshots.get(b.afterHash)), diagnostics: [] };
      }); },
      rollbackToRecord(request) { return capture(request, async input => {
        const { current, workflowId: id, targetRecordId, expectedCurrentHash, expectedLatestRecordId } = input;
        validWorkflow(current);
        requireThat(current.workflowId === id, 'HISTORY_WORKFLOW_ID_MISMATCH', 'Current workflow identity does not match.');
        requireThat(hashWorkflow(current) === expectedCurrentHash, 'STALE_WORKFLOW_STATE', 'Expected current hash does not match.');
        const details = detailsOf(input); safeDetails(details);
        return locked(async () => {
          const state = await load(id), latest = state.records.at(-1);
          requireThat(latest && latest.afterHash === expectedCurrentHash && latest.recordId === expectedLatestRecordId, 'STALE_WORKFLOW_STATE', 'Current state or history head changed; refresh before rollback.');
          const target = select(state, targetRecordId), after = state.snapshots.get(target.afterHash);
          validWorkflow(after);
          return persist(state, current, after, null, details, target);
        });
      }); },
      async verifyHistoryIntegrity(id) {
        const result = await store.listHistory(id);
        return result.status === 'ok' ? { status: 'valid', workflowId: id, recordCount: result.records.length, diagnostics: [], warnings: result.warnings } : { ...result, status: 'invalid' };
      },
    };
    return { status: 'ready', store, diagnostics: [] };
  } catch (error) { return rejected(error); }
}

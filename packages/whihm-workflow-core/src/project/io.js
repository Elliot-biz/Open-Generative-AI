import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { portablePath, validateWorkflow } from '../validate.js';
import { stableJSON } from '../diff.js';

export class ProjectFailure extends Error {
  constructor(code, message) { super(message); this.diagnostic = { code, path: '', message }; }
}
export const ensure = (condition, code, message) => { if (!condition) throw new ProjectFailure(code, message); };
export const reject = error => ({ status: 'rejected', diagnostics: [error instanceof ProjectFailure ? error.diagnostic : { code: 'PROJECT_IO_FAILED', path: '', message: 'Local project operation failed; system paths and input values are omitted.' }] });
export async function capture(input, action) { try { return await action(structuredClone(input)); } catch (e) { return reject(e); } }
export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export const encode = data => JSON.stringify(JSON.parse(stableJSON(data)), null, 2) + '\n';
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validId = value => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value);
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const iso = value => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
export function fields(value, required, optional = [], code = 'PROJECT_MANIFEST_INVALID') {
  ensure(object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key)), code, 'Missing or unknown record fields.');
}
// Reuse the canonical JSON/credential checks without altering that validator.
export function safeData(data, code = 'PROJECT_MANIFEST_INVALID') {
  const result = validateWorkflow({ schemaVersion: 1, workflowId: 'project_check', name: 'Project check', nodes: [], edges: [], inputs: [], outputs: [], assets: [], metadata: { data } });
  ensure(result.valid, result.errors.some(e => e.code === 'NON_PORTABLE_PATH') ? 'PROJECT_PATH_UNSAFE' : code, 'Expected portable JSON without credential material.');
  function walk(value) {
    if (typeof value === 'string') ensure(!/^(?:\/|[A-Za-z]:|\\|file:|~[\\/])/.test(value), 'PROJECT_PATH_UNSAFE', 'Absolute or machine-specific paths are not portable data.');
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  }
  walk(data);
}
export function relative(value, area) {
  ensure(portablePath(value) && !value.split('/').some(segment => /^(?:\.git|\.env(?:\..*)?|node_modules|\.next|dist|cache|credentials?|tokens?|.*\.pem|.*\.key)$/i.test(segment)), 'PROJECT_PATH_UNSAFE', 'Unsafe or excluded project path.');
  if (area) ensure(value.startsWith(`${area}/`), 'PROJECT_PATH_UNSAFE', 'Reference is outside its managed directory.');
  return value;
}
export async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function rootLocation(input, mustExist = true) {
  ensure(typeof input === 'string' && input.length > 0, 'PROJECT_PATH_UNSAFE', 'A local project root is required.');
  const root = path.resolve(input);
  // Refuse symlink aliases in roots as well as project-relative children.
  let part = path.parse(root).root;
  for (const segment of root.slice(part.length).split(path.sep).filter(Boolean)) {
    part = path.join(part, segment);
    if (await exists(part)) ensure(!(await fs.lstat(part)).isSymbolicLink(), 'PROJECT_PATH_UNSAFE', 'Project root paths cannot traverse symlinks.');
  }
  if (mustExist) ensure(await exists(root) && (await fs.lstat(root)).isDirectory(), 'PROJECT_NOT_FOUND', 'Project directory does not exist.');
  return root;
}
export async function local(root, value) {
  ensure(!(await fs.lstat(root)).isSymbolicLink(), 'PROJECT_PATH_UNSAFE', 'Project data root cannot be a symlink.');
  relative(value);
  let file = root;
  for (const segment of value.split('/')) {
    file = path.join(file, segment);
    if (await exists(file)) ensure(!(await fs.lstat(file)).isSymbolicLink(), 'PROJECT_PATH_UNSAFE', 'Project data cannot traverse symlinks.');
  }
  return file;
}
export async function readBytes(root, value, missing = 'PROJECT_INTEGRITY_FAILED') {
  const file = await local(root, value);
  ensure(await exists(file) && (await fs.lstat(file)).isFile(), missing, 'A registered file is missing or is not a regular file.');
  return fs.readFile(file);
}
export async function readJSON(root, value, missing, invalid) {
  const bytes = await readBytes(root, value, missing);
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new ProjectFailure(invalid, 'Malformed JSON record.'); }
}
export async function syncDirectory(dir) {
  let handle;
  try { handle = await fs.open(dir, 'r'); await handle.sync(); }
  catch (e) { if (!(['EINVAL', 'ENOTSUP'].includes(e.code) || (process.platform === 'win32' && ['EACCES', 'EPERM', 'EISDIR'].includes(e.code)))) throw e; }
  finally { await handle?.close(); }
}
// Same write/flush/rename commit pattern as history. History internals remain unchanged.
export async function atomic(root, value, bytes, { replace = false } = {}) {
  const file = await local(root, value), temp = `${file}.tmp-${randomUUID()}`;
  let handle;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    ensure(replace || !await exists(file), 'PROJECT_WRITE_FAILED', 'Refusing to overwrite an immutable project file.');
    await fs.rename(temp, file);
  } catch {
    await handle?.close().catch(() => {}); await fs.unlink(temp).catch(() => {});
    throw new ProjectFailure('PROJECT_WRITE_FAILED', 'Atomic publication failed; prior committed project metadata is unchanged.');
  }
  const warnings = [];
  try {
    for (let dir = path.dirname(file); ; dir = path.dirname(dir)) { await syncDirectory(dir); if (dir === root) break; }
  } catch { warnings.push({ code: 'PROJECT_DURABILITY_UNCERTAIN', path: '', message: 'Publication succeeded but directory flush failed.' }); }
  return warnings;
}
export async function locked(root, action, name = '.project-lock') {
  const lock = await local(root, name);
  try { await fs.mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new ProjectFailure('PROJECT_BUSY', 'Project/history writer lock is held; do not automatically break it.'); throw e; }
  let result;
  try { result = await action(); return result; }
  finally {
    try { await fs.rmdir(lock); } catch { if (result) (result.warnings ??= []).push({ code: 'PROJECT_LOCK_CLEANUP_REQUIRED', path: '', message: 'Inspect writer lock before further writes.' }); }
  }
}
// Only file copying/checksumming: no transformations. Bound memory use for V1.
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
export function safeFileContent(bytes, filename) {
  ensure(!/(?:^|[\\/])(?:\.env(?:\..*)?|credentials?(?:\..*)?|tokens?(?:\..*)?|id_rsa|.*\.(?:pem|key))$/i.test(filename), 'ASSET_UNSAFE_CONTENT', 'Credential/key files cannot be imported.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return; }
  if (text.includes('\0')) return;
  let data = text;
  try { data = JSON.parse(text); } catch { /* Ordinary textual asset. */ }
  safeData(data, 'ASSET_UNSAFE_CONTENT');
}

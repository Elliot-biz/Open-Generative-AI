import { readFileSync } from 'node:fs';
import { collectionNames } from '../diff.js';
import { validateWorkflow, workflowSchema } from '../validate.js';

export const commandFields = Object.freeze({
  'add-node': ['value'], 'remove-node': ['targetId'], 'update-node': ['targetId', 'changes'],
  'rename-node-title': ['targetId', 'value'], 'enable-node': ['targetId'], 'disable-node': ['targetId'],
  'set-executor': ['targetId', 'value'], 'set-provider': ['targetId', 'value'], 'set-model': ['targetId', 'value'],
  'set-node-parameter': ['targetId', 'parameterPath', 'value'], 'remove-node-parameter': ['targetId', 'parameterPath'],
  'add-edge': ['value'], 'remove-edge': ['targetId'], 'reconnect-edge': ['targetId', 'changes'],
  'add-workflow-input': ['value'], 'remove-workflow-input': ['targetId'],
  'add-workflow-output': ['value'], 'remove-workflow-output': ['targetId'],
  'add-asset': ['value'], 'update-asset': ['targetId', 'changes'], 'remove-asset': ['targetId'],
  'attach-asset-to-node': ['targetId', 'assetId'], 'detach-asset-from-node': ['targetId', 'assetId'],
  'set-node-position': ['targetId', 'value'],
});
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const commandSchema = freeze(JSON.parse(readFileSync(new URL('../../commands.schema.json', import.meta.url), 'utf8')));
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value);

export function pathSegments(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/.test(path)) return null;
  const parts = path.slice(1).split('/').map(x => x.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (parts.some(x => ['__proto__', 'prototype', 'constructor'].includes(x))) return null;
  return parts;
}
export function readSemanticPath(doc, path) {
  const parts = pathSegments(path);
  if (!parts) return { exists: false };
  let value = doc;
  for (let i = 0; i < parts.length; i++) {
    if (i === 1 && collectionNames.includes(parts[0])) {
      value = value.find(item => item.id === parts[i]);
      if (value === undefined) return { exists: false };
    } else {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, parts[i])) return { exists: false };
      value = value[parts[i]];
    }
  }
  return { exists: true, value };
}

export function validateCommandBatch(batch) {
  // Reuse core plain-JSON and secret checks. Command pointers use 'at' and
  // 'parameterPath', so they are not mistaken for portable asset file paths.
  const safety = validateWorkflow({ schemaVersion: 1, workflowId: 'command_check', name: 'Command check', nodes: [], edges: [], inputs: [], outputs: [], assets: [], metadata: { batch } });
  if (!safety.valid) return { valid: false, errors: safety.errors.map(e => ({ ...e, path: e.path.replace('/metadata/batch', '') })) };
  const errors = [];
  const error = (code, path, message) => errors.push({ code, path, message });
  // Check command operand shapes against the exported machine-readable schema.
  // Only keywords used by canonical operand definitions are interpreted here;
  // cross-node semantics remain the final workflow validator's responsibility.
  function operand(value, schema, path) {
    if (schema.$ref) return operand(value, workflowSchema.$defs[schema.$ref.split('/').at(-1)], path);
    const types = { object: isObject(value), array: Array.isArray(value), string: typeof value === 'string', number: typeof value === 'number' && Number.isFinite(value), boolean: typeof value === 'boolean' };
    if (schema.type && !types[schema.type]) { error('INVALID_COMMAND', path, `Expected ${schema.type}.`); return; }
    if (schema.enum && !schema.enum.includes(value)) error('INVALID_COMMAND', path, 'Value is outside the allowed enumeration.');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) error('INVALID_COMMAND', path, 'Invalid value format.');
    if (schema.type === 'object') {
      for (const key of schema.required || []) if (!Object.hasOwn(value, key)) error('INVALID_COMMAND', `${path}/${key}`, 'Required operand field is missing.');
      for (const [key, child] of Object.entries(value)) {
        const next = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        if (schema.properties && Object.hasOwn(schema.properties, key)) operand(child, schema.properties[key], next);
        else if (schema.additionalProperties === false) error('INVALID_COMMAND', next, 'Unknown operand field.');
      }
    }
    if (schema.type === 'array') value.forEach((item, index) => operand(item, schema.items, `${path}/${index}`));
  }
  function keys(value, required, optional, path) {
    if (!isObject(value)) { error('INVALID_COMMAND', path, 'Expected an object.'); return false; }
    for (const key of required) if (!Object.hasOwn(value, key)) error('INVALID_COMMAND', `${path}/${key}`, 'Required command field is missing.');
    for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) error('INVALID_COMMAND', `${path}/${key}`, 'Unknown command field.');
    return true;
  }
  function conditions(list, path) {
    if (!Array.isArray(list)) { error('INVALID_PRECONDITION', path, 'Expected a precondition array.'); return; }
    list.forEach((condition, i) => {
      const p = `${path}/${i}`;
      if (!keys(condition, ['at'], ['exists', 'equals'], p)) return;
      if (!pathSegments(condition.at) || (!Object.hasOwn(condition, 'exists') && !Object.hasOwn(condition, 'equals')) || (Object.hasOwn(condition, 'exists') && typeof condition.exists !== 'boolean') || (condition.exists === false && Object.hasOwn(condition, 'equals'))) error('INVALID_PRECONDITION', p, 'Expected a semantic path and exists and/or equals assertion.');
    });
  }
  function common(value, path) {
    if (Object.hasOwn(value, 'preconditions')) conditions(value.preconditions, `${path}/preconditions`);
    if (Object.hasOwn(value, 'reason') && typeof value.reason !== 'string') error('INVALID_COMMAND', `${path}/reason`, 'Reason must be text.');
    if (Object.hasOwn(value, 'metadata') && !isObject(value.metadata)) error('INVALID_COMMAND', `${path}/metadata`, 'Metadata must be an object.');
  }
  if (!keys(batch, ['commandVersion', 'commands'], ['expectedWorkflowHash', 'allowedPaths', 'preconditions', 'dryRun', 'metadata', 'reason'], '')) return { valid: false, errors };
  if (batch.commandVersion !== 1) error('UNSUPPORTED_COMMAND_VERSION', '/commandVersion', 'Only command version 1 is supported.');
  if (Object.hasOwn(batch, 'expectedWorkflowHash') && !/^[a-f0-9]{64}$/.test(batch.expectedWorkflowHash)) error('INVALID_COMMAND', '/expectedWorkflowHash', 'Expected lowercase SHA-256 hex.');
  if (Object.hasOwn(batch, 'dryRun') && typeof batch.dryRun !== 'boolean') error('INVALID_COMMAND', '/dryRun', 'Expected boolean.');
  if (Object.hasOwn(batch, 'allowedPaths') && (!Array.isArray(batch.allowedPaths) || batch.allowedPaths.some(p => !pathSegments(p)))) error('INVALID_SCOPE', '/allowedPaths', 'Expected semantic pointer paths.');
  common(batch, '');
  if (!Array.isArray(batch.commands)) error('INVALID_COMMAND', '/commands', 'Expected command array.');
  else batch.commands.forEach((command, i) => {
    const p = `/commands/${i}`;
    if (!isObject(command) || !Object.hasOwn(commandFields, command.type)) { error('UNSUPPORTED_COMMAND', p, 'Unknown command type.'); return; }
    keys(command, ['type', ...commandFields[command.type]], ['preconditions', 'metadata', 'reason'], p);
    common(command, p);
    const definition = commandSchema.$defs.command.oneOf.find(item => item.properties.type.const === command.type);
    for (const field of ['value']) if (Object.hasOwn(command, field) && definition.properties[field]) operand(command[field], definition.properties[field], `${p}/${field}`);
    for (const field of ['targetId', 'assetId']) if (Object.hasOwn(command, field) && !id(command[field])) error('INVALID_COMMAND', `${p}/${field}`, 'Invalid logical ID.');
    if (commandFields[command.type].includes('parameterPath') && !pathSegments(command.parameterPath)) error('INVALID_COMMAND', `${p}/parameterPath`, 'Expected a parameter JSON Pointer.');
    if (commandFields[command.type].includes('changes') && !isObject(command.changes)) error('INVALID_COMMAND', `${p}/changes`, 'Expected shallow field patch.');
    if (['rename-node-title', 'set-provider', 'set-model'].includes(command.type) && typeof command.value !== 'string') error('INVALID_COMMAND', `${p}/value`, 'Expected text.');
    if (command.type.startsWith('add-') && (!isObject(command.value) || !id(command.value.id))) error('INVALID_COMMAND', `${p}/value`, 'Expected an entity with a logical ID.');
    if (['set-executor', 'set-node-position'].includes(command.type) && !isObject(command.value)) error('INVALID_COMMAND', `${p}/value`, 'Expected an object.');
    if (['update-node', 'update-asset'].includes(command.type) && isObject(command.changes) && Object.hasOwn(command.changes, 'id')) error('IMMUTABLE_ID', `${p}/changes/id`, 'Logical IDs cannot be patched.');
    if (command.type === 'reconnect-edge' && isObject(command.changes) && (Object.keys(command.changes).length === 0 || Object.keys(command.changes).some(k => !['source', 'target'].includes(k)) || Object.values(command.changes).some(v => !isObject(v) || !id(v.nodeId) || !id(v.portId) || Object.keys(v).some(k => !['nodeId', 'portId'].includes(k))))) error('INVALID_COMMAND', `${p}/changes`, 'Only complete source/target endpoints can be reconnected.');
  });
  return { valid: errors.length === 0, errors };
}

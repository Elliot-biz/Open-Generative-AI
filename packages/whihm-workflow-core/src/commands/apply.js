import { isObject, pathSegments } from './contract.js';

export class CommandFailure extends Error {
  constructor(code, path, message) { super(message); this.diagnostic = { code, path, message }; }
}
const fail = (code, path, message) => { throw new CommandFailure(code, path, message); };
const noun = { nodes: 'NODE', edges: 'EDGE', assets: 'ASSET', inputs: 'WORKFLOW_INPUT', outputs: 'WORKFLOW_OUTPUT' };
function find(doc, collection, id) {
  const entity = doc[collection].find(item => item.id === id);
  if (!entity) fail(`${noun[collection]}_NOT_FOUND`, `/${collection}`, 'Target ID does not exist.');
  return entity;
}
function contains(value, predicate) {
  if (predicate(value)) return true;
  return value !== null && typeof value === 'object' && Object.values(value).some(child => contains(child, predicate));
}
function executableValues(doc) {
  return [...doc.nodes.flatMap(n => [n.parameters, n.fallbackPolicy]), ...doc.inputs.map(input => input.default)];
}
function referencesNode(doc, id) {
  const ep = value => value?.nodeId === id;
  if (doc.edges.some(e => ep(e.source) || ep(e.target)) || doc.inputs.some(input => Array.isArray(input.targets) && input.targets.some(ep)) || doc.outputs.some(output => ep(output.source))) return true;
  if (doc.nodes.some(node => Array.isArray(node.dependencies) && node.dependencies.includes(id))) return true;
  return executableValues(doc).some(value => contains(value, item => {
    if (isObject(item) && item.$nodeOutput?.nodeId === id) return true;
    if (typeof item !== 'string') return false;
    return [...item.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_.:-]*)\.outputs\[\d+\]\.value\s*\}\}/g)].some(match => match[1] === id);
  }));
}
function referencesAsset(doc, id) {
  return doc.nodes.some(node => Array.isArray(node.assetRefs) && node.assetRefs.includes(id))
    || executableValues(doc).some(value => contains(value, item => isObject(item) && item.$asset === id));
}
const collections = {
  node: 'nodes', edge: 'edges', 'workflow-input': 'inputs', 'workflow-output': 'outputs', asset: 'assets',
};

function parameter(node, command) {
  const parts = pathSegments(command.parameterPath);
  let parent = node.parameters;
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, part)) fail('PARAMETER_PATH_NOT_FOUND', command.parameterPath, 'Parent parameter path does not exist.');
    parent = parent[part];
  }
  const key = parts.at(-1);
  if (!parent || typeof parent !== 'object') fail('PARAMETER_PATH_NOT_FOUND', command.parameterPath, 'Parameter parent must be an object or array.');
  if (Array.isArray(parent) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length)) fail('PARAMETER_PATH_NOT_FOUND', command.parameterPath, 'Array element must already exist; replace the array to append.');
  if (command.type === 'remove-node-parameter') {
    if (!Object.hasOwn(parent, key)) fail('PARAMETER_NOT_FOUND', command.parameterPath, 'Parameter does not exist.');
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
  } else parent[key] = structuredClone(command.value);
}

// Mutates only the private batch draft; callers must never receive this object
// until whole-document validation and scope enforcement have succeeded.
export function applyCommand(doc, command) {
  const match = command.type.match(/^(add|remove)-(node|edge|workflow-input|workflow-output|asset)$/);
  if (match) {
    const [, operation, kind] = match, collection = collections[kind];
    if (operation === 'add') {
      if (doc[collection].some(item => item.id === command.value.id)) fail(`${noun[collection]}_ALREADY_EXISTS`, `/${collection}`, 'Logical ID already exists.');
      doc[collection].push(structuredClone(command.value));
    } else {
      const entity = find(doc, collection, command.targetId);
      if (kind === 'node' && referencesNode(doc, command.targetId)) fail('REFERENCED_NODE_REMOVE_BLOCKED', '/nodes', 'Disconnect all graph, interface and embedded references before removal.');
      if (kind === 'asset' && referencesAsset(doc, command.targetId)) fail('REFERENCED_ASSET_REMOVE_BLOCKED', '/assets', 'Detach all explicit and structured asset references before removal.');
      doc[collection].splice(doc[collection].indexOf(entity), 1);
    }
    return;
  }
  if (command.type === 'update-asset') {
    Object.assign(find(doc, 'assets', command.targetId), structuredClone(command.changes));
    return;
  }
  if (command.type === 'reconnect-edge') {
    Object.assign(find(doc, 'edges', command.targetId), structuredClone(command.changes));
    return;
  }
  const node = find(doc, 'nodes', command.targetId);
  switch (command.type) {
    case 'update-node': Object.assign(node, structuredClone(command.changes)); break;
    case 'rename-node-title': node.title = command.value; break;
    case 'enable-node': node.enabled = true; break;
    case 'disable-node': node.enabled = false; break;
    case 'set-executor': node.executor = structuredClone(command.value); break;
    case 'set-provider':
    case 'set-model':
      if (!isObject(node.executor)) fail('INVALID_EXECUTOR', '/nodes', 'Executor is not an object.');
      node.executor[command.type === 'set-provider' ? 'provider' : 'model'] = command.value;
      break;
    case 'set-node-parameter':
    case 'remove-node-parameter': parameter(node, command); break;
    case 'set-node-position': node.position = structuredClone(command.value); break;
    case 'attach-asset-to-node':
    case 'detach-asset-from-node': {
      find(doc, 'assets', command.assetId);
      if (node.assetRefs !== undefined && !Array.isArray(node.assetRefs)) fail('INVALID_ASSET_REFS', '/nodes', 'Asset references must be an array.');
      if (command.type === 'attach-asset-to-node') {
        if (!node.assetRefs) node.assetRefs = [];
        if (!node.assetRefs.includes(command.assetId)) node.assetRefs.push(command.assetId);
      } else {
        const index = node.assetRefs?.indexOf(command.assetId) ?? -1;
        if (index === -1) fail('ASSET_NOT_ATTACHED', '/nodes', 'Asset is not attached to the node.');
        node.assetRefs.splice(index, 1);
      }
      break;
    }
    default: fail('UNSUPPORTED_COMMAND', '', 'Unknown command type.');
  }
}

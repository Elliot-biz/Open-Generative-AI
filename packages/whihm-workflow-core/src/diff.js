import { createHash } from 'node:crypto';
import { assertWorkflow, exportWorkflow } from './index.js';

export const collectionNames = Object.freeze(['nodes', 'edges', 'inputs', 'outputs', 'assets']);
export const escapeSegment = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
export const childPath = (path, key) => `${path}/${escapeSegment(key)}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const equalJSON = (a, b) => stableJSON(a) === stableJSON(b);

// Hash the exact canonical v1 serialization, including its trailing newline.
// Canonical timestamps/metadata count; formatting and object-key order do not.
export function hashWorkflow(doc) {
  return createHash('sha256').update(exportWorkflow(doc), 'utf8').digest('hex');
}

function fields(before, after, path, changes) {
  if (equalJSON(before, after)) return;
  if (object(before) && object(after)) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const p = childPath(path, key);
      if (!Object.hasOwn(before, key)) changes.push({ path: p, operation: 'added', after: structuredClone(after[key]) });
      else if (!Object.hasOwn(after, key)) changes.push({ path: p, operation: 'removed', before: structuredClone(before[key]) });
      else fields(before[key], after[key], p, changes);
    }
  } else {
    // Arrays are ordered values, not sets. Report the entire array rather than
    // hiding shifts of clip sequence / legacy output indexes behind leaf edits.
    changes.push({ path, operation: 'modified', before: structuredClone(before), after: structuredClone(after) });
  }
}

export function diffWorkflows(before, after) {
  assertWorkflow(before);
  assertWorkflow(after);
  const diff = [];
  for (const collection of collectionNames) {
    const left = new Map(before[collection].map((item, index) => [item.id, { item, index }]));
    const right = new Map(after[collection].map((item, index) => [item.id, { item, index }]));
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const path = childPath(`/${collection}`, id), a = left.get(id), b = right.get(id);
      if (!a) diff.push({ collection, id, path, operation: 'added', after: structuredClone(b.item), afterIndex: b.index });
      else if (!b) diff.push({ collection, id, path, operation: 'removed', before: structuredClone(a.item), beforeIndex: a.index });
      else if (!equalJSON(a.item, b.item)) {
        const changes = [];
        fields(a.item, b.item, path, changes);
        diff.push({ collection, id, path, operation: 'modified', changes });
      }
    }
    // Add/remove positions are already explicit. Detect reordering of surviving
    // IDs separately so array order cannot escape scope enforcement.
    const a = [...left.keys()].filter(id => right.has(id));
    const b = [...right.keys()].filter(id => left.has(id));
    if (!equalJSON(a, b)) diff.push({ collection, path: `/${collection}`, operation: 'reordered', before: [...left.keys()], after: [...right.keys()] });
  }
  const left = Object.fromEntries(Object.entries(before).filter(([key]) => !collectionNames.includes(key)));
  const right = Object.fromEntries(Object.entries(after).filter(([key]) => !collectionNames.includes(key)));
  const changes = [];
  fields(left, right, '', changes);
  diff.push(...changes.map(change => ({ collection: 'workflow', ...change })));
  return diff;
}

export function changedPaths(diff) {
  return diff.flatMap(change => change.changes ? change.changes.map(field => field.path) : [change.path]);
}

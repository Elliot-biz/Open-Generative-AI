import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createWorkflow, validateWorkflow, exportWorkflow, importWorkflow,
  applyEditBatch, validateCommandBatch, hashWorkflow, diffWorkflows, commandSchema,
} from '../src/index.js';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/heterogeneous-media.json', import.meta.url), 'utf8'));
const empty = () => createWorkflow({ workflowId: 'command_job', name: 'Command job' });
const node = (id = 'clip_a', kind = 'remote-model') => ({
  id, title: `Title ${id}`, kind: 'media', executor: {
    type: kind, id: kind === 'remote-model' ? 'provider.model' : 'whihm.utility',
    ...(kind === 'remote-model' ? { provider: 'example', model: 'model-a' } : { tool: 'whihm.video-combiner' }),
    mayCostMoney: kind === 'remote-model', requiresConfirmation: kind === 'remote-model',
  }, inputs: [{ id: 'clips', type: 'video', cardinality: 'many' }], outputs: [{ id: 'video', type: 'video' }], parameters: {},
});
const edge = (id = 'e1', from = 'clip_a', to = 'clip_b') => ({ id, source: { nodeId: from, portId: 'video' }, target: { nodeId: to, portId: 'clips' } });
const run = (doc, commands, options = {}) => applyEditBatch(doc, { commandVersion: 1, commands, ...options });
function applied(doc, commands, options) {
  const snapshot = structuredClone(doc);
  const result = run(doc, commands, options);
  assert.equal(result.status, 'applied', JSON.stringify(result.errors));
  assert.equal(result.validation.valid, true);
  assert.deepEqual(doc, snapshot);
  assert.notEqual(result.workflow, doc);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  return result;
}
function rejected(doc, commands, code, options) {
  const before = structuredClone(doc);
  const result = run(doc, commands, options);
  assert.equal(result.status, 'rejected');
  assert.ok(result.errors.some(e => e.code === code), JSON.stringify(result.errors));
  assert.deepEqual(doc, before);
  assert.equal(Object.hasOwn(result, 'workflow'), false);
  return result;
}
const pair = () => applied(empty(), [{ type: 'add-node', value: node() }, { type: 'add-node', value: node('clip_b') }]).workflow;

test('hash canonical equality, formatting and key order; canonical changes affect hash', () => {
  const doc = fixture();
  assert.equal(hashWorkflow(doc), hashWorkflow(importWorkflow(JSON.stringify(doc))));
  assert.equal(hashWorkflow(doc), hashWorkflow(Object.fromEntries(Object.entries(doc).reverse())));
  const changed = structuredClone(doc); changed.nodes[0].title = 'Changed';
  assert.notEqual(hashWorkflow(doc), hashWorkflow(changed));
  changed.nodes.reverse(); assert.notEqual(hashWorkflow(doc), hashWorkflow(changed));
});
test('stale hash rejects before any command, including an invalid target', () => {
  const result = rejected(pair(), [{ type: 'rename-node-title', targetId: 'absent', value: 'New' }], 'WORKFLOW_HASH_MISMATCH', { expectedWorkflowHash: '0'.repeat(64) });
  assert.equal(result.afterHash, null); assert.deepEqual(result.diff, []);
});
test('batch and per-command expected-state conditions; distinguish absent from null', () => {
  const doc = pair();
  applied(doc, [{ type: 'set-model', targetId: 'clip_a', value: 'model-b', preconditions: [{ at: '/nodes/clip_a/executor/model', equals: 'model-a' }] }], { expectedWorkflowHash: hashWorkflow(doc), preconditions: [{ at: '/nodes/clip_a', exists: true }] });
  rejected(doc, [{ type: 'set-model', targetId: 'clip_a', value: 'b', preconditions: [{ at: '/nodes/clip_a/executor/model', equals: 'stale' }] }], 'PRECONDITION_FAILED');
  applied(doc, [
    { type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/x', value: null, preconditions: [{ at: '/nodes/clip_a/parameters/x', exists: false }] },
    { type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/x', value: 4, preconditions: [{ at: '/nodes/clip_a/parameters/x', equals: null }] },
  ]);
  rejected(doc, [], 'PRECONDITION_FAILED', { preconditions: [{ at: '/nodes/clip_a/parameters/x', equals: null }] });
});
test('title rename changes only title, preserving identity, edges and embedded refs', () => {
  const doc = fixture(); const result = applied(doc, [{ type: 'rename-node-title', targetId: 'video', value: 'Snow Motion' }], { allowedPaths: ['/nodes/video/title'] });
  const expected = structuredClone(doc); expected.nodes.find(n => n.id === 'video').title = 'Snow Motion';
  assert.deepEqual(result.workflow, expected);
  assert.deepEqual(result.diff[0].changes.map(x => x.path), ['/nodes/video/title']);
});
test('set provider/model/executor changes no titles, ports, parameters, IDs or edges', () => {
  const doc = fixture(); const result = applied(doc, [
    { type: 'set-provider', targetId: 'video', value: 'another-provider' },
    { type: 'set-model', targetId: 'video', value: 'another-model' },
  ], { allowedPaths: ['/nodes/video/executor/provider', '/nodes/video/executor/model'] });
  const expected = structuredClone(doc); Object.assign(expected.nodes[2].executor, { provider: 'another-provider', model: 'another-model' });
  assert.deepEqual(result.workflow, expected);
  const executor = { type: 'utility', id: 'whihm.utility', tool: 'passthrough', mayCostMoney: false, requiresConfirmation: false };
  const swapped = applied(doc, [{ type: 'set-executor', targetId: 'video', value: executor }]);
  const expectedSwap = structuredClone(doc); expectedSwap.nodes[2].executor = executor; assert.deepEqual(swapped.workflow, expectedSwap);
  rejected(doc, [{ type: 'set-executor', targetId: 'video', value: { type: 'remote-model', id: 'provider.model', mayCostMoney: true, requiresConfirmation: true } }], 'RESULTING_WORKFLOW_INVALID');
});
test('update node, enable/disable and position stay narrow', () => {
  const doc = pair(); const result = applied(doc, [
    { type: 'update-node', targetId: 'clip_a', changes: { metadata: { approved: false } } },
    { type: 'disable-node', targetId: 'clip_a' }, { type: 'enable-node', targetId: 'clip_b' },
    { type: 'set-node-position', targetId: 'clip_a', value: { x: 10, y: -5 } },
  ]);
  assert.equal(result.workflow.nodes[0].enabled, false); assert.equal(result.workflow.nodes[1].enabled, true);
  assert.deepEqual(result.workflow.nodes[0].position, { x: 10, y: -5 });
  rejected(doc, [{ type: 'update-node', targetId: 'clip_a', changes: { id: 'renamed' } }], 'IMMUTABLE_ID');
});
test('set/remove nested parameters and escaped keys; array changes are explicit', () => {
  let doc = applied(pair(), [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/settings', value: { duration: 5, clips: [1, 2] } }]).workflow;
  const result = applied(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/settings/duration', value: 7 }], { allowedPaths: ['/nodes/clip_a/parameters/settings/duration'] });
  assert.equal(result.diff[0].changes[0].path, '/nodes/clip_a/parameters/settings/duration');
  doc = applied(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/a~1b', value: 9 }]).workflow;
  assert.equal(doc.nodes[0].parameters['a/b'], 9);
  doc = applied(doc, [{ type: 'remove-node-parameter', targetId: 'clip_a', parameterPath: '/settings/clips/0' }, { type: 'remove-node-parameter', targetId: 'clip_a', parameterPath: '/a~1b' }]).workflow;
  assert.deepEqual(doc.nodes[0].parameters.settings.clips, [2]);
  rejected(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/missing/child', value: 1 }], 'PARAMETER_PATH_NOT_FOUND');
  rejected(doc, [{ type: 'remove-node-parameter', targetId: 'clip_a', parameterPath: '/missing' }], 'PARAMETER_NOT_FOUND');
});
test('add/remove/reconnect edge and protect referenced nodes', () => {
  let doc = pair(); doc = applied(doc, [{ type: 'add-edge', value: edge() }]).workflow;
  rejected(doc, [{ type: 'remove-node', targetId: 'clip_a' }], 'REFERENCED_NODE_REMOVE_BLOCKED');
  const reconnected = applied(doc, [{ type: 'reconnect-edge', targetId: 'e1', changes: { source: { nodeId: 'clip_b', portId: 'video' }, target: { nodeId: 'clip_a', portId: 'clips' } } }]);
  assert.equal(reconnected.diff[0].collection, 'edges'); assert.equal(reconnected.diff[0].operation, 'modified');
  doc = applied(doc, [{ type: 'remove-edge', targetId: 'e1' }, { type: 'remove-node', targetId: 'clip_a' }]).workflow;
  assert.equal(doc.nodes.length, 1);
});
test('add/remove workflow IO; check expected output endpoint', () => {
  const doc = applied(pair(), [
    { type: 'add-workflow-input', value: { id: 'clips', type: 'video', targets: [{ nodeId: 'clip_a', portId: 'clips' }] } },
    { type: 'add-workflow-output', value: { id: 'final', type: 'video', source: { nodeId: 'clip_b', portId: 'video' } } },
  ]).workflow;
  rejected(doc, [{ type: 'remove-node', targetId: 'clip_a' }], 'REFERENCED_NODE_REMOVE_BLOCKED');
  rejected(doc, [{ type: 'remove-node', targetId: 'clip_b' }], 'REFERENCED_NODE_REMOVE_BLOCKED');
  const result = applied(doc, [{ type: 'remove-workflow-input', targetId: 'clips' }, { type: 'remove-workflow-output', targetId: 'final', preconditions: [{ at: '/outputs/final/source', equals: { portId: 'video', nodeId: 'clip_b' } }] }]);
  assert.equal(result.workflow.inputs.length, 0); assert.equal(result.workflow.outputs.length, 0);
});
test('add/update/attach/detach/remove asset; referenced asset removal blocked', () => {
  let doc = applied(pair(), [{ type: 'add-asset', value: { id: 'logo', type: 'image', localPath: 'assets/logo.png' } }, { type: 'attach-asset-to-node', targetId: 'clip_a', assetId: 'logo' }]).workflow;
  rejected(doc, [{ type: 'remove-asset', targetId: 'logo' }], 'REFERENCED_ASSET_REMOVE_BLOCKED');
  doc = applied(doc, [{ type: 'update-asset', targetId: 'logo', changes: { localPath: 'assets/logo-v2.png' } }]).workflow;
  assert.equal(doc.assets[0].localPath, 'assets/logo-v2.png');
  const result = applied(doc, [{ type: 'detach-asset-from-node', targetId: 'clip_a', assetId: 'logo' }, { type: 'remove-asset', targetId: 'logo' }]);
  assert.deepEqual(result.workflow.assets, []); assert.deepEqual(result.workflow.nodes[0].assetRefs, []);
});
test('embedded parameter, fallback and explicit dependency references block node removal', () => {
  for (const changes of [
    { parameters: { clip: '{{ clip_a.outputs[0].value }}' } },
    { parameters: { clip: { $nodeOutput: { nodeId: 'clip_a', portId: 'video' } } } },
    { dependencies: ['clip_a'] },
    { fallbackPolicy: { source: { $nodeOutput: { nodeId: 'clip_a', portId: 'video' } } } },
  ]) {
    const doc = applied(pair(), [{ type: 'update-node', targetId: 'clip_b', changes }]).workflow;
    rejected(doc, [{ type: 'remove-node', targetId: 'clip_a' }], 'REFERENCED_NODE_REMOVE_BLOCKED');
  }
});
test('structured asset references block removal independently of assetRefs', () => {
  const doc = applied(pair(), [{ type: 'add-asset', value: { id: 'logo', type: 'image', localPath: 'assets/logo.png' } }, { type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/logo', value: { $asset: 'logo' } }]).workflow;
  rejected(doc, [{ type: 'remove-asset', targetId: 'logo' }], 'REFERENCED_ASSET_REMOVE_BLOCKED');
});
test('successful/failed batches and validation failures never mutate workflow or command objects', () => {
  const doc = pair(), commands = [{ type: 'rename-node-title', targetId: 'clip_a', value: 'New title' }, { type: 'add-edge', value: edge() }], before = structuredClone(commands);
  const success = applied(doc, commands); assert.deepEqual(commands, before);
  success.workflow.nodes[0].title = 'External mutation'; assert.equal(doc.nodes[0].title, 'Title clip_a');
  rejected(doc, [...commands, { type: 'remove-edge', targetId: 'absent' }], 'EDGE_NOT_FOUND');
  rejected(doc, [...commands, { type: 'update-node', targetId: 'clip_a', changes: { position: { x: 'invalid', y: 0 } } }], 'RESULTING_WORKFLOW_INVALID');
  rejected(doc, [{ type: 'add-edge', value: { ...edge(), target: { nodeId: 'clip_b', portId: 'missing' } } }], 'PORT_NOT_FOUND');
});
test('dry run returns prospective hash and exact diff but no workflow state', () => {
  const doc = pair(), before = structuredClone(doc), commands = [{ type: 'rename-node-title', targetId: 'clip_a', value: 'Preview' }];
  const result = run(doc, commands, { dryRun: true });
  assert.equal(result.status, 'dry-run'); assert.equal(Object.hasOwn(result, 'workflow'), false); assert.deepEqual(doc, before);
  const actual = applied(doc, commands); assert.equal(result.afterHash, actual.afterHash); assert.deepEqual(result.diff, actual.diff);
});
test('collateral scope enforces field boundaries, nested executor paths, and empty scope', () => {
  const doc = pair();
  applied(doc, [{ type: 'set-model', targetId: 'clip_a', value: 'model-b' }], { allowedPaths: ['/nodes/clip_a/executor/model'] });
  rejected(doc, [{ type: 'set-model', targetId: 'clip_a', value: 'model-b' }, { type: 'rename-node-title', targetId: 'clip_a', value: 'Unexpected' }], 'COLLATERAL_CHANGE_DETECTED', { allowedPaths: ['/nodes/clip_a/executor/model'] });
  rejected(doc, [{ type: 'rename-node-title', targetId: 'clip_a', value: 'Unexpected' }], 'COLLATERAL_CHANGE_DETECTED', { allowedPaths: ['/nodes/clip'] });
  applied(doc, [], { allowedPaths: [] });
  rejected(doc, [{ type: 'disable-node', targetId: 'clip_a' }], 'COLLATERAL_CHANGE_DETECTED', { allowedPaths: [] });
});
test('semantic diff covers entities, field paths, top-level metadata and meaningful array order', () => {
  const before = pair(), after = structuredClone(before);
  after.nodes[0].parameters.duration = 5; after.nodes.reverse(); after.name = 'New name'; after.metadata = { reviewed: true };
  after.edges.push(edge());
  after.inputs.push({ id: 'input', type: 'video', targets: [{ nodeId: 'clip_a', portId: 'clips' }] });
  after.outputs.push({ id: 'out', type: 'video', source: { nodeId: 'clip_b', portId: 'video' } });
  after.assets.push({ id: 'logo', type: 'image', localPath: 'assets/logo.png' });
  const diff = diffWorkflows(before, after);
  for (const c of ['nodes', 'edges', 'inputs', 'outputs', 'assets', 'workflow']) assert.ok(diff.some(x => x.collection === c));
  assert.ok(diff.some(x => x.operation === 'reordered'));
  assert.ok(diff.some(x => x.changes?.some(p => p.path === '/nodes/clip_a/parameters/duration')));
  const modified = structuredClone(after); modified.inputs[0].title = 'Input'; modified.outputs[0].title = 'Output'; modified.assets[0].localPath = 'assets/other.png';
  for (const c of ['inputs', 'outputs', 'assets']) assert.ok(diffWorkflows(after, modified).some(x => x.collection === c && x.operation === 'modified'));
  const removed = diffWorkflows(after, before); for (const c of ['edges', 'inputs', 'outputs', 'assets']) assert.ok(removed.some(x => x.collection === c && x.operation === 'removed'));
  assert.deepEqual(diffWorkflows(before, Object.fromEntries(Object.entries(before).reverse())), []);
});
test('utility combiner is added with ordered clips, wired and exposed without invoking FFmpeg', () => {
  const doc = pair(), combine = node('combine', 'utility'); combine.title = 'WHIHM Video Combiner';
  const result = applied(doc, [
    { type: 'add-node', value: combine },
    { type: 'set-node-parameter', targetId: 'combine', parameterPath: '/clips', value: [
      { source: { $nodeOutput: { nodeId: 'clip_b', portId: 'video' } }, inSeconds: 1, outSeconds: 3 },
      { source: { $nodeOutput: { nodeId: 'clip_a', portId: 'video' } }, inSeconds: 0, outSeconds: 2 },
    ] },
    { type: 'set-node-parameter', targetId: 'combine', parameterPath: '/export', value: { fps: 30, codec: 'h264', width: 1080, height: 1920 } },
    { type: 'add-edge', value: edge('a_combine', 'clip_a', 'combine') },
    { type: 'add-edge', value: edge('b_combine', 'clip_b', 'combine') },
    { type: 'add-workflow-output', value: { id: 'final', type: 'video', source: { nodeId: 'combine', portId: 'video' } } },
  ]);
  assert.equal(result.workflow.nodes[2].parameters.clips[0].source.$nodeOutput.nodeId, 'clip_b');
  assert.equal(result.workflow.nodes[2].executor.mayCostMoney, false);
  assert.equal(result.workflow.outputs[0].source.nodeId, 'combine');
});
test('commands construct the full heterogeneous fixture incrementally from an empty document', () => {
  const expected = fixture(); let doc = empty();
  // Forward IO references can be declared first within an atomic batch.
  const commands = [
    ...expected.inputs.map(value => ({ type: 'add-workflow-input', value })),
    ...expected.assets.map(value => ({ type: 'add-asset', value })),
    ...expected.nodes.map(value => ({ type: 'add-node', value })),
    ...expected.edges.map(value => ({ type: 'add-edge', value })),
    ...expected.outputs.map(value => ({ type: 'add-workflow-output', value })),
  ];
  doc = applied(doc, JSON.parse(JSON.stringify(commands))).workflow;
  for (const collection of ['nodes', 'edges', 'inputs', 'outputs', 'assets']) assert.deepEqual(doc[collection], expected[collection]);
  assert.equal(validateWorkflow(doc).valid, true);
});
test('batch can insert segmentation between existing steps without transient graph validation', () => {
  const base = pair(); const doc = applied(base, [{ type: 'add-edge', value: edge() }]).workflow;
  const segment = node('segment', 'local-ai'); segment.executor.tool = 'segmentation';
  const result = applied(doc, [
    { type: 'add-node', value: segment }, { type: 'add-edge', value: edge('into_segment', 'clip_a', 'segment') },
    { type: 'add-edge', value: edge('out_segment', 'segment', 'clip_b') }, { type: 'remove-edge', targetId: 'e1' },
  ]);
  assert.equal(result.workflow.edges.length, 2); assert.equal(result.workflow.nodes.length, 3);
});
test('command schema is exported and plain serializable requests validate', () => {
  assert.equal(commandSchema.properties.commandVersion.const, 1);
  const request = { commandVersion: 1, expectedWorkflowHash: hashWorkflow(pair()), allowedPaths: ['/nodes/clip_a/title'], commands: [{ type: 'rename-node-title', targetId: 'clip_a', value: 'New', reason: 'Requested title', metadata: { ticket: 'example' } }] };
  assert.equal(validateCommandBatch(JSON.parse(JSON.stringify(request))).valid, true);
});
for (const [type, fields, code] of [
  ['remove-node', { targetId: 'missing' }, 'NODE_NOT_FOUND'],
  ['remove-edge', { targetId: 'missing' }, 'EDGE_NOT_FOUND'],
  ['remove-asset', { targetId: 'missing' }, 'ASSET_NOT_FOUND'],
  ['add-node', { value: node() }, 'NODE_ALREADY_EXISTS'],
  ['nonsense', {}, 'UNSUPPORTED_COMMAND'],
]) test(`structured ${code}`, () => rejected(pair(), [{ type, ...fields }], code));
test('invalid/unsafe command documents fail without echoing secret values or invoking accessors', () => {
  const doc = pair();
  rejected(doc, [{ type: 'rename-node-title', targetId: 'clip_a', value: 'New', unexpected: true }], 'INVALID_COMMAND');
  rejected(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/__proto__/polluted', value: true }], 'INVALID_COMMAND');
  const result = rejected(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/apiKey', value: 'synthetic-private-value' }], 'RESULTING_WORKFLOW_INVALID');
  assert.equal(JSON.stringify(result).includes('synthetic-private-value'), false);
  const batch = { commandVersion: 1, commands: [] }; batch.cycle = batch;
  assert.equal(applyEditBatch(doc, batch).status, 'rejected');
  const accessor = {}; Object.defineProperty(accessor, 'commands', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.equal(applyEditBatch(doc, accessor).status, 'rejected');
  assert.equal(applyEditBatch(null, { commandVersion: 1, commands: [] }).errors[0].code, 'INPUT_WORKFLOW_INVALID');
});

test('duplicate edges/assets and missing attachment targets return dedicated errors', () => {
  const doc = applied(pair(), [{ type: 'add-edge', value: edge() }, { type: 'add-asset', value: { id: 'logo', type: 'image', localPath: 'assets/logo.png' } }]).workflow;
  rejected(doc, [{ type: 'add-edge', value: edge() }], 'EDGE_ALREADY_EXISTS');
  rejected(doc, [{ type: 'add-asset', value: doc.assets[0] }], 'ASSET_ALREADY_EXISTS');
  rejected(doc, [{ type: 'attach-asset-to-node', targetId: 'clip_a', assetId: 'missing' }], 'ASSET_NOT_FOUND');
  rejected(doc, [{ type: 'detach-asset-from-node', targetId: 'clip_a', assetId: 'logo' }], 'ASSET_NOT_ATTACHED');
});
test('invalid reconnect and broken port replacement reject the entire candidate', () => {
  const doc = applied(pair(), [{ type: 'add-edge', value: edge() }]).workflow;
  rejected(doc, [{ type: 'reconnect-edge', targetId: 'e1', changes: { target: { nodeId: 'clip_b', portId: 'unknown' } } }], 'PORT_NOT_FOUND');
  rejected(doc, [{ type: 'update-node', targetId: 'clip_a', changes: { outputs: [] } }], 'RESULTING_WORKFLOW_INVALID');
  rejected(doc, [{ type: 'reconnect-edge', targetId: 'e1', changes: { id: 'other' } }], 'INVALID_COMMAND');
});
test('nonexistent removal does not silently succeed and node removals do not cascade', () => {
  const doc = pair();
  const result = applied(doc, [{ type: 'remove-node', targetId: 'clip_b' }], { allowedPaths: ['/nodes/clip_b'] });
  assert.deepEqual(result.diff.map(x => [x.collection, x.operation, x.id]), [['nodes', 'removed', 'clip_b']]);
  const add = applied(doc, [{ type: 'add-node', value: node('clip_c') }], { allowedPaths: ['/nodes/clip_c'] });
  assert.deepEqual(add.diff.map(x => [x.collection, x.operation, x.id]), [['nodes', 'added', 'clip_c']]);
});
test('array changes and remove/re-add reordering cannot evade collateral protection', () => {
  const doc = pair();
  rejected(doc, [{ type: 'remove-node', targetId: 'clip_a' }, { type: 'add-node', value: doc.nodes[0] }], 'COLLATERAL_CHANGE_DETECTED', { allowedPaths: ['/nodes/clip_a'] });
  const arrayDoc = applied(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/clips', value: ['a', 'b'] }]).workflow;
  rejected(arrayDoc, [{ type: 'remove-node-parameter', targetId: 'clip_a', parameterPath: '/clips/0' }], 'COLLATERAL_CHANGE_DETECTED', { allowedPaths: ['/nodes/clip_a/parameters/clips/0'] });
  applied(arrayDoc, [{ type: 'remove-node-parameter', targetId: 'clip_a', parameterPath: '/clips/0' }], { allowedPaths: ['/nodes/clip_a/parameters/clips'] });
});
test('dry-run applies the same validation and scope enforcement as actual edits', () => {
  const doc = pair();
  rejected(doc, [{ type: 'disable-node', targetId: 'clip_a' }], 'COLLATERAL_CHANGE_DETECTED', { dryRun: true, allowedPaths: [] });
  rejected(doc, [{ type: 'add-edge', value: edge('bad', 'missing') }], 'RESULTING_WORKFLOW_INVALID', { dryRun: true });
});
test('workflow input default dependencies and asset references are removal-protected', () => {
  const doc = pair(); doc.nodes[1].inputs.push({ id: 'config', type: 'json' });
  const withDefault = applied(doc, [{ type: 'add-workflow-input', value: { id: 'config', type: 'json', targets: [{ nodeId: 'clip_b', portId: 'config' }], default: { $nodeOutput: { nodeId: 'clip_a', portId: 'video' } } } }]).workflow;
  rejected(withDefault, [{ type: 'remove-node', targetId: 'clip_a' }], 'REFERENCED_NODE_REMOVE_BLOCKED');
  const withAsset = applied(doc, [{ type: 'add-asset', value: { id: 'logo', type: 'image', localPath: 'assets/logo.png' } }, { type: 'add-workflow-input', value: { id: 'config', type: 'json', targets: [{ nodeId: 'clip_b', portId: 'config' }], default: { $asset: 'logo' } } }]).workflow;
  rejected(withAsset, [{ type: 'remove-asset', targetId: 'logo' }], 'REFERENCED_ASSET_REMOVE_BLOCKED');
});
test('parameter expected value and edge existence checks fail on stale targeted state', () => {
  const doc = applied(pair(), [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/duration', value: 5 }]).workflow;
  rejected(doc, [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/duration', value: 7, preconditions: [{ at: '/nodes/clip_a/parameters/duration', equals: 6 }] }], 'PRECONDITION_FAILED');
  rejected(doc, [], 'PRECONDITION_FAILED', { preconditions: [{ at: '/edges/e1', exists: true }] });
});
test('non-JSON commands, invalid scopes and unknown schema versions fail closed', () => {
  for (const bad of [null, [], { commandVersion: 2, commands: [] }, { commandVersion: 1, commands: [], allowedPaths: ['nodes/a'] }, { commandVersion: 1, commands: [], dryRun: 'yes' }, { commandVersion: 1, commands: [], metadata: { bad: undefined } }]) {
    const result = applyEditBatch(pair(), bad); assert.equal(result.status, 'rejected'); assert.equal(Object.hasOwn(result, 'workflow'), false);
  }
  rejected(pair(), [{ type: 'set-node-parameter', targetId: 'clip_a', parameterPath: '/bad~2escape', value: 1 }], 'INVALID_COMMAND');
});

test('machine-readable command operands reject malformed entity shapes before editing', () => {
  const request = { commandVersion: 1, commands: [{ type: 'add-node', value: { id: 'partial' } }] };
  assert.equal(validateCommandBatch(request).valid, false);
  rejected(pair(), [{ type: 'set-node-position', targetId: 'clip_a', value: { x: 'invalid', y: 0 } }], 'INVALID_COMMAND');
  rejected(pair(), [{ type: 'add-edge', value: { id: 'partial' } }], 'INVALID_COMMAND');
});

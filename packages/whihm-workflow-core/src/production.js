import { validateWorkflow } from './validate.js';
import { hashWorkflow, diffWorkflows, escapeSegment } from './diff.js';
import { applyEditBatch } from './edit.js';
import { workflowDependencyMap, dependencyScope, assetIds } from './dependencies.js';
import { fields, ensure, validHash, object, safeData } from './project/io.js';
import { assessWorkflowReadiness } from './readiness.js';

const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const nodeAt = (workflow, id) => {
  const node = workflow.nodes.find(n => n.id === id);
  ensure(node, 'NODE_NOT_FOUND', 'Production evidence requires an existing node.'); return node;
};
function validWorkflow(workflow) {
  ensure(validateWorkflow(workflow).valid, 'WORKFLOW_INVALID', 'Expected a valid canonical workflow.');
}
export const isManualGate = node => node.executionPolicy?.manual === true || node.executor.requiresConfirmation === true ||
  (node.executor.type === 'control' && ['approval', 'approval-gate', 'review', 'manual', 'storyboard-review'].includes(node.executor.tool));

// Only explicitly presentation-only metadata is excluded. Unknown metadata and
// oga.mode remain material; port ordering remains meaningful for embedded refs.
function presentationFree(value) {
  const copy = structuredClone(value);
  delete copy.title; delete copy.label; delete copy.position;
  if (copy.metadata) {
    delete copy.metadata.presentation;
    if (!Object.keys(copy.metadata).length) delete copy.metadata;
  }
  return copy;
}

/** Canonical hash of a valid dependency-scope projection, never a new workflow format. */
export function hashNodeProductionScope(workflow, nodeId, { inputs = {}, includeOwnOutput = false } = {}) {
  validWorkflow(workflow); nodeAt(workflow, nodeId); safeData(inputs, 'PRODUCTION_INPUT_INVALID');
  const scope = dependencyScope(workflowDependencyMap(workflow), nodeId);
  const nodes = workflow.nodes.filter(n => scope.has(n.id)).map(n => {
    const copy = presentationFree(n), outputHash = n.metadata?.production?.derived?.outputHash;
    copy.title = '';
    if (copy.metadata) {
      delete copy.metadata.production;
      if (!Object.keys(copy.metadata).length) delete copy.metadata;
    }
    copy.metadata = { definition: copy.metadata || {}, ...((n.id !== nodeId || includeOwnOutput) && outputHash !== undefined ? { scopeOutputHash: outputHash } : {}) };
    copy.inputs = copy.inputs.map(presentationFree); copy.outputs = copy.outputs.map(presentationFree);
    return copy;
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const bindings = workflow.inputs.map(input => ({ ...presentationFree(input), targets: input.targets.filter(t => scope.has(t.nodeId)) }))
    .filter(input => input.targets.length).map(input => Object.hasOwn(inputs, input.id) ? { ...input, default: structuredClone(inputs[input.id]) } : input);
  const refs = new Set();
  for (const node of nodes) {
    (node.assetRefs || []).forEach(id => refs.add(id)); assetIds(node.parameters, refs); assetIds(node.fallbackPolicy, refs);
  }
  for (const input of bindings) {
    assetIds(input.default, refs);
    if (input.type === 'asset' && input.default !== undefined) (Array.isArray(input.default) ? input.default : [input.default]).forEach(id => refs.add(id));
  }
  const metadata = structuredClone(workflow.metadata || {}); delete metadata.presentation;
  return hashWorkflow({ schemaVersion: 1, workflowId: workflow.workflowId, name: '', nodes,
    edges: workflow.edges.filter(e => scope.has(e.source.nodeId) && scope.has(e.target.nodeId)).map(presentationFree),
    inputs: bindings, outputs: workflow.outputs.filter(o => scope.has(o.source.nodeId)).map(presentationFree),
    assets: workflow.assets.filter(a => refs.has(a.id)).map(presentationFree), metadata,
    ...Object.fromEntries(['execution', 'review', 'variants'].filter(key => workflow[key] !== undefined).map(key => [key, structuredClone(workflow[key])])) });
}

function recordValid(record, workflow, node, kind) {
  const required = ['workflowId', 'nodeId', 'workflowHash', 'scopeHash', ...(kind === 'approval' ? ['decision', 'decidedAt', 'actor', 'note'] : ['status', 'outputHash', 'recordedAt'])];
  fields(record, required, ['invalidatedAt', 'previousDecision'], 'PRODUCTION_STATE_INVALID');
  ensure(record.workflowId === workflow.workflowId && record.nodeId === node.id && validHash(record.workflowHash) && validHash(record.scopeHash), 'PRODUCTION_STATE_INVALID', 'Production evidence identity/hash is invalid.');
  ensure(time(record[kind === 'approval' ? 'decidedAt' : 'recordedAt']) && (record.invalidatedAt === undefined || time(record.invalidatedAt)), 'PRODUCTION_STATE_INVALID', 'Explicit production timestamps are required.');
  if (kind === 'approval') {
    ensure(isManualGate(node) && ['PENDING', 'APPROVED', 'REJECTED', 'STALE'].includes(record.decision) && object(record.actor) && typeof record.note === 'string', 'PRODUCTION_STATE_INVALID', 'Invalid approval record.');
    if (record.previousDecision !== undefined) ensure(['PENDING', 'APPROVED', 'REJECTED'].includes(record.previousDecision), 'PRODUCTION_STATE_INVALID', 'Invalid historical decision.');
  } else ensure(['VALID', 'STALE'].includes(record.status) && validHash(record.outputHash) && record.previousDecision === undefined, 'PRODUCTION_STATE_INVALID', 'Invalid derived output evidence.');
  safeData(record, 'PRODUCTION_STATE_INVALID');
}
function productionAt(workflow, node) {
  const state = node.metadata?.production;
  if (state === undefined) return { schemaVersion: 1, workflowId: workflow.workflowId };
  fields(state, ['schemaVersion', 'workflowId'], ['approval', 'derived'], 'PRODUCTION_STATE_INVALID');
  ensure(state.schemaVersion === 1 && state.workflowId === workflow.workflowId, 'PRODUCTION_STATE_INVALID', 'Unsupported or mismatched production evidence.');
  for (const key of ['approval', 'derived']) if (state[key] !== undefined) recordValid(state[key], workflow, node, key);
  return structuredClone(state);
}

export function getNodeProductionEvidence(workflow, nodeId, { inputs = {}, evaluatedAt } = {}) {
  ensure(evaluatedAt === undefined || time(evaluatedAt), 'PRODUCTION_STATE_INVALID', 'An evaluation timestamp must be explicit ISO time.');
  const node = nodeAt(workflow, nodeId), state = productionAt(workflow, node), scopeHash = hashNodeProductionScope(workflow, nodeId, { inputs });
  const approvalScopeHash = hashNodeProductionScope(workflow, nodeId, { inputs, includeOwnOutput: true });
  const future = timestamp => evaluatedAt !== undefined && Date.parse(timestamp) > Date.parse(evaluatedAt);
  return { scopeHash, approvalScopeHash,
    approval: { status: !state.approval ? 'PENDING' : state.approval.scopeHash !== approvalScopeHash ? 'STALE' : future(state.approval.decidedAt) ? 'PENDING' : state.approval.decision, record: state.approval ?? null },
    derived: { status: !state.derived ? 'ABSENT' : state.derived.scopeHash !== scopeHash || future(state.derived.recordedAt) ? 'STALE' : state.derived.status, record: state.derived ?? null } };
}

function rejected(error) {
  return { status: 'rejected', errors: [{ code: error.diagnostic?.code || 'PRODUCTION_STATE_INVALID', path: '', message: 'Production transition rejected; input values are omitted.' }] };
}
function transition(workflow, commands, expectedWorkflowHash, reason) {
  const batch = structuredClone({ commandVersion: 1, expectedWorkflowHash, commands, reason });
  return { ...applyEditBatch(workflow, batch), batch };
}
function stateCommand(node, state) {
  return { type: 'update-node', targetId: node.id, changes: { metadata: { ...node.metadata, production: state } } };
}

/** Pure command-backed transition; return batch/result can use existing history.recordEdit. */
export function setNodeApproval(workflow, request) {
  try {
    validWorkflow(workflow);
    fields(request, ['nodeId', 'decision', 'timestamp', 'expectedWorkflowHash'], ['inputs', 'actor', 'note'], 'APPROVAL_REQUEST_INVALID'); safeData(request, 'APPROVAL_REQUEST_INVALID');
    const node = nodeAt(workflow, request.nodeId);
    ensure(isManualGate(node) && ['PENDING', 'APPROVED', 'REJECTED'].includes(request.decision) && time(request.timestamp), 'APPROVAL_REQUEST_INVALID', 'Expected a manual gate, decision and explicit timestamp.');
    const state = productionAt(workflow, node), evidence = getNodeProductionEvidence(workflow, node.id, request);
    if (request.decision === 'APPROVED') {
      for (const id of dependencyScope(workflowDependencyMap(workflow), node.id)) {
        const upstream = getNodeProductionEvidence(workflow, id, { inputs: request.inputs, evaluatedAt: request.timestamp });
        ensure(upstream.derived.status !== 'STALE' && (id === node.id || !isManualGate(nodeAt(workflow, id)) || upstream.approval.status === 'APPROVED'), 'APPROVAL_INPUT_UNRESOLVED', 'Approval requires current derived inputs and resolved upstream gates.');
      }
    }
    state.approval = { workflowId: workflow.workflowId, workflowHash: hashWorkflow(workflow), nodeId: node.id, scopeHash: evidence.approvalScopeHash,
      decision: request.decision, decidedAt: request.timestamp, actor: request.actor ?? {}, note: request.note ?? '' };
    recordValid(state.approval, workflow, node, 'approval');
    return transition(workflow, [stateCommand(node, state)], request.expectedWorkflowHash, 'Record explicit approval decision');
  } catch (error) { return rejected(error); }
}

/** Records supplied output identity only; never executes or reads a media file. */
export function recordNodeOutput(workflow, request) {
  try {
    validWorkflow(workflow);
    fields(request, ['nodeId', 'outputHash', 'timestamp', 'expectedWorkflowHash'], ['inputs'], 'PRODUCTION_OUTPUT_INVALID'); safeData(request, 'PRODUCTION_OUTPUT_INVALID');
    const node = nodeAt(workflow, request.nodeId), state = productionAt(workflow, node);
    state.derived = { workflowId: workflow.workflowId, nodeId: node.id, workflowHash: hashWorkflow(workflow), scopeHash: hashNodeProductionScope(workflow, node.id, request), status: 'VALID', outputHash: request.outputHash, recordedAt: request.timestamp };
    recordValid(state.derived, workflow, node, 'derived');
    return transition(workflow, [stateCommand(node, state)], request.expectedWorkflowHash, 'Record supplied derived output evidence');
  } catch (error) { return rejected(error); }
}

export function quoteScopeValid(scope) {
  return object(scope) && Object.keys(scope).every(key => ['schemaVersion', 'scopeHash', 'status', 'invalidatedAt'].includes(key)) && scope.schemaVersion === 1 && validHash(scope.scopeHash)
    && ['BOUND', 'STALE'].includes(scope.status) && (scope.invalidatedAt === undefined || time(scope.invalidatedAt));
}
export function quoteScopeCurrent(workflow, quote, inputs = {}) {
  const scope = quote.metadata?.whihmScope;
  return quoteScopeValid(scope) && scope.status === 'BOUND' && scope.scopeHash === hashNodeProductionScope(workflow, quote.nodeId, { inputs });
}

/** Attach only supplied quotes for this exact canonical version; never reprice/rebase old envelopes. */
export function bindWorkflowQuotes(workflow, quoteContext, { evaluatedAt, inputs = {} } = {}) {
  try {
    validWorkflow(workflow);
    const report = assessWorkflowReadiness(workflow, { evaluatedAt, inputs, quoteContext });
    ensure(!report.blockers.some(d => d.code === 'READINESS_CONTEXT_INVALID') && quoteContext?.workflowId === workflow.workflowId && quoteContext.workflowHash === hashWorkflow(workflow), 'QUOTE_BINDING_INVALID', 'Quotes must belong to this exact canonical workflow version.');
    const envelope = structuredClone(quoteContext);
    for (const quote of envelope.quotes) {
      ensure(!quote.metadata?.whihmScope || quoteScopeCurrent(workflow, quote, inputs), 'QUOTE_BINDING_INVALID', 'Stale quote evidence cannot be rebound.');
      quote.metadata = { ...quote.metadata, whihmScope: { schemaVersion: 1, scopeHash: hashNodeProductionScope(workflow, quote.nodeId, { inputs }), status: 'BOUND' } };
    }
    return { status: 'bound', quoteContext: envelope, errors: [] };
  } catch (error) { return rejected(error); }
}

/** Explicit evidence transition after an edit. Freshness is also checked on every assessment. */
export function invalidateWorkflowProduction(before, after, options) {
  try {
    validWorkflow(before); validWorkflow(after);
    fields(options, ['evaluatedAt'], ['beforeInputs', 'afterInputs', 'quoteContext'], 'PRODUCTION_INVALIDATION_INVALID'); safeData(options, 'PRODUCTION_INVALIDATION_INVALID');
    ensure(before.workflowId === after.workflowId && time(options.evaluatedAt), 'PRODUCTION_INVALIDATION_INVALID', 'Matching workflow identity and explicit evaluation time are required.');
    const sourceDiff = diffWorkflows(before, after), commands = [], affectedNodeIds = [];
    for (const node of [...after.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      const scopeHash = hashNodeProductionScope(after, node.id, { inputs: options.afterInputs });
      const approvalScopeHash = hashNodeProductionScope(after, node.id, { inputs: options.afterInputs, includeOwnOutput: true });
      if (!before.nodes.some(n => n.id === node.id) || scopeHash !== hashNodeProductionScope(before, node.id, { inputs: options.beforeInputs }) || approvalScopeHash !== hashNodeProductionScope(before, node.id, { inputs: options.beforeInputs, includeOwnOutput: true })) affectedNodeIds.push(node.id);
      const state = productionAt(after, node); let changed = false;
      for (const key of ['approval', 'derived']) {
        const record = state[key], field = key === 'approval' ? 'decision' : 'status';
        if (record && record[field] !== 'STALE' && record.scopeHash !== (key === 'approval' ? approvalScopeHash : scopeHash)) {
          if (key === 'approval') record.previousDecision = record.decision;
          record[field] = 'STALE'; record.invalidatedAt = options.evaluatedAt; changed = true;
        }
      }
      if (changed) commands.push(stateCommand(node, state));
    }
    let quoteContext, quoteBindingSource; const retiredQuotes = [];
    if (options.quoteContext !== undefined) {
      quoteContext = structuredClone(options.quoteContext);
      ensure(quoteContext?.workflowId === after.workflowId && Array.isArray(quoteContext.quotes), 'QUOTE_BINDING_INVALID', 'Quote identity must match the workflow.');
      // An exact before-version is sufficient evidence to attach scopes to legacy
      // entries. Keep the original envelope hash/prices/times; never rebase a hash.
      const unscoped = quoteContext.quotes.filter(q => q?.metadata?.whihmScope === undefined);
      if (unscoped.length && quoteContext.workflowHash === hashWorkflow(before)) {
        const bound = bindWorkflowQuotes(before, { ...quoteContext, quotes: unscoped }, { evaluatedAt: options.evaluatedAt, inputs: options.beforeInputs });
        ensure(bound.status === 'bound', 'QUOTE_BINDING_INVALID', 'Before-version quote evidence could not be verified.');
        const attached = new Map(bound.quoteContext.quotes.map(q => [q.nodeId, q]));
        quoteContext.quotes = quoteContext.quotes.map(q => attached.get(q.nodeId) || q);
        quoteBindingSource = 'verified-before-workflow';
      }
      const removed = quoteContext.quotes.filter(q => !after.nodes.some(n => n.id === q.nodeId));
      if (removed.length) {
        const original = assessWorkflowReadiness(before, { evaluatedAt: options.evaluatedAt, inputs: options.beforeInputs || {}, quoteContext });
        ensure(!original.blockers.some(d => d.code === 'READINESS_CONTEXT_INVALID'), 'QUOTE_BINDING_INVALID', 'Removed quote entries must be valid original evidence.');
        retiredQuotes.push(...removed.map(quote => ({ reason: 'NODE_REMOVED', quote })));
        quoteContext.quotes = quoteContext.quotes.filter(q => after.nodes.some(n => n.id === q.nodeId));
      }
      // Existing readiness validates quote schema, currency, identities and secrets.
      const report = assessWorkflowReadiness(after, { evaluatedAt: options.evaluatedAt, inputs: options.afterInputs || {}, quoteContext });
      ensure(!report.blockers.some(d => d.code === 'READINESS_CONTEXT_INVALID'), 'QUOTE_BINDING_INVALID', 'Malformed quote context.');
      for (const quote of quoteContext.quotes) if (quote.metadata?.whihmScope && !quoteScopeCurrent(after, quote, options.afterInputs)) {
        quote.metadata.whihmScope.status = 'STALE'; quote.metadata.whihmScope.invalidatedAt ??= options.evaluatedAt;
      }
    }
    const result = transition(after, commands, hashWorkflow(after), 'Invalidate stale production evidence');
    return { ...result, sourceDiff, affectedNodeIds, removedNodeIds: before.nodes.filter(n => !after.nodes.some(a => a.id === n.id)).map(n => n.id).sort(),
      ...(quoteContext ? { quoteContext, retiredQuotes, ...(quoteBindingSource ? { quoteBindingSource } : {}) } : {}), invalidatedPaths: commands.map(c => `/nodes/${escapeSegment(c.targetId)}/metadata/production`) };
  } catch (error) { return rejected(error); }
}

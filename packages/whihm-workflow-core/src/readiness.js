import { validateWorkflow } from './validate.js';
import { hashWorkflow } from './diff.js';
import { workflowDependencyMap, assetIds } from './dependencies.js';
import { getNodeProductionEvidence, isManualGate, quoteScopeCurrent, quoteScopeValid } from './production.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const sorted = values => [...values].sort();
const reason = (code, message, details = {}) => ({ code, message, ...details });
const empty = () => ({ executable: 0, blocked: 0, manual: 0, disabledOptional: 0, disabled: 0, inactive: 0, unsupported: 0, unverified: 0, unknownCost: 0 });

// Fixed decimal arithmetic prevents binary-float addition or comparison from
// declaring an unaffordable workflow within budget. No exchange rates inferred.
function units(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return null;
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const shift = 12 + Number(exponent) - fraction.length;
  if (shift < 0) return null;
  return BigInt(whole + fraction) * 10n ** BigInt(shift);
}
function decimal(value) {
  const text = value.toString().padStart(13, '0');
  return `${text.slice(0, -12)}.${text.slice(-12)}`.replace(/\.?0+$/, '') || '0';
}
function amount(value) {
  const number = Number(decimal(value));
  return units(number) === value ? number : null;
}
function checkContext(workflow, context) {
  const errors = [];
  const fail = path => errors.push(reason('READINESS_CONTEXT_INVALID', 'Invalid readiness context field.', { path }));
  // Reuse canonical JSON/secret/path safety, without putting context in the workflow.
  const safe = validateWorkflow({ schemaVersion: 1, workflowId: 'readiness_context', name: '', nodes: [], edges: [], inputs: [], outputs: [], assets: [], metadata: { context } });
  if (!safe.valid) return safe.errors.map(e => ({ ...e, code: 'READINESS_CONTEXT_INVALID' }));
  if (!object(context)) return [reason('READINESS_CONTEXT_INVALID', 'Expected a plain context object.')];
  const keys = (value, allowed, path) => {
    if (!object(value)) { fail(path); return false; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}/${key}`);
    return true;
  };
  keys(context, ['evaluatedAt', 'executors', 'assets', 'inputs', 'nodeStates', 'quoteContext', 'quotePolicy', 'budget'], '');
  if (!iso(context.evaluatedAt)) fail('/evaluatedAt');
  const nodes = new Set(workflow.nodes.map(n => n.id));
  const inputIds = new Set(workflow.inputs.map(i => i.id));
  if (context.inputs !== undefined && keys(context.inputs, [...inputIds], '/inputs')) {
    // Value typing is checked against the canonical interface below.
  }
  if (context.nodeStates !== undefined && keys(context.nodeStates, [...nodes], '/nodeStates')) {
    for (const [id, state] of Object.entries(context.nodeStates)) {
      if (!keys(state, ['active', 'manualResolved'], `/nodeStates/${id}`)) continue;
      for (const value of Object.values(state)) if (typeof value !== 'boolean') fail(`/nodeStates/${id}`);
      if (state.active === false && workflow.nodes.find(n => n.id === id)?.executionPolicy?.optional !== true) fail(`/nodeStates/${id}/active`);
    }
  }
  for (const [key, fields] of [['assets', ['id', 'present']], ['executors', ['id', 'type', 'provider', 'model', 'tool', 'available']]]) {
    if (context[key] === undefined) continue;
    if (!Array.isArray(context[key])) { fail(`/${key}`); continue; }
    const identities = new Set();
    for (const [i, entry] of context[key].entries()) {
      const path = `/${key}/${i}`;
      if (!keys(entry, fields, path)) continue;
      if (typeof entry.id !== 'string' || !entry.id || ![true, false, null].includes(entry[key === 'assets' ? 'present' : 'available'])) fail(path);
      if (key === 'executors' && !['remote-model', 'local-ai', 'utility', 'control'].includes(entry.type)) fail(path);
      for (const field of ['provider', 'model', 'tool']) if (entry[field] !== undefined && typeof entry[field] !== 'string') fail(path);
      const identity = key === 'assets' ? entry.id : JSON.stringify([entry.id, entry.type, entry.provider, entry.model, entry.tool]);
      if (identities.has(identity)) fail(path);
      identities.add(identity);
    }
  }
  if (context.quotePolicy !== undefined && keys(context.quotePolicy, ['maxAgeMs'], '/quotePolicy')) {
    if (!Number.isSafeInteger(context.quotePolicy.maxAgeMs) || context.quotePolicy.maxAgeMs <= 0) fail('/quotePolicy/maxAgeMs');
  }
  if (context.budget !== undefined && keys(context.budget, ['maximumSpend', 'currency'], '/budget')) {
    if (units(context.budget.maximumSpend) === null || !currency(context.budget.currency)) fail('/budget');
  }
  if (context.quoteContext !== undefined && keys(context.quoteContext, ['schemaVersion', 'workflowId', 'workflowHash', 'quotes'], '/quoteContext')) {
    const q = context.quoteContext;
    if (q.schemaVersion !== 1 || typeof q.workflowId !== 'string' || !/^[a-f0-9]{64}$/.test(q.workflowHash)) fail('/quoteContext');
    if (!Array.isArray(q.quotes)) fail('/quoteContext/quotes');
    else {
      const seen = new Set();
      q.quotes.forEach((quote, i) => {
        const path = `/quoteContext/quotes/${i}`;
        if (!keys(quote, ['nodeId', 'amount', 'currency', 'quotedAt', 'expiresAt', 'provider', 'model', 'source', 'metadata'], path)) return;
        if (!nodes.has(quote.nodeId) || seen.has(quote.nodeId) || units(quote.amount) === null || !currency(quote.currency) || !iso(quote.quotedAt)) fail(path);
        if (quote.expiresAt !== undefined && (!iso(quote.expiresAt) || Date.parse(quote.expiresAt) <= Date.parse(quote.quotedAt))) fail(path);
        for (const field of ['provider', 'model', 'source']) if (quote[field] !== undefined && typeof quote[field] !== 'string') fail(path);
        if (quote.metadata !== undefined && !object(quote.metadata)) fail(path);
        if (quote.metadata?.whihmScope !== undefined && !quoteScopeValid(quote.metadata.whihmScope)) fail(`${path}/metadata/whihmScope`);
        seen.add(quote.nodeId);
      });
    }
  }
  return errors;
}
function inputValueValid(input, value) {
  const one = v => v !== null && (input.type === 'any' || (['text', 'image', 'video', 'audio', 'asset', 'file', 'result', 'selection'].includes(input.type) ? typeof v === 'string' && v.length > 0
    : input.type === 'number' ? typeof v === 'number' : input.type === 'boolean' ? typeof v === 'boolean' : input.type === 'object' ? object(v) : true));
  return input.cardinality === 'many' ? Array.isArray(value) && value.length > 0 && value.every(one) : one(value);
}

/** Pure whole-document assessment. Context is evidence, never an executor. */
export function assessWorkflowReadiness(workflow, context = {}) {
  const validation = validateWorkflow(workflow);
  const base = { status: 'INVALID', ready: false, workflowId: validation.valid ? workflow.workflowId : null, workflowHash: null,
    evaluatedAt: null, summary: empty(), blockers: [], warnings: [], manualGates: [], disabledOptional: [], nodes: {}, cost: null, validation };
  if (!validation.valid) return { ...base, validation: { ...validation, warnings: validation.warnings.map(({ code, path }) => ({ code, path, message: 'Canonical validation warning.' })) }, blockers: [reason('WORKFLOW_INVALID', 'Canonical workflow validation failed.')] };
  base.workflowHash = hashWorkflow(workflow);
  const contextErrors = checkContext(workflow, context);
  if (contextErrors.length) return { ...base, status: 'BLOCKED', blockers: contextErrors };
  base.evaluatedAt = context.evaluatedAt;
  const nodes = new Map(workflow.nodes.map(n => [n.id, n]));
  const reports = new Map();
  const hard = new Set(), pending = new Set(), uncertain = new Set();
  const deps = workflowDependencyMap(workflow, validation);
  const reachable = new Set();
  const visit = id => { if (reachable.has(id)) return; reachable.add(id); deps.get(id).forEach(visit); };
  workflow.outputs.forEach(o => visit(o.source.nodeId));
  for (const id of sorted(nodes.keys())) {
    const node = nodes.get(id), optional = node.executionPolicy?.optional === true;
    const active = node.enabled !== false && context.nodeStates?.[id]?.active !== false;
    const status = active ? 'EXECUTABLE' : node.enabled === false ? optional ? 'DISABLED_OPTIONAL' : 'DISABLED' : 'INACTIVE';
    const report = { status, active, optional, outputReachable: reachable.has(id), reasons: [], cost: null };
    reports.set(id, report);
    if (!active) {
      report.reasons.push(reason(optional && node.enabled === false ? 'NODE_DISABLED_OPTIONAL' : 'NODE_INACTIVE', 'Node is explicitly excluded from the active production plan.'));
      if (status === 'DISABLED_OPTIONAL') base.disabledOptional.push(id);
    }
  }
  const add = (id, code, message, level, details = {}) => {
    reports.get(id).reasons.push(reason(code, message, details));
    (level === 'hard' ? hard : level === 'manual' ? pending : uncertain).add(id);
  };
  // Detect active dependency cycles separately from downstream blockage.
  const visiting = [], visited = new Set(), cyclic = new Set();
  const cycle = id => {
    if (!reports.get(id).active) return;
    if (visiting.includes(id)) { visiting.slice(visiting.indexOf(id)).forEach(n => cyclic.add(n)); return; }
    if (visited.has(id)) return;
    visiting.push(id); deps.get(id).forEach(cycle); visiting.pop(); visited.add(id);
  };
  sorted(nodes.keys()).forEach(cycle);
  cyclic.forEach(id => add(id, 'DEPENDENCY_CYCLE', 'Active dependency cycle cannot be evaluated as a finite production path.', 'hard'));
  const inputBindings = new Map();
  for (const input of workflow.inputs) {
    const provided = own(context.inputs || {}, input.id) || own(input, 'default');
    const value = own(context.inputs || {}, input.id) ? context.inputs[input.id] : input.default;
    const validValue = provided && inputValueValid(input, value);
    for (const target of input.targets) {
      if (validValue) inputBindings.set(JSON.stringify([target.nodeId, target.portId]), value);
      else if (reports.get(target.nodeId).active && (input.required || provided)) add(target.nodeId, 'WORKFLOW_INPUT_MISSING', 'Required workflow input is absent or has an incompatible value.', 'hard', { inputId: input.id });
    }
  }
  const inventory = context.assets === undefined ? null : new Map(context.assets.map(a => [a.id, a.present]));
  for (const id of sorted(nodes.keys())) {
    const node = nodes.get(id), report = reports.get(id);
    if (!report.active) continue;
    if (!report.outputReachable && workflow.outputs.length) base.warnings.push(reason('NODE_OUTSIDE_OUTPUT_PATH', 'Enabled node is outside declared output ancestry; it still counts toward readiness and cost.', { nodeId: id }));
    const manual = isManualGate(node);
    let production;
    try { production = getNodeProductionEvidence(workflow, id, { inputs: context.inputs, evaluatedAt: context.evaluatedAt }); }
    catch { add(id, 'PRODUCTION_STATE_INVALID', 'Production evidence is malformed or its scope cannot be verified.', 'hard'); }
    report.approval = manual ? production?.approval.status || 'PENDING' : 'NOT_REQUIRED';
    report.derived = production?.derived.status || 'ABSENT';
    if (production?.derived.status === 'STALE') add(id, 'OUTPUT_STALE', 'Derived output evidence no longer matches its production dependencies.', 'hard');
    if (manual && production?.approval.status === 'REJECTED') add(id, 'APPROVAL_REJECTED', 'Required manual/control gate was explicitly rejected.', 'hard');
    else if (manual && production?.approval.status !== 'APPROVED') {
      add(id, 'APPROVAL_PENDING', 'Required manual/control gate has no current explicit approval.', 'manual');
      if (production?.approval.status === 'STALE') add(id, 'APPROVAL_STALE', 'Approval belongs to a different production dependency state.', 'manual');
      base.manualGates.push(id);
    }
    // A resolved manual control gate needs no generation/runtime binding.
    if (!(manual && node.executor.type === 'control')) {
      const match = context.executors?.find(e => ['id', 'type', 'provider', 'model', 'tool'].every(field => e[field] === node.executor[field]));
      if (context.executors === undefined) add(id, 'EXECUTOR_UNVERIFIED', 'No executor availability evidence was supplied.', 'uncertain');
      else if (!match) add(id, 'EXECUTOR_UNSUPPORTED', 'No matching runtime binding was supplied for this executor identity.', 'hard');
      else if (match.available === null) add(id, 'EXECUTOR_UNVERIFIED', 'Runtime binding exists, but operational availability is unverified.', 'uncertain');
      else if (!match.available) add(id, node.executor.type === 'utility' ? 'UTILITY_UNAVAILABLE' : 'EXECUTOR_UNAVAILABLE', 'Declared runtime binding is unavailable.', 'hard');
    }
    const refs = assetIds(node.parameters, new Set(node.assetRefs || []));
    for (const port of node.inputs) {
      const key = JSON.stringify([id, port.id]);
      const value = inputBindings.get(key);
      if (value !== undefined) {
        assetIds(value, refs);
        const declaration = workflow.inputs.find(i => i.targets.some(t => t.nodeId === id && t.portId === port.id));
        if (declaration?.type === 'asset') (Array.isArray(value) ? value : [value]).forEach(v => refs.add(v));
      }
      const linked = workflow.edges.some(e => e.target.nodeId === id && e.target.portId === port.id);
      if (port.required && !linked && !inputBindings.has(key) && (node.parameters[port.id] === undefined || node.parameters[port.id] === null || node.parameters[port.id] === '')) add(id, 'REQUIRED_INPUT_MISSING', 'Required input port has no value or binding.', 'hard', { portId: port.id });
    }
    for (const assetId of sorted(refs)) {
      const asset = workflow.assets.find(a => a.id === assetId);
      const optional = asset?.metadata?.optional === true;
      if (!asset || (inventory !== null && inventory.get(assetId) !== true && inventory.get(assetId) !== null)) {
        if (optional) base.warnings.push(reason('OPTIONAL_ASSET_MISSING', 'Optional asset is not present.', { nodeId: id, assetId }));
        else add(id, 'ASSET_MISSING', 'Required asset is undeclared or not present in the supplied inventory.', 'hard', { assetId });
      } else if (inventory === null || inventory.get(assetId) === null) {
        if (optional) base.warnings.push(reason('OPTIONAL_ASSET_UNVERIFIED', 'Optional asset presence is unverified.', { nodeId: id, assetId }));
        else add(id, 'ASSET_UNVERIFIED', 'Asset declaration exists, but presence has not been verified.', 'uncertain', { assetId });
      }
    }
  }
  for (const output of workflow.outputs) if (!reports.get(output.source.nodeId).active) base.blockers.push(reason('WORKFLOW_OUTPUT_INACTIVE', 'Declared workflow output comes from an inactive node.', { nodeId: output.source.nodeId, outputId: output.id }));
  // Fixed-point propagation is assessment only, not scheduling or execution.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of sorted(nodes.keys())) if (reports.get(id).active) {
      for (const upstreamId of sorted(deps.get(id))) {
        const upstream = reports.get(upstreamId);
        const code = !upstream.active || hard.has(upstreamId) ? 'UPSTREAM_BLOCKED' : pending.has(upstreamId) ? 'UPSTREAM_MANUAL_PENDING' : uncertain.has(upstreamId) ? 'UPSTREAM_UNVERIFIED' : null;
        if (!code || reports.get(id).reasons.some(r => r.code === code && r.upstreamNodeId === upstreamId)) continue;
        add(id, code, 'Upstream dependency is not ready.', code === 'UPSTREAM_BLOCKED' ? 'hard' : code === 'UPSTREAM_MANUAL_PENDING' ? 'manual' : 'uncertain', { upstreamNodeId: upstreamId });
        changed = true;
      }
    }
  }
  base.cost = assessCosts(workflow, context, reports, base.workflowHash);
  for (const id of base.cost.unknownNodeIds) base.warnings.push(reason(base.cost.staleNodeIds.includes(id) ? 'QUOTE_STALE' : 'COST_UNKNOWN', 'Active node has no usable current quote.', { nodeId: id }));
  if (base.cost.budgetStatus === 'OVER_BUDGET' || base.cost.budgetStatus === 'BUDGET_UNKNOWN') base.blockers.push(reason(base.cost.budgetStatus === 'OVER_BUDGET' ? 'BUDGET_EXCEEDED' : 'BUDGET_UNCERTAIN', 'Supplied spending limit is not satisfied by current cost evidence.'));
  for (const [id, report] of reports) {
    if (report.active) {
      report.status = hard.has(id) ? report.reasons.some(r => r.code === 'EXECUTOR_UNSUPPORTED') ? 'UNSUPPORTED' : 'BLOCKED'
        : pending.has(id) ? base.manualGates.includes(id) ? 'MANUAL_PENDING' : 'WAITING_MANUAL'
        : uncertain.has(id) ? 'UNVERIFIED' : 'EXECUTABLE';
      for (const r of report.reasons) {
        const diagnostic = { ...r, nodeId: id };
        if (['ASSET_MISSING', 'EXECUTOR_UNSUPPORTED', 'UTILITY_UNAVAILABLE', 'EXECUTOR_UNAVAILABLE', 'DEPENDENCY_CYCLE', 'WORKFLOW_INPUT_MISSING', 'REQUIRED_INPUT_MISSING', 'UPSTREAM_BLOCKED', 'APPROVAL_REJECTED', 'PRODUCTION_STATE_INVALID', 'OUTPUT_STALE'].includes(r.code)) base.blockers.push(diagnostic);
        else if (r.code !== 'APPROVAL_PENDING') base.warnings.push(diagnostic);
      }
    }
    if (report.status === 'EXECUTABLE') base.summary.executable++;
    if (hard.has(id)) base.summary.blocked++;
    if (['MANUAL_PENDING', 'WAITING_MANUAL'].includes(report.status)) base.summary.manual++;
    if (report.status === 'UNVERIFIED') base.summary.unverified++;
    if (report.status === 'DISABLED_OPTIONAL') base.summary.disabledOptional++;
    if (report.status === 'DISABLED') base.summary.disabled++;
    if (report.status === 'INACTIVE') base.summary.inactive++;
    if (report.status === 'UNSUPPORTED') base.summary.unsupported++;
  }
  base.summary.unknownCost = base.cost.unknownNodeIds.length;
  base.nodes = Object.fromEntries(reports);
  base.status = cyclic.size ? 'INVALID' : base.blockers.length ? 'BLOCKED'
    : pending.size || uncertain.size || base.cost.unknownNodeIds.length ? 'CONDITIONALLY_READY' : 'READY';
  base.ready = base.status === 'READY';
  return base;
}

function assessCosts(workflow, context, reports, workflowHash) {
  const totals = new Map(), excludedTotals = new Map();
  const quotedNodeIds = [], unknownNodeIds = [], staleNodeIds = [], zeroCostNodeIds = [], excludedNodeIds = [];
  const q = context.quoteContext;
  const matchingContext = q && q.workflowId === workflow.workflowId && q.workflowHash === workflowHash;
  const quotes = new Map((q?.quotes || []).map(quote => [quote.nodeId, quote]));
  const maxAgeMs = context.quotePolicy?.maxAgeMs ?? 86400000;
  const now = Date.parse(context.evaluatedAt);
  for (const node of [...workflow.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const report = reports.get(node.id), quote = quotes.get(node.id);
    let state = 'NOT_REQUIRED';
    if (node.executor.mayCostMoney || quote) {
      let bindingCurrent = matchingContext;
      if (quote?.metadata?.whihmScope !== undefined) {
        try { bindingCurrent = q.workflowId === workflow.workflowId && quoteScopeCurrent(workflow, quote, context.inputs); }
        catch { bindingCurrent = false; }
      }
      state = !quote ? 'MISSING' : !bindingCurrent || now < Date.parse(quote.quotedAt) || now - Date.parse(quote.quotedAt) >= maxAgeMs
        || (quote.expiresAt !== undefined && now >= Date.parse(quote.expiresAt))
        || (quote.provider !== undefined && quote.provider !== node.executor.provider)
        || (quote.model !== undefined && quote.model !== node.executor.model) ? 'STALE' : 'CURRENT';
    }
    report.cost = { status: state, amount: state === 'CURRENT' ? quote.amount : state === 'NOT_REQUIRED' ? 0 : null, currency: state === 'CURRENT' ? quote.currency : null };
    if (!report.active) excludedNodeIds.push(node.id);
    if (state === 'CURRENT') {
      const collection = report.active ? totals : excludedTotals;
      collection.set(quote.currency, (collection.get(quote.currency) || 0n) + units(quote.amount));
      if (report.active) quotedNodeIds.push(node.id);
    }
    if (!report.active) continue;
    if (state === 'MISSING' || state === 'STALE') unknownNodeIds.push(node.id);
    if (state === 'STALE') staleNodeIds.push(node.id);
    if (state === 'NOT_REQUIRED' || (state === 'CURRENT' && quote.amount === 0)) zeroCostNodeIds.push(node.id);
  }
  const budget = context.budget || null;
  let budgetStatus = 'NO_BUDGET';
  if (budget) budgetStatus = (totals.get(budget.currency) || 0n) > units(budget.maximumSpend) ? 'OVER_BUDGET'
    : unknownNodeIds.length || [...totals.keys()].some(c => c !== budget.currency) ? 'BUDGET_UNKNOWN' : 'WITHIN_BUDGET';
  const list = map => sorted(map.keys()).map(c => ({ currency: c, amount: amount(map.get(c)), exactAmount: decimal(map.get(c)) }));
  const currencyCode = totals.size === 1 ? [...totals.keys()][0] : totals.size ? null : budget?.currency || null;
  return { knownSubtotal: totals.size > 1 ? null : amount([...totals.values()][0] || 0n), currency: currencyCode,
    totals: list(totals), quotedNodeIds, quotedNodeCount: quotedNodeIds.length, unknownNodeIds, staleNodeIds, zeroCostNodeIds,
    excluded: { nodeIds: excludedNodeIds, totals: list(excludedTotals) }, quotePolicy: { maxAgeMs },
    budget: budget ? { ...budget } : null, budgetStatus };
}

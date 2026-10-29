// Progressive read-only views over the projection, not a planner or executor registry.
import { projectCapabilities } from './capability-projection.mjs';
import {semanticReviewContract} from './semantic-creative-qc.mjs';

const schemaVersion = 1;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const rules = Object.freeze({
  catalogPresenceGrantsAvailability: false,
  availabilityGrantsExecutionAuthorization: false,
  knownUnavailableAreExecutionCandidates: false,
  runtimeUnverifiedMeansRuntimeFailed: false,
  humanLifecycleActionMayBeAutomated: false,
  specializedRoutesMayBeSilentlySubstituted: false,
  opaqueProviderIdentifiersAreProjectAssets: false,
  localConfigurationProvesRuntimeAvailability: false,
  sourceUseImpliesPackagedReadiness: false,
});
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare).filter(k => value[k] !== undefined).map(k => [k, stable(value[k])]));
  return value;
}
const pick = (value, fields) => Object.fromEntries(fields.filter(k => Object.hasOwn(value, k)).map(k => [k, structuredClone(value[k])]));
const roleSummary = role => { const value = structuredClone(role); delete value.schema; return value; };
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim() && !/[\x00-\x1f]/.test(value);
function error(status, code, projection) {
  return stable({ schemaVersion, ...(projection ? { projectionSchemaVersion: projection.schemaVersion } : {}), status, diagnostics: [{ code }] });
}
function snapshot() {
  const projection = projectCapabilities();
  return projection.schemaVersion === 1 ? { projection } : { error: error('rejected', 'PLANNING_PROJECTION_VERSION_UNSUPPORTED', projection) };
}
function distribution(entries, value) {
  const counts = {};
  for (const entry of entries) { const key = value(entry); if (key !== undefined) counts[key] = (counts[key] || 0) + 1; }
  return counts;
}
function counts(entries) {
  const available = entries.filter(e => e.available === true);
  return { executorEntries: entries.length, availableForPlanning: available.length, knownNotExecutable: entries.length - available.length,
    availableByAssurance: distribution(available, e => e.assurance), byAvailability: distribution(entries, e => e.availability),
    byRuntime: distribution(entries, e => e.runtime.class), byRuntimeVerification: distribution(entries, e => e.runtimeVerification) };
}
function observed(entries) {
  return { knownNotExecutablePresent: entries.some(e => e.available !== true),
    deferredOrProviderBlockedPresent: entries.some(e => ['deferred', 'provider_blocked'].includes(e.availability)),
    runtimeUnverifiedPresent: entries.some(e => e.runtimeVerification === 'unverified'),
    specializedRoutingPresent: entries.some(e => e.route === 'specialized'),
    humanLifecycleActionRequired: entries.some(e => e.lifecycle?.humanActionRequired === true),
    providerLivenessRequired: entries.some(e => e.lifecycle?.providerLivenessRequired === true),
    declaredOpaqueProviderIdentitiesPresent: entries.some(e => e.providerIdentifiers?.length || e.result?.projectAsset === false && e.result?.providerField),
    localRuntimeConstrained: entries.some(e => e.availability === 'local_constrained'),
    providerClarificationRequired: entries.some(e => e.reason?.requiresProviderClarification === true) };
}
function envelope(kind, projection, entries) {
  return { schemaVersion, projectionSchemaVersion: projection.schemaVersion, kind, status: 'ok',
    environment: structuredClone(projection.environment), guards: { rules: { ...rules }, observed: observed(entries) },
    limitations: [...projection.limitations] };
}
function summary(entry, shared) {
  const value = pick(entry, ['key', 'id', 'label', 'mode', 'provider', 'availability', 'available', 'assurance', 'route', 'operation',
    'binding', 'requiredFields', 'constraints', 'projectAssets', 'providerIdentifiers', 'result', 'runtimeVerification', 'partial', 'reason', 'mustRevisit', 'specializedRoutes']);
  value.runtime = structuredClone(entry.runtime); // retain derived runtime scopes/readiness without per-tool branches
  value.inputs = entry.inputs.map(roleSummary);
  value.controlFields = Object.keys(entry.controls).sort(compare);
  value.limitations = entry.limitations.filter(text => !shared.includes(text)).sort(compare);
  if (entry.lifecycle) {
    value.lifecycle = pick(entry.lifecycle, ['multiStage', 'humanActionRequired', 'providerLivenessRequired', 'automaticLiveness', 'continuation', 'actions', 'stages']);
    value.lifecycle.operations = entry.lifecycle.operations.map(op => ({ action: op.action, required: [...op.required],
      inputs: op.inputs.map(roleSummary), controlFields: Object.keys(op.controls).sort(compare) }));
  }
  return value;
}

export function getPlanningOverview(...unsupported) {
  if (unsupported.length) return error('rejected', 'PLANNING_FILTERS_UNSUPPORTED');
  const state = snapshot(); if (state.error) return state.error;
  const p = state.projection, all = p.capabilities.flatMap(c => c.executors);
  return stable({ ...envelope('planning_overview', p, all), semanticCreativeReview:semanticReviewContract, providerCenter: {operation:'getProviderCenter',readOnly:true,credentials:'presence_only',connectionTests:'explicit_local_only'}, counts: counts(all),
    capabilities: p.capabilities.map(c => ({ id: c.id, purpose: c.purpose, counts: counts(c.executors), flags: observed(c.executors) })).sort((a, b) => compare(a.id, b.id)) });
}
export function getCapabilityContext(capabilityId, ...unsupported) {
  if (unsupported.length) return error('rejected', 'PLANNING_FILTERS_UNSUPPORTED');
  if (!validId(capabilityId)) return error('rejected', 'PLANNING_ID_INVALID');
  const state = snapshot(); if (state.error) return state.error;
  const p = state.projection, capability = p.capabilities.find(c => c.id === capabilityId);
  if (!capability) return error('not_found', 'PLANNING_CAPABILITY_NOT_FOUND', p);
  // Lossless equality deduplication only: no paraphrasing, truncation or importance ranking.
  const shared = [...new Set(capability.executors[0]?.limitations || [])].filter(text => capability.executors.every(e => e.limitations.includes(text))).sort(compare);
  return stable({ ...envelope('capability_context', p, capability.executors), capability: { id: capability.id, purpose: capability.purpose },
    counts: counts(capability.executors), sharedLimitations: shared,
    executors: capability.executors.map(e => summary(e, shared)).sort((a, b) => compare(a.key, b.key)) });
}
export function getExecutorContext(executorId, ...unsupported) {
  if (unsupported.length) return error('rejected', 'PLANNING_FILTERS_UNSUPPORTED');
  if (!validId(executorId)) return error('rejected', 'PLANNING_ID_INVALID');
  const state = snapshot(); if (state.error) return state.error;
  const p = state.projection, all = p.capabilities.flatMap(c => c.executors.map(executor => ({ capability: { id: c.id, purpose: c.purpose }, executor })));
  const keyed = all.filter(row => row.executor.key === executorId);
  const matches = keyed.length ? keyed : all.filter(row => row.executor.id === executorId);
  if (!matches.length) return error('not_found', 'PLANNING_EXECUTOR_NOT_FOUND', p);
  if (matches.length !== 1) return stable({ ...error('ambiguous', 'PLANNING_EXECUTOR_ID_AMBIGUOUS', p),
    matches: matches.map(row => ({ capabilityId: row.capability.id, ...pick(row.executor, ['key', 'id', 'mode']), runtimeClass: row.executor.runtime.class })).sort((a, b) => compare(a.key, b.key)) });
  const { capability, executor } = matches[0];
  return stable({ ...envelope('executor_context', p, [executor]), capability, executor: structuredClone(executor) });
}

import {fields, safeData, validId, validHash} from '../../packages/whihm-workflow-core/src/project/io.js';
import {validateCreativeIntent, creativeIntentSchema} from './creative-intent.mjs';

export const revisionLimits = Object.freeze({cycles: 2, findings: 8, plans: 32, continuations: 8});
export const revisionFamilies = ['audio_event', 'timeline_item', 'audio_master', 'timeline_output'];
export const revisionNeed = (value, code) => {
  if (!value) throw Object.assign(new Error(code), {revisionCode: code});
};
const need = revisionNeed;
export function validateRevisionRequest(request) {
  safeData(request, 'REVISION_REQUEST_UNSAFE');
  need(Buffer.byteLength(JSON.stringify(request)) <= 131072, 'REVISION_REQUEST_LIMIT');
  fields(request, ['schemaVersion', 'requestId', 'projectId', 'workflowId', 'expectedWorkflowHash',
    'sourceQc', 'agentExecutionId', 'runId', 'findingIds', 'scope', 'cycle', 'maxCycles',
    'executionPolicy', 'stopPolicy', 'intents'], ['previousRevisionId', 'instructions', 'structuredIntent'], 'REVISION_REQUEST_INVALID');
  if (request.structuredIntent) { validateCreativeIntent(request.structuredIntent); need(request.intents.length === 0, 'REVISION_INTENT_AMBIGUOUS'); }
  need(request.schemaVersion === 1, 'REVISION_VERSION_UNSUPPORTED');
  need(['requestId', 'workflowId', 'agentExecutionId', 'runId'].every(k => validId(request[k])) &&
    typeof request.projectId === 'string' && validHash(request.expectedWorkflowHash), 'REVISION_IDENTITY_INVALID');
  fields(request.sourceQc, ['assetId', 'checksum'], [], 'REVISION_QC_REF_INVALID');
  need(validId(request.sourceQc.assetId) && validHash(request.sourceQc.checksum), 'REVISION_QC_REF_INVALID');
  need(Array.isArray(request.findingIds) && request.findingIds.length > 0 && request.findingIds.length <= revisionLimits.findings &&
    request.findingIds.every(validId) && new Set(request.findingIds).size === request.findingIds.length, 'REVISION_FINDINGS_INVALID');
  fields(request.scope, ['nodeIds', 'families'], [], 'REVISION_SCOPE_INVALID');
  need(Array.isArray(request.scope.nodeIds) && request.scope.nodeIds.length > 0 && request.scope.nodeIds.length <= 8 &&
    request.scope.nodeIds.every(validId) && new Set(request.scope.nodeIds).size === request.scope.nodeIds.length &&
    Array.isArray(request.scope.families) && request.scope.families.length > 0 &&
    request.scope.families.every(f => revisionFamilies.includes(f)) && new Set(request.scope.families).size === request.scope.families.length, 'REVISION_SCOPE_INVALID');
  need(Number.isInteger(request.cycle) && request.cycle >= 1 && request.cycle <= revisionLimits.cycles &&
    Number.isInteger(request.maxCycles) && request.maxCycles >= 1 && request.maxCycles <= revisionLimits.cycles, 'REVISION_CYCLE_INVALID');
  need(['review', 'safe_deterministic'].includes(request.executionPolicy), 'REVISION_POLICY_INVALID');
  need(JSON.stringify(request.stopPolicy) === JSON.stringify(['pass', 'review', 'blocked', 'failed', 'uncertain', 'limit', 'stale']), 'REVISION_STOP_POLICY_REQUIRED');
  need(request.previousRevisionId === undefined || validId(request.previousRevisionId), 'REVISION_PREVIOUS_INVALID');
  need(request.instructions === undefined || typeof request.instructions === 'string' && request.instructions.length <= 2000, 'REVISION_INSTRUCTIONS_INVALID');
  need(Array.isArray(request.intents) && request.intents.length <= revisionLimits.findings, 'REVISION_INTENTS_INVALID');
  for (const intent of request.intents) {
    fields(intent, ['findingId', 'nodeId', 'family', 'changes', 'capabilityId', 'expectedOutcome'], ['elementId'], 'REVISION_INTENT_INVALID');
    need(request.findingIds.includes(intent.findingId) && request.scope.nodeIds.includes(intent.nodeId) &&
      request.scope.families.includes(intent.family) && validId(intent.capabilityId) &&
      typeof intent.expectedOutcome === 'string' && intent.expectedOutcome.length > 0 && intent.expectedOutcome.length <= 1000 &&
      (intent.elementId === undefined || validId(intent.elementId)), 'REVISION_INTENT_INVALID');
    need(intent.changes && typeof intent.changes === 'object' && !Array.isArray(intent.changes) && Object.keys(intent.changes).length > 0, 'REVISION_INTENT_INVALID');
  }
  return structuredClone(request);
}
export function getCreativeRevisionDescription() {
  return {capability: 'PLAN_CREATIVE_REVISION', entry: {
    key: 'local:plan_creative_revision:whihm:creative-revision', id: 'creative-revision', label: 'Bounded Creative Revision',
    mode: 'plan_creative_revision', provider: 'whihm', operation: 'plan_apply_delegate_recheck',
    runtime: {class: 'local', method: 'planCreativeRevision', sessionOnly: true},
    binding: {available: true, source: 'host.creativeRevision', requiresAllowExecution: true, deterministic: true,
      operations: ['planCreativeRevision', 'runCreativeRevision', 'getCreativeRevision', 'continueCreativeRevision']},
    available: true, availability: 'available', assurance: 'reviewed', route: 'local', runtimeVerification: 'unverified', partial: true,
    inputs: [{field: 'request', type: 'json', required: true, isArray: false, projectAsset: false, role: 'checksum-bound-qc-revision'}],
    requiredFields: ['request'], controls: {request: {type: 'object', schemaVersion: 1, families: revisionFamilies,
      limits: revisionLimits, structuredIntent: creativeIntentSchema, automaticMapping: 'lineage_event_start_duration_only',
      phases: ['plan', 'inspect', 'explicit_run', 'delegate_agent', 'recheck'], authority: 'structured_fields_only',
      classes: ['SAFE_DETERMINISTIC', 'APPROVAL_REQUIRED', 'EXTERNAL_REASONING_REQUIRED', 'HUMAN_REVIEW_REQUIRED'],
      requires: ['immutable_qc', 'matching_workflow_hash', 'live_agent_run', 'exact_artifact_checksum'],
      stops: ['pass', 'review', 'blocked', 'failed', 'uncertain', 'limit', 'stale']}},
    constraints: [{kind: 'same_session_agent_required'}, {kind: 'no_prose_execution'}, {kind: 'no_autonomous_cycle_or_provider_retry'}],
    projectAssets: [], providerIdentifiers: [], result: {kind: 'creative-revision-proposal', schemaVersion: 1},
    limitations: ['Only bounded parameter edits; no structural repair or provider substitutions.',
      'Cycle limits are session-owned; records do not restore execution authority.',
      'External recorded evidence and human reviews must be renewed after artifact/definition changes.'],
    evidence: {contractStatus: 'REVIEWED', authorization: 'not_granted'}
  }};
}

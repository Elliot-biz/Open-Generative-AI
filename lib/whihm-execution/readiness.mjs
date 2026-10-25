// Application-side evidence collection only. Canonical rules stay in workflow-core.
import { assessWorkflowReadiness, hashWorkflow, openProject, validateWorkflow } from 'whihm-workflow-core';
import { fields, safeData, validId } from '../../packages/whihm-workflow-core/src/project/io.js';
import { resolveExecutionBinding } from './runtime.mjs';

const diagnostic = (code, source, message) => ({ code, source, path: '', message });
const rejected = (diagnostics, report = null) => ({ status: 'rejected', context: null, provenance: null, diagnostics, report });
const failure = (code, source) => rejected([diagnostic(code, source, 'Readiness evidence could not be verified; input values and system paths are omitted.')]);
const keys = ['workflow', 'workflowId', 'project', 'projectRoot', 'expectedProjectId', 'evaluatedAt', 'inputs', 'nodeStates', 'quoteContext', 'quotePolicy', 'budget', 'localState', 'utility'];
const identity = executor => Object.fromEntries(['id', 'type', 'provider', 'model', 'tool'].filter(key => executor[key] !== undefined).map(key => [key, executor[key]]));
const state = value => value === true ? 'AVAILABLE' : value === false ? 'UNAVAILABLE' : 'UNVERIFIED';
const knownCodes = new Set(['PROVIDER_UNSUPPORTED', 'MODEL_ROUTE_UNSUPPORTED_OR_AMBIGUOUS', 'LOCAL_MODEL_UNSUPPORTED', 'UTILITY_UNAVAILABLE', 'EXECUTOR_UNSUPPORTED']);
function projectFailure(result, source) {
  // Preserve existing codes, never external messages/paths/raw Error objects.
  const codes = (result?.diagnostics || []).map(d => d.code).filter(c => typeof c === 'string' && /^[A-Z_0-9]{1,80}$/.test(c));
  return rejected((codes.length ? codes : ['PROJECT_EVIDENCE_UNAVAILABLE']).map(code => diagnostic(code, source, 'Existing project validation could not verify the requested data.')));
}
function localAvailability(node, snapshot) {
  if (snapshot?.hostAvailable === false) return { available: false, code: 'LOCAL_HOST_UNAVAILABLE' };
  const matches = Array.isArray(snapshot?.models) ? snapshot.models.filter(m => m?.id === node.executor.model) : [];
  const model = matches.length === 1 ? matches[0] : null;
  if (node.executor.provider === 'sdcpp') {
    if (snapshot?.binaryStatus?.exists === false) return { available: false, code: 'LOCAL_BINARY_MISSING' };
    if (['not-downloaded', 'partial'].includes(model?.state)) return { available: false, code: 'LOCAL_WEIGHTS_MISSING' };
    if (model?.auxiliaryStatus && Object.values(model.auxiliaryStatus).some(value => ['not-downloaded', 'partial'].includes(value))) return { available: false, code: 'LOCAL_AUXILIARY_MISSING' };
  }
  if (node.executor.provider === 'wan2gp' && snapshot?.wan2gpConfig) {
    const config = snapshot.wan2gpConfig;
    if (!config.dir && !config.url) return { available: false, code: 'LOCAL_ENGINE_UNCONFIGURED' };
  }
  if (model?.ready === false) return { available: false, code: 'LOCAL_MODEL_UNAVAILABLE' };
  // Installed files, configured paths, ready:true, or preload existence do not
  // prove the engine/GPU can run. Never probe or permit first-run downloads here.
  return { available: null, code: 'LOCAL_RUNTIME_UNVERIFIED' };
}

/** Trusted application API; resolveBinding is a static host/test seam, not IPC. */
export async function buildWorkflowReadinessContext(request = {}, { resolveBinding = resolveExecutionBinding } = {}) {
  try {
    fields(request, [], keys, 'READINESS_EVIDENCE_INVALID');
    if (request.project !== undefined && request.projectRoot !== undefined) return failure('PROJECT_SOURCE_AMBIGUOUS', 'project-store');
    if (request.expectedProjectId !== undefined && request.projectRoot === undefined) return failure('PROJECT_ID_CONTEXT_INVALID', 'project-store');
    // Snapshot all portable caller evidence before any async reads. Never retain
    // credentials, callbacks or transient local configuration in this context.
    const context = {};
    for (const key of ['evaluatedAt', 'inputs', 'nodeStates', 'quoteContext', 'quotePolicy', 'budget']) if (request[key] !== undefined) context[key] = structuredClone(request[key]);
    safeData(context, 'READINESS_EVIDENCE_INVALID');
    const localState = request.localState === undefined ? undefined : structuredClone(request.localState);
    let project = request.project, workflow = request.workflow === undefined ? undefined : structuredClone(request.workflow);
    let registry;
    const provenance = { project: { source: 'project-store', state: project ? 'SUPPLIED' : 'NOT_SUPPLIED' }, assets: {}, executors: {},
      quotes: { source: 'supplied-quote-envelope', state: context.quoteContext === undefined ? 'NOT_SUPPLIED' : 'SUPPLIED' } };
    const diagnostics = [];
    if (request.projectRoot !== undefined) {
      const opened = await openProject(request.projectRoot, { expectedProjectId: request.expectedProjectId });
      if (opened.status !== 'opened') return projectFailure(opened, 'project-store');
      project = opened.project;
      registry = opened.manifest.assets; // openProject has already verified all bytes/checksums.
      provenance.project = { source: 'project-store', state: 'VERIFIED', projectId: opened.projectId };
    }
    if (request.workflowId !== undefined && !validId(request.workflowId)) return failure('WORKFLOW_ID_INVALID', 'project-store');
    if (workflow === undefined) {
      if (!project || request.workflowId === undefined) return failure('WORKFLOW_SOURCE_MISSING', 'project-store');
      const loaded = await project.getProjectWorkflow(request.workflowId);
      if (loaded.status !== 'ok') return projectFailure(loaded, 'project-workflows');
      workflow = structuredClone(loaded.workflow);
    }
    if (!validateWorkflow(workflow).valid) return rejected([diagnostic('WORKFLOW_INVALID', 'workflow-declaration', 'Canonical workflow validation failed.')], assessWorkflowReadiness(workflow, context));
    if (request.workflowId !== undefined && request.workflowId !== workflow.workflowId) return failure('WORKFLOW_ID_MISMATCH', 'workflow-declaration');
    const workflowHash = hashWorkflow(workflow);
    if (project && registry === undefined) {
      const listed = await project.listProjectAssets(); // existing full integrity check, no parallel reader
      if (listed.status !== 'ok') return projectFailure(listed, 'project-assets');
      registry = listed.assets;
      provenance.project.state = 'VERIFIED';
    }
    if (project && !Array.isArray(registry)) return failure('PROJECT_EVIDENCE_INVALID', 'project-assets');
    const assets = [];
    for (const asset of [...workflow.assets].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      const record = registry?.find(a => a.assetId === asset.id);
      let present = null, code = 'ASSET_EVIDENCE_UNVERIFIED';
      if (project && asset.localPath) {
        present = Boolean(record && record.path === asset.localPath && (!asset.checksum || asset.checksum.value.toLowerCase() === record.checksum));
        code = present ? 'PROJECT_ASSET_VERIFIED' : record ? 'ASSET_IDENTITY_MISMATCH' : 'ASSET_NOT_REGISTERED';
      } else if (project && record && asset.checksum) {
        present = asset.checksum.value.toLowerCase() === record.checksum;
        code = present ? 'PROJECT_ASSET_VERIFIED' : 'ASSET_IDENTITY_MISMATCH';
      }
      assets.push({ id: asset.id, present });
      provenance.assets[asset.id] = { source: project ? 'project-assets' : 'workflow-declaration', state: state(present), code, optional: asset.metadata?.optional === true };
    }
    context.assets = assets;
    // Identity deduplication is just output normalization, not a new registry.
    const bindings = new Map();
    for (const node of [...workflow.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      let resolved;
      try { resolved = resolveBinding(structuredClone(node), { utility: request.utility }); }
      catch { resolved = null; }
      let available = null, code = 'BINDING_EVIDENCE_UNVERIFIED', source = 'execution-bridge';
      if (resolved?.code && knownCodes.has(resolved.code)) { available = false; code = resolved.code; }
      else if (typeof resolved?.runtime === 'string' && /^[A-Za-z0-9_.]+$/.test(resolved.runtime)) { available = true; code = 'BRIDGE_ROUTE_PLANNABLE'; }
      if (node.executor.type === 'local-ai' && available === true) {
        ({ available, code } = localAvailability(node, localState)); source = 'local-runtime-configuration';
      }
      const binding = { ...identity(node.executor), available, unsupported: knownCodes.has(code) && code !== 'UTILITY_UNAVAILABLE' }, key = JSON.stringify(identity(node.executor));
      if (bindings.has(key) && bindings.get(key).available !== available) {
        // A model can be supported in one mode but not another. The existing
        // readiness identity is mode-neutral: conflicting evidence stays unknown.
        bindings.get(key).available = null; bindings.get(key).unsupported = false;
        diagnostics.push(diagnostic('BINDING_EVIDENCE_CONFLICT', source, 'Different node modes produced conflicting evidence for one executor identity.'));
      } else if (!bindings.has(key)) bindings.set(key, binding);
      provenance.executors[node.id] = { source, state: state(available), code,
        ...(available !== false && resolved?.runtime ? { runtime: resolved.runtime } : {}) };
    }
    context.executors = [...bindings.values()].filter(binding => !binding.unsupported).map(({ unsupported: _unsupported, ...binding }) => binding);
    const report = assessWorkflowReadiness(workflow, context);
    if (report.blockers.some(d => d.code === 'READINESS_CONTEXT_INVALID')) return rejected(report.blockers.filter(d => d.code === 'READINESS_CONTEXT_INVALID').map(d => ({ ...d, source: 'supplied-readiness-evidence' })), report);
    if (context.quoteContext !== undefined) {
      if (context.quoteContext.workflowId !== workflow.workflowId || context.quoteContext.workflowHash !== workflowHash) {
        const scoped = context.quoteContext.workflowId === workflow.workflowId && context.quoteContext.quotes.length > 0 && context.quoteContext.quotes.every(q => q.metadata?.whihmScope !== undefined);
        provenance.quotes.state = scoped ? context.quoteContext.quotes.some(q => report.nodes[q.nodeId].cost.status === 'STALE') ? 'PARTIALLY_STALE' : 'SCOPE_VERIFIED' : 'MISMATCHED';
        if (provenance.quotes.state !== 'SCOPE_VERIFIED') diagnostics.push(diagnostic(scoped ? 'QUOTE_SCOPE_STALE' : 'QUOTE_WORKFLOW_MISMATCH', 'supplied-quote-envelope', 'Quote evidence is preserved; the readiness engine determines freshness for each supplied quote binding.'));
      }
    }
    for (const node of workflow.nodes) {
      const evidence = provenance.executors[node.id];
      const matched = context.executors.find(b => JSON.stringify(identity(b)) === JSON.stringify(identity(node.executor)));
      if (matched?.available === null && evidence.state !== 'UNVERIFIED') Object.assign(evidence, { state: 'UNVERIFIED', code: 'BINDING_EVIDENCE_CONFLICT' });
      // Manual classification belongs to the authoritative readiness evaluator.
      if (node.executor.type === 'control' && (report.manualGates.includes(node.id) || (report.nodes[node.id].active && !matched && !report.nodes[node.id].reasons.some(r => r.code.startsWith('EXECUTOR_'))))) {
        provenance.executors[node.id] = { source: 'workflow-declaration', state: 'MANUAL', code: 'MANUAL_CONTROL_DECLARED' };
      }
    }
    safeData({ context, provenance }, 'READINESS_EVIDENCE_INVALID');
    return { status: 'built', workflowId: workflow.workflowId, workflowHash, context, provenance, diagnostics, report };
  } catch {
    return failure('READINESS_EVIDENCE_INVALID', 'readiness-evidence');
  }
}

/** Same authoritative report as direct evaluation of the returned context. */
export async function assessProjectWorkflowReadiness(request, dependencies) {
  const result = await buildWorkflowReadinessContext(request, dependencies);
  return result.status === 'built' ? { ...result, status: 'assessed' } : result;
}

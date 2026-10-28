// A constrained bridge. Agent owns edits; Workflow Execution owns every dispatch.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {hashWorkflow} from 'whihm-workflow-core';
import {fields, readBytes, hashBytes} from '../../packages/whihm-workflow-core/src/project/io.js';
import {workflowDependencyMap, dependencyScope} from '../../packages/whihm-workflow-core/src/dependencies.js';
import {timelineHash} from './timeline-contract.mjs';
import {getCreativeQc, evaluateCreativeQc} from './creative-qc.mjs';
import {validateRevisionRequest, revisionNeed as need, revisionLimits} from './creative-revision-contract.mjs';

const clone = structuredClone;
const accepted = (result, status) => {
  need(result.status === status, result.diagnostics?.[0]?.code ?? 'REVISION_DEPENDENCY_REJECTED');
  return result;
};
const output = node => node?.result?.output;
const diagnostic = error => error.revisionCode ?? error.agentCode ?? error.diagnostic?.code ?? 'REVISION_OPERATION_FAILED';
const stateFor = code => /LIMIT_REACHED|PLAN_LIMIT|CONTINUATION_LIMIT/.test(code) ? 'LIMIT_REACHED' :
  /CONFLICT_REQUIRES_REASONING/.test(code) ? 'EXTERNAL_REASONING_REQUIRED' : /STALE|HASH_MISMATCH/.test(code) ? 'STALE' : 'BLOCKED';
const families = {
  audio_event: {tool: 'audio-production', parameter: 'definition', fields: ['startFrame', 'durationFrames', 'sourceInFrame', 'gainDb', 'pan', 'fadeInFrames', 'fadeOutFrames', 'manipulation']},
  timeline_item: {tool: 'timeline-composition', parameter: 'timeline', fields: ['startFrame', 'durationFrames', 'sourceInFrame', 'gainDb', 'placement']},
  audio_master: {tool: 'audio-production', parameter: 'definition', fields: ['gainDb', 'processors']},
  timeline_output: {tool: 'timeline-composition', parameter: 'timeline', fields: ['canvas', 'durationFrames']}
};

// Project records reject slash-prefixed path strings. Store canonical pointer segments,
// while the live Agent plan retains its validated JSON pointer. This is audit data only.
function portableAudit(value) {
  if (Array.isArray(value)) return value.map(portableAudit);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    ['parameterPath', 'path'].includes(key) && typeof item === 'string' && item.startsWith('/') ? [key === 'path' ? 'pathSegments' : 'parameterSegments', item.split('/').slice(1)] : [key, portableAudit(item)]));
}
async function appendRecord(project, body) {
  let directory;
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-revision-'));
    const file = path.join(directory, 'revision.json');
    const bytes = Buffer.from(JSON.stringify(portableAudit(body)));
    need(bytes.length <= 2097152, 'REVISION_RECORD_LIMIT');
    await fs.writeFile(file, bytes, {flag: 'wx', mode: 0o600});
    const {asset} = accepted(await project.importAsset({sourcePath: file, contentType: 'application/json',
      role: 'creative-revision-record', metadata: {creativeRevision: {schemaVersion: 1, recordHash: hashBytes(bytes)}}}), 'imported');
    need(asset.checksum === hashBytes(bytes), 'REVISION_RECORD_IDENTITY_MISMATCH');
    return {assetId: asset.assetId, checksum: asset.checksum};
  } finally {
    if (directory) await fs.rm(directory, {recursive: true, force: true});
  }
}

export function createCreativeRevision({agent, engine}) {
  const records = new Map(), chains = new Map(), busy = new Set();
  let disposed = false;
  const view = r => clone({schemaVersion: 1, revisionId: r.request.requestId, state: r.state,
    classification: r.classification, request: r.request, requestHash: r.requestHash,
    planHash: r.planHash, proposal: r.proposal, agent: r.agentView ?? null,
    recheck: r.recheck ?? null, records: r.records, diagnostics: r.diagnostics ?? []});
  async function capture(fn) {
    try { need(!disposed, 'REVISION_SESSION_DISPOSED'); return await fn(); }
    catch (error) { const code = diagnostic(error); return {schemaVersion: 1, status: 'rejected', state: stateFor(code), diagnostics: [{code}]}; }
  }
  function at(args) {
    const r = records.get(args.revisionId);
    need(r && r.request.projectId === args.projectId, 'REVISION_NOT_FOUND');
    return r;
  }
  async function lock(args, fn) {
    const r = at(args), key = r.request.workflowId;
    need(!busy.has(key), 'REVISION_TRANSITION_BUSY');
    busy.add(key);
    try { return await fn(r); } finally { busy.delete(key); }
  }
  async function source(ctx, request) {
    need(request.projectId === ctx.projectId, 'REVISION_PROJECT_MISMATCH');
    const qc = accepted(await getCreativeQc({...ctx, record: request.sourceQc}), 'ok').result;
    need(qc.projectId === ctx.projectId, 'REVISION_QC_PROJECT_MISMATCH');
    const workflow = accepted(await ctx.project.getProjectWorkflow(request.workflowId), 'ok').workflow;
    need(hashWorkflow(workflow) === request.expectedWorkflowHash &&
      qc.association.workflowId === request.workflowId && qc.association.workflowHash === request.expectedWorkflowHash &&
      qc.association.runId === request.runId, 'REVISION_STALE_REVIEW');
    const previous = await agent.get({executionId: request.agentExecutionId});
    need(previous.status !== 'rejected' && previous.plan.projectId === request.projectId &&
      previous.plan.workflowId === request.workflowId && previous.resultingHash === request.expectedWorkflowHash &&
      previous.runId === request.runId, 'REVISION_AGENT_RUN_MISMATCH');
    const run = await engine.get({runId: request.runId});
    need(run.status !== 'rejected' && run.workflowHash === request.expectedWorkflowHash, 'REVISION_STALE_RUN');
    need(!previous.uncertain && !Object.values(run.nodes).some(n => n.uncertain), 'REVISION_PROVIDER_UNCERTAIN');
    need(!Object.values(run.nodes).some(n => n.continuationRequired), 'REVISION_PROVIDER_OPERATION_ACTIVE');
    // A revision must not incidentally start unrelated pending work from an unfinished run.
    need(run.status === 'completed', 'REVISION_SOURCE_RUN_NOT_COMPLETED');
    for (const a of [...qc.request.artifacts, ...qc.request.evidence]) {
      const asset = accepted(await ctx.project.getProjectAsset(a.assetId), 'ok').asset;
      const bytes = await readBytes(ctx.root, asset.path);
      need(asset.checksum === a.checksum && bytes.length === asset.size && hashBytes(bytes) === a.checksum, 'REVISION_STALE_ARTIFACT');
    }
    return {qc, workflow, previous, run};
  }
  function cycle(request) {
    const chain = chains.get(request.workflowId);
    if (!chain) {
      need(request.cycle === 1 && !request.previousRevisionId, 'REVISION_CYCLE_INVALID');
      return;
    }
    need(request.previousRevisionId === chain.revisionId && request.cycle === chain.cycle + 1 &&
      request.maxCycles === chain.maxCycles, 'REVISION_CHAIN_REQUIRED');
    need(request.cycle <= chain.maxCycles, 'REVISION_LIMIT_REACHED');
    const prior = records.get(chain.revisionId);
    need(prior?.state === 'REVISION_NEEDED' && prior.recheck?.record &&
      request.sourceQc.assetId === prior.recheck.record.assetId && request.sourceQc.checksum === prior.recheck.record.checksum &&
      request.agentExecutionId === prior.proposal.agentPlan.planId, 'REVISION_RECHECK_REQUIRED');
  }
  async function save(ctx, r, phase) {
    r.records.push(await appendRecord(ctx.project, {schemaVersion: 1, kind: 'creative-revision-record', phase,
      previousRecord: r.records.at(-1) ?? null, ...view(r)}));
  }
  async function finish(ctx, r) {
    const a = r.agentView;
    if (a.status !== 'completed') {
      r.state = a.uncertain ? 'BLOCKED' : a.status === 'awaiting_approval' ? 'AWAITING_APPROVAL' :
        a.status === 'failed' ? 'FAILED' : 'BLOCKED';
      r.diagnostics = a.diagnostics ?? [];
      return;
    }
    r.state = 'RECHECKING';
    // Rebind only known outputs in the SAME run. Never manufacture fresh measurement evidence.
    const request = clone(r.sourceRequest);
    request.requestId = `recheck_${r.planHash.slice(0,24)}`;
    request.reviewRefs = []; // old creative acceptance is bound to the previous definition/artifact
    for (const ref of request.artifacts) {
      const producer = r.proposal.artifactProducers[ref.id];
      if (producer) {
        const next = output(a.run.nodes[producer]);
        need(next?.assetId && next.checksum, 'REVISION_OUTPUT_UNAVAILABLE');
        ref.assetId = next.assetId; ref.checksum = next.checksum;
      }
    }
    request.association = {...request.association, workflowHash: a.resultingHash, runId: a.runId};
    r.recheck = accepted(await evaluateCreativeQc({...ctx, request, allowExecution: true}), 'succeeded');
    r.state = r.recheck.result.state;
    if (r.state === 'REVISION_NEEDED' && r.request.cycle >= r.request.maxCycles) {
      r.state = 'LIMIT_REACHED'; r.diagnostics = [{code: 'REVISION_LIMIT_REACHED'}];
    }
  }
  return {
    plan: args => capture(async () => {
      const request = validateRevisionRequest(args.request), requestHash = timelineHash(request);
      const existing = records.get(request.requestId);
      if (existing) { need(existing.requestHash === requestHash, 'REVISION_ID_CONFLICT'); await source(args, request); return view(existing); }
      need(records.size < revisionLimits.plans && !busy.has(request.workflowId), 'REVISION_PLAN_LIMIT');
      const {qc, workflow, run} = await source(args, request);
      const r = {request, requestHash, state: 'PLANNED', classification: 'SAFE_DETERMINISTIC', records: [], sourceRequest: qc.request};
      const proposal = {schemaVersion: 1, sourceQc: request.sourceQc, sourceQcResultHash: qc.resultHash,
        sourceWorkflowHash: request.expectedWorkflowHash, sourceRunId: run.runId, cycle: request.cycle,
        maxCycles: request.maxCycles, findingActionMapping: [], affectedNodes: [], expectedStaleNodes: [],
        preservedNodes: [], artifactProducers: {}, agentPlan: null, capabilityRequirements: [],
        readinessRequirements: [], approvalRequirements: [], sideEffects: []};
      r.proposal = proposal;
      function stop(state, code) { r.state = state; r.classification = state; r.diagnostics = [{code}]; r.planHash = timelineHash({requestHash, proposal, state}); records.set(request.requestId, r); return view(r); }
      if (qc.state !== 'REVISION_NEEDED') return stop(qc.state, `REVISION_QC_${qc.state}`);
      if (request.cycle > request.maxCycles) return stop('LIMIT_REACHED', 'REVISION_LIMIT_REACHED');
      cycle(request);
      const selected = request.findingIds.map(id => {
        const f = qc.findings.find(f => f.id === id);
        need(f && f.outcome === 'FAIL', 'REVISION_FINDING_NOT_ACTIONABLE'); return f;
      }).sort((a,b) => Number(b.required)-Number(a.required) ||
        ['BLOCKING','ERROR','WARNING','INFO'].indexOf(a.severity)-['BLOCKING','ERROR','WARNING','INFO'].indexOf(b.severity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const documents = new Map(), writes = new Map(), edits = [];
      for (const finding of selected) {
        const req = qc.request.requirements.find(x => x.id === finding.id);
        if (!req) return stop('EXTERNAL_REASONING_REQUIRED', 'REVISION_STRUCTURED_REQUIREMENT_REQUIRED');
        const target = finding.target?.nodeId, node = workflow.nodes.find(n => n.id === target);
        const artifact = qc.request.artifacts.find(a => a.id === (req.artifactId ?? qc.request.artifacts[0].id));
        need(artifact && finding.artifact?.assetId === artifact.assetId && finding.artifact.checksum === artifact.checksum, 'REVISION_FINDING_ARTIFACT_MISMATCH');
        // Old QC cannot target a newer output, even if the original immutable asset still exists.
        const producer = Object.keys(run.nodes).find(id => output(run.nodes[id])?.assetId === artifact.assetId && output(run.nodes[id])?.checksum === artifact.checksum);
        need(producer, 'REVISION_STALE_ARTIFACT');
        need(node && request.scope.nodeIds.includes(node.id), 'REVISION_TARGET_UNSUPPORTED');
        const upstream = dependencyScope(workflowDependencyMap(workflow), producer);
        need(producer === node.id || upstream.has(node.id), 'REVISION_TARGET_UNRELATED');
        const intents = request.intents.filter(i => i.findingId === finding.id);
        let corrections = intents;
        if (!intents.length && req.rule.type === 'lineage_event' && req.humanReview !== 'required' &&
            ['TECHNICAL','OBJECTIVE_INTENT'].includes(req.category)) {
          corrections = [{findingId: finding.id, nodeId: node.id,
            family: req.rule.family === 'audio' ? 'audio_event' : 'timeline_item', elementId: req.rule.itemId,
            changes: {startFrame: req.rule.startFrame, ...(req.rule.durationFrames === undefined ? {} : {durationFrames: req.rule.durationFrames})}}];
        }
        if (!corrections.length) return stop(req.category === 'HUMAN_ONLY' ? 'HUMAN_REVIEW_REQUIRED' : 'EXTERNAL_REASONING_REQUIRED', 'REVISION_STRUCTURED_INTENT_REQUIRED');
        for (const intent of corrections) {
          const spec = families[intent.family];
          need(intent.nodeId === node.id && request.scope.families.includes(intent.family) && spec?.tool === node.executor.tool &&
            (!intent.capabilityId || intent.capabilityId === (spec.tool === 'audio-production' ? 'PRODUCE_AUDIO_MIX' : 'COMPOSE_TIMELINE')), 'REVISION_TARGET_UNSUPPORTED');
          fields(intent.changes, [], spec.fields, 'REVISION_PARAMETER_UNSUPPORTED');
          const key = JSON.stringify([node.id, spec.parameter]);
          if (!documents.has(key)) documents.set(key, clone(node.parameters[spec.parameter]));
          const doc = documents.get(key);
          let element = doc;
          if (intent.family === 'audio_master') element = doc.master;
          if (['audio_event','timeline_item'].includes(intent.family)) {
            need(intent.elementId, 'REVISION_ELEMENT_REQUIRED');
            const declared = intent.family === 'audio_event' ? finding.target?.audioEventId : finding.target?.timelineItemId;
            need(!declared || intent.elementId === declared, 'REVISION_ELEMENT_TARGET_MISMATCH');
            element = doc.tracks.flatMap(t => intent.family === 'audio_event' ? t.events : t.items).find(e => e.id === intent.elementId);
          }
          need(element, 'REVISION_ELEMENT_UNKNOWN');
          for (const [parameter, value] of Object.entries(intent.changes)) {
            const writeKey = `${key}:${intent.elementId ?? intent.family}:${parameter}`;
            need(!writes.has(writeKey) || timelineHash(writes.get(writeKey)) === timelineHash(value), 'REVISION_CONFLICT_REQUIRES_REASONING');
            need(element[parameter] === undefined || timelineHash(element[parameter]) !== timelineHash(value) || writes.has(writeKey), 'REVISION_NO_CHANGE');
            writes.set(writeKey, clone(value)); element[parameter] = clone(value);
          }
          proposal.findingActionMapping.push({findingId: finding.id, nodeId: node.id, family: intent.family,
            elementId: intent.elementId ?? null, parameter: spec.parameter, changes: clone(intent.changes), source: intents.length ? 'explicit_structured_intent' : 'qc_lineage_requirement'});
        }
      }
      for (const [key, value] of documents) {
        const [nodeId, parameter] = JSON.parse(key);
        const id = `edit_${edits.length}`;
        edits.push({id, type: 'set-node-parameter', dependsOn: edits.length ? [edits.at(-1).id] : [],
          command: {type: 'set-node-parameter', targetId: nodeId, parameterPath: `/${parameter}`, value}});
        for (const m of proposal.findingActionMapping) if (m.nodeId === nodeId && m.parameter === parameter) m.actionId = id;
      }
      const original = await agent.get({executionId: request.agentExecutionId});
      const agentPlan = {schemaVersion: 1, planId: `revision_${requestHash.slice(0,24)}`, projectId: request.projectId,
        workflowId: request.workflowId, expectedWorkflowHash: request.expectedWorkflowHash,
        objective: qc.request.objective, previousExecutionId: request.agentExecutionId,
        actions: [...edits, {id: 'run', type: 'run-workflow', dependsOn: [edits.at(-1).id]}],
        requirements: clone(original.plan.requirements), stopConditions: ['blocked','failed','awaiting_user','uncertain']};
      // Canonical owner validators, capability selection and readiness remain in Agent Execution.
      const checked = await agent.plan({...args, plan: agentPlan});
      need(checked.status === 'validated', checked.diagnostics?.[0]?.code ?? 'REVISION_AGENT_PLAN_REJECTED');
      proposal.agentPlan = agentPlan; r.agentView = checked;
      proposal.capabilityRequirements = checked.plan.requirements;
      proposal.sideEffects = checked.effects;
      proposal.readinessRequirements = checked.effects.map(e => ({nodeId: e.nodeId, runtime: e.runtimeRequirements ?? null}));
      proposal.approvalRequirements = checked.effects.filter(e => e.kind === 'approval_gated' || e.approvalRequired).map(e => e.nodeId);
      proposal.affectedNodes = [...new Set(proposal.findingActionMapping.map(m => m.nodeId))].sort();
      const graph = workflowDependencyMap(workflow);
      proposal.expectedStaleNodes = workflow.nodes.filter(n => proposal.affectedNodes.includes(n.id) ||
        [...dependencyScope(graph, n.id)].some(id => proposal.affectedNodes.includes(id))).map(n => n.id).sort();
      proposal.preservedNodes = workflow.nodes.filter(n => !proposal.expectedStaleNodes.includes(n.id)).map(n => n.id).sort();
      for (const a of qc.request.artifacts) {
        const producer = Object.keys(run.nodes).find(id => output(run.nodes[id])?.assetId === a.assetId && output(run.nodes[id])?.checksum === a.checksum);
        if (producer) proposal.artifactProducers[a.id] = producer;
      }
      proposal.affectedArtifacts = Object.entries(run.nodes).filter(([id]) => proposal.expectedStaleNodes.includes(id))
        .map(([nodeId, n]) => ({nodeId, output: output(n) ?? null}));
      const remote = checked.effects.some(e => e.kind === 'remote_provider_execution');
      r.classification = remote || proposal.approvalRequirements.length ? 'APPROVAL_REQUIRED' : 'SAFE_DETERMINISTIC';
      proposal.mappingHash = timelineHash(proposal.findingActionMapping);
      // Readiness observations have timestamps; they are reported, not plan identity.
      r.planHash = timelineHash({requestHash, sourceQcResultHash: qc.resultHash, agentPlan,
        mappingHash: proposal.mappingHash, affectedNodes: proposal.affectedNodes,
        expectedStaleNodes: proposal.expectedStaleNodes, preservedNodes: proposal.preservedNodes, classification: r.classification});
      r.state = 'READY'; records.set(request.requestId, r); return view(r);
    }),
    get: args => capture(() => view(at(args))),
    run: args => capture(() => lock(args, async r => {
      need(args.allowExecution === true, 'EXECUTION_NOT_AUTHORIZED');
      need(r.state === 'READY' && args.planHash === r.planHash, 'REVISION_RUN_STATE_INVALID');
      need(r.request.executionPolicy === 'safe_deterministic' && r.classification === 'SAFE_DETERMINISTIC' || args.approveProposal === true, 'REVISION_PROPOSAL_REVIEW_REQUIRED');
      try { await source(args, r.request); cycle(r.request); }
      catch (error) { r.state = stateFor(diagnostic(error)); r.diagnostics = [{code: diagnostic(error)}]; return view(r); }
      if (r.proposal.sideEffects.some(e => e.kind === 'remote_provider_execution')) need(args.allowRemoteExecution === true, 'REVISION_REMOTE_PERMISSION_REQUIRED');
      // Consume the cycle BEFORE any mutation; exceptions never invite a blind repeat.
      chains.set(r.request.workflowId, {revisionId: r.request.requestId, cycle: r.request.cycle, maxCycles: r.request.maxCycles});
      r.state = 'EXECUTING'; r.steps = 0;
      try {
        await save(args, r, 'accepted_proposal');
        r.agentView = await agent.apply({...args, executionId: r.proposal.agentPlan.planId, planHash: r.agentView.planHash, allowExecution: true});
        need(r.agentView.status === 'ready', r.agentView.diagnostics?.[0]?.code ?? 'REVISION_APPLY_FAILED');
        const stale = Object.entries(r.agentView.run?.nodes ?? {}).filter(([,n]) => n.status === 'stale').map(([id]) => id);
        need(stale.length > 0 && stale.every(id => r.proposal.expectedStaleNodes.includes(id)), 'REVISION_STALE_SCOPE_MISMATCH');
        r.agentView = await agent.continue({...args, executionId: r.proposal.agentPlan.planId,
          allowExecution: true, rerunNodeIds: stale});
        await finish(args, r); await save(args, r, 'observed');
      } catch (error) {
        r.state = stateFor(diagnostic(error)); r.diagnostics = [{code: diagnostic(error)}];
        try { await save(args, r, 'stopped'); } catch { r.diagnostics.push({code: 'REVISION_AUDIT_STORAGE_BLOCKED'}); }
      }
      return view(r);
    })),
    continue: args => capture(() => lock(args, async r => {
      need(args.allowExecution === true, 'EXECUTION_NOT_AUTHORIZED');
      need(['AWAITING_APPROVAL','BLOCKED'].includes(r.state) && !r.recheck && r.agentView?.runId &&
        ['awaiting_approval','awaiting_user','blocked'].includes(r.agentView.status) && !r.agentView.uncertain &&
        !r.agentView.diagnostics?.some(d => d.code === 'APPROVAL_REJECTED'), 'REVISION_CONTINUATION_UNAVAILABLE');
      need(r.steps < revisionLimits.continuations, 'REVISION_CONTINUATION_LIMIT');
      // No rerun list or new edits can enter continuation. Known polling is Agent-controlled.
      r.steps++;
      r.agentView = await agent.continue({project: args.project, root: args.root, projectId: args.projectId,
        executionId: r.proposal.agentPlan.planId, allowExecution: true, allowRemoteExecution: args.allowRemoteExecution,
        ...(args.continuation ? {continuation: args.continuation} : {})});
      await finish(args, r); await save(args, r, 'continued'); return view(r);
    })),
    dispose() { disposed = true; records.clear(); chains.clear(); busy.clear(); }
  };
}

// Node-side project access. No credentials, browser globals, or provider clients.
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { openProject, hashWorkflow, setNodeApproval, invalidateWorkflowProduction } from 'whihm-workflow-core';
import { readBytes, validId, validHash, uuid, fields, safeData } from '../../packages/whihm-workflow-core/src/project/io.js';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from './planning-context.mjs';
import { projectCapabilities } from './capability-projection.mjs';
import { createExecutionBridge } from './bridge.mjs';
import { assessProjectWorkflowReadiness } from './readiness.mjs';

const rejected = code => ({ status: 'rejected', diagnostics: [{ code, path: '', message: code.replaceAll('_', ' ') }] });
const readinessFields = new Set(['workflow', 'workflowId', 'evaluatedAt', 'inputs', 'nodeStates', 'quoteContext', 'quotePolicy', 'budget', 'localState']);
function need(value, code) { if (!value) throw Object.assign(new Error(code), { hostCode: code }); }
function accepted(result, status = 'ok') { if (result.status !== status) throw Object.assign(new Error('Project rejected'), { result }); return result; }
export function createWorkflowHost({ callRuntime, emit = () => {} }) {
  const projects = new Map();
  let active = false, transitionActive = false;
  async function context(request) {
    need(request && typeof request === 'object' && !Array.isArray(request), 'HOST_REQUEST_INVALID');
    const saved = projects.get(request.projectHandle);
    need(saved, 'PROJECT_HANDLE_INVALID');
    const opened = accepted(await openProject(saved.root, { expectedProjectId: saved.projectId }), 'opened');
    return { root: saved.root, project: opened.project };
  }
  async function operation(method, request) {
    if (method === 'getPlanningOverview') {
      fields(request ?? {}, [], [], 'HOST_REQUEST_INVALID');
      return getPlanningOverview();
    }
    if (method === 'getCapabilityContext') {
      fields(request, ['capabilityId'], [], 'HOST_REQUEST_INVALID');
      return getCapabilityContext(request.capabilityId);
    }
    if (method === 'getExecutorContext') {
      fields(request, ['executorId'], [], 'HOST_REQUEST_INVALID');
      return getExecutorContext(request.executorId);
    }
    if (method === 'getCapabilityProjection') {
      fields(request ?? {}, [], [], 'HOST_REQUEST_INVALID');
      return projectCapabilities();
    }
    if (method === 'openProject') {
      const root = request?.projectRoot;
      need(typeof root === 'string' && path.isAbsolute(root) && !root.split(/[\\/]/).some(p => p === '..' || p === '.') && !root.includes('\0'), 'PROJECT_PATH_UNSAFE');
      const opened = accepted(await openProject(root), 'opened');
      need(projects.size < 32, 'PROJECT_HANDLE_LIMIT');
      const projectHandle = randomUUID(); projects.set(projectHandle, { root, projectId: opened.projectId });
      return { status: 'opened', projectHandle, projectId: opened.projectId, manifest: opened.manifest, diagnostics: [] };
    }
    if (method === 'assessWorkflowReadiness') {
      need(request && typeof request === 'object' && !Array.isArray(request), 'HOST_REQUEST_INVALID');
      need(Object.keys(request).every(key => key === 'projectHandle' || readinessFields.has(key)), 'HOST_REQUEST_INVALID');
      let project;
      if (request.projectHandle !== undefined) project = (await context(request)).project;
      const readinessRequest = Object.fromEntries(Object.entries(request).filter(([key]) => readinessFields.has(key)));
      if (project) readinessRequest.project = project;
      return assessProjectWorkflowReadiness(readinessRequest);
    }
    if (method === 'applyWorkflowApproval' || method === 'applyWorkflowInvalidation') {
      const approval = method === 'applyWorkflowApproval';
      fields(request, ['projectHandle', 'workflowId', 'expectedWorkflowHash', ...(approval ? ['nodeId', 'decision', 'timestamp'] : ['transitionRecordId', 'evaluatedAt'])],
        ['expectedLatestRecordId', ...(approval ? ['actor', 'note', 'inputs'] : ['beforeInputs', 'afterInputs', 'quoteContext'])], 'HOST_REQUEST_INVALID');
      safeData(request, 'HOST_REQUEST_INVALID');
      need(validId(request.workflowId) && validHash(request.expectedWorkflowHash), 'HOST_REQUEST_INVALID');
      need(request.expectedLatestRecordId === undefined || request.expectedLatestRecordId === null || uuid(request.expectedLatestRecordId), 'HOST_REQUEST_INVALID');
      if (approval) {
        need(validId(request.nodeId), 'NODE_ID_INVALID');
        if (request.actor !== undefined) {
          // Host annotations cannot introduce arbitrary project references.
          fields(request.actor, [], ['id', 'source'], 'HOST_REQUEST_INVALID');
          need(Object.values(request.actor).every(v => typeof v === 'string'), 'HOST_REQUEST_INVALID');
        }
      } else need(uuid(request.transitionRecordId), 'HOST_REQUEST_INVALID');
      need(!transitionActive, 'HOST_TRANSITION_BUSY'); transitionActive = true;
      try {
        const { project } = await context(request);
        const { workflow } = accepted(await project.getProjectWorkflow(request.workflowId));
        need(hashWorkflow(workflow) === request.expectedWorkflowHash, 'WORKFLOW_HASH_MISMATCH');
        const { store } = accepted(await project.getProjectHistory(request.workflowId));
        const { record: latest } = accepted(await store.getLatestHistoryRecord(request.workflowId));
        if (request.expectedLatestRecordId !== undefined) need(request.expectedLatestRecordId === (latest?.recordId ?? null), 'STALE_WORKFLOW_STATE');
        let result;
        if (approval) {
          const { nodeId, decision, timestamp, actor, note, inputs, expectedWorkflowHash } = request;
          result = setNodeApproval(workflow, { nodeId, decision, timestamp, expectedWorkflowHash,
            ...Object.fromEntries(Object.entries({ actor, note, inputs }).filter(([, value]) => value !== undefined)) });
        } else {
          need(latest?.recordId === request.transitionRecordId && latest.afterHash === request.expectedWorkflowHash, 'STALE_WORKFLOW_STATE');
          const { workflow: before } = accepted(await store.getWorkflowAtRecord(request.workflowId, request.transitionRecordId, 'before'));
          const options = Object.fromEntries(['evaluatedAt', 'beforeInputs', 'afterInputs', 'quoteContext'].filter(k => request[k] !== undefined).map(k => [k, request[k]]));
          result = invalidateWorkflowProduction(before, workflow, options);
        }
        if (result.status !== 'applied') return { status: 'rejected', diagnostics: (result.errors || []).map(({ code, path, message }) => ({ code, path, message })) };
        const evidence = Object.fromEntries(['affectedNodeIds', 'removedNodeIds', 'invalidatedPaths', 'quoteContext', 'retiredQuotes', 'quoteBindingSource'].filter(k => result[k] !== undefined).map(k => [k, result[k]]));
        const recorded = await store.recordEdit({ before: workflow, result, batch: result.batch, expectedLatestRecordId: latest?.recordId ?? null,
          metadata: { source: method, ...(approval ? {} : { transitionRecordId: request.transitionRecordId }), ...Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'invalidatedPaths')) } });
        if (recorded.status !== 'recorded') return recorded;
        const updated = await project.updateWorkflowInProject({ workflow: result.workflow, expectedHash: result.beforeHash });
        const response = { workflowId: workflow.workflowId, recordId: recorded.recordId, beforeHash: result.beforeHash, afterHash: result.afterHash,
          workflow: result.workflow, diff: result.diff, ...evidence };
        // Existing stores commit history then project. Never erase a durable record
        // if the second publication fails; report the recoverable snapshot explicitly.
        if (updated.status !== 'updated') return { ...response, status: 'partial', diagnostics: [{ code: 'PROJECT_COMMIT_INCOMPLETE', path: '', message: 'History is durable; project publication needs explicit reconciliation from this record.' }] };
        return { ...response, status: 'applied', diagnostics: [], warnings: [...(recorded.warnings || []), ...(updated.warnings || [])] };
      } finally { transitionActive = false; }
    }
    if (method === 'executeNode') need(request?.allowExecution === true, 'EXECUTION_NOT_AUTHORIZED');
    const ctx = await context(request);
    if (method === 'getAsset') {
      need(validId(request.assetId), 'ASSET_ID_INVALID');
      return ctx.project.getProjectAsset(request.assetId);
    }
    need(validId(request.workflowId), 'WORKFLOW_ID_INVALID');
    const { workflow } = accepted(await ctx.project.getProjectWorkflow(request.workflowId));
    if (method === 'getWorkflow') return { status: 'ok', workflow, diagnostics: [] };
    need(method === 'planNode' || method === 'executeNode', 'HOST_OPERATION_UNSUPPORTED');
    need(validId(request.nodeId), 'NODE_ID_INVALID');
    safeData({ inputs: request.inputs ?? {}, assetBindings: request.assetBindings ?? {} }, 'HOST_REQUEST_INVALID');
    const args = { workflow, nodeId: request.nodeId, inputs: request.inputs ?? {}, assetBindings: request.assetBindings ?? {}, project: ctx.project };
    const runtime = {
      localAvailable: () => true, // Desktop preload exists; installed-model readiness remains upstream.
      canUpload: () => true,
      async upload(asset) {
        const record = accepted(await ctx.project.getProjectAsset(asset.assetId)).asset;
        need(record.path === asset.relativePath, 'ASSET_IDENTITY_MISMATCH');
        need(record.size <= 64 * 1024 * 1024, 'ASSET_TOO_LARGE');
        const bytes = await readBytes(ctx.root, record.path);
        need(bytes.length === record.size && createHash('sha256').update(bytes).digest('hex') === record.checksum, 'ASSET_HASH_MISMATCH');
        // No absolute path crosses IPC; only already-validated project asset bytes.
        return callRuntime('upload', { bytes: new Uint8Array(bytes), name: record.originalFilename, type: record.contentType });
      },
      remote: (method, parameters) => callRuntime('remote', { method, parameters }),
      local: parameters => callRuntime('local', { parameters }),
    };
    const bridge = createExecutionBridge({ runtime });
    if (method === 'planNode') return bridge.plan(args);
    need(!active, 'HOST_EXECUTION_BUSY'); active = true;
    try {
      const result = await bridge.execute(args, { allowExecution: true });
      emit({ status: result.status, workflowId: workflow.workflowId, nodeId: request.nodeId, requestId: result.requestId ?? null });
      return result;
    } finally { active = false; }
  }
  return {
    async invoke(method, request) {
      try { return await operation(method, structuredClone(request)); }
      catch (error) { return error.result ?? rejected(error.hostCode || error.diagnostic?.code || 'HOST_OPERATION_FAILED'); }
    },
    dispose() { projects.clear(); },
  };
}

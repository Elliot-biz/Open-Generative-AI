// Session DAG coordinator. Contracts, approval semantics and project stores remain authoritative.
import { randomUUID, createHash } from 'node:crypto';
import { hashWorkflow, hashNodeProductionScope, assessWorkflowReadiness, setNodeApproval, invalidateWorkflowProduction } from 'whihm-workflow-core';
import { stableJSON } from '../../packages/whihm-workflow-core/src/diff.js';
import { dependencyScope, assetIds } from '../../packages/whihm-workflow-core/src/dependencies.js';
import { isManualGate } from '../../packages/whihm-workflow-core/src/production.js';
import { fields } from '../../packages/whihm-workflow-core/src/project/io.js';
import { validateGraph, inventory, resolveNodeBindings, normalizeRunOutputs, portable, need, compare } from './workflow-bindings.mjs';
import { createWorkflowNodeAdapter } from './workflow-node-adapter.mjs';
import { workflowExecutionLimits, workflowExecutionLimitations } from './workflow-execution-contract.mjs';
const clone=value=>structuredClone(value),digest=value=>createHash('sha256').update(stableJSON(value)).digest('hex');
const diag=(code,category)=>({code,category});
function category(code='') {
  if(/APPROVAL|HUMAN|USER_REJECT/.test(code))return 'human_approval';
  if(/CONTINUATION|SUNO|CONFIRMATION/.test(code))return 'continuation';
  if(/AUTHORIZ/.test(code))return 'authorization';
  if(/VERIFICATION|RUN_OUTPUT_(?:TYPE|CARDINALITY|MAPPING|NOT_PORTABLE|MISSING)/.test(code))return 'output_verification';
  if(/RUNTIME|EXECUTOR|MODEL_ROUTE|LOCAL_|BINDING|UTILITY_UNAVAILABLE/.test(code))return 'readiness';
  if(/UPSTREAM|PROVIDER/.test(code))return 'provider';
  return 'contract';
}
const rejected=error=>({schemaVersion:1,status:'rejected',diagnostics:[diag(error.runCode??error.diagnostic?.code??'RUN_OPERATION_FAILED',category(error.runCode??error.diagnostic?.code))],...(error.validation?{validation:error.validation}:{})});
const codeOf=result=>result.diagnostics?.[0]?.code??'RUN_CONTRACT_REJECTED';
const identity=node=>Object.fromEntries(['id','type','provider','model','tool'].filter(k=>node.executor[k]!==undefined).map(k=>[k,node.executor[k]]));
function validatePolicies(workflow) {
  for(const node of workflow.nodes){
    fields(node.executionPolicy??{},[],['manual','optional'],'RUN_POLICY_UNSUPPORTED');need(Object.values(node.executionPolicy??{}).every(v=>typeof v==='boolean'),'RUN_POLICY_UNSUPPORTED');
    fields(node.retryPolicy??{},[],['maxAttempts'],'RUN_POLICY_UNSUPPORTED');need(node.retryPolicy?.maxAttempts===undefined||node.retryPolicy.maxAttempts===1,'RUN_POLICY_UNSUPPORTED');
    fields(node.fallbackPolicy??{},[],['allowed'],'RUN_POLICY_UNSUPPORTED');need(node.fallbackPolicy?.allowed===undefined||node.fallbackPolicy.allowed===false,'RUN_POLICY_UNSUPPORTED');
    fields(node.costPolicy??{},[],[],'RUN_POLICY_UNSUPPORTED');
  }
}
function sourceScopes(workflow,inputs,graph,records) {
  return Object.fromEntries(workflow.nodes.map(node=>{
    const scope=dependencyScope(graph.dependencies,node.id),refs=new Set();
    for(const ancestor of workflow.nodes.filter(n=>scope.has(n.id))){assetIds(ancestor.parameters,refs);(ancestor.assetRefs??[]).forEach(id=>refs.add(id));for(const p of ancestor.inputs)if(p.type==='asset'&&typeof ancestor.parameters[p.id]==='string')refs.add(ancestor.parameters[p.id]);}
    for(const input of workflow.inputs.filter(i=>i.targets.some(t=>scope.has(t.nodeId)))){const value=Object.hasOwn(inputs,input.id)?inputs[input.id]:input.default;assetIds(value,refs);if(input.type==='asset')for(const id of Array.isArray(value)?value:[value])if(typeof id==='string')refs.add(id);}
    return [node.id,digest({definition:hashNodeProductionScope(workflow,node.id,{inputs}),assets:[...refs].sort(compare).map(id=>({id,record:records.filter(r=>r.assetId===id).map(r=>({checksum:r.checksum,path:r.path,contentType:r.contentType,size:r.size}))}))})];
  }));
}
function descendants(graph,seeds) {
  const affected=new Set(seeds);let changed=true;
  while(changed){changed=false;for(const [id,deps]of graph.dependencies)if(!affected.has(id)&&[...deps].some(d=>affected.has(d))){affected.add(id);changed=true;}}
  return affected;
}
export function createWorkflowExecution({adapter=createWorkflowNodeAdapter(),currentWorkflow,now=()=>new Date().toISOString(),id=randomUUID}={}) {
  const runs=new Map(),locks=new Set();let disposed=false;
  const snapshot=record=>clone(record.state);
  function at(runId){need(!disposed&&runs.has(runId),'RUN_NOT_FOUND');return runs.get(runId);}
  function timestamp(){const value=now();need(typeof value==='string'&&Number.isFinite(Date.parse(value)),'RUN_CLOCK_INVALID');return value;}
  async function capture(action){try{return await action();}catch(error){return rejected(error);}}
  async function locked(request,action) {
    const record=at(request.runId);need(request.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');need(!locks.has(request.runId),'RUN_TRANSITION_BUSY');
    need(Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision===record.state.revision,'RUN_REVISION_MISMATCH');
    locks.add(request.runId);
    try{const result=await action(record);record.state.revision++;record.state.updatedAt=timestamp();return result??snapshot(record);}
    finally{locks.delete(request.runId);}
  }
  async function prepare({workflow,inputs={},project,root}) {
    const definition=clone(workflow),values=clone(inputs),graph=validateGraph(definition,values);validatePolicies(definition);
    const records=await inventory(project,definition),bindings=await adapter.describe(definition);
    return {definition,inputs:values,project,root,graph,bindings,scopes:sourceScopes(definition,values,graph,records),records};
  }
  function readiness(record) {
    const workflow=record.evidence??record.definition,executors=new Map();
    for(const node of workflow.nodes){const entry={...identity(node),available:record.bindings[node.id]?.available===true};const key=stableJSON(identity(node));if(executors.has(key)&&executors.get(key).available!==entry.available)entry.available=false;executors.set(key,entry);}
    const result=assessWorkflowReadiness(workflow,{evaluatedAt:timestamp(),inputs:record.inputs,assets:workflow.assets.map(a=>({id:a.id,present:Boolean(record.records.find(r=>r.assetId===a.id&&(!a.localPath||r.path===a.localPath)))})),executors:[...executors.values()]});
    return result;
  }
  async function nodePlan(record,node,states,executing=false) {
    const binding=record.bindings[node.id];
    if(!binding.available)return {status:'blocked',binding,diagnostics:[diag(binding.code??'RUN_EXECUTOR_UNAVAILABLE','readiness')]};
    try {
      const resolved=await resolveNodeBindings(record.definition,node,record.inputs,states,record.project),plan=await adapter.plan(node,resolved,{workflow:record.definition,project:record.project,root:record.root,executing});
      if(plan.status!=='planned')return {status:'blocked',binding,diagnostics:[diag(codeOf(plan),category(codeOf(plan)))]};
      if(plan.execution?.executable===false)return {status:'blocked',binding,resolved,plan,diagnostics:[diag('FINISH_RUNTIME_NOT_READY','readiness')],runtime:plan.runtime};
      return {status:'ready',binding,resolved,plan,diagnostics:[]};
    }catch(error){return {status:'blocked',binding,diagnostics:rejected(error).diagnostics};}
  }
  function transition(record,nodeId,status,diagnostics=[]) {
    const state=record.state.nodes[nodeId];state.status=status;state.diagnostics=diagnostics;
    record.state.events.push({nodeId,status,timestamp:timestamp()});
    need(record.state.events.length<=4096,'RUN_EVENT_LIMIT');
  }
  function stop(record,nodeId,status,diagnostics) {
    transition(record,nodeId,status,diagnostics);record.state.status=status;
    for(const id of descendants(record.graph,[nodeId]))if(id!==nodeId&&record.state.nodes[id].status==='pending')transition(record,id,'blocked',[diag('RUN_DEPENDENCY_BLOCKED','dependency')]);
  }
  async function acceptResult(record,node,result,resolved) {
    portable(result);const state=record.state.nodes[node.id];state.result=clone(result);state.finishedAt=timestamp();
    if(result.status==='awaiting_user'||record.bindings[node.id].mode==='voice_clone_guided'&&['processing','blocked'].includes(result.status)){
      state.continuationRequired=true;stop(record,node.id,result.status==='awaiting_user'?'awaiting_user':'blocked',[diag(result.status==='awaiting_user'?'RUN_PROVIDER_HUMAN_REQUIRED':'RUN_PROVIDER_PENDING','continuation')]);return false;
    }
    if(result.status!=='succeeded') {
      const failureCode=codeOf(result),isFailed=['failed','cancelled'].includes(result.status);
      if(isFailed)state.continuationRequired=false;state.uncertain=!isFailed&&state.attempts>0;stop(record,node.id,isFailed?'failed':'blocked',[diag(failureCode,isFailed?node.executor.type==='utility'?'local_tool':'provider':category(failureCode))]);return false;
    }
    state.outputs=await normalizeRunOutputs(node,result,resolved,record.project,record.bindings[node.id].mode);
    state.outputHash=digest(state.outputs);state.continuationRequired=false;state.cost=result.cost??null;
    transition(record,node.id,'completed');return true;
  }
  async function drive(record,allowStale=[]) {
    need(Array.isArray(allowStale)&&new Set(allowStale).size===allowStale.length,'RUN_RERUN_INVALID');
    need(!disposed,'RUN_SESSION_CLOSED');
    for(const nodeId of allowStale){const state=record.state.nodes[nodeId];need(state?.status==='stale'&&!state.uncertain&&!state.continuationRequired,'RUN_RERUN_INVALID');}
    for(const nodeId of allowStale){const state=record.state.nodes[nodeId];state.history.push({status:'stale',outputs:clone(state.outputs),result:clone(state.result),approval:clone(state.approval),cost:state.cost??null});state.outputs={};state.result=null;state.cost=null;state.runtime=null;state.outputHash=null;state.approval=null;state.startedAt=null;state.finishedAt=null;state.waitingFor=null;transition(record,nodeId,'pending');}
    record.state.status='running';
    for(const nodeId of record.graph.order){
      const node=record.definition.nodes.find(n=>n.id===nodeId),state=record.state.nodes[nodeId];
      if(['completed','skipped'].includes(state.status))continue;
      if(currentWorkflow){let current;try{current=await currentWorkflow(record.state.workflowId);}catch{stop(record,nodeId,'blocked',[diag('RUN_DEFINITION_UNAVAILABLE','readiness')]);return;}if(hashWorkflow(current)!==record.state.workflowHash){stop(record,nodeId,'blocked',[diag('RUN_DEFINITION_CHANGED','invalidation')]);return;}}
      if(state.status==='stale'){record.state.status='stale';return;}
      if(state.uncertain||state.status==='failed'){record.state.status=state.status;return;}
      if(node.enabled===false){transition(record,nodeId,'skipped');continue;}
      if([...record.graph.dependencies.get(nodeId)].some(d=>record.state.nodes[d].status!=='completed')){stop(record,nodeId,'blocked',[diag('RUN_DEPENDENCY_BLOCKED','dependency')]);return;}
      state.binding=clone(record.bindings[nodeId]);
      const read=readiness(record).nodes[nodeId];
      if(read?.approval==='REJECTED'){stop(record,nodeId,'blocked',[diag('APPROVAL_REJECTED','human_approval')]);return;}
      const nonApproval=(read?.reasons??[]).filter(r=>!['APPROVAL_PENDING','APPROVAL_STALE','UPSTREAM_MANUAL_PENDING'].includes(r.code));
      if(nonApproval.length){stop(record,nodeId,'blocked',nonApproval.map(r=>diag(r.code,category(r.code))));return;}
      const planned=await nodePlan(record,node,record.state.nodes,true);state.binding=clone(planned.binding);
      if(planned.status!=='ready'){state.runtime=planned.runtime??null;stop(record,nodeId,'blocked',planned.diagnostics);return;}
      state.runtime=planned.plan.runtime??null;state.normalizedInputs=clone(planned.resolved);state.effectiveOptions=clone(planned.plan.request?.effectiveOptions??planned.plan.parameters??{});
      if(isManualGate(node)&&read.approval!=='APPROVED'){state.waitingFor='generic_approval';stop(record,nodeId,'awaiting_user',[diag('APPROVAL_PENDING','human_approval')]);return;}
      if(read.approval==='APPROVED'&&!state.approval)state.approval=clone(record.evidence.nodes.find(n=>n.id===node.id).metadata?.production?.approval??null);
      if(node.executor.type==='control') {state.startedAt=timestamp();state.finishedAt=timestamp();state.result={decision:'approved',approval:clone(state.approval)};state.outputs=await normalizeRunOutputs(node,state.result,planned.resolved,record.project);state.outputHash=digest(state.outputs);transition(record,nodeId,'completed');continue;}
      need(!disposed,'RUN_SESSION_CLOSED');
      transition(record,nodeId,'ready');transition(record,nodeId,'running');state.startedAt=timestamp();state.attempts++;
      try {
        const result=await adapter.execute(node,planned.resolved,{workflow:record.definition,project:record.project,root:record.root});
        need(!disposed,'RUN_SESSION_CLOSED');if(!await acceptResult(record,node,result,planned.resolved))return;
      }catch(error){state.finishedAt=timestamp();state.uncertain=true;stop(record,nodeId,'failed',rejected(error).diagnostics);return;}
    }
    record.state.outputs={};
    for(const output of record.definition.outputs){const value=record.state.nodes[output.source.nodeId].outputs[output.source.portId];need(value!==undefined,'RUN_OUTPUT_MISSING');record.state.outputs[output.id]=clone(value);}
    record.state.status='completed';record.state.completedAt=timestamp();
  }
  async function verifyCurrent(record,request) {
    need(request.workflow&&hashWorkflow(request.workflow)===record.state.workflowHash,'RUN_DEFINITION_CHANGED');
    const current=await prepare({workflow:request.workflow,inputs:record.inputs,project:request.project,root:request.root});
    need(stableJSON(current.scopes)===stableJSON(record.scopes),'RUN_INPUTS_CHANGED');
    // Verify every completed project output before it can satisfy a dependency.
    for(const state of Object.values(record.state.nodes))if(state.status==='completed')for(const values of Object.values(state.outputs))for(const value of Array.isArray(values)?values:[values])if(value.kind==='project_asset'){
      const asset=current.records.find(a=>a.assetId===value.assetId);need(asset?.checksum===value.checksum,'RUN_OUTPUT_ASSET_CHANGED');
    }
    Object.assign(record,{project:request.project,root:request.root,bindings:current.bindings,records:current.records});
  }
  return {
    plan:request=>capture(async()=>{
      const record=await prepare(request),nodes={},report=readiness(record);
      for(const nodeId of record.graph.order){const node=record.definition.nodes.find(n=>n.id===nodeId),deps=[...record.graph.dependencies.get(nodeId)].sort(compare);
        const planned=deps.length?{status:record.bindings[nodeId].available?'pending':'blocked',binding:record.bindings[nodeId],diagnostics:record.bindings[nodeId].available?[]:[diag(record.bindings[nodeId].code,'readiness')]}:await nodePlan(record,node,{});
        if(deps.some(id=>nodes[id]?.status==='blocked')){planned.status='blocked';planned.diagnostics=[diag('RUN_DEPENDENCY_BLOCKED','dependency')];}
        nodes[nodeId]={...planned,dependencies:deps,approvalRequired:isManualGate(node),readiness:report.nodes[nodeId].status,...(isManualGate(node)&&report.nodes[nodeId].approval!=='APPROVED'&&planned.status==='ready'?{status:'awaiting_user'}:{})};
      }
      return {schemaVersion:1,status:'planned',workflowId:record.definition.workflowId,workflowHash:hashWorkflow(record.definition),order:record.graph.order,nodes,
        approvals:report.manualGates,knownBlocked:record.graph.order.filter(id=>nodes[id].status==='blocked'),limitations:workflowExecutionLimitations,remoteTransport:false,diagnostics:[]};
    }),
    run:request=>capture(async()=>{
      need(request.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');need(!disposed&&runs.size<workflowExecutionLimits.runs,'RUN_SESSION_LIMIT');
      const record=await prepare(request),runId=`run_${id()}`,time=timestamp();need(!runs.has(runId),'RUN_ID_COLLISION');
      record.evidence=clone(record.definition);record.state={schemaVersion:1,runId,workflowId:record.definition.workflowId,workflowVersion:record.definition.schemaVersion,workflowHash:hashWorkflow(record.definition),initialWorkflowHash:hashWorkflow(record.definition),revision:0,status:'pending',startedAt:time,updatedAt:time,completedAt:null,
        inputs:clone(record.inputs),outputs:{},nodes:Object.fromEntries(record.definition.nodes.map(n=>[n.id,{nodeId:n.id,executor:identity(n),binding:clone(record.bindings[n.id]),dependencies:[...record.graph.dependencies.get(n.id)].sort(compare),status:'pending',attempts:0,uncertain:false,continuationRequired:false,outputs:{},result:null,approval:null,history:[],diagnostics:[],startedAt:null,finishedAt:null}])),events:[],definitionChanges:[],persistence:'same_host_session'};
      runs.set(runId,record);locks.add(runId);
      try{await drive(record);record.state.revision++;record.state.updatedAt=timestamp();return snapshot(record);}catch(error){record.state.status='failed';record.state.diagnostics=rejected(error).diagnostics;return snapshot(record);}finally{locks.delete(runId);}
    }),
    get:request=>capture(async()=>snapshot(at(request.runId))),
    approve:request=>capture(()=>locked(request,async record=>{
      need(request.origin==='human'&&['approve','reject'].includes(request.decision),'RUN_HUMAN_DECISION_REQUIRED');
      const node=record.definition.nodes.find(n=>n.id===request.nodeId),state=record.state.nodes[request.nodeId];
      need(node&&state?.status==='awaiting_user'&&state.waitingFor==='generic_approval'&&!state.approval,'RUN_APPROVAL_NOT_PENDING');
      const result=setNodeApproval(record.evidence,{nodeId:node.id,decision:request.decision==='approve'?'APPROVED':'REJECTED',timestamp:timestamp(),expectedWorkflowHash:hashWorkflow(record.evidence),inputs:record.inputs,actor:{source:'explicit_human_workflow_action'}});
      need(result.status==='applied',result.errors?.[0]?.code??'RUN_APPROVAL_INVALID');record.evidence=result.workflow;state.approval=clone(result.workflow.nodes.find(n=>n.id===node.id).metadata.production.approval);
      state.waitingFor=null;transition(record,node.id,request.decision==='approve'?'pending':'blocked',request.decision==='approve'?[]:[diag('APPROVAL_REJECTED','human_approval')]);record.state.status=request.decision==='approve'?'paused':'blocked';
    })),
    resume:request=>capture(()=>locked(request,async record=>{
      await verifyCurrent(record,request);
      if(request.continuation){fields(request.continuation,['nodeId','action'],['confirmationAssetId','recordingOrigin'],'RUN_CONTINUATION_INVALID');
        const {nodeId}=request.continuation,state=record.state.nodes[nodeId],node=record.definition.nodes.find(n=>n.id===nodeId);
        need(state?.continuationRequired&&!state.uncertain&&['blocked','awaiting_user'].includes(state.status),'RUN_CONTINUATION_UNAVAILABLE');
        let submitted=false;
        try{const result=await adapter.continue(node,state.result,request.continuation,{workflow:record.definition,project:record.project,root:record.root,onSubmit(){
          submitted=true;state.continuations??=[];state.continuations.push({...clone(request.continuation),requestId:state.result.requestId,timestamp:timestamp()});
          transition(record,nodeId,'running');state.attempts++;
        }});if(!await acceptResult(record,node,result,state.normalizedInputs))return;}
        catch(error){if(!submitted)throw error;state.uncertain=true;stop(record,nodeId,'blocked',rejected(error).diagnostics);return;}
      }else if(Object.values(record.state.nodes).some(s=>s.continuationRequired)){return;}
      await drive(record,request.rerunNodeIds??[]);
    })),
    invalidate:request=>capture(()=>locked(request,async record=>{
      const next=await prepare({...request,inputs:request.inputs??record.inputs});need(next.definition.workflowId===record.definition.workflowId&&stableJSON(next.definition.nodes.map(n=>n.id).sort(compare))===stableJSON(record.definition.nodes.map(n=>n.id).sort(compare)),'RUN_GRAPH_CHANGE_REQUIRES_NEW_RUN');
      const reported=request.changedOutputNodeIds??[];need(Array.isArray(reported)&&reported.every(id=>typeof id==='string'&&Object.hasOwn(record.state.nodes,id)),'RUN_INVALIDATION_INVALID');
      const seeds=next.graph.order.filter(id=>next.scopes[id]!==record.scopes[id]);reported.forEach(id=>seeds.push(id));
      const affected=new Set([...descendants(record.graph,seeds),...descendants(next.graph,seeds)]);
      const evidence=clone(next.definition);for(const node of evidence.nodes){const old=record.evidence.nodes.find(n=>n.id===node.id);if(old.metadata?.production)node.metadata={...node.metadata,production:clone(old.metadata.production)};}
      const invalidated=invalidateWorkflowProduction(record.evidence,evidence,{evaluatedAt:timestamp(),beforeInputs:record.inputs,afterInputs:next.inputs});need(invalidated.status==='applied','RUN_INVALIDATION_INVALID');
      record.state.definitionChanges.push({beforeHash:record.state.workflowHash,afterHash:hashWorkflow(next.definition),timestamp:timestamp(),affectedNodeIds:[...affected].sort(compare),diff:invalidated.sourceDiff});
      record.evidence=invalidated.workflow;
      for(const nodeId of affected){const node=record.evidence.nodes.find(n=>n.id===nodeId);if(node.metadata)delete node.metadata.production;transition(record,nodeId,'stale',[diag('RUN_INPUT_OR_OUTPUT_CHANGED','invalidation')]);}
      Object.assign(record,next);record.state.workflowHash=hashWorkflow(next.definition);record.state.inputs=clone(next.inputs);if(affected.size){record.state.outputs={};record.state.completedAt=null;record.state.status='stale';}
      for(const node of next.definition.nodes){record.state.nodes[node.id].executor=identity(node);record.state.nodes[node.id].dependencies=[...next.graph.dependencies.get(node.id)].sort(compare);}
    })),
    dispose(){disposed=true;runs.clear();},
  };
}

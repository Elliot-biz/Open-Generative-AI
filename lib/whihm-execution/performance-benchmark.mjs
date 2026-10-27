// Evaluation records only. No execution bridge, provider transport, run restoration or filesystem writes.
import { maskSequenceMime } from './guidance-artifact-types.mjs';
import { createHash } from 'node:crypto';
import { fields, safeData, validId, validHash, iso } from '../../packages/whihm-workflow-core/src/project/io.js';
import { stableJSON } from '../../packages/whihm-workflow-core/src/diff.js';
import { unsafeRemoteUrl, portablePath } from '../../packages/whihm-workflow-core/src/validate.js';
import { projectCapabilities } from './capability-projection.mjs';
import { preservationAxes, preservationPolicies, acceptanceStates, benchmarkLimits, metricScale } from './performance-benchmark-contract.mjs';
import { nativeCostEvidence, sumReportedCosts, costThroughAcceptance } from './benchmark-cost.mjs';

const clone=value=>structuredClone(value),compare=(a,b)=>a<b?-1:a>b?1:0;
const hash=(kind,value)=>createHash('sha256').update(`whihm-benchmark-${kind}:v1\n${stableJSON(value)}`).digest('hex');
const need=(value,code='BENCHMARK_INVALID')=>{if(!value)throw Object.assign(new Error(code),{benchmarkCode:code});};
const id=value=>typeof value==='string'&&value.length<=128&&validId(value)&&!['__proto__','prototype','constructor'].includes(value);
const text=(value,max=4000)=>typeof value==='string'&&value.length<=max;
const list=(value,max,min=0)=>Array.isArray(value)&&value.length>=min&&value.length<=max;
function safe(value){safeData(value,'BENCHMARK_DATA_UNSAFE');need(Buffer.byteLength(JSON.stringify(value))<=benchmarkLimits.recordBytes,'BENCHMARK_LIMIT');}
function unique(values){need(new Set(values).size===values.length,'BENCHMARK_DUPLICATE_ID');}
const reject=error=>({schemaVersion:1,status:'rejected',diagnostics:[{code:error.benchmarkCode??error.diagnostic?.code??'BENCHMARK_OPERATION_FAILED'}]});
function executorIdentity(executor){
  fields(executor,['id','type'],['provider','model','tool'],'BENCHMARK_EXECUTOR_INVALID');need(id(executor.id)&&['remote-model','local-ai','utility','control'].includes(executor.type),'BENCHMARK_EXECUTOR_INVALID');
  for(const key of ['provider','model','tool'])if(executor[key]!==undefined)need(text(executor[key],256)&&executor[key].trim(),'BENCHMARK_EXECUTOR_INVALID');
  need(!['remote-model','local-ai'].includes(executor.type)||executor.provider&&executor.model,'BENCHMARK_EXECUTOR_INVALID');
  need(!['utility','control'].includes(executor.type)||executor.tool,'BENCHMARK_EXECUTOR_INVALID');return clone(executor);
}
function assetShape(asset){
  fields(asset,['role','assetId','checksum','path','mediaKind','contentType'],[],'BENCHMARK_ASSET_INVALID');
  need(id(asset.role)&&id(asset.assetId)&&validHash(asset.checksum)&&portablePath(asset.path)&&asset.path.startsWith('assets/')&&(['image','video','audio'].includes(asset.mediaKind)&&typeof asset.contentType==='string'&&asset.contentType.startsWith(`${asset.mediaKind}/`)||asset.mediaKind==='file'&&asset.contentType===maskSequenceMime),'BENCHMARK_ASSET_INVALID');
}
function definitionShape(definition){
  fields(definition,['caseId','title','description','category','intent','sources','references','preservation','metrics'],[],'BENCHMARK_DEFINITION_INVALID');
  need(id(definition.caseId)&&text(definition.title,200)&&definition.title.trim()&&text(definition.description)&&id(definition.category),'BENCHMARK_DEFINITION_INVALID');
  fields(definition.intent,['operation','description'],[],'BENCHMARK_INTENT_INVALID');need(id(definition.intent.operation)&&text(definition.intent.description),'BENCHMARK_INTENT_INVALID');
  for(const group of ['sources','references']){need(list(definition[group],benchmarkLimits.assetsPerRoleGroup,group==='sources'?1:0),'BENCHMARK_ASSET_INVALID');definition[group].forEach(assetShape);unique(definition[group].map(a=>a.role));}
  fields(definition.preservation,[],preservationAxes,'BENCHMARK_PRESERVATION_INVALID');
  for(const requirement of Object.values(definition.preservation)){
    fields(requirement,['policy'],['basis','notes'],'BENCHMARK_PRESERVATION_INVALID');need(preservationPolicies.includes(requirement.policy)&&(!Object.hasOwn(requirement,'notes')||text(requirement.notes)),'BENCHMARK_PRESERVATION_INVALID');
    if(Object.hasOwn(requirement,'basis')){fields(requirement.basis,['group','role'],[],'BENCHMARK_PRESERVATION_INVALID');const {group,role}=requirement.basis;need(['source','reference'].includes(group)&&definition[group==='source'?'sources':'references'].some(a=>a.role===role),'BENCHMARK_PRESERVATION_INVALID');}
  }
  need(list(definition.metrics,benchmarkLimits.metrics,1),'BENCHMARK_METRICS_INVALID');unique(definition.metrics.map(m=>m.id));
  for(const metric of definition.metrics){fields(metric,['id','label'],['description'],'BENCHMARK_METRICS_INVALID');need(id(metric.id)&&text(metric.label,200)&&metric.label.trim()&&(!Object.hasOwn(metric,'description')||text(metric.description)),'BENCHMARK_METRICS_INVALID');}
}
async function assetIdentity(project,reference){
  fields(reference,['role','assetId'],['checksum'],'BENCHMARK_ASSET_INVALID');need(id(reference.role)&&id(reference.assetId),'BENCHMARK_ASSET_INVALID');
  const result=await project.getProjectAsset(reference.assetId);need(result.status==='ok',result.diagnostics?.[0]?.code??'ASSET_NOT_FOUND');
  const record=result.asset,mediaKind=record.contentType===maskSequenceMime?'file':record.contentType.split('/')[0];need(['image','video','audio','file'].includes(mediaKind),'BENCHMARK_ASSET_INVALID');
  need(reference.checksum===undefined||reference.checksum===record.checksum,'ASSET_HASH_MISMATCH');
  return {role:reference.role,assetId:record.assetId,checksum:record.checksum,path:record.path,mediaKind,contentType:record.contentType};
}
async function normalizeDefinition(definition,project){
  fields(definition,['caseId','title','category','intent','sources','references','preservation','metrics'],['description'],'BENCHMARK_DEFINITION_INVALID');
  const result={...clone(definition),description:definition.description??'',intent:{...clone(definition.intent),description:definition.intent?.description??''}};
  for(const group of ['sources','references']){need(list(result[group],benchmarkLimits.assetsPerRoleGroup,group==='sources'?1:0),'BENCHMARK_ASSET_INVALID');result[group]=await Promise.all(result[group].map(ref=>assetIdentity(project,ref)));}
  definitionShape(result);return result;
}
function mediaShape(item){
  if(item.kind==='project_asset'){const {kind:_kind,group:_group,index:_index,...asset}=item;assetShape(asset);}
  else {fields(item,['role','kind','mediaKind','url'],['group','index'],'BENCHMARK_MEDIA_INVALID');need(item.kind==='remote_media'&&id(item.role)&&['image','video','audio'].includes(item.mediaKind)&&typeof item.url==='string'&&!unsafeRemoteUrl(item.url),'BENCHMARK_MEDIA_INVALID');}
  if(item.group!==undefined)need(['source','reference','executor_input'].includes(item.group),'BENCHMARK_MEDIA_INVALID');
  if(item.index!==undefined)need(Number.isSafeInteger(item.index)&&item.index>=0,'BENCHMARK_MEDIA_INVALID');
}
async function mediaReference(project,reference){
  if(Object.hasOwn(reference,'assetId'))return {kind:'project_asset',...await assetIdentity(project,reference)};
  fields(reference,['role','url','mediaKind'],[],'BENCHMARK_MEDIA_INVALID');const result={kind:'remote_media',...clone(reference)};mediaShape(result);return result;
}
function evaluationShape(evaluation,definition,attempt){
  fields(evaluation,['origin','evaluator','acceptance','metrics','notes','issues'],[],'BENCHMARK_EVALUATION_INVALID');
  need(evaluation.origin==='human'&&acceptanceStates.includes(evaluation.acceptance),'BENCHMARK_HUMAN_EVALUATION_REQUIRED');
  fields(evaluation.evaluator,['id'],['label'],'BENCHMARK_EVALUATOR_INVALID');need(id(evaluation.evaluator.id)&&(!Object.hasOwn(evaluation.evaluator,'label')||text(evaluation.evaluator.label,200)),'BENCHMARK_EVALUATOR_INVALID');
  fields(evaluation.metrics,definition.metrics.map(m=>m.id),[],'BENCHMARK_METRICS_INVALID');
  for(const metric of Object.values(evaluation.metrics)){fields(metric,['score'],['notes'],'BENCHMARK_SCORE_INVALID');need(metric.score===null||Number.isInteger(metric.score)&&metric.score>=metricScale.minimum&&metric.score<=metricScale.maximum,'BENCHMARK_SCORE_INVALID');need(!Object.hasOwn(metric,'notes')||text(metric.notes),'BENCHMARK_SCORE_INVALID');need(metric.score!==null||typeof metric.notes==='string'&&metric.notes.trim(),'BENCHMARK_NOT_ASSESSED_REASON_REQUIRED');}
  need(text(evaluation.notes)&&list(evaluation.issues,32)&&evaluation.issues.every(note=>text(note,1000)),'BENCHMARK_NOTES_INVALID');
  need(evaluation.acceptance==='REJECT'||attempt.evidence.status==='completed'&&attempt.evidence.outputs.length>0,'BENCHMARK_OUTPUT_REQUIRED');
}
function snapshotOf(record){const copy=clone(record);return {...copy,snapshotHash:hash('snapshot',copy)};}
function verifySnapshot(record){
  safe(record);fields(record,['schemaVersion','kind','definition','definitionHash','createdAt','updatedAt','revision','candidates','snapshotHash'],[],'BENCHMARK_SNAPSHOT_INVALID');
  need(record.schemaVersion===1&&record.kind==='whihm-performance-benchmark','BENCHMARK_VERSION_UNSUPPORTED');definitionShape(record.definition);
  need(record.definitionHash===hash('definition',record.definition),'BENCHMARK_DEFINITION_HASH_MISMATCH');
  const {snapshotHash,...body}=record;need(snapshotHash===hash('snapshot',body),'BENCHMARK_SNAPSHOT_HASH_MISMATCH');
  need(iso(record.createdAt)&&iso(record.updatedAt)&&Number.isSafeInteger(record.revision)&&record.revision>=0&&list(record.candidates,benchmarkLimits.candidates),'BENCHMARK_SNAPSHOT_INVALID');
  unique(record.candidates.map(c=>c.candidateId));let attempts=0;const order=[],provenance=new Set();
  for(const candidate of record.candidates){
    fields(candidate,['candidateId','label','executor','capabilityId','route','createdAt','attempts'],[],'BENCHMARK_CANDIDATE_INVALID');need(id(candidate.candidateId)&&text(candidate.label,200)&&iso(candidate.createdAt),'BENCHMARK_CANDIDATE_INVALID');executorIdentity(candidate.executor);
    need(candidate.capabilityId===null||id(candidate.capabilityId),'BENCHMARK_CANDIDATE_INVALID');if(candidate.route!==null){fields(candidate.route,[],['mode','route','runtime','bindingKey'],'BENCHMARK_ROUTE_INVALID');need(Object.values(candidate.route).every(v=>text(v,512)&&v.trim()),'BENCHMARK_ROUTE_INVALID');if(candidate.route.route!==undefined)need(['canonical','specialized','local','external','checkpoint'].includes(candidate.route.route),'BENCHMARK_ROUTE_INVALID');}need(list(candidate.attempts,benchmarkLimits.attempts,1),'BENCHMARK_ATTEMPT_INVALID');
    for(const [index,attempt]of candidate.attempts.entries()){
      fields(attempt,['attemptId','attemptNumber','recordOrder','recordedAt','evidence','evidenceHash','evaluations'],[],'BENCHMARK_ATTEMPT_INVALID');attempts++;order.push(attempt.recordOrder);
      need(attempt.attemptId===`${candidate.candidateId}:attempt:${index+1}`&&attempt.attemptNumber===index+1&&Number.isSafeInteger(attempt.recordOrder)&&attempt.recordOrder>0&&iso(attempt.recordedAt),'BENCHMARK_ATTEMPT_INVALID');
      const evidence=attempt.evidence;fields(evidence,['source','status','workflowRef','binding','mediaInputs','outputs','controls','technical','requestId','continuationId','cost','notes'],[],'BENCHMARK_EVIDENCE_INVALID');
      need(['recorded_result','workflow_run'].includes(evidence.source)&&['completed','failed','blocked','cancelled'].includes(evidence.status)&&text(evidence.notes),'BENCHMARK_EVIDENCE_INVALID');
      for(const key of ['controls','technical'])need(evidence[key]&&typeof evidence[key]==='object'&&!Array.isArray(evidence[key]),'BENCHMARK_EVIDENCE_INVALID');
      for(const key of ['requestId','continuationId'])need(evidence[key]===null||text(evidence[key],512)&&evidence[key].trim(),'BENCHMARK_EVIDENCE_INVALID');
      need(evidence.source!=='recorded_result'||evidence.workflowRef===null&&evidence.binding===null,'BENCHMARK_EVIDENCE_INVALID');
      for(const group of ['mediaInputs','outputs']){need(list(evidence[group],128),'BENCHMARK_MEDIA_INVALID');evidence[group].forEach(mediaShape);}
      need(stableJSON(evidence.cost)===stableJSON(nativeCostEvidence(evidence.cost.native)),'BENCHMARK_COST_INVALID');
      need(attempt.evidenceHash===hash('attempt',{definitionHash:record.definitionHash,candidateId:candidate.candidateId,attemptNumber:attempt.attemptNumber,evidence}),'BENCHMARK_EVIDENCE_HASH_MISMATCH');
      if(evidence.workflowRef){const ref=evidence.workflowRef;fields(ref,['workflowId','workflowHash','initialWorkflowHash','runId','nodeId','runRevision','executionAttempt'],[],'BENCHMARK_RUN_REFERENCE_INVALID');need([ref.workflowId,ref.runId,ref.nodeId].every(id)&&validHash(ref.workflowHash)&&validHash(ref.initialWorkflowHash)&&Number.isSafeInteger(ref.runRevision)&&ref.runRevision>=0&&Number.isSafeInteger(ref.executionAttempt)&&ref.executionAttempt>=0,'BENCHMARK_RUN_REFERENCE_INVALID');
        const key=stableJSON([ref.runId,ref.nodeId,ref.executionAttempt]);need(!provenance.has(key),'BENCHMARK_ATTEMPT_ALREADY_RECORDED');provenance.add(key);
      }else need(evidence.source==='recorded_result','BENCHMARK_RUN_REFERENCE_INVALID');
      need(list(attempt.evaluations,benchmarkLimits.evaluationsPerAttempt),'BENCHMARK_EVALUATION_INVALID');
      for(const [i,item]of attempt.evaluations.entries()){
        fields(item,['evaluationNumber','recordedAt','definitionHash','evidenceHash','assessment','evaluationHash'],[],'BENCHMARK_EVALUATION_INVALID');need(item.evaluationNumber===i+1&&iso(item.recordedAt)&&item.definitionHash===record.definitionHash&&item.evidenceHash===attempt.evidenceHash,'BENCHMARK_EVALUATION_INVALID');evaluationShape(item.assessment,record.definition,attempt);
        const {evaluationHash,...base}=item;need(evaluationHash===hash('evaluation',base),'BENCHMARK_EVALUATION_HASH_MISMATCH');
      }
    }
  }
  need(attempts<=benchmarkLimits.attempts&&stableJSON(order.sort((a,b)=>a-b))===stableJSON(Array.from({length:attempts},(_,i)=>i+1)),'BENCHMARK_ATTEMPT_INVALID');return record;
}
export function validatePerformanceBenchmark(record){try{verifySnapshot(record);return {valid:true,diagnostics:[]};}catch(error){return {valid:false,diagnostics:reject(error).diagnostics};}}
export function comparePerformanceBenchmark(record){
  try{
    verifySnapshot(record);const all=record.candidates.flatMap(c=>c.attempts).sort((a,b)=>a.recordOrder-b.recordOrder);
    const costs=attempts=>({reportedSpend:sumReportedCosts(attempts),throughFirstAccept:costThroughAcceptance(attempts,['ACCEPT']),throughFirstUsable:costThroughAcceptance(attempts,['ACCEPT','USABLE_WITH_ISSUES'])});
    return {schemaVersion:1,status:'ok',caseId:record.definition.caseId,definitionHash:record.definitionHash,revision:record.revision,title:record.definition.title,category:record.definition.category,intent:clone(record.definition.intent),preservation:clone(record.definition.preservation),metrics:clone(record.definition.metrics),metricScale:clone(metricScale),
      candidates:[...record.candidates].sort((a,b)=>compare(a.candidateId,b.candidateId)).map(c=>({candidateId:c.candidateId,label:c.label,executor:clone(c.executor),capabilityId:c.capabilityId,route:clone(c.route),attemptCount:c.attempts.length,costs:costs(c.attempts),
        attempts:c.attempts.map(a=>({attemptId:a.attemptId,attemptNumber:a.attemptNumber,status:a.evidence.status,evidenceSource:a.evidence.source,workflowRef:clone(a.evidence.workflowRef),evidenceHash:a.evidenceHash,acceptance:a.evaluations.at(-1)?.assessment.acceptance??null,evaluation:clone(a.evaluations.at(-1)??null),cost:clone(a.evidence.cost),mediaInputs:clone(a.evidence.mediaInputs),outputs:clone(a.evidence.outputs),notes:a.evidence.notes}))})),
      assessmentPolicy:'latest_evaluation_per_attempt',summary:{attemptCount:all.length,candidateCount:record.candidates.length,costs:costs(all)},ranking:false,recommendations:false,executionAuthority:false};
  }catch(error){return reject(error);}
}
async function manualEvidence(project,attempt){
  fields(attempt,['status','inputs','references','outputs'],['nativeCost','controls','technical','requestId','continuationId','notes'],'BENCHMARK_EVIDENCE_INVALID');
  const mediaInputs=[];
  for(const [group,refs]of [['source',attempt.inputs],['reference',attempt.references]]){need(list(refs,benchmarkLimits.assetsPerRoleGroup),'BENCHMARK_MEDIA_INVALID');for(const [index,ref]of refs.entries())mediaInputs.push({...await mediaReference(project,ref),group,index});}
  need(list(attempt.outputs,benchmarkLimits.assetsPerRoleGroup),'BENCHMARK_MEDIA_INVALID');const outputs=await Promise.all(attempt.outputs.map(ref=>mediaReference(project,ref)));
  return {source:'recorded_result',status:attempt.status,workflowRef:null,binding:null,mediaInputs,outputs,controls:clone(attempt.controls??{}),technical:clone(attempt.technical??{}),requestId:attempt.requestId??null,continuationId:attempt.continuationId??null,cost:nativeCostEvidence(attempt.nativeCost),notes:attempt.notes??''};
}
async function workflowEvidence(project,runRef,readRun){
  fields(runRef,['runId','nodeId'],[],'BENCHMARK_RUN_REFERENCE_INVALID');need(id(runRef.runId)&&id(runRef.nodeId)&&typeof readRun==='function','BENCHMARK_RUN_UNAVAILABLE');
  const run=clone(await readRun(runRef.runId));need(run&&run.schemaVersion===1&&run.runId===runRef.runId&&run.nodes&&Object.hasOwn(run.nodes,runRef.nodeId),'BENCHMARK_RUN_UNAVAILABLE');
  const node=run.nodes[runRef.nodeId];need(['completed','failed','blocked'].includes(node.status)&&!node.uncertain&&!node.continuationRequired,'BENCHMARK_RUN_NOT_FINAL');
  const convert=async(role,value,index)=>value.kind==='project_asset'?{kind:'project_asset',...await assetIdentity(project,{role,assetId:value.assetId,checksum:value.checksum}),index}:value.kind==='remote_media'?{kind:'remote_media',role,mediaKind:value.type,url:value.value,index}:null;
  const mediaInputs=[],outputs=[];
  for(const [field,values]of Object.entries(node.normalizedInputs?.bindings??{}))for(const [i,value]of (Array.isArray(values)?values:[values]).entries()){const ref=await convert(field,value,i);if(ref)mediaInputs.push({...ref,group:'executor_input'});}
  for(const [port,values]of Object.entries(node.outputs??{}))for(const [i,value]of (Array.isArray(values)?values:[values]).entries()){const ref=await convert(port,value,i);if(ref)outputs.push(ref);}
  // Catalog role metadata may describe scalar/array media supplied as parameters rather than ports.
  // Provider identity controls are never media roles and cannot enter these references.
  const entry=projectCapabilities().capabilities.flatMap(c=>c.executors).find(e=>e.mode===node.binding?.mode&&(e.id===node.executor.model||e.id===node.executor.tool));
  for(const role of entry?.inputs??[])if(['image','video','audio'].includes(role.type)&&!mediaInputs.some(i=>i.role===role.field)) {
    const raw=node.normalizedInputs?.parameters?.[role.field];
    for(const [index,value]of (Array.isArray(raw)?raw:raw===undefined?[]:[raw]).entries())if(typeof value==='string'&&!unsafeRemoteUrl(value))mediaInputs.push({kind:'remote_media',role:role.field,mediaKind:role.type,url:value,group:'executor_input',index});
  }
  const native=node.result;
  return {executor:executorIdentity(node.executor),route:node.binding?Object.fromEntries(['mode','route','runtime'].filter(k=>node.binding[k]!==undefined).map(k=>[k,node.binding[k]])):null,
    evidence:{source:'workflow_run',status:node.status,workflowRef:{workflowId:run.workflowId,workflowHash:run.workflowHash,initialWorkflowHash:run.initialWorkflowHash,runId:run.runId,nodeId:node.nodeId,runRevision:run.revision,executionAttempt:node.attempts},
      binding:clone(node.binding??null),mediaInputs,outputs,controls:clone(node.effectiveOptions??{}),technical:clone({...native?.output?.inspection??(native?.facts?{facts:native.facts,inspection:native.inspection}:native?.backend?{backend:native.backend}:{}),...(native?.usage!==undefined?{providerUsage:native.usage}:{})}),requestId:native?.requestId??null,continuationId:native?.operationState?.continuationId??null,cost:nativeCostEvidence(native?.cost??node.cost),notes:''}};
}
export function createPerformanceBenchmarks({readRun,now=()=>new Date().toISOString()}={}) {
  const records=new Map(),locks=new Set();let disposed=false;
  const time=()=>{const value=now();need(iso(value),'BENCHMARK_CLOCK_INVALID');return value;};
  const at=caseId=>{need(!disposed&&id(caseId)&&records.has(caseId),'BENCHMARK_NOT_FOUND');return records.get(caseId);};
  async function capture(action){try{return await action();}catch(error){return reject(error);}}
  async function mutate(request,action){
    need(request.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const record=at(request.caseId);need(!locks.has(request.caseId),'BENCHMARK_TRANSITION_BUSY');need(request.expectedRevision===record.revision,'BENCHMARK_REVISION_MISMATCH');locks.add(request.caseId);
    try{const next=clone(record);await action(next);next.revision++;next.updatedAt=time();const snapshot=snapshotOf(next);verifySnapshot(snapshot);need(!disposed,'BENCHMARK_SESSION_CLOSED');records.set(request.caseId,next);return {schemaVersion:1,status:'recorded',benchmark:snapshot};}finally{locks.delete(request.caseId);}
  }
  return {
    create:request=>capture(async()=>{
      need(request.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');need(!disposed&&records.size<benchmarkLimits.cases,'BENCHMARK_LIMIT');safe(request.definition);
      const definition=await normalizeDefinition(request.definition,request.project);need(records.size<benchmarkLimits.cases,'BENCHMARK_LIMIT');need(!disposed&&!records.has(definition.caseId),'BENCHMARK_CASE_EXISTS');const timestamp=time();
      const record={schemaVersion:1,kind:'whihm-performance-benchmark',definition,definitionHash:hash('definition',definition),createdAt:timestamp,updatedAt:timestamp,revision:0,candidates:[]};verifySnapshot(snapshotOf(record));records.set(definition.caseId,record);return {schemaVersion:1,status:'created',benchmark:snapshotOf(record)};
    }),
    get:request=>capture(async()=>({schemaVersion:1,status:'ok',benchmark:snapshotOf(at(request.caseId))})),
    recordCandidate:request=>capture(()=>mutate(request,async record=>{
      need(id(request.candidateId)&&(!Object.hasOwn(request,'label')||text(request.label,200)),'BENCHMARK_CANDIDATE_INVALID');need(Boolean(request.runRef)!==Boolean(request.attempt),'BENCHMARK_EVIDENCE_SOURCE_INVALID');
      let evidence,executor,route,capabilityId;
      if(request.runRef){const observed=await workflowEvidence(request.project,request.runRef,readRun);evidence=observed.evidence;executor=observed.executor;route=observed.route;
        if(request.executor)need(stableJSON(request.executor)===stableJSON(executor),'BENCHMARK_EXECUTOR_MISMATCH');
        if(request.route)need(stableJSON(request.route)===stableJSON(route),'BENCHMARK_ROUTE_MISMATCH');
        const entry=projectCapabilities().capabilities.find(c=>c.executors.some(e=>e.mode===route?.mode&&(e.id===executor.model||e.id===executor.tool)));
        capabilityId=entry?.id??null;need(request.capabilityId===undefined||request.capabilityId===capabilityId,'BENCHMARK_CAPABILITY_MISMATCH');
      }else{executor=executorIdentity(request.executor);route=clone(request.route??null);capabilityId=request.capabilityId??null;evidence=await manualEvidence(request.project,request.attempt);}
      let candidate=record.candidates.find(c=>c.candidateId===request.candidateId);
      if(candidate)need(stableJSON([candidate.executor,candidate.route,candidate.capabilityId])===stableJSON([executor,route,capabilityId])&&(request.label===undefined||request.label===candidate.label),'BENCHMARK_CANDIDATE_IDENTITY_CHANGED');
      else{need(record.candidates.length<benchmarkLimits.candidates,'BENCHMARK_LIMIT');candidate={candidateId:request.candidateId,label:request.label??request.candidateId,executor,route,capabilityId,createdAt:time(),attempts:[]};record.candidates.push(candidate);}
      const number=candidate.attempts.length+1,attempt={attemptId:`${candidate.candidateId}:attempt:${number}`,attemptNumber:number,recordOrder:record.candidates.reduce((n,c)=>n+c.attempts.length,0)+1,recordedAt:time(),evidence,evidenceHash:hash('attempt',{definitionHash:record.definitionHash,candidateId:candidate.candidateId,attemptNumber:number,evidence}),evaluations:[]};candidate.attempts.push(attempt);
    })),
    recordEvaluation:request=>capture(()=>mutate(request,async record=>{
      const candidate=record.candidates.find(c=>c.candidateId===request.candidateId),attempt=candidate?.attempts.find(a=>a.attemptNumber===request.attemptNumber);need(attempt,'BENCHMARK_ATTEMPT_NOT_FOUND');need(attempt.evaluations.length<benchmarkLimits.evaluationsPerAttempt,'BENCHMARK_LIMIT');
      const assessment=clone(request.evaluation);evaluationShape(assessment,record.definition,attempt);const base={evaluationNumber:attempt.evaluations.length+1,recordedAt:time(),definitionHash:record.definitionHash,evidenceHash:attempt.evidenceHash,assessment};attempt.evaluations.push({...base,evaluationHash:hash('evaluation',base)});
    })),
    compare:request=>capture(async()=>comparePerformanceBenchmark(snapshotOf(at(request.caseId)))),
    dispose(){disposed=true;records.clear();},
  };
}

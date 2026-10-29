// Local adapter only: the canonical host retains all planning/execution authority.
import {randomUUID} from 'node:crypto';
import {openProject,hashWorkflow} from 'whihm-workflow-core';
import {validId,fields} from '../../packages/whihm-workflow-core/src/project/io.js';
import {createWorkflowHost} from './host.mjs';
import {timelineHash} from './timeline-contract.mjs';
import {getMultimediaRuntimeStatus} from './multimedia-runtime.mjs';

const id={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_.:-]*$'};
const object={type:'object'};
const bool={type:'boolean'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const tools=[];
function tool(name,method,kind,required={},optional={},contract){
  const properties={...required,...optional,...(kind==='ACT'?{commandId:id}:{})};
  tools.push({name,method,class:kind,description:`${name.replaceAll('_',' ')} through canonical WHIHM controls`,
    providerSideEffects:kind==='ACT'&&/^(run|continue)(AgentExecution|CreativeRevision)$/.test(method),approvalMayBeRequired:kind==='ACT',
    inputSchema:{type:'object',additionalProperties:false,properties,required:[...Object.keys(required),...(kind==='ACT'?['commandId']:[])]},
    outputSchema:{type:'object',additionalProperties:false,required:['schemaVersion','sessionId','status'],properties:{schemaVersion:{const:1},sessionId:{type:'string'},status:{enum:['ok','error']},data:{type:'object'},error:{type:'object',required:['code','nativeCode'],properties:{code:{type:'string'},nativeCode:{type:'string'}},additionalProperties:false}}},
    ...(contract?{canonicalContract:contract}:{})});
}
tool('get_project_context',null,'READ');
tool('get_capabilities','getCapabilityProjection','READ');
tool('get_provider_center','getProviderCenter','READ');
tool('get_provider_status','getProviderStatus','READ',{providerId:id});
tool('get_project_assets',null,'READ');
tool('inspect_media','inspectMedia','READ',{assetId:id},{requirements:object},'validateInspectionRequirements');
tool('get_workflow','getWorkflow','READ',{workflowId:id});
tool('get_workflow_run','getWorkflowRun','READ',{runId:id});
tool('get_agent_execution','getAgentExecution','READ',{executionId:id});
tool('get_creative_qc','getCreativeQc','READ',{record:object},{},'getCreativeQc checksum-bound record');
tool('get_creative_revision','getCreativeRevision','READ',{revisionId:id});
tool('plan_agent_execution','planAgentExecution','PLAN',{plan:object},{},'Agent plan schema v1');
tool('plan_creative_revision','planCreativeRevision','PLAN',{request:object},{},'Revision request schema v1');
tool('apply_agent_plan','applyAgentPlan','ACT',{executionId:id,planHash:hash,allowExecution:bool});
tool('run_agent_execution','runAgentExecution','ACT',{executionId:id,allowExecution:bool},{allowRemoteExecution:bool});
tool('continue_agent_execution','continueAgentExecution','ACT',{executionId:id,allowExecution:bool},{allowRemoteExecution:bool,rerunNodeIds:{type:'array',items:id},continuation:object});
tool('run_creative_revision','runCreativeRevision','ACT',{revisionId:id,planHash:hash,allowExecution:bool},{allowRemoteExecution:bool,approveProposal:bool});
tool('continue_creative_revision','continueCreativeRevision','ACT',{revisionId:id,allowExecution:bool},{allowRemoteExecution:bool,continuation:object});
tool('evaluate_creative_qc','evaluateCreativeQc','ACT',{request:object,allowExecution:bool},{},'Creative QC request schema v1; external evidence must already be registered');
export function directorManifest(){return structuredClone({schemaVersion:1,transport:'json-lines-stdio',tools,
  limits:{requestBytes:1048576,calls:512,actions:128},sessionOnly:true,credentials:'no access or mutation',humanApproval:'owner must use existing approval API; no bridge approval tool'});}
const need=(v,code='INVALID_REQUEST')=>{if(!v)throw Object.assign(Error(code),{bridgeCode:code});};
function validate(schema,value){
  if(schema.type==='object')need(value!==null&&typeof value==='object'&&!Array.isArray(value));
  else if(schema.type==='string')need(typeof value==='string'&&value.length<=512&&(!schema.pattern||new RegExp(schema.pattern).test(value)));
  else if(schema.type==='boolean')need(typeof value==='boolean');
  else if(schema.type==='array'){need(Array.isArray(value)&&value.length<=64);value.forEach(v=>validate(schema.items,v));}
  if(schema.properties){fields(value,schema.required,Object.keys(schema.properties).filter(k=>!schema.required.includes(k)),'DIRECTOR_INVALID_REQUEST');for(const [k,v]of Object.entries(value))validate(schema.properties[k],v);}
}
function category(code){return /INTERNAL_ERROR/.test(code)?'INTERNAL_ERROR':/HASH|STALE|REVISION_MISMATCH/.test(code)?'STALE_STATE':/REMOTE_PERMISSION/.test(code)?'PAID_ACTION_REQUIRES_CONFIRMATION':/UNCERTAIN/.test(code)?'BLOCKED':/APPROVAL|HUMAN/.test(code)?'APPROVAL_REQUIRED':/LIMIT/.test(code)?'LIMIT_REACHED':/NOT_FOUND|NOT_REGISTERED/.test(code)?'NOT_FOUND':/READINESS|RUNTIME|CREDENTIAL|UNAVAILABLE/.test(code)?'NOT_READY':/REASONING/.test(code)?'EXTERNAL_REASONING_REQUIRED':/INVALID|UNSUPPORTED|AUTHORIZ/.test(code)?'INVALID_REQUEST':'BLOCKED';}
const secretKey=/^(?:authorization|credentials|api[_-]?key|key_secret|key_id|HF_API_KEY_ID|HF_API_KEY_SECRET|WHIHM_META_API_KEY|META_API_KEY|encrypted|ciphertext|storagePath|resolvedPath|projectRoot)$/i;
function publicValue(value,secrets){
  if(typeof value==='string'){let s=value;for(const secret of secrets)if(secret)s=s.split(secret).join('[redacted]');return s;}
  if(Array.isArray(value))return value.map(v=>publicValue(v,secrets));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!secretKey.test(k)).map(([k,v])=>[k,publicValue(v,secrets)]));
  return value;
}
export async function createExternalDirector({projectRoot,host,env=process.env}={}){
  const opened=await openProject(projectRoot);need(opened.status==='opened','PROJECT_UNAVAILABLE');
  const project=opened.project,projectId=opened.projectId,sessionId=randomUUID();
  const control=host??createWorkflowHost({callRuntime:async()=>{throw Error('DIRECTOR_RENDERER_RUNTIME_UNAVAILABLE');}});
  const linked=await control.invoke('openProject',{projectRoot});need(linked.status==='opened','PROJECT_UNAVAILABLE');
  await getMultimediaRuntimeStatus(); // Existing bounded local probe; never provider transport.
  const projectHandle=linked.projectHandle,audit=[],commands=new Map(),observed=new Map();let calls=0,closed=false,busy=false;
  const secrets=Object.entries(env).filter(([k])=>/KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION/i.test(k)).map(([,v])=>v).filter(v=>typeof v==='string'&&v.length>=3);
  const clean=v=>publicValue(v,[...secrets,projectRoot]);
  const responseId=input=>typeof input?.requestId==='string'&&input.requestId.length<=128?input.requestId:undefined;
  const ok=(data,input)=>({schemaVersion:1,sessionId,...(responseId(input)?{requestId:responseId(input)}:{}),status:'ok',data:clean(data)});
  const fail=(code,input)=>clean({schemaVersion:1,sessionId,...(responseId(input)?{requestId:responseId(input)}:{}),status:'error',error:{code:category(code),nativeCode:code}});
  async function assets(){const r=await project.listProjectAssets();need(r.status==='ok','PROJECT_UNAVAILABLE');return {assets:r.assets.map(({path:_p,originalFilename:_f,...a})=>a)};}
  return {sessionId,manifest:directorManifest,
    async call(input){
      if(busy)return fail('DIRECTOR_BUSY',input);busy=true;
      let entry,args,key;
      try{
        need(!closed,'DIRECTOR_CLOSED');need(++calls<=512,'DIRECTOR_CALL_LIMIT');
        fields(input,['tool','arguments'],['requestId'],'DIRECTOR_INVALID_REQUEST');
        need(input.requestId===undefined||typeof input.requestId==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/.test(input.requestId),'DIRECTOR_REQUEST_ID_INVALID');
        need(Buffer.byteLength(JSON.stringify(input))<=1048576,'DIRECTOR_REQUEST_LIMIT');
        entry=tools.find(t=>t.name===input.tool);need(entry,'DIRECTOR_TOOL_UNSUPPORTED');args=input.arguments;validate(entry.inputSchema,args);
        if(entry.class==='ACT'){
          need(args.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');key=args.commandId;
          const old=commands.get(key),fingerprint=timelineHash({tool:input.tool,arguments});
          if(old){need(old.fingerprint===fingerprint,'DIRECTOR_COMMAND_CONFLICT');return structuredClone(old.result??fail('DIRECTOR_COMMAND_UNRESOLVED',input));}
          need(commands.size<128,'DIRECTOR_ACTION_LIMIT');commands.set(key,{fingerprint});
        }
        let result;
        if(entry.name==='get_project_assets')result=await assets();
        else if(entry.name==='get_project_context'){
          const manifest=await project.getManifest();need(manifest.status==='ok','PROJECT_UNAVAILABLE');
          const r=await project.listProjectWorkflows();need(r.status==='ok','PROJECT_UNAVAILABLE');
          const workflows=[];for(const ref of r.workflows){const w=await project.getProjectWorkflow(ref.workflowId);need(w.status==='ok','PROJECT_UNAVAILABLE');workflows.push({workflowId:ref.workflowId,hash:hashWorkflow(w.workflow)});}
          const provider=await control.invoke('getProviderCenter',{});
          result={projectId,title:manifest.manifest.title,description:manifest.manifest.description??null,mainWorkflowId:manifest.manifest.mainWorkflowId??null,workflows,...await assets(),providers:provider.providers?.map(p=>({id:p.id,readiness:p.readiness,paidSideEffect:p.paidSideEffect})),observed:[...observed.values()],sessionOnly:true};
        }else{
          const {commandId:_c,...request}=args;
          const global=['getCapabilityProjection','getProviderCenter','getProviderStatus'].includes(entry.method);
          result=await control.invoke(entry.method,{...request,...(!global?{projectHandle}:{}),...(entry.name==='inspect_media'?{allowExecution:true}:{})});
          if(entry.name==='get_workflow'&&result.workflow)result={...result,hash:hashWorkflow(result.workflow)};
        }
        const code=result.diagnostics?.[0]?.code;
        const response=result.status==='rejected'?fail(typeof code==='string'&&/^[A-Z0-9_]+$/.test(code)?code:'DIRECTOR_OPERATION_REJECTED',input):ok(result,input);
        if(key)commands.get(key).result=response;
        const record={sessionId,tool:entry.name,class:entry.class,providerSideEffects:entry.providerSideEffects,projectId,workflowId:args.plan?.workflowId??args.request?.workflowId??args.workflowId??null,executionId:result.executionId??args.executionId??null,revisionId:result.revisionId??args.revisionId??null,runId:result.runId??null,outcome:result.status??result.state??response.status};
        audit.push(record);if(record.executionId||record.revisionId||record.runId)observed.set(record.executionId??record.revisionId??record.runId,record);
        return structuredClone(response);
      }catch(error){const raw=error.bridgeCode??error.diagnostic?.code;const response=fail(typeof raw==='string'&&/^[A-Z0-9_]+$/.test(raw)?raw:'DIRECTOR_INTERNAL_ERROR',input);if(key&&commands.has(key)&&!commands.get(key).result)commands.get(key).result=response;if(audit.length<512)audit.push({sessionId,tool:entry?.name??'unregistered',class:entry?.class??'READ',providerSideEffects:entry?.providerSideEffects??false,projectId,outcome:response.error.code});return response;}
      finally{busy=false;}
    },
    getAudit:()=>clean(structuredClone(audit)),
    close(){closed=true;control.dispose();},
  };
}

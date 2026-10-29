// Read-only normalization. Catalog membership comes exclusively from capability projection.
import {projectCapabilities} from './capability-projection.mjs';
import {higgsfieldNativeReadiness} from './higgsfield-native.mjs';
import {metaSegmentationReadiness} from './meta-segmentation-binding.mjs';
import {peekMultimediaRuntimeStatus,getMultimediaRuntimeStatus} from './multimedia-runtime.mjs';
import {peekFaceGuidanceStatus,getFaceGuidanceStatus} from './face-guidance-runtime.mjs';
import {timelineHash} from './timeline-contract.mjs';
import {validId} from '../../packages/whihm-workflow-core/src/project/io.js';
import {resolveProviderEnvironment,providerCredentialView} from './provider-credentials.mjs';

const need=(v)=>{if(!v)throw Error('PROVIDER_CENTER_INVALID');};
const states=['KNOWN','UNVERIFIED','READY','PARTIAL','BLOCKED','UNAVAILABLE'];
const types=['remote_generation','remote_utility','local_runtime','local_model','deterministic_tool'];
const spend=['LOCAL_NO_PROVIDER_SPEND','REMOTE_PAID_OR_ACCOUNT_USAGE','REMOTE_UNKNOWN_COST','NOT_APPLICABLE'];
export function validateProviderRecord(r){need(r?.schemaVersion===1&&validId(r.id)&&types.includes(r.type)&&states.includes(r.readiness.state)&&spend.includes(r.paidSideEffect));return r;}
// Only these owner-defined adapter checks inspect config. Never copy configuration values.
function configuration(id,env,credentialStore){
 if(id==='higgsfield'||id==='meta'){
  const resolved=resolveProviderEnvironment(id,{env,store:credentialStore}),r=id==='higgsfield'?higgsfieldNativeReadiness(resolved.env):metaSegmentationReadiness(resolved.env),code=resolved.code??r.code;
  const presence=resolved.presence==='present'?'present':resolved.presence==='malformed'?'malformed':'missing';
  return {configuration:presence==='present'?'CONFIGURED':presence==='malformed'?'MALFORMED':'NOT_CONFIGURED',
   credential:{required:true,requirements:id==='higgsfield'?['HF_API_KEY_ID','HF_API_KEY_SECRET']:['WHIHM_META_API_KEY'],...providerCredentialView(id,{env,store:credentialStore}),presence,source:resolved.source,verification:'unverified'},
   readiness:{state:code?'BLOCKED':'UNVERIFIED',code:code??'ACCOUNT_ACCESS_NOT_VERIFIED',dispatchConfigured:!code}};
 }
 return {configuration:'UNKNOWN',credential:{required:id==='muapi'?true:null,presence:'unknown',source:id==='muapi'?'external_config':'unavailable',verification:'unverified'},readiness:{state:'UNVERIFIED',code:'NO_SAFE_HOST_READINESS_OBSERVATION'}};
}
function runtimeReadiness(r,face=false){
 const a=face?r.available:r.availability;
 return {state:a===true||a==='ready'?'READY':a==='partial'?'PARTIAL':a===null||a==='unverified'?'UNVERIFIED':'BLOCKED',
  code:face?r.code??null:r.blockingReasons?.[0]?.code??null};
}
function runtimeId(e){return e.id==='face-guidance'?'mediapipe-face':e.runtime?.multimedia?'multimedia':null;}
function rows(projection){return projection.capabilities.flatMap(c=>c.executors.map(e=>({capabilityId:c.id,e})));}
export function getProviderCenter({env=process.env,credentialStore,projection,multimedia=peekMultimediaRuntimeStatus(),face=peekFaceGuidanceStatus()}={}){
 projection??=projectCapabilities({env});
 const groups=new Map();
  function group(id,type,local){if(!groups.has(id))groups.set(id,{schemaVersion:1,id,displayName:id,type,local,known:true,
  ...(local?{configuration:'UNKNOWN',credential:{required:false,presence:'not_applicable',source:'unavailable',verification:'not_applicable'},readiness:{state:'UNVERIFIED',code:'EXECUTION_NOT_VERIFIED'}}:configuration(id,env,credentialStore)),
  bindings:[],links:[],health:{state:local?'not_observed':'not_live_tested',sessionOnly:true},
  nativeEvidence:{usage:'unknown',cost:'unknown',actualCost:'unknown',unknownIsZero:false,scope:'support_only_no_ledger'},
  limitations:['Catalog availability is not account health, input readiness or execution authorization.']});return groups.get(id);}
 for(const {capabilityId,e} of rows(projection)){
  const local=e.runtime?.class!=='remote',id=e.provider??'unknown';
  const g=group(id,local?e.modelRequirement?'local_model':'deterministic_tool':id==='meta'?'remote_utility':'remote_generation',local);
  // Allowlisted contract identifiers only: never forward controls, config, errors or runtime objects.
  const b={capabilityId,executorId:e.id,executorKey:e.key,providerId:id,mode:e.mode??null,
   bindingAvailable:e.binding?.available===true,catalogAvailable:e.available===true,
   readinessCode:typeof e.reason?.code==='string'&&/^[A-Z0-9_]+$/.test(e.reason.code)?e.reason.code:null,
   remote:!local,approval:{executionAuthorizationRequired:true,humanApproval:'workflow_dependent',providerLiveness:e.lifecycle?'adapter_controlled_session':'unknown'}};
  g.bindings.push(b);
  const rid=runtimeId(e);if(rid)group(rid,'local_runtime',true).bindings.push({...b,dependencyOnly:true});
 }
 for(const g of groups.values()){
  if(g.id==='multimedia'){g.readiness=runtimeReadiness(multimedia);g.configuration=multimedia.binaries?.ffmpeg?.present&&multimedia.binaries?.ffprobe?.present?'CONFIGURED':'UNKNOWN';}
  if(g.id==='mediapipe-face'){g.readiness=runtimeReadiness(face,true);g.configuration=face.identity?'CONFIGURED':'UNKNOWN';}
  g.paidSideEffect=g.local?'LOCAL_NO_PROVIDER_SPEND':g.id==='higgsfield'||g.id==='meta'||g.id==='muapi'?'REMOTE_PAID_OR_ACCOUNT_USAGE':'REMOTE_UNKNOWN_COST';
  if(g.local&&g.type==='deterministic_tool'&&g.id==='whihm'){g.readiness={state:'PARTIAL',code:'PER_EXECUTOR_PREREQUISITES_REQUIRED'};g.configuration='NOT_APPLICABLE';}
  if(g.id==='wan2gp'){g.paidSideEffect='REMOTE_UNKNOWN_COST';g.limitations.push('Configured Wan2GP may use a remote MCP backend; locality and spend are unverified.');}
  // Existing upstream account link, components/ApiKeyModal.js; no account interpolation.
  if(g.id==='muapi')g.links=[{kind:'api_keys',url:'https://muapi.ai/access-keys',source:'components/ApiKeyModal.js'}];
  if(g.id==='higgsfield')g.nativeEvidence={...g.nativeEvidence,usage:'supported_when_returned',cost:'supported_when_returned',actualUsage:'unknown'};
  if(g.id==='meta')g.nativeEvidence={...g.nativeEvidence,usage:'supported_when_returned',actualUsage:'unknown'};
  g.bindings.sort((a,b)=>a.executorKey.localeCompare(b.executorKey));
  g.capabilities=[...new Set(g.bindings.map(b=>b.capabilityId))].sort();
  g.modelsModes=g.bindings.map(b=>({executorId:b.executorId,mode:b.mode}));
  g.health={...g.health,state:g.local?(g.readiness.state==='READY'?'local_readiness_observed':'not_verified'):'not_live_tested',configurationChecked:g.configuration==='CONFIGURED',accountAccessVerified:g.local?'not_applicable':false};
  validateProviderRecord(g);
 }
 const providers=[...groups.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const summary={ready:providers.filter(p=>p.readiness.state==='READY').length,configuredNotReady:providers.filter(p=>p.configuration==='CONFIGURED'&&p.readiness.state!=='READY').length,
  missingCredentials:providers.filter(p=>p.credential.presence==='missing').length,blocked:providers.filter(p=>p.readiness.state==='BLOCKED').length,localReady:providers.filter(p=>p.local&&p.readiness.state==='READY').length};
 const body={schemaVersion:1,providers,summary,scope:'global',networkCalls:false};
 return {...body,snapshotHash:timelineHash(body)};
}
export async function testProviderReadiness({providerId,env=process.env,credentialStore}={}){
 need(validId(providerId));
 // Explicit local probes only. No provider client, network or generation is reachable here.
 if(providerId==='multimedia')await getMultimediaRuntimeStatus({refresh:true});
 else if(providerId==='mediapipe-face')await getFaceGuidanceStatus();
 const snapshot=getProviderCenter({env,credentialStore}),provider=snapshot.providers.find(p=>p.id===providerId);need(provider);
 return {schemaVersion:1,provider,connectionTest:provider.local&&['multimedia','mediapipe-face'].includes(providerId)?'LOCAL_READINESS_ONLY':'NOT_SUPPORTED',networkCalls:false,generation:false};
}
export async function getProviderDependencies({project,providerId,env=process.env,credentialStore}){
 need(validId(providerId));const snapshot=getProviderCenter({env,credentialStore}),record=snapshot.providers.find(p=>p.id===providerId);need(record);
 const listed=await project.listProjectWorkflows();need(listed.status==='ok');const dependencies=[];
 for(const ref of listed.workflows){const r=await project.getProjectWorkflow(ref.workflowId);need(r.status==='ok');
  for(const node of r.workflow.nodes){const matches=record.bindings.filter(b=>b.executorId===(node.executor.tool??node.executor.model)&&
   (b.dependencyOnly||node.executor.provider===undefined||b.providerId===node.executor.provider)&&(!node.metadata?.oga?.mode||b.mode===node.metadata.oga.mode));
   if(matches.length)dependencies.push({workflowId:ref.workflowId,nodeId:node.id,dependencyKind:matches.every(b=>b.dependencyOnly)?'catalog_declared_runtime_requirement':'executor_binding',resolution:matches.length===1?'exact_catalog_match':'ambiguous_catalog_matches',bindings:matches.map(b=>({executorKey:b.executorKey,capabilityId:b.capabilityId,mode:b.mode}))});
  }
 }
 return {schemaVersion:1,scope:'project',providerId,dependencies};
}

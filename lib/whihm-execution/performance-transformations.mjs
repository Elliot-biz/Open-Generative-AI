import { higgsfieldRoutes, higgsfieldNativeReadiness } from './higgsfield-native.mjs';
const higgsfield = Object.entries(higgsfieldRoutes).map(([id,r])=>[id.split('/')[2],r.capability,r.minimum,r.maximum]);
export function getHiggsfieldTransformationDescriptions({env=process.env}={}) {
  const ready=higgsfieldNativeReadiness(env);return higgsfield.map(([operation,capability,minimum,maximum])=>({capability,entry:{
    key:`remote:higgsfield:higgsfield/genjutsu/${operation}/v1.0`,id:`higgsfield/genjutsu/${operation}/v1.0`,label:`Genjutsu ${operation}`,mode:'performance_transformation',provider:'higgsfield',
    runtime:{class:'remote',method:'runWorkflow',requirements:['Registered project source/references','HF_API_KEY_ID','HF_API_KEY_SECRET','Public IPv4 HTTPS media handoff'],workflow:{executorType:'remote-model',provider:'higgsfield',mode:'performance_transformation',planOperation:'planWorkflowExecution',executeOperation:'runWorkflow',resumeOperation:'resumeWorkflow'},readiness:ready},
    available:ready.adapterReady,availability:ready.adapterReady?'available':'provider_blocked',assurance:'reviewed',route:'specialized',partial:false,runtimeVerification:'unverified',
    binding:{available:true,source:'workflow.higgsfield',code:'HIGGSFIELD_WORKFLOW_BOUND',requiresAllowExecution:true},...(!ready.adapterReady?{reason:{code:ready.code}}:{}),
    inputs:[{field:'video_url',type:'video',role:'source-performance',required:true,isArray:false,projectAsset:true,projectAssetRequired:true},{field:'image_urls',type:'image',role:'appearance-references',required:minimum>0,isArray:true,minimum,maximum,projectAsset:true,projectAssetRequired:true}],
    controls:{prompt:{type:'string',maxLength:10000,default:'',required:false},resolution:{type:'string',enum:['480p','720p','1080p'],default:'720p',required:false},...(operation==='restyle'?{preset_id:{type:'string',required:true,providerIdentifier:'style-preset',projectAsset:false}}:{})},
    requiredFields:['video_url',...(minimum?['image_urls']:[]),...(operation==='restyle'?['preset_id']:[])],
    constraints:[{kind:'media_formats',video:['video/mp4'],images:['image/png','image/jpeg','image/webp','image/gif'],output:['video/mp4'],videoStreams:1},{kind:'media_transport',protocol:'https',addressFamily:'public_ipv4',redirects:false,maximumOutputBytes:67108864,timeoutMs:30000},{kind:'aggregate_input_byte_limit',maximum:67108864},{kind:'registered_project_assets_only'},{kind:'source_duration',minimumSeconds:4,maximumSeconds:30,excessPolicy:'reject_before_upload'},...(operation==='object-swap'?[{kind:'source_pixels',minimum:409600}]:[]),{kind:'guidance_input_unsupported',modes:['face_mesh','depth_mask','depth_mask_face_mesh']}],
    projectAssets:[{field:'video_url',type:'video',role:'source',array:false},{field:'image_urls',type:'image',role:'references',array:true}],providerIdentifiers:[{field:'result.requestId',kind:'higgsfield-request',source:'result',projectAsset:false},...(operation==='restyle'?[{field:'preset_id',kind:'style-preset',projectAsset:false}]:[])],result:{kind:'derived-project-video',inspectionSchemaVersion:1},
    limitations:['Bound through Workflow Execution only. Explicit allowExecution and registered project assets required. Session-only continuation; no retries.','Provider motion/preservation statements are not fidelity verification.','Native usage/cost remains unknown until reported; no price estimation.'],
    lifecycle:{multiStage:true,humanActionRequired:false,continuation:'same_live_host_session',actions:['poll'],stages:['queued','in_progress','completed','failed','nsfw','canceled'],operations:[{action:'poll',required:['runId','nodeId'],inputs:[],controls:{}}]},
    evidence:{contractStatus:'REVIEWED',authorization:'not_granted'},
  }}));
}
// Distinct projection views reuse exact executor identity and route. The selected
// intent remains an explicit existing request parameter; no execution duplication.
export function transformationViews(descriptions) {
  return descriptions.flatMap(description=>{
    const {entry}=description, support=entry.constraints.find(c=>c.kind==='transformation_support');
    if(!support)return [description];
    return Object.entries(support.selectors).map(([capability,parameters],index)=>({capability,entry:{...structuredClone(entry),
      key:index===0?entry.key:`${entry.key}:intent:${capability}`,
      controls:{...structuredClone(entry.controls),...Object.fromEntries(Object.entries(parameters).map(([field,value])=>[field,{...entry.controls[field],type:'string',enum:[value],required:true}]))},
      constraints:[...structuredClone(entry.constraints).map(c=>c.kind==='transformation_support'?{...c,capability}:c),{kind:'exact_intent_parameters',capability,parameters}],
    }}));
  });
}

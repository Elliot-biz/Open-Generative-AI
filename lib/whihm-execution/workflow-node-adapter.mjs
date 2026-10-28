import {createAudioProduction} from './audio-production.mjs';
import { createTimelineComposition } from './timeline-composition.mjs';
import { createHiggsfieldProject } from './higgsfield-project.mjs';
import { higgsfieldRoutes } from './higgsfield-native.mjs';
// Orchestration adapter only. Existing contracts, bridge and local tools own execution.
import { segmentationBinding } from './meta-segmentation-binding.mjs';
import { createPerformanceGuidance } from './performance-guidance.mjs';
import { getMultimediaRuntimeStatus } from './multimedia-runtime.mjs';
import { createExecutionBridge } from './bridge.mjs';
import { resolveExecutionBinding } from './runtime.mjs';
import { projectCapabilities } from './capability-projection.mjs';
import { planMediaInspection, inspectMedia } from './media-inspection.mjs';
import { planMediaFinishing, finishMedia } from './media-finishing.mjs';
import { bridgeRequest, need, portable } from './workflow-bindings.mjs';
export function createWorkflowNodeAdapter({bridge=createExecutionBridge(),timeline=createTimelineComposition(),audio=createAudioProduction(),guidance=createPerformanceGuidance(),higgsfield=createHiggsfieldProject(),localReadiness=async()=>({available:null,code:'LOCAL_RUNTIME_UNVERIFIED'})}={}) {
  const tools={
    'audio-production':{plan:audio.plan,execute:audio.produce,keys:['definition','sources'],mode:'produce_audio_mix',method:'produceAudioMix'},
    'timeline-composition':{plan:timeline.plan,execute:timeline.compose,keys:['timeline','sources'],mode:'compose_timeline',method:'composeTimeline'},
    'video-subject-segmentation':{plan:guidance.plan,execute:guidance.prepare,keys:['assetId','mode','selector','objectId','trackingDirection','parameters'],mode:'segment_video_subject',method:'preparePerformanceGuidance',route:'specialized',runtimeClass:'remote'},
    'performance-guidance':{plan:guidance.plan,execute:guidance.prepare,keys:['assetId','mode','depthAssetId','maskAssetId','parameters','selector','objectId','trackingDirection'],mode:'prepare_performance_guidance',method:'preparePerformanceGuidance'},
    'face-guidance':{plan:guidance.plan,execute:guidance.prepare,keys:['assetId','mode','parameters'],mode:'extract_face_guidance',method:'preparePerformanceGuidance'},
    'media-inspection':{plan:planMediaInspection,execute:inspectMedia,keys:['assetId','requirements']},
    'media-finishing':{plan:planMediaFinishing,execute:finishMedia,keys:['assetId','operation','parameters','sourceAudioAssetId']},
  };
  async function describe(workflow) {
    const entries=projectCapabilities().capabilities.flatMap(c=>c.executors),result={};
    for(const node of workflow.nodes){
      if(node.executor.type==='control'&&node.executor.tool==='approval') {
        need(typeof node.parameters.reason==='string'&&node.parameters.reason.trim()&&node.parameters.reason.length<=2000,'RUN_CHECKPOINT_INVALID');
        need(Object.keys(node.parameters).every(k=>k==='reason'||node.inputs.some(p=>p.id===k))&&node.outputs.every(p=>['boolean','json','object','result'].includes(p.type)),'RUN_CHECKPOINT_INVALID');
        result[node.id]={available:true,mode:'approval',route:'checkpoint',runtime:'host.workflowCheckpoint'};continue;
      }
      if(node.executor.type==='utility'&&Object.hasOwn(tools,node.executor.tool)) {
        if(node.executor.tool==='performance-guidance')need(node.parameters.mode!=='subject_mask','RUN_CANONICAL_SEGMENTATION_TOOL_REQUIRED');
        if(node.executor.tool==='video-subject-segmentation')need((node.executor.provider===undefined||node.executor.provider===segmentationBinding.provider)&&(node.executor.model===undefined||node.executor.model===segmentationBinding.model),'RUN_EXECUTOR_BINDING_MISMATCH');
        result[node.id]={available:true,mode:tools[node.executor.tool].mode??(node.executor.tool==='media-inspection'?'inspect_media':'finish_media'),route:tools[node.executor.tool].route??'local',...(tools[node.executor.tool].runtimeClass?{runtimeClass:tools[node.executor.tool].runtimeClass}:{}),runtime:`host.${tools[node.executor.tool].method??(node.executor.tool==='media-inspection'?'inspectMedia':'finishMedia')}`};continue;
      }
      if(node.executor.type==='remote-model'&&node.executor.provider==='higgsfield'){
        need(Object.hasOwn(higgsfieldRoutes,node.executor.model),'HIGGSFIELD_MODEL_UNSUPPORTED');need(node.metadata?.oga?.intent===undefined||node.metadata.oga.intent===higgsfieldRoutes[node.executor.model].capability,'TRANSFORMATION_INTENT_MISMATCH');need(node.outputs.length===1&&node.outputs[0].type==='video'&&(node.outputs[0].cardinality??'one')!=='many','HF_OUTPUT_PORT_INVALID');
        need(node.metadata?.oga?.mode===undefined||node.metadata.oga.mode==='performance_transformation','HF_MODE_INVALID');
        const ready=higgsfield.readiness();result[node.id]={available:ready.adapterReady,availability:ready.adapterReady?'available':'provider_blocked',code:ready.code,mode:'performance_transformation',route:'specialized',runtimeClass:'remote',runtime:'host.higgsfield',assurance:'reviewed',runtimeVerification:'unverified'};continue;
      }
      const binding=resolveExecutionBinding(node);
      if(binding.code){
        const matches=entries.filter(e=>e.id===node.executor.model&&(!node.metadata?.oga?.mode||e.mode===node.metadata.oga.mode)),known=matches.length===1?matches[0]:null;
        result[node.id]={available:false,code:binding.code,availability:known?.available===false?known.availability:'unavailable',...(known?{route:known.route,...(known.reason?{reason:known.reason}:{})}:{})};continue;
      }
      const mode=binding.selected?.mode,entry=entries.find(e=>e.id===node.executor.model&&(node.executor.type==='local-ai'?e.runtime.class==='local':e.mode===mode&&e.runtime.class==='remote'));
      if(node.executor.type==='local-ai') {
        const local=await localReadiness(structuredClone(node));
        result[node.id]={available:local.available===true,availability:local.available===true?'available':'local_constrained',code:local.available===true?null:local.code??'LOCAL_RUNTIME_UNVERIFIED',mode:'local',route:'local',runtime:binding.runtime,assurance:entry?.assurance??'generic',runtimeVerification:'unverified'};
      } else result[node.id]={available:entry?.available===true,availability:entry?.availability??'unavailable',code:entry?.available===true?null:entry?.reason?.code??'RUN_EXECUTOR_UNAVAILABLE',mode,route:entry?.route??'canonical',runtime:binding.runtime,assurance:entry?.assurance??'unreviewed',runtimeVerification:'unverified'};
      if(node.executor.type==='remote-model'&&node.outputs.length>1)need(node.outputs.every(p=>Number.isSafeInteger(p.metadata?.normalizedOutputIndex)&&p.metadata.normalizedOutputIndex>=0),'RUN_OUTPUT_MAPPING_REQUIRED');
    }
    return result;
  }
  function toolArgs(node,resolved,context) {
    need(Object.keys(resolved.parameters).every(k=>tools[node.executor.tool].keys.includes(k)),'RUN_TOOL_PARAMETERS_INVALID');
    if(node.executor.tool==='audio-production'){
      const sources=resolved.bindings.sources;need(Array.isArray(sources)&&sources.every(s=>s.kind==='project_asset'),'RUN_PROJECT_ASSET_REQUIRED');
      const expected=resolved.parameters.definition.tracks.flatMap(t=>t.events.map(e=>e.source));need(expected.every(e=>sources.some(s=>s.assetId===e.assetId&&s.checksum===e.checksum))&&sources.every(s=>expected.some(e=>s.assetId===e.assetId&&s.checksum===e.checksum)),'ASSET_IDENTITY_MISMATCH');
      return {project:context.project,root:context.root,definition:resolved.parameters.definition};
    }
    if(node.executor.tool==='timeline-composition') {
      need(Object.keys(resolved.parameters).every(k=>['timeline','sources'].includes(k)),'RUN_TOOL_PARAMETERS_INVALID');
      const sources=resolved.bindings.sources;need(Array.isArray(sources)&&sources.every(s=>s.kind==='project_asset'),'RUN_PROJECT_ASSET_REQUIRED');
      const expected=resolved.parameters.timeline.tracks.flatMap(t=>t.items.map(i=>i.source));
      need(expected.every(e=>sources.some(s=>s.assetId===e.assetId&&s.checksum===e.checksum))&&sources.every(s=>expected.some(e=>s.assetId===e.assetId&&s.checksum===e.checksum)),'ASSET_IDENTITY_MISMATCH');
      return {project:context.project,root:context.root,timeline:resolved.parameters.timeline};
    }
    const source=resolved.bindings.assetId;need(source?.kind==='project_asset','RUN_PROJECT_ASSET_REQUIRED');
    if(node.executor.tool==='performance-guidance')need(resolved.parameters.mode!=='subject_mask','RUN_CANONICAL_SEGMENTATION_TOOL_REQUIRED');
    if(node.executor.tool==='video-subject-segmentation')need(resolved.parameters.mode==='subject_mask','GUIDANCE_MODE_INVALID');
    if(node.executor.tool==='face-guidance')need(resolved.parameters.mode==='face_mesh','GUIDANCE_MODE_INVALID');
    const args={project:context.project,root:context.root,...resolved.parameters,assetId:source.assetId};
    for(const key of ['depthAssetId','maskAssetId','sourceAudioAssetId'])if(resolved.bindings[key]){need(resolved.bindings[key].kind==='project_asset','RUN_PROJECT_ASSET_REQUIRED');args[key]=resolved.bindings[key].assetId;}
    if(node.executor.tool==='media-finishing'&&args.operation==='restore_source_audio'){
      need(resolved.bindings.sourceAudioAssetId?.kind==='project_asset','RUN_PROJECT_ASSET_REQUIRED');
      need(args.parameters.sourceAudioAssetId===undefined||args.parameters.sourceAudioAssetId===args.sourceAudioAssetId,'RUN_INPUT_CONFLICT');
      args.parameters={...args.parameters,sourceAudioAssetId:args.sourceAudioAssetId};delete args.sourceAudioAssetId;
    }
    return args;
  }
  return {describe,dispose(){higgsfield.dispose?.();guidance.dispose?.();},
    async plan(node,resolved,context) {
      if(node.executor.type==='remote-model'&&node.executor.provider==='higgsfield')return higgsfield.plan(node.executor.model,resolved,context);
      if(node.executor.type==='control')return {status:'planned',reason:node.parameters.reason,requiresHumanApproval:true,...(resolved.bindings.guidance?await guidance.checkpoint(resolved.bindings.guidance.value,context):{})};
      if(node.executor.type==='utility') {
        const args=toolArgs(node,resolved,context);let planned=await tools[node.executor.tool].plan(args);
        if(context.executing&&['performance-guidance','face-guidance'].includes(node.executor.tool)&&planned.status==='planned'&&planned.mode!=='subject_mask') {await getMultimediaRuntimeStatus({refresh:true});planned=await tools[node.executor.tool].plan(args);}
        if(context.executing&&['timeline-composition','audio-production'].includes(node.executor.tool)&&planned.status==='planned'){await getMultimediaRuntimeStatus({refresh:true});planned=await tools[node.executor.tool].plan(args);}
        if(context.executing&&node.executor.tool==='media-finishing'&&planned.expectedOutput?.mediaKind!=='image'&&planned.status==='planned') {await getMultimediaRuntimeStatus({refresh:true});planned=await tools[node.executor.tool].plan(args);}
        return planned;
      }
      return bridge.plan(await bridgeRequest(context.workflow,node,resolved,context.project));
    },
    async execute(node,resolved,context) {
      if(node.executor.type==='remote-model'&&node.executor.provider==='higgsfield')return higgsfield.start(node.executor.model,resolved,{...context,allowExecution:true});
      if(node.executor.type==='utility')return tools[node.executor.tool].execute({...toolArgs(node,resolved,context),allowExecution:true});
      const result=await bridge.execute(await bridgeRequest(context.workflow,node,resolved,context.project),{allowExecution:true});
      portable(result);return result;
    },
    async continue(node,result,request,context) {
      if(node.executor.type==='remote-model'&&node.executor.provider==='higgsfield'){need(request.action==='poll'&&request.confirmationAssetId===undefined&&request.recordingOrigin===undefined,'RUN_CONTINUATION_INVALID');context.onSubmit?.();return higgsfield.poll(result,{...context,allowExecution:true});}
      need(node.executor.type==='remote-model'&&node.metadata?.oga?.mode==='voice_clone_guided','RUN_CONTINUATION_UNAVAILABLE');
      need(['confirm','poll'].includes(request.action),'RUN_CONTINUATION_INVALID');
      need(result.operationState&&result.requestId===result.operationState.requestId,'RUN_CONTINUATION_UNAVAILABLE');
      const view=structuredClone(context.workflow),target=view.nodes.find(n=>n.id===node.id);
      view.nodes=[target];view.edges=[];view.inputs=[];view.outputs=[];target.dependencies=[];
      target.parameters={action:request.action,state:result.operationState};target.inputs=[];target.assetRefs=[];
      const assetBindings={};
      if(request.action==='confirm') {
        need(result.status==='awaiting_user'&&request.recordingOrigin==='user_recorded_challenge'&&typeof request.confirmationAssetId==='string','RUN_CONFIRMATION_REQUIRED');
        const registered=await context.project.getProjectAsset(request.confirmationAssetId);need(registered.status==='ok'&&registered.asset.contentType.startsWith('audio/'),'RUN_CONFIRMATION_REQUIRED');
        const record=registered.asset;
        if(!view.assets.some(a=>a.id===record.assetId))view.assets.push({id:record.assetId,type:'audio',localPath:record.path,checksum:{algorithm:'sha256',value:record.checksum}});
        target.inputs=[{id:'audio_url',type:'audio',required:true}];target.assetRefs=[record.assetId];target.parameters.recording_origin=request.recordingOrigin;assetBindings.audio_url=record.assetId;
      }else need(request.confirmationAssetId===undefined&&request.recordingOrigin===undefined,'RUN_CONTINUATION_INVALID');
      const args={workflow:view,nodeId:node.id,project:context.project,assetBindings},plan=await bridge.plan(args);
      need(plan.status==='planned',plan.diagnostics?.[0]?.code??'RUN_CONTINUATION_INVALID');
      context.onSubmit?.();
      return bridge.execute(args,{allowExecution:true});
    },
  };
}

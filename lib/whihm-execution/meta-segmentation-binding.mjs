import { maskSequenceMime } from './guidance-artifact-types.mjs';
// One fixed Meta Responses binding. No provider registry, polling engine or implicit retries.
import { buildObjectPrompt, formats } from '@meta-sam/parser';
import { fields, safeData, validId } from '../../packages/whihm-workflow-core/src/project/io.js';
export const segmentationBinding=Object.freeze({provider:'meta',model:'sam-3.1',endpoint:'https://api.meta.ai/v1/responses',parser:'@meta-sam/parser',parserVersion:'0.1.0',operationVersion:1});
export const segmentationLimits=Object.freeze({sourceBytes:16777216,responseBytes:33554432,points:32,timeoutMs:300000});
export const segmentationNeed=(v,code)=>{if(!v)throw Object.assign(new Error(code),{guidanceCode:code});};
const need=segmentationNeed;
export function metaSegmentationReadiness(env=process.env) {
  const key=env.WHIHM_META_API_KEY,endpoint=env.WHIHM_META_BASE_URL;
  const code=endpoint!==undefined&&endpoint!=='https://api.meta.ai/v1'?'META_CONFIGURATION_INVALID':!key?'META_API_KEY_MISSING':typeof key!=='string'||! /^[\x21-\x7e]{16,4096}$/.test(key)?'META_CONFIGURATION_INVALID':null;
  return {bindingAvailable:true,available:code===null,availability:code?'provider_blocked':'available',code,provider:'meta',model:'sam-3.1',runtimeVerification:'unverified',providerProbed:false};
}
export function normalizeSegmentationRequest(selector,timeline,{objectId='subject',trackingDirection}={}) {
  need(validId(objectId)&&objectId.length<=64,'SEGMENTATION_OBJECT_ID_INVALID');
  need(selector&&['box','point','concept'].includes(selector.type),'SEGMENTATION_SELECTOR_INVALID');
  const p=structuredClone(selector),{width,height,frameCount}=timeline;
  const coord=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<max;
  if(p.type==='concept'){
    fields(p,['type','prompt'],[],'SEGMENTATION_SELECTOR_INVALID');
    need(typeof p.prompt==='string'&&p.prompt.trim().length>0&&p.prompt.length<=300&&!/[\r\n<>\x00-\x1f]/.test(p.prompt),'SEGMENTATION_SELECTOR_INVALID');
    p.prompt=p.prompt.trim();need(trackingDirection===undefined,'SEGMENTATION_DIRECTION_UNSUPPORTED');
  }else{
    need(coord(p.frameIndex,frameCount),'SEGMENTATION_FRAME_INVALID');
    if(p.type==='box'){
      fields(p,['type','frameIndex','x1','y1','x2','y2'],[],'SEGMENTATION_SELECTOR_INVALID');
      need(coord(p.x1,width)&&coord(p.x2,width)&&coord(p.y1,height)&&coord(p.y2,height)&&p.x2>=p.x1&&p.y2>=p.y1,'SEGMENTATION_BOX_INVALID');
    }else{
      fields(p,['type','frameIndex','points'],[],'SEGMENTATION_SELECTOR_INVALID');need(Array.isArray(p.points)&&p.points.length>0&&p.points.length<=segmentationLimits.points,'SEGMENTATION_POINT_INVALID');
      p.points=p.points.map(point=>{fields(point,['x','y'],['label'],'SEGMENTATION_POINT_INVALID');need(coord(point.x,width)&&coord(point.y,height)&&[undefined,'positive','negative'].includes(point.label),'SEGMENTATION_POINT_INVALID');return {...point,label:point.label??'positive'};});
      need(p.points.some(point=>point.label==='positive'),'SEGMENTATION_POSITIVE_POINT_REQUIRED');
    }
  }
  const direction=p.type==='concept'?null:trackingDirection??(p.frameIndex===0?'forward':'both');
  need(direction===null||['forward','both'].includes(direction),'SEGMENTATION_DIRECTION_UNSUPPORTED');
  // Whole-clip v1 never calls unrequested frames absent. Partial/backward scopes remain deferred.
  need(direction!=='forward'||p.frameIndex===0,'SEGMENTATION_PARTIAL_TRACKING_UNSUPPORTED');
  return {selector:p,objectId,trackingDirection:direction};
}
export function buildMetaSegmentationRequest(normalized,timeline,mediaPart) {
  const p=normalized.selector;
  const text=p.type==='concept'?p.prompt:buildObjectPrompt({size:{width:timeline.width,height:timeline.height},objects:[{id:'1',prompts:[p.type==='box'?{frame:p.frameIndex,box:{left:p.x1,top:p.y1,right:p.x2+1,bottom:p.y2+1}}:{frame:p.frameIndex,points:p.points}]}]});
  return {model:'sam-3.1',stream:false,input:[{type:'message',role:'user',content:[{type:'input_text',text},{type:'input_video',...mediaPart}]}],metadata:{mask_encoding:'one_bit',...(normalized.trackingDirection?{propagation_direction:normalized.trackingDirection}:{})}};
}
// Preflight dimensions BEFORE the official parser's intrinsic mask decoder allocates a raster.
export function parseMetaSegmentationText(text,timeline) {
  need(typeof text==='string'&&Buffer.byteLength(text)<=segmentationLimits.responseBytes,'SEGMENTATION_OUTPUT_INVALID');
  let pixels=0,segments=0;
  for(const token of text.matchAll(/<\|([^|]*?)\|>/g)){
    const parts=token[1].split(';'),kind=parts.shift().trim(),pairs=parts.map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [i<0?x:x.slice(0,i).trim(),i<0?'':x.slice(i+1).trim()];});
    if(kind==='box'){
      const data=Object.fromEntries(pairs);need(data.w===String(timeline.width)&&data.h===String(timeline.height),'SEGMENTATION_DIMENSIONS_INVALID');
    }
    if(kind==='mask'){
      const values=pairs.filter(([k])=>k==='data');need(values.length===1,'SEGMENTATION_MASK_INVALID');const match=values[0][1].match(/^(\d+),(\d+),[!~]/);need(match,'SEGMENTATION_MASK_INVALID');
      const h=Number(match[1]),w=Number(match[2]);need(Number.isSafeInteger(h)&&Number.isSafeInteger(w)&&h>0&&w>0&&h<=timeline.height&&w<=timeline.width,'SEGMENTATION_DIMENSIONS_INVALID');
      pixels+=h*w;need(pixels<=134217728&&++segments<=timeline.frameCount*16,'SEGMENTATION_OUTPUT_LIMIT');
    }
  }
  let parsed;try{const parser=formats.segmentation.video().createParser();parser.push(text,{emit:false});parsed=parser.finish({status:'completed'}).result;}catch{need(false,'SEGMENTATION_MASK_INVALID');}
  need(parsed.diagnostics.every(d=>d.severity!=='error')&&parsed.records.every(r=>r.kind==='box'||r.kind==='mask'),'SEGMENTATION_OUTPUT_INVALID');
  return parsed;
}
const opaque=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!/[\x00-\x20]/.test(value)&&! /^(?:\/|\\|file:|[A-Za-z]:)/.test(value);
export function createMetaSegmentationBinding({env=process.env,fetchImpl=(...args)=>fetch(...args),timeoutMs=segmentationLimits.timeoutMs}={}) {
  return {readiness:()=>metaSegmentationReadiness(env),async execute({bytes,normalized,timeline,allowExecution,mediaType='video/mp4'}){
    need(allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const readiness=metaSegmentationReadiness(env);need(readiness.available,readiness.code);
    need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=segmentationLimits.sourceBytes,'SEGMENTATION_SOURCE_LIMIT');
    need(['video/mp4','video/quicktime'].includes(mediaType),'SEGMENTATION_SOURCE_TYPE_INVALID');
    const controller=new AbortController();let timer,reader,submitted=false,requestId=null,providerCompleted=false;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Meta timeout'),{guidanceCode:'META_REQUEST_TIMEOUT'}));},timeoutMs);});
    try {
      const payload=buildMetaSegmentationRequest(normalized,timeline,{video_url:`data:${mediaType};base64,${bytes.toString('base64')}`});
      submitted=true;
      const response=await Promise.race([fetchImpl(segmentationBinding.endpoint,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:`Bearer ${env.WHIHM_META_API_KEY}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)}),deadline]);
      const headerId=response.headers.get('x-request-id');if(opaque(headerId))requestId=headerId;
      if(response.status>=400&&response.status<500)providerCompleted=true;
      need(response.ok,`META_HTTP_${Number.isSafeInteger(response.status)?response.status:'ERROR'}`);
      need(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'META_RESPONSE_INVALID');
      reader=response.body?.getReader();need(reader,'META_RESPONSE_INVALID');let size=0;const chunks=[];
      while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.byteLength;need(size<=segmentationLimits.responseBytes,'META_RESPONSE_LIMIT');chunks.push(Buffer.from(value));}
      let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{need(false,'META_RESPONSE_INVALID');}
      need(result&&result.status==='completed'&&result.model==='sam-3.1'&&opaque(result.id)&&Array.isArray(result.output),'META_RESPONSE_INVALID');requestId=result.id;providerCompleted=true;
      const content=result.output.flatMap(item=>Array.isArray(item.content)?item.content:[]);need(!content.some(c=>c.type==='refusal'),'META_REFUSAL');
      const lanes=content.filter(c=>c.type==='output_text');need(lanes.length===1&&typeof lanes[0].text==='string','META_RESPONSE_INVALID');
      const parsed=parseMetaSegmentationText(lanes[0].text,timeline),usage=result.usage??null;
      if(usage!==null){need(Buffer.byteLength(JSON.stringify(usage))<=65536,'META_USAGE_INVALID');safeData(usage,'META_USAGE_INVALID');}
      return {parsed,requestId,usage,cost:null,expectedProviderObjectId:normalized.selector.type==='concept'?null:'1',backend:{...segmentationBinding,runtimeVerification:'unverified'}};
    }catch(error){throw Object.assign(new Error('Meta segmentation failed'),{guidanceCode:error.guidanceCode??(providerCompleted?'META_RESPONSE_INVALID':'META_TRANSPORT_FAILED'),requestId,executionUncertain:submitted&&!providerCompleted,providerCompleted});}
    finally{clearTimeout(timer);controller.abort();if(reader){try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{/* no accepted output on incomplete reads */}}}
  }};
}

export function getVideoSegmentationDescription() {
  const readiness=metaSegmentationReadiness();
  const pixel={type:'integer',minimum:0},frame={type:'integer',minimum:0,maximum:599};
  const selectors={oneOf:[
    {type:'object',required:['type','frameIndex','x1','y1','x2','y2'],properties:{type:{const:'box'},frameIndex:frame,x1:pixel,y1:pixel,x2:pixel,y2:pixel},additionalProperties:false},
    {type:'object',required:['type','frameIndex','points'],properties:{type:{const:'point'},frameIndex:frame,points:{type:'array',minItems:1,maxItems:32,items:{type:'object',properties:{x:pixel,y:pixel,label:{type:'string',enum:['positive','negative'],default:'positive'}},required:['x','y'],additionalProperties:false}}},additionalProperties:false},
    {type:'object',required:['type','prompt'],properties:{type:{const:'concept'},prompt:{type:'string',minLength:1,maxLength:300}},additionalProperties:false},
  ]};
  return {capability:'SEGMENT_VIDEO_SUBJECT',entry:{key:'remote:segment_video_subject:whihm:video-subject-segmentation',id:'video-subject-segmentation',label:'Video Subject Segmentation',mode:'segment_video_subject',provider:'meta',operation:'segment',
    available:readiness.available,availability:readiness.availability,assurance:'reviewed',route:'specialized',runtimeVerification:'unverified',partial:false,
    runtime:{class:'remote',method:'preparePerformanceGuidance',backend:'sam-3.1',binding:segmentationBinding,readiness,requirements:['Trusted project host','WHIHM_META_API_KEY','Registered source video'],workflow:{executorType:'utility',tool:'video-subject-segmentation'},localHeavyInference:false,providerTransport:true},
    binding:{available:true,source:'host.preparePerformanceGuidance',code:'META_SEGMENTATION_BOUND',requiresAllowExecution:true},...(!readiness.available?{reason:{code:readiness.code,requiresProviderClarification:false}}:{}),
    inputs:[{field:'assetId',type:'video',role:'segmentation-source',required:true,isArray:false,projectAsset:true}],requiredFields:['assetId','mode','selector'],
    controls:{mode:{type:'string',const:'subject_mask',required:true},selector:selectors,objectId:{type:'string',default:'subject',maxLength:64},trackingDirection:{type:'string',enum:['forward','both'],defaultRule:'frame0=forward;later=both;concept=omitted'},allowExecution:{type:'boolean',default:false}},
    constraints:[{kind:'single_subject'},{kind:'source_pixel_coordinates',boxEnd:'inclusive'},{kind:'positive_point_required'},{kind:'full_clip_tracking'},{kind:'registered_project_asset_only'},{kind:'whole_clip_review'},{kind:'data_url_source_limit',bytes:segmentationLimits.sourceBytes}],
    projectAssets:[{field:'assetId',type:'video',role:'source',array:false}],providerIdentifiers:[{field:'result.requestId',kind:'segmentation-request',source:'result',isArray:false,projectAsset:false},{field:'result.objects.providerObjectId',kind:'segmentation-object',source:'result',isArray:true,projectAsset:false}],result:{kind:'aligned-subject-mask-sequence',schemaVersion:1,mediaKind:'file',mime:maskSequenceMime,providerFields:['requestId','objects.providerObjectId'],executionApproval:false},
    limitations:['One explicit request; no retries, fallback, alternate provider, private listing or local SAM/PyTorch/CUDA. Static configuration is not provider health or model-access proof.',
      'Single subject v1. Concept requests with multiple matches fail closed rather than selecting an object. Backward/partial tracking, initial-mask prompts and multi-object composition remain deferred.',
      'Masks use explicit source frame indices. A completed request may omit absent frames; those become known-empty masks, never interpolated detections. Empty results are no_match, not transport failure.',
      'Lossless black/white PNG sequence is registered without FFmpeg. Composition still requires the existing guidance multimedia profile and separate whole-clip review/checkpoint approval.',
      'Provider usage is native evidence; billed monetary cost is not reported by this reviewed contract. Missing cost remains unknown. Real provider fidelity/runtime is unverified.'],
    evidence:{contractStatus:'REVIEWED',inputValidation:'not_evaluated',authorization:'not_granted'}}};
}

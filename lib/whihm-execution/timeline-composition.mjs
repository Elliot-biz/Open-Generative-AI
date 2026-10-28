import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readBytes, hashBytes, MAX_IMPORT_BYTES } from '../../packages/whihm-workflow-core/src/project/io.js';
import { inspectMedia, inspectMediaBuffer } from './media-inspection.mjs';
import { getMultimediaRuntimeRequirement } from './multimedia-runtime.mjs';
import { normalizeTimeline, hashTimeline, timelineHash, timelineReadiness, timelineNeed as need, frameSeconds } from './timeline-contract.mjs';
import { createTimelineBackend } from './timeline-backend.mjs';
const checked=r=>{need(r.status==='succeeded'||r.status==='ok'||r.status==='imported',r.diagnostics?.[0]?.code??'TIMELINE_ASSET_REJECTED');return r;};
async function prepare({timeline:input,project,root}) {
  const timeline=normalizeTimeline(input),sources=[],seen=new Map();let size=0;
  for(const track of timeline.tracks)for(const item of track.items){
    const old=seen.get(item.source.assetId);need(!old||old.checksum===item.source.checksum,'ASSET_HASH_MISMATCH');
    let source=old;
    if(!source){
      const record=checked(await project.getProjectAsset(item.source.assetId)).asset;
      size+=record.size;need(size<=MAX_IMPORT_BYTES,'TIMELINE_INPUT_LIMIT');
      const inspected=checked(await inspectMedia({project,root,assetId:record.assetId})),f=inspected.facts;
      need(record.checksum===item.source.checksum,'ASSET_HASH_MISMATCH');
      source={assetId:record.assetId,checksum:record.checksum,path:record.path,container:f.container,facts:f};sources.push(source);seen.set(source.assetId,source);
    }
    const f=source.facts;need(f.mediaKind===item.type,'TIMELINE_MEDIA_TYPE_MISMATCH');
    if(item.type==='image')need(f.container==='png'&&f.image.pages===1&&[null,1].includes(f.image.exifOrientation),'TIMELINE_SOURCE_UNSUPPORTED');
    else{
      const stream=f.streams.find(s=>s.type===item.type);need(stream&&Number.isFinite(stream.durationSeconds)&&frameSeconds(item.sourceInFrame+item.durationFrames,timeline.frameRate)<=stream.durationSeconds+0.000001,'TIMELINE_SOURCE_RANGE_INVALID');
      if(item.type==='video')need(f.streamCounts.video===1&&stream.codec==='avc1'&&stream.rotationDegrees===0,'TIMELINE_SOURCE_UNSUPPORTED');
      else need(f.container==='wav'&&stream.codec==='pcm'&&stream.bitsPerSample===16,'TIMELINE_SOURCE_UNSUPPORTED');
      if(item.sourceAudio==='use')need(f.streamCounts.audio===1&&f.streams.find(s=>s.type==='audio')?.codec==='mp4a'&&frameSeconds(item.sourceInFrame+item.durationFrames,timeline.frameRate)<=f.streams.find(s=>s.type==='audio').durationSeconds+0.000001,'TIMELINE_SOURCE_AUDIO_UNSUPPORTED');
    }
  }
  sources.sort((a,b)=>a.assetId.localeCompare(b.assetId,'en'));
  const layers=timeline.tracks.filter(t=>t.enabled).flatMap(t=>t.items),features=['color','format','setsar','settb',...(layers.some(i=>i.type!=='audio')?['overlay']:[]),...(timeline.audio.policy==='mix'?['anullsrc','adelay','amix']:[])].map(n=>`ffmpeg.filters.${n}`);
  if(layers.some(i=>i.type==='image'))features.push('ffmpeg.decoders.png','ffmpeg.demuxers.image2');
  const runtime=getMultimediaRuntimeRequirement(),definitionHash=hashTimeline(timeline);
  const recipe={schemaVersion:1,definitionHash,layers,sources:sources.map(({assetId,checksum})=>({assetId,checksum})),render:timeline.render,audio:timeline.audio};
  return {schemaVersion:1,status:'planned',capability:'COMPOSE_TIMELINE',tool:'timeline-composition',mode:'compose_timeline',timeline,sources,layers,definitionHash,renderPlanHash:timelineHash(recipe),requiredRuntimeFeatures:features,runtime,execution:timelineReadiness(runtime.snapshot,features),expectedOutput:{mediaKind:'video',container:'mp4',...timeline.canvas,frameCount:timeline.durationFrames},providerCost:0,remoteTransport:false,diagnostics:[]};
}
async function capture(action){try{return await action();}catch(e){return {schemaVersion:1,status:'rejected',diagnostics:[{code:e.timelineCode??e.inspectionCode??e.diagnostic?.code??'TIMELINE_FAILED'}]};}}
export function verifyTimelineOutput(plan,facts){
  const t=plan.timeline,v=facts.streams.find(s=>s.type==='video'),a=facts.streams.find(s=>s.type==='audio'),duration=frameSeconds(t.durationFrames,t.frameRate);
  need(facts.container==='mp4'&&facts.fileSize>0&&facts.streamCounts.video===1&&v?.codec==='avc1'&&v.rotationDegrees===0&&v.dimensions.width===t.canvas.width&&v.dimensions.height===t.canvas.height&&v.frameCount===t.durationFrames,'TIMELINE_OUTPUT_VERIFICATION_FAILED');
  need(v.frameRate&&Math.abs(v.frameRate.numerator/v.frameRate.denominator-t.frameRate.numerator/t.frameRate.denominator)<0.000001&&Math.abs(v.durationSeconds-duration)<=0.000001,'TIMELINE_OUTPUT_VERIFICATION_FAILED');
  need(t.audio.policy==='none'?facts.streamCounts.audio===0:facts.streamCounts.audio===1&&a.codec==='mp4a'&&a.sampleRate===t.audio.sampleRate&&a.channels===t.audio.channels&&Math.abs(a.durationSeconds-duration)<=1024/t.audio.sampleRate+0.000001,'TIMELINE_OUTPUT_VERIFICATION_FAILED');
}
export function createTimelineComposition({backend=createTimelineBackend()}={}){return {
  plan:args=>capture(()=>prepare(args)),
  compose:args=>capture(async()=>{
    need(args.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const plan=await prepare(args),inputs=new Map();
    for(const s of plan.sources){const b=await readBytes(args.root,s.path);need(hashBytes(b)===s.checksum,'ASSET_HASH_MISMATCH');inputs.set(s.assetId,b);}
    const result=await backend(inputs,plan);need(Buffer.isBuffer(result.bytes)&&result.bytes.length>0&&result.bytes.length<=MAX_IMPORT_BYTES&&result.backend?.versions?.ffmpeg,'TIMELINE_OUTPUT_INVALID');
    const inspection=await inspectMediaBuffer(result.bytes,'video');verifyTimelineOutput(plan,inspection.facts);
    // Recheck original assets before publication as well as before rendering.
    for(const s of plan.sources)need(hashBytes(await readBytes(args.root,s.path))===s.checksum,'ASSET_HASH_MISMATCH');
    const lineage={definitionHash:plan.definitionHash,renderPlanHash:plan.renderPlanHash,sources:plan.sources.map(({assetId,checksum})=>({assetId,checksum})),timeline:plan.timeline,backend:result.backend,renderedAt:new Date().toISOString()};
    let dir;
    try{dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-timeline-import-'));const file=path.join(dir,'timeline.mp4');await fs.writeFile(file,result.bytes,{flag:'wx',mode:0o600});
      const {asset}=checked(await args.project.importAsset({sourcePath:file,contentType:'video/mp4',role:'derived-timeline-video',metadata:{timelineComposition:lineage}}));need(asset.checksum===hashBytes(result.bytes),'TIMELINE_OUTPUT_IDENTITY_MISMATCH');
      return {schemaVersion:1,status:'succeeded',capability:plan.capability,tool:plan.tool,mode:plan.mode,output:{assetId:asset.assetId,path:asset.path,checksum:asset.checksum,inspection},lineage,diagnostics:[]};
    }finally{if(dir)await fs.rm(dir,{recursive:true,force:true});}
  })};}
const service=createTimelineComposition();
export const planTimelineComposition=args=>service.plan(args);
export const composeTimeline=args=>service.compose(args);
export function getTimelineCompositionDescription(){const runtime=getMultimediaRuntimeRequirement();return {capability:'COMPOSE_TIMELINE',entry:{
  key:'local:compose_timeline:whihm:timeline-composition',id:'timeline-composition',label:'Timeline Composition',mode:'compose_timeline',provider:'whihm',operation:'compose',available:true,availability:'available',assurance:'reviewed',route:'local',runtimeVerification:'unverified',partial:true,
  runtime:{class:'local',method:'composeTimeline',multimedia:runtime,requirements:['Fresh baseline-ready paired multimedia runtime','Operation-specific advertised filters'],scope:'runtime_gated'},
  binding:{available:true,source:'host.composeTimeline',code:'LOCAL_TIMELINE_BOUND',planOperation:'planTimelineComposition',executeOperation:'composeTimeline',requiresAllowExecution:true,deterministic:true,readOnly:false},
  inputs:[{field:'sources',type:'media',acceptedTypes:['video','image','audio'],role:'timeline-sources',required:true,isArray:true,projectAsset:true,projectAssetRequired:true}],projectAssets:[{field:'sources',type:'media',acceptedTypes:['video','image','audio'],role:'timeline-sources',array:true}],providerIdentifiers:[],
  requiredFields:['timeline'],controls:{timeline:{type:'object',required:true,projectAsset:false,schemaVersion:1,trackTypes:['video','audio','overlay'],timeUnit:'integer_frames',transitions:['cut'],contract:'WHIHM_TIMELINE_COMPOSITION.md'}},
  constraints:[{kind:'registered_project_asset_only'},{kind:'timeline_limits',maximumItems:32,maximumSeconds:600},{kind:'output',container:'mp4',videoCodec:'h264',audioCodec:'aac'}],result:{kind:'derived-project-video',schemaVersion:1},limitations:['Cut only; PNG still overlays; H.264 MP4/MOV video; PCM16 WAV audio.','No captions, dissolve, UI, caching, semantic editing or provider transport.','Plan reads assets but never probes/spawns runtime; execution acquires a fresh runtime lease.'],evidence:{contractStatus:'REVIEWED',authorization:'not_granted',inputValidation:'not_evaluated'}
}};}

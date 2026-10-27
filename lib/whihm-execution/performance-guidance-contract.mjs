// Provider-neutral guidance records. Definition identity excludes observations and human review.
import { createHash } from 'node:crypto';
import { fields, safeData, validId, validHash } from '../../packages/whihm-workflow-core/src/project/io.js';
import { stableJSON } from '../../packages/whihm-workflow-core/src/diff.js';
import { peekFaceGuidanceStatus } from './face-guidance-runtime.mjs';
import { getMultimediaRuntimeRequirement } from './multimedia-runtime.mjs';
export const guidanceModes = Object.freeze(['face_mesh','depth_mask','depth_mask_face_mesh']);
export const guidanceLimits = Object.freeze({frames:600,pixels:2073600,totalPixels:134217728,records:32,bytes:67108864});
export const guidanceDigest = value => createHash('sha256').update(stableJSON(value)).digest('hex');
export const guidanceNeed = (condition,code) => { if(!condition)throw Object.assign(new Error(code),{guidanceCode:code}); };
export const guidanceProfileId = 'WHIHM_PERFORMANCE_GUIDANCE_V1';
export const guidanceFeatures = Object.freeze(['ffmpeg.decoders.png','ffmpeg.encoders.png','ffmpeg.filters.format','ffmpeg.filters.maskedmerge','ffmpeg.filters.overlay','ffmpeg.muxers.image2','ffmpeg.demuxers.image2']);
export function guidanceReadiness(snapshot) {
  const features=guidanceFeatures.map(id=>({id,status:snapshot.baseline.features.find(f=>f.id===id)?.status??'unknown'}));
  return {profileId:guidanceProfileId,executable:snapshot.availability==='ready'&&features.every(f=>f.status==='available'),features,
    blockingReasons:[...snapshot.blockingReasons,...features.filter(f=>f.status!=='available').map(f=>({code:'GUIDANCE_FEATURE_UNAVAILABLE',feature:f.id,status:f.status}))]};
}
export function validateGuidanceDefinition(value) {
  fields(value,['schemaVersion','source','mode','parameters'],['depth','mask'],'GUIDANCE_DEFINITION_INVALID');safeData(value,'GUIDANCE_DEFINITION_INVALID');
  guidanceNeed(value.schemaVersion===1&&guidanceModes.includes(value.mode),'GUIDANCE_MODE_INVALID');
  for(const reference of [value.source,value.depth,value.mask].filter(Boolean)) {
    fields(reference,['assetId','checksum'],[],'GUIDANCE_REFERENCE_INVALID');guidanceNeed(validId(reference.assetId)&&validHash(reference.checksum),'GUIDANCE_REFERENCE_INVALID');
  }
  const ids=[value.source,value.depth,value.mask].filter(Boolean).map(r=>r.assetId);guidanceNeed(new Set(ids).size===ids.length,'GUIDANCE_REFERENCE_CONFLICT');
  fields(value.parameters,[],[],'GUIDANCE_PARAMETERS_INVALID');
  guidanceNeed(value.mode==='face_mesh'?!value.depth&&!value.mask:Boolean(value.depth&&value.mask),'GUIDANCE_INPUTS_INVALID');
  return {definition:structuredClone(value),definitionHash:guidanceDigest(value)};
}
export function guidanceTimeline(facts) {
  const videos=facts.streams.filter(s=>s.type==='video'),v=videos[0];
  guidanceNeed(facts.mediaKind==='video'&&videos.length===1&&v.codec==='avc1'&&v.rotationDegrees===0&&v.pixelAspectRatio?.value===1&&v.timing==='uniform_sample_deltas','GUIDANCE_SOURCE_UNSUPPORTED');
  const {width,height}=v.dimensions,fps=v.frameRate?.value,count=v.frameCount;
  guidanceNeed(Number.isSafeInteger(count)&&count>0&&count<=guidanceLimits.frames&&fps>=1&&fps<=120&&width>0&&height>0&&width%2===0&&height%2===0&&width*height<=guidanceLimits.pixels&&width*height*count<=guidanceLimits.totalPixels,'GUIDANCE_MEDIA_LIMIT');
  guidanceNeed(Math.abs(v.durationSeconds-count/fps)<=0.000001&&Math.abs(facts.durationSeconds-v.durationSeconds)<=0.000001,'GUIDANCE_TIMING_UNSUPPORTED');
  const gcd=(a,b)=>b?gcd(b,a%b):a, divisor=gcd(v.frameRate.numerator,v.frameRate.denominator);
  return {width,height,frameCount:count,frameRate:{numerator:v.frameRate.numerator/divisor,denominator:v.frameRate.denominator/divisor,value:fps},durationSeconds:v.durationSeconds,timestampsMs:Array.from({length:count},(_,i)=>i*1000/fps)};
}
export function assertGuidanceAlignment(a,b) {guidanceNeed(guidanceDigest(a)===guidanceDigest(b),'GUIDANCE_ALIGNMENT_MISMATCH');}
export function validateFaceFrames(frames,timeline) {
  guidanceNeed(Array.isArray(frames)&&frames.length===timeline.frameCount,'FACE_FRAME_ALIGNMENT_INVALID');
  let detected=0;
  for(const [i,frame] of frames.entries()) {
    fields(frame,['index','timestampMs','landmarks'],[],'FACE_RESULT_INVALID');
    guidanceNeed(frame.index===i&&frame.timestampMs===timeline.timestampsMs[i]&&Array.isArray(frame.landmarks),'FACE_FRAME_ALIGNMENT_INVALID');
    if(!frame.landmarks.length)continue;
    guidanceNeed(frame.landmarks.length===478,'FACE_LANDMARK_COUNT_INVALID');detected++;
    for(const p of frame.landmarks){fields(p,['x','y','z'],[],'FACE_RESULT_INVALID');guidanceNeed([p.x,p.y,p.z].every(Number.isFinite)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&Math.abs(p.z)<=10,'FACE_RESULT_INVALID');}
  }
  return {frames:timeline.frameCount,detectedFrames:detected,missingFrameIndexes:frames.filter(f=>!f.landmarks.length).map(f=>f.index),complete:detected===timeline.frameCount};
}
const limitations=[
  'Guidance is source/checksum bound. CFR H.264 MP4/MOV only; exact zero-based decoded timestamps and complete coverage are required. No retiming, interpolation or semantic quality guarantee.',
  'Face extraction uses pinned MediaPipe JS/WASM with one face; a second face or a missed frame rejects. Tracking identity across crossings is not certified. Models must be explicitly staged; no downloads.',
  'Remote subject segmentation has no reviewed binding in the current provider architecture. It is unavailable; supplied mask references are not claimed as provider-generated or semantically correct.',
  'Depth references reuse the existing depth-anything/depth route; supplied registered depth is not a new depth implementation or proof of metric depth.',
  'Whole-clip review is an explicit human declaration about exact artifact checksums, not automated QC, authentication, workflow approval or provider liveness. Approval uses the existing workflow checkpoint.',
  'No provider calls, uploads, automatic retries, fallback, ranking, generation executor integration or benchmark experiments. Source/dev readiness only; packaged dependency closure remains unresolved.',
];
export function getPerformanceGuidanceDescriptions() {
  const runtime=getMultimediaRuntimeRequirement(),faceRuntime=peekFaceGuidanceStatus(),multimedia=guidanceReadiness(runtime.snapshot);
  return [['PREPARE_PERFORMANCE_GUIDANCE','performance-guidance','prepare_performance_guidance'],['EXTRACT_FACE_GUIDANCE','face-guidance','extract_face_guidance'],['SEGMENT_VIDEO_SUBJECT','video-subject-segmentation','segment_video_subject']].map(([capability,id,mode])=>{
    const segmentation=id==='video-subject-segmentation';
    return {capability,entry:{key:`${segmentation?'remote':'local'}:${mode}:whihm:${id}`,id,label:capability.toLowerCase().replaceAll('_',' '),mode,provider:'whihm',operation:segmentation?'segment':id==='face-guidance'?'face_mesh':'prepare',
      available:!segmentation,availability:segmentation?'provider_blocked':'available',assurance:segmentation?'unreviewed':'reviewed',route:segmentation?'specialized':'local',runtimeVerification:'unverified',partial:true,
      runtime:{class:segmentation?'remote':'local',method:segmentation?null:'preparePerformanceGuidance',backend:segmentation?null:id==='face-guidance'?'mediapipe-tasks-vision-0.10.32':'ffmpeg-performance-guidance',requirements:['Registered project video',...(segmentation?['Reviewed remote raw-mask binding']:['Baseline-ready multimedia pair',guidanceProfileId])],multimedia:runtime,guidance:{modes:id==='face-guidance'?['face_mesh']:guidanceModes,readiness:guidanceReadiness(runtime.snapshot),faceRuntime,scopes:Object.fromEntries(guidanceModes.map(mode=>[mode,{implemented:true,executable:multimedia.executable&&(mode==='depth_mask'||faceRuntime.available===true),requiresFaceRuntime:mode!=='depth_mask'}])),wholeClipReviewRequired:true,artifactBoundWorkflowApproval:true,heavyLocalInference:false,segmentationImplemented:false,faceModel:'explicitly-staged-sha256',facePackage:'@mediapipe/tasks-vision@0.10.32'}},
      binding:{available:!segmentation,source:segmentation?'unbound':'host.preparePerformanceGuidance',code:segmentation?'SEGMENTATION_REVIEWED_ROUTE_MISSING':'PERFORMANCE_GUIDANCE_BOUND',requiresAllowExecution:true},
      ...(segmentation?{reason:{code:'SEGMENTATION_REVIEWED_ROUTE_MISSING',requiresProviderClarification:true}}:{}),
      inputs:[{field:'assetId',type:'video',role:'guidance-source',required:true,isArray:false,projectAsset:true},...(!segmentation&&id!=='face-guidance'?['depthAssetId','maskAssetId'].map(field=>({field,type:'video',role:field==='depthAssetId'?'depth-reference':'subject-mask',required:false,isArray:false,projectAsset:true})):[])],
      requiredFields:segmentation?['assetId']:['assetId','mode'],controls:segmentation?{}:{mode:{type:'string',enum:id==='face-guidance'?['face_mesh']:guidanceModes,required:true},parameters:{type:'object',additionalProperties:false},allowExecution:{type:'boolean',default:false}},
      constraints:[{kind:'registered_project_asset_only'},{kind:'whole_clip_review'},{kind:'artifact_bound_approval'},{kind:'limits',...guidanceLimits}],
      projectAssets:[{field:'assetId',type:'video',role:'source',array:false},...(!segmentation?['depthAssetId','maskAssetId'].map(field=>({field,type:'video',role:field,array:false})):[])],providerIdentifiers:[],result:{kind:segmentation?'aligned-subject-mask':'performance-guidance-artifacts',schemaVersion:1,executionApproval:false},limitations,evidence:{contractStatus:segmentation?'UNREVIEWED':'REVIEWED',authorization:'not_granted',inputValidation:'not_evaluated'}}};
  });
}

// Provider-neutral guidance records. Definition identity excludes observations and human review.
import { maskSequenceMime } from './guidance-artifact-types.mjs';
import { getVideoSegmentationDescription } from './meta-segmentation-binding.mjs';
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
  fields(value,['schemaVersion','source','mode','parameters'],['depth','mask','segmentation'],'GUIDANCE_DEFINITION_INVALID');safeData(value,'GUIDANCE_DEFINITION_INVALID');
  guidanceNeed(value.schemaVersion===1&&[...guidanceModes,'subject_mask'].includes(value.mode),'GUIDANCE_MODE_INVALID');
  for(const reference of [value.source,value.depth,value.mask].filter(Boolean)) {
    fields(reference,['assetId','checksum'],[],'GUIDANCE_REFERENCE_INVALID');guidanceNeed(validId(reference.assetId)&&validHash(reference.checksum),'GUIDANCE_REFERENCE_INVALID');
  }
  const ids=[value.source,value.depth,value.mask].filter(Boolean).map(r=>r.assetId);guidanceNeed(new Set(ids).size===ids.length,'GUIDANCE_REFERENCE_CONFLICT');
  fields(value.parameters,[],[],'GUIDANCE_PARAMETERS_INVALID');
  guidanceNeed(['face_mesh','subject_mask'].includes(value.mode)?!value.depth&&!value.mask:Boolean(value.depth&&value.mask),'GUIDANCE_INPUTS_INVALID');
  guidanceNeed(value.mode==='subject_mask'?Boolean(value.segmentation):value.segmentation===undefined,'GUIDANCE_INPUTS_INVALID');
  if(value.mode==='subject_mask'){fields(value.segmentation,['selector','objectId','trackingDirection'],[],'GUIDANCE_DEFINITION_INVALID');guidanceNeed(validId(value.segmentation.objectId)&&['box','point','concept'].includes(value.segmentation.selector?.type)&&[null,'forward','both'].includes(value.segmentation.trackingDirection),'GUIDANCE_DEFINITION_INVALID');}
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
  'Meta SAM 3.1 segmentation is an explicit remote operation. Registered supplied masks remain supported; no hidden segmentation, semantic validation or automatic generation occurs.',
  'Depth references reuse the existing depth-anything/depth route; supplied registered depth is not a new depth implementation or proof of metric depth.',
  'Whole-clip review is an explicit human declaration about exact artifact checksums, not automated QC, authentication, workflow approval or provider liveness. Approval uses the existing workflow checkpoint.',
  'Composition/face preparation perform no provider calls or uploads; segmentation is a separate explicit operation. No automatic retries, fallback, ranking, generation executor integration or benchmark experiments. Source/dev readiness only; packaged dependency closure remains unresolved.',
];
export function getPerformanceGuidanceDescriptions() {
  const runtime=getMultimediaRuntimeRequirement(),faceRuntime=peekFaceGuidanceStatus(),multimedia=guidanceReadiness(runtime.snapshot);
  const local=[['PREPARE_PERFORMANCE_GUIDANCE','performance-guidance','prepare_performance_guidance'],['EXTRACT_FACE_GUIDANCE','face-guidance','extract_face_guidance']].map(([capability,id,mode])=>{
    const face=id==='face-guidance';
    const roles=[{field:'assetId',type:'video',role:'guidance-source',required:true,isArray:false,projectAsset:true},...(!face?[
      {field:'depthAssetId',type:'video',role:'depth-reference',required:false,isArray:false,projectAsset:true},
      {field:'maskAssetId',type:'media',acceptedTypes:['video','file'],fileMime:maskSequenceMime,role:'subject-mask',required:false,isArray:false,projectAsset:true},
    ]:[])];
    return {capability,entry:{key:`local:${mode}:whihm:${id}`,id,label:capability.toLowerCase().replaceAll('_',' '),mode,provider:'whihm',operation:face?'face_mesh':'prepare',
      available:true,availability:'available',assurance:'reviewed',route:'local',runtimeVerification:'unverified',partial:true,
      runtime:{class:'local',method:'preparePerformanceGuidance',backend:face?'mediapipe-tasks-vision-0.10.32':'ffmpeg-performance-guidance',requirements:['Registered project video','Baseline-ready multimedia pair',guidanceProfileId],multimedia:runtime,
        guidance:{modes:face?['face_mesh']:guidanceModes,readiness:multimedia,faceRuntime,scopes:Object.fromEntries((face?['face_mesh']:guidanceModes).map(mode=>[mode,{implemented:true,executable:multimedia.executable&&(mode==='depth_mask'||faceRuntime.available===true),requiresFaceRuntime:mode!=='depth_mask'}])),wholeClipReviewRequired:true,artifactBoundWorkflowApproval:true,heavyLocalInference:false,segmentationImplemented:true,segmentationCapability:'SEGMENT_VIDEO_SUBJECT',faceModel:'explicitly-staged-sha256',facePackage:'@mediapipe/tasks-vision@0.10.32'}},
      binding:{available:true,source:'host.preparePerformanceGuidance',code:'PERFORMANCE_GUIDANCE_BOUND',requiresAllowExecution:true},inputs:roles,
      requiredFields:['assetId','mode'],controls:{mode:{type:'string',enum:face?['face_mesh']:guidanceModes,required:true},parameters:{type:'object',additionalProperties:false},allowExecution:{type:'boolean',default:false}},
      constraints:[{kind:'registered_project_asset_only'},{kind:'whole_clip_review'},{kind:'artifact_bound_approval'},{kind:'limits',...guidanceLimits}],
      projectAssets:roles.map(({field,type,role,acceptedTypes,fileMime})=>({field,type,role,array:false,...(acceptedTypes?{acceptedTypes,fileMime}:{})})),providerIdentifiers:[],result:{kind:'performance-guidance-artifacts',schemaVersion:1,executionApproval:false},limitations,evidence:{contractStatus:'REVIEWED',authorization:'not_granted',inputValidation:'not_evaluated'}}};
  });
  return [...local,getVideoSegmentationDescription()];
}

// Guidance preparation/review only: no provider client, generation, automatic approval or run rehydration.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { readBytes, hashBytes, fields, safeData, validId } from '../../packages/whihm-workflow-core/src/project/io.js';
import { inspectMedia, inspectMediaBuffer } from './media-inspection.mjs';
import { getDepthInputDescription } from '../../packages/studio/src/depthInputContracts.js';
import { getMultimediaRuntimeRequirement } from './multimedia-runtime.mjs';
import { getFaceGuidanceStatus } from './face-guidance-runtime.mjs';
import { createGuidanceBackend } from './performance-guidance-backend.mjs';
import { guidanceNeed as need, guidanceDigest, guidanceLimits, guidanceReadiness, guidanceTimeline, assertGuidanceAlignment, validateGuidanceDefinition, guidanceModes } from './performance-guidance-contract.mjs';
const reference=r=>({assetId:r.assetId,checksum:r.checksum});
const checked=(r,status)=>{if(r?.status!==status)throw Object.assign(new Error('Existing operation rejected'),{guidanceCode:r?.diagnostics?.[0]?.code??'GUIDANCE_PROJECT_REJECTED'});return r;};
const capture=async action=>{try{return await action();}catch(e){return {schemaVersion:1,status:'rejected',diagnostics:[{code:e.guidanceCode??e.inspectionCode??e.diagnostic?.code??'GUIDANCE_FAILED'}]};}};
async function registered(project,root,assetId,checksum) {
  need(validId(assetId),'GUIDANCE_REFERENCE_INVALID');const asset=checked(await project.getProjectAsset(assetId),'ok').asset;
  need(checksum===undefined||asset.checksum===checksum,'GUIDANCE_ASSET_CHANGED');
  const bytes=await readBytes(root,asset.path);need(hashBytes(bytes)===asset.checksum,'GUIDANCE_ASSET_CHANGED');return {asset,bytes};
}
export function createPerformanceGuidance({backend=createGuidanceBackend(),faceStatus=getFaceGuidanceStatus,now=()=>new Date().toISOString()}={}) {
  const records=new Map();let busy=false,disposed=false;
  function time(){const t=now();need(typeof t==='string'&&new Date(t).toISOString()===t,'GUIDANCE_CLOCK_INVALID');return t;}
  async function preparePlan(args) {
    const {project,root,assetId,mode,depthAssetId,maskAssetId}=args;
    fields(args,['project','root','assetId','mode'],['depthAssetId','maskAssetId','parameters','allowExecution'],'GUIDANCE_REQUEST_INVALID');
    need(!disposed,'GUIDANCE_SESSION_CLOSED');need(guidanceModes.includes(mode),'GUIDANCE_MODE_INVALID');
    const source=checked(await inspectMedia({project,root,assetId}),'succeeded'),timeline=guidanceTimeline(source.facts);
    const definition={schemaVersion:1,source:reference(source.source),mode,parameters:args.parameters??{}};let depth=null,mask=null;
    if(mode!=='face_mesh') {
      depth=checked(await inspectMedia({project,root,assetId:depthAssetId}),'succeeded');mask=checked(await inspectMedia({project,root,assetId:maskAssetId}),'succeeded');
      need(new Set([source.source.assetId,depth.source.assetId,mask.source.assetId]).size===3,'GUIDANCE_REFERENCE_CONFLICT');
      assertGuidanceAlignment(timeline,guidanceTimeline(depth.facts));assertGuidanceAlignment(timeline,guidanceTimeline(mask.facts));
      definition.depth=reference(depth.source);definition.mask=reference(mask.source);
    }else need(depthAssetId===undefined&&maskAssetId===undefined,'GUIDANCE_INPUTS_INVALID');
    const validated=validateGuidanceDefinition(definition),runtime=getMultimediaRuntimeRequirement(),readiness=guidanceReadiness(runtime.snapshot),face=mode==='depth_mask'?null:await faceStatus();
    if(face&&!face.available){readiness.executable=false;readiness.blockingReasons.push({code:face.code});}
    // Depth is an existing independent canonical operation, never submitted implicitly here.
    const depthContract=depth?getDepthInputDescription('depth-anything'):null;
    return {schemaVersion:1,status:'planned',capability:'PREPARE_PERFORMANCE_GUIDANCE',tool:'performance-guidance',mode,...validated,source:source.source,timeline,
      inputs:{source:source.source,...(depth?{depth:depth.source,mask:mask.source}:{})},
      ...(depth?{depthRoute:{executor:'depth-anything',mode:'depth',capability:depthContract.capability,inputKind:'video',origin:'supplied_registered_reference',providerExecutionAttested:false}}:{}),
      runtime,faceRuntime:face,execution:{...readiness,requiresFreshRuntimeCheck:true},expectedOutput:{mediaKind:'video',container:'mp4',audio:false,...timeline},
      encoding:{foreground:'depth RGB where mask channel intensity >= 128 for validation; composition uses continuous grayscale alpha',background:'source RGB',mesh:'green 1-pixel tessellation over composite; transparent elsewhere',video:'H.264 software/libx264 lossless CRF0 yuv444p MP4; no audio',retiming:false},
      limitations:['Header plan is not decoded-frame or semantic fidelity proof. Execution independently verifies decoded timestamps.','Supplied masks/depth are explicit user references; semantic subject identity and original provider provenance are not attested.','Whole-clip review and a separate artifact-bound workflow checkpoint are required before later generation.'],providerTransport:false,providerCost:0,diagnostics:[]};
  }
  async function current(args) {
    const record=records.get(args.guidanceId);need(!disposed&&record,'GUIDANCE_NOT_FOUND');
    for(const r of [record.source,...record.artifacts])await registered(args.project,args.root,r.assetId,r.checksum);
    for(const r of Object.values(record.definition).filter(v=>v?.assetId))await registered(args.project,args.root,r.assetId,r.checksum);
    return record;
  }
  return {
    plan:args=>capture(()=>preparePlan(args)),
    prepare:args=>capture(async()=>{
      need(args.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');need(!busy,'GUIDANCE_BUSY');need(records.size<guidanceLimits.records,'GUIDANCE_RECORD_LIMIT');busy=true;
      try {
        const plan=await preparePlan(args),inputs={};
        for(const [role,r]of Object.entries(plan.inputs))inputs[role]=(await registered(args.project,args.root,r.assetId,r.checksum)).bytes;
        // The backend acquires a fresh lease; cached planning readiness never authorizes execution.
        const result=await backend(inputs,plan);need(!disposed,'GUIDANCE_SESSION_CLOSED');need(Buffer.isBuffer(result.bytes)&&result.bytes.length>0&&result.bytes.length<=guidanceLimits.bytes,'GUIDANCE_OUTPUT_INVALID');
        const inspection=await inspectMediaBuffer(result.bytes,'video');assertGuidanceAlignment(plan.timeline,guidanceTimeline(inspection.facts));
        need(inspection.facts.container==='mp4'&&inspection.facts.hasAudio===false&&result.validation?.decodedTimingVerified===true,'GUIDANCE_OUTPUT_VERIFICATION_FAILED');
        const source=plan.definition.source,guidanceId=`guidance_${randomUUID()}`,createdAt=time();let directory;
        const artifacts=[];
        try {
          directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-guidance-publish-'));
          const publish=async(kind,bytes,contentType)=>{const filename=path.join(directory,`${kind}.bin`);await fs.writeFile(filename,bytes,{flag:'wx',mode:0o600});
            const imported=checked(await args.project.importAsset({sourcePath:filename,contentType,role:`guidance-${kind}`,source,metadata:{performanceGuidance:{schemaVersion:1,guidanceId,source,definitionHash:plan.definitionHash,mode:plan.mode,parents:Object.values(plan.inputs).map(reference),operation:plan.definition.parameters,backend:result.backend,timeline:plan.timeline}}}),'imported').asset;
            artifacts.push({...reference(imported),path:imported.path,kind,contentType});return imported;};
          const output=await publish('preview',result.bytes,'video/mp4');
          if(result.landmarks)await publish('face-landmarks',Buffer.from(JSON.stringify({schemaVersion:1,source,timeline:plan.timeline,...result.landmarks})),'application/json');
          const record={schemaVersion:1,status:'succeeded',guidanceId,definitionHash:plan.definitionHash,definition:plan.definition,mode:plan.mode,source,artifacts,
            artifactDigest:guidanceDigest({source,artifacts:artifacts.map(({assetId,checksum,kind})=>({assetId,checksum,kind}))}),timeline:plan.timeline,backend:result.backend,validation:result.validation,
            output:{...reference(output),path:output.path,contentType:output.contentType},createdAt,review:null,reviewHistory:[],executionApproval:false};
          safeData(record,'GUIDANCE_RESULT_INVALID');need(!disposed,'GUIDANCE_SESSION_CLOSED');records.set(guidanceId,structuredClone(record));return structuredClone(record);
        }finally{if(directory)await fs.rm(directory,{recursive:true,force:true});}
      }finally{busy=false;}
    }),
    get:args=>capture(async()=>structuredClone(await current(args))),
    review:args=>capture(async()=>{
      need(args.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');fields(args.review,['origin','coverage','decision','artifactDigest','reviewer'],['notes','issues'],'GUIDANCE_REVIEW_INVALID');safeData(args.review,'GUIDANCE_REVIEW_INVALID');
      const record=await current(args),r=args.review;
      need(r.origin==='human'&&r.coverage==='whole_clip'&&['reviewed','issues','rejected'].includes(r.decision)&&r.artifactDigest===record.artifactDigest,'GUIDANCE_WHOLE_CLIP_REVIEW_REQUIRED');
      need(typeof r.reviewer==='string'&&r.reviewer.trim().length>0&&r.reviewer.length<=200&&(r.notes===undefined||typeof r.notes==='string'&&r.notes.length<=4000)&&(r.issues===undefined||Array.isArray(r.issues)&&r.issues.length<=32&&r.issues.every(i=>typeof i==='string'&&i.length<=2000)),'GUIDANCE_REVIEW_INVALID');
      need(record.reviewHistory.length<32,'GUIDANCE_REVIEW_LIMIT');const evidence={...structuredClone(r),reviewId:`review_${randomUUID()}`,source:record.source,artifacts:record.artifacts.map(({assetId,checksum,kind})=>({assetId,checksum,kind})),timestamp:time(),executionApproval:false};
      record.review=evidence;record.reviewHistory.push(evidence);return structuredClone(record);
    }),
    async checkpoint(value,context) {
      need(value&&typeof value.guidanceId==='string','GUIDANCE_REVIEW_REQUIRED');const record=await current({...context,guidanceId:value.guidanceId});
      need(value.artifactDigest===record.artifactDigest,'GUIDANCE_ASSET_CHANGED');need(record.review?.coverage==='whole_clip'&&record.review.decision==='reviewed','GUIDANCE_WHOLE_CLIP_REVIEW_REQUIRED');
      return {artifactBinding:guidanceDigest({source:record.source,artifactDigest:record.artifactDigest,reviewId:record.review.reviewId}),guidanceId:record.guidanceId,artifactDigest:record.artifactDigest,reviewId:record.review.reviewId};
    },
    dispose(){disposed=true;records.clear();},
  };
}

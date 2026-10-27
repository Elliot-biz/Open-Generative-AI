// Official parser/decoder + deterministic lossless PNGs, never local segmentation inference.
import sharp from 'sharp';
import { decodeMaskToRaster, recordsOfKind } from '@meta-sam/parser';
import { fields, hashBytes, safeData, validId } from '../../packages/whihm-workflow-core/src/project/io.js';
import { guidanceDigest, guidanceLimits, assertGuidanceAlignment } from './performance-guidance-contract.mjs';
import { segmentationNeed as need, segmentationBinding } from './meta-segmentation-binding.mjs';
import { maskSequenceMime, maskSequenceKind } from './guidance-artifact-types.mjs';
export { maskSequenceMime, maskSequenceKind };
// Constraint check for this one-frame PNG artifact format; Sharp remains the pixel decoder.
function validateMaskPng(bytes,timeline){
  need(bytes.length>=45&&bytes.readUInt32BE(8)===13&&bytes.toString('ascii',12,16)==='IHDR'&&bytes.readUInt32BE(16)===timeline.width&&bytes.readUInt32BE(20)===timeline.height&&bytes[24]===8&&[0,2].includes(bytes[25]),'SEGMENTATION_MASK_INVALID');
  let offset=8,ended=false;
  while(offset<bytes.length){need(offset+12<=bytes.length,'SEGMENTATION_MASK_INVALID');const size=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);need(size<=bytes.length-offset-12&&!['acTL','fcTL','fdAT'].includes(kind),'SEGMENTATION_MASK_INVALID');offset+=size+12;if(kind==='IEND'){need(size===0&&offset===bytes.length,'SEGMENTATION_MASK_INVALID');ended=true;break;}}
  need(ended,'SEGMENTATION_MASK_INVALID');
}
export async function normalizeSegmentationMasks({parsed,source,timeline,normalized,requestId,usage,backend,expectedProviderObjectId=null}) {
  const records=recordsOfKind(parsed.records,'mask'),ids=[...new Set(records.map(r=>r.objectId))];
  need(ids.length<=1,'SEGMENTATION_MULTIPLE_MATCHES_NEED_SELECTION');
  const providerObjectId=ids[0]??null;
  need(expectedProviderObjectId===null||providerObjectId===null||providerObjectId===expectedProviderObjectId,'SEGMENTATION_OBJECT_ID_INVALID');
  const byFrame=new Map(),boxes=new Map(recordsOfKind(parsed.records,'box').map(b=>[b.order,b]));
  for(const record of records){
    const index=record.frame?.frameIndex;
    need(Number.isSafeInteger(index)&&index>=0&&index<timeline.frameCount,'SEGMENTATION_FRAME_INVALID');
    const b=record.bounds,box=boxes.get(record.order-1);need(box&&box.objectId===record.objectId&&box.frame?.frameIndex===index,'SEGMENTATION_BOX_INVALID');
    need([b.left,b.top,b.right,b.bottom].every(Number.isSafeInteger)&&b.left>=0&&b.top>=0&&b.right<=timeline.width&&b.bottom<=timeline.height&&b.right>b.left&&b.bottom>b.top,'SEGMENTATION_BOX_INVALID');
    need(record.mask.width===b.right-b.left&&record.mask.height===b.bottom-b.top,'SEGMENTATION_DIMENSIONS_INVALID');
    const confidence={...(record.confidence!==undefined?{mask:record.confidence}:{}),...(box.confidence!==undefined?{box:box.confidence}:{})};
    const identity=guidanceDigest({objectId:record.objectId,bounds:b,mask:record.mask,confidence});
    if(byFrame.has(index)){need(byFrame.get(index).identity===identity,'SEGMENTATION_DUPLICATE_FRAME_CONFLICT');continue;}
    let raster;try{raster=decodeMaskToRaster(record.mask);}catch{need(false,'SEGMENTATION_MASK_INVALID');}
    need(raster.length===record.mask.width*record.mask.height&&raster.every(p=>p===0||p===1),'SEGMENTATION_MASK_INVALID');
    byFrame.set(index,{record,raster,identity,box});
  }
  const frames=[];let total=0;const emptyFrames=[],fullFrames=[],nearFullFrames=[];
  for(let index=0;index<timeline.frameCount;index++){
    const value=byFrame.get(index),pixels=Buffer.alloc(timeline.width*timeline.height);let count=0;
    if(value){const {bounds:b,mask}=value.record;for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){const p=value.raster[y*mask.width+x]*255;pixels[(y+b.top)*timeline.width+x+b.left]=p;if(p)count++;}}
    const bytes=await sharp(pixels,{raw:{width:timeline.width,height:timeline.height,channels:1},limitInputPixels:guidanceLimits.pixels}).png({compressionLevel:9}).toBuffer();
    total+=bytes.length;need(total<=guidanceLimits.bytes*0.7,'SEGMENTATION_ARTIFACT_LIMIT');
    if(!count)emptyFrames.push(index);if(count===pixels.length)fullFrames.push(index);else if(count/pixels.length>=0.98)nearFullFrames.push(index);
    frames.push({index,timestampMs:timeline.timestampsMs[index],objectId:normalized.objectId,providerObjectId,present:count>0,
      evidence:value?'provider_mask':'provider_omitted',box:value?{...structuredClone(value.record.bounds),...(value.box.confidence!==undefined?{confidence:value.box.confidence}:{})}:null,width:timeline.width,height:timeline.height,
      mask:{format:'png',encoding:'base64',checksum:hashBytes(bytes),data:bytes.toString('base64')},foregroundPixels:count,
      ...(value?.record.confidence!==undefined?{confidence:value.record.confidence}:{})});
  }
  const noMatch=frames.every(f=>!f.present),validation={emptyFrames,fullFrames,nearFullFrames,reportedFrameCount:byFrame.size,completeFrameAlignment:true,alignmentEvidence:'source_header_cfr_and_explicit_provider_indices',decodedSourceTimingVerified:false,subjectQualityEvaluated:false};
  return {schemaVersion:1,kind:maskSequenceKind,source:structuredClone(source),timeline:structuredClone(timeline),operation:structuredClone(normalized),
    backend:{...backend??segmentationBinding,materializer:{id:'sharp-png',versions:{sharp:sharp.versions.sharp,vips:sharp.versions.vips},compressionLevel:9,bitDepth:8}},requestId,usage:usage??null,cost:null,outcome:noMatch?'no_match':'matched',
    objects:providerObjectId===null?[]:[{objectId:normalized.objectId,providerObjectId}],frames,validation,
    parserWarnings:parsed.diagnostics.map(({code,line})=>({code,line}))};
}
// Registered sequence data is an artifact, never trusted workflow/provider continuation state.
export function readMaskSequence(bytes,source,timeline) {
  need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=guidanceLimits.bytes,'SEGMENTATION_ARTIFACT_INVALID');let value;
  try{value=JSON.parse(bytes.toString('utf8'));}catch{need(false,'SEGMENTATION_ARTIFACT_INVALID');}
  safeData(value,'SEGMENTATION_ARTIFACT_INVALID');
  fields(value,['schemaVersion','kind','source','timeline','operation','backend','requestId','usage','cost','outcome','objects','frames','validation','parserWarnings'],[],'SEGMENTATION_ARTIFACT_INVALID');
  need(value.schemaVersion===1&&value.kind===maskSequenceKind&&value.source.assetId===source.assetId&&value.source.checksum===source.checksum,'SEGMENTATION_SOURCE_MISMATCH');assertGuidanceAlignment(value.timeline,timeline);
  need(['matched','no_match'].includes(value.outcome)&&Array.isArray(value.frames)&&value.frames.length===timeline.frameCount,'SEGMENTATION_ARTIFACT_INVALID');
  const masks=[];let size=0;
  for(const [i,frame]of value.frames.entries()){
    need(validId(frame.objectId)&&frame.objectId===value.operation.objectId&&(frame.providerObjectId===null||typeof frame.providerObjectId==='string'&&/^\d+$/.test(frame.providerObjectId))&&['provider_mask','provider_omitted'].includes(frame.evidence),'SEGMENTATION_OBJECT_ID_INVALID');
    need(frame.index===i&&frame.timestampMs===timeline.timestampsMs[i]&&typeof frame.present==='boolean'&&frame.width===timeline.width&&frame.height===timeline.height,'SEGMENTATION_FRAME_INVALID');
    if(frame.evidence==='provider_omitted')need(frame.present===false&&frame.box===null,'SEGMENTATION_ARTIFACT_INVALID');
    else need(frame.box&&[frame.box.left,frame.box.right,frame.box.top,frame.box.bottom].every(Number.isSafeInteger)&&frame.box.left>=0&&frame.box.top>=0&&frame.box.right<=timeline.width&&frame.box.bottom<=timeline.height&&frame.box.right>frame.box.left&&frame.box.bottom>frame.box.top,'SEGMENTATION_BOX_INVALID');
    const mask=frame.mask;need(mask?.format==='png'&&mask.encoding==='base64'&&typeof mask.data==='string'&&mask.data.length<=guidanceLimits.bytes,'SEGMENTATION_MASK_INVALID');
    const decoded=Buffer.from(mask.data,'base64');size+=decoded.length;
    need(decoded.toString('base64')===mask.data&&hashBytes(decoded)===mask.checksum&&size<=guidanceLimits.bytes&&decoded.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'SEGMENTATION_MASK_INVALID');validateMaskPng(decoded,timeline);masks.push(decoded);
  }
  need(value.outcome==='no_match'?value.frames.every(f=>!f.present):value.frames.some(f=>f.present),'SEGMENTATION_ARTIFACT_INVALID');
  return {sequence:value,masks,allowedEmptyFrames:value.frames.filter(f=>!f.present).map(f=>f.index)};
}

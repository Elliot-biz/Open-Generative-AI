import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fields, validId} from '../../packages/whihm-workflow-core/src/project/io.js';
import {timelineHash} from './timeline-contract.mjs';
import {acquireMultimediaRuntime} from './multimedia-runtime.mjs';
import {runBoundedMediaProcess} from './multimedia-process.mjs';
const need=(v,c='QC_OBJECTIVE_RULE_INVALID')=>{if(!v)throw Object.assign(Error(c),{qcCode:c});};
export const objectiveMetrics={startFrame:'frames',endFrame:'frames',durationFrames:'frames',sourceInFrame:'frames',gainDb:'dB',masterGainDb:'dB',pan:'ratio',fadeInFrames:'frames',fadeOutFrames:'frames',pitchSemitones:'semitones',stretchRatio:'ratio',layerOrder:'order',width:'pixels',height:'pixels'};
export function validateObjectiveRule(r){
 need(r?.type==='objective_measurement');
 fields(r,['type','family','metric','operator','value','tolerance','unit'],['itemId','startFrame','frameCount','stepFrames'],'QC_OBJECTIVE_RULE_INVALID');
 need(['timeline','audio','visual'].includes(r.family)&&['eq','lte','gte'].includes(r.operator)&&Number.isFinite(r.value)&&Number.isFinite(r.tolerance)&&r.tolerance>=0);
 const units=r.family==='visual'?{changeCount:'count',meanActivity:'ratio',meanLuminance:'ratio',meanContrast:'ratio',blackFraction:'ratio',whiteFraction:'ratio'}:objectiveMetrics;
 need(Object.hasOwn(units,r.metric)&&r.unit===units[r.metric]);
 need(r.itemId===undefined||validId(r.itemId));
 if(r.family==='visual')need(Number.isSafeInteger(r.startFrame)&&r.startFrame>=0&&r.startFrame<=1800&&Number.isSafeInteger(r.frameCount)&&r.frameCount>1&&r.frameCount<=120&&Number.isSafeInteger(r.stepFrames)&&r.stepFrames>=1&&r.stepFrames<=30&&r.frameCount*r.stepFrames<=120);
 return r;
}
export function compareObjective(value,r){return r.operator==='eq'?Math.abs(value-r.value)<=r.tolerance:r.operator==='lte'?value<=r.value+r.tolerance:value>=r.value-r.tolerance;}
export function measureGrayFrames(bytes,size=1024){
 need(bytes.length>size&&bytes.length%size===0,'QC_SAMPLE_COUNT_INVALID');const samples=[];let previous;const changes=[];
 for(let offset=0;offset<bytes.length;offset+=size){const frame=bytes.subarray(offset,offset+size);let sum=0,squares=0,black=0,white=0,difference=0;for(let j=0;j<size;j++){const v=frame[j]/255;sum+=v;squares+=v*v;if(frame[j]<=4)black++;if(frame[j]>=251)white++;if(previous)difference+=Math.abs(frame[j]-previous[j])/255;}const mean=sum/size,activity=previous?difference/size:0;samples.push({meanLuminance:mean,contrast:Math.sqrt(Math.max(0,squares/size-mean*mean)),blackFraction:black/size,whiteFraction:white/size,activity});if(previous&&activity>=0.25)changes.push(samples.length-1);previous=frame;}
 const avg=k=>samples.reduce((s,x)=>s+x[k],0)/samples.length;
 return {samples,changeSampleIndices:changes,metrics:{changeCount:changes.length,meanActivity:samples.slice(1).reduce((s,x)=>s+x.activity,0)/(samples.length-1),meanLuminance:avg('meanLuminance'),meanContrast:avg('contrast'),blackFraction:avg('blackFraction'),whiteFraction:avg('whiteFraction')},interpretation:'sampled_pixel_change_not_semantic_shots_or_optical_flow',changeThreshold:0.25};
}
export async function visualEvidence(bytes,source,facts,rule){
 validateObjectiveRule(rule);const stream=facts.streams.find(s=>s.type==='video');need(facts.mediaKind==='video'&&['mp4','mov'].includes(facts.container)&&stream?.frameRate,'QC_OBJECTIVE_MEDIA_UNSUPPORTED');need(Number.isSafeInteger(stream.frameCount)&&rule.startFrame+(rule.frameCount-1)*rule.stepFrames<stream.frameCount,'QC_OBJECTIVE_RANGE_INVALID');
 const rate=stream.frameRate;need(rate.numerator>0&&rate.denominator>0&&rule.frameCount*rule.stepFrames*rate.denominator<=3*rate.numerator,'QC_OBJECTIVE_WINDOW_LIMIT');
 const lease=await acquireMultimediaRuntime();need(lease.ok,'QC_OBJECTIVE_RUNTIME_UNAVAILABLE');let dir;
 try{dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-objective-'));const input=path.join(dir,'source.mp4'),output=path.join(dir,'frames.gray');await fs.writeFile(input,bytes,{flag:'wx',mode:0o600});
 const end=rule.startFrame+rule.frameCount*rule.stepFrames;
 const filter=`trim=start_frame=${rule.startFrame}:end_frame=${end},select=not(mod(n\\,${rule.stepFrames})),scale=32:32:flags=area,format=gray`;
 need(await lease.unchanged(),'QC_OBJECTIVE_RUNTIME_CHANGED');const result=await runBoundedMediaProcess(lease.paths.ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-n','-threads','1','-filter_threads','1','-max_alloc','67108864','-protocol_whitelist','file','-f','mov','-enable_drefs','0','-use_absolute_path','0','-i',input,'-map','0:v:0','-an','-vf',filter,'-fps_mode','passthrough','-frames:v',String(rule.frameCount),'-f','rawvideo','-pix_fmt','gray','-fs','122881',output],{env:lease.env,timeoutMs:15000,outputLimit:65536});need(result.ok,'QC_OBJECTIVE_DECODE_FAILED');need(await lease.unchanged(),'QC_OBJECTIVE_RUNTIME_CHANGED');const stat=await fs.stat(output);need(stat.size===rule.frameCount*1024,'QC_SAMPLE_COUNT_INVALID');const measured=measureGrayFrames(await fs.readFile(output));
 const body={schemaVersion:1,kind:'objective-media-evidence',target:source,sourceClass:'DETERMINISTIC',version:'gray-difference-v1',units:{changeCount:'count',meanActivity:'ratio',meanLuminance:'ratio',meanContrast:'ratio',blackFraction:'ratio',whiteFraction:'ratio'},scope:{startFrame:rule.startFrame,frameCount:rule.frameCount,stepFrames:rule.stepFrames,frameRate:rate},runtime:lease.status.versions,...measured,sampleFrames:measured.samples.map((_,i)=>rule.startFrame+i*rule.stepFrames)};return {...body,evidenceHash:timelineHash(body)};
 }finally{if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
export function authoredMeasurement(record,r){
 const doc=r.family==='timeline'?record.metadata?.timelineComposition?.timeline:record.metadata?.audioProduction?.definition;if(!doc)return null;
 let item=doc;if(r.itemId){item=doc.tracks?.flatMap(t=>r.family==='timeline'?t.items??[]:t.events??[]).find(i=>i.id===r.itemId);if(!item)return null;}
 const v=r.metric==='endFrame'?item.startFrame+item.durationFrames:r.metric==='pitchSemitones'?item.manipulation?.pitchSemitones:r.metric==='stretchRatio'?item.manipulation?.sourceDurationFrames/item.durationFrames:r.metric==='masterGainDb'?doc.master?.gainDb:r.metric==='layerOrder'?doc.tracks?.find(t=>t.items?.some(i=>i.id===r.itemId))?.order:['width','height'].includes(r.metric)?doc.canvas?.[r.metric]:item[r.metric];return Number.isFinite(v)?v:null;
}
export function outcomesToRequirements(outcomes){return outcomes.filter(o=>o.type==='objective'&&o.rule).map(o=>({id:o.id,artifactId:o.artifactId,category:'OBJECTIVE_INTENT',required:true,severity:'ERROR',humanReview:'never',description:o.description,rule:structuredClone(o.rule)}));}

import {fields,safeData,validId,validHash} from '../../packages/whihm-workflow-core/src/project/io.js';
import {normalizeTimelineRate,timelineSample,timelineHash} from './timeline-contract.mjs';
export const audioNeed=(v,c='AUDIO_DEFINITION_INVALID')=>{if(!v)throw Object.assign(new Error(c),{audioCode:c});};
const need=audioNeed,num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export const processorSpecs={highpass:{frequency:[20,20000]},lowpass:{frequency:[20,20000]},equalizer:{frequency:[20,20000],q:[0.1,10],gainDb:[-24,24]},compressor:{thresholdDb:[-60,0],ratio:[1,20],attackFrames:[1,60],releaseFrames:[1,600],makeupDb:[0,24]},limiter:{limit:[0.0625,1]},gate:{thresholdDb:[-60,0],ratio:[1,20],attackFrames:[1,60],releaseFrames:[1,600]}};
function processors(list=[]){need(Array.isArray(list)&&list.length<=8);return list.map(p=>{need(Object.hasOwn(processorSpecs,p.type),'AUDIO_PROCESSOR_UNSUPPORTED');const spec=processorSpecs[p.type];fields(p,['type',...Object.keys(spec)],[],'AUDIO_PROCESSOR_INVALID');for(const [key,[lo,hi]]of Object.entries(spec))need(num(p[key],lo,hi)&&(!key.endsWith('Frames')||Number.isInteger(p[key])),'AUDIO_PROCESSOR_INVALID');return structuredClone(p);});}
function controls(x,duration){
 const gainDb=x.gainDb??0,pan=x.pan??0;need(num(gainDb,-60,12)&&num(pan,-1,1),'AUDIO_LEVEL_INVALID');
 const automation=x.automation??{};fields(automation,[],['gainDb','pan'],'AUDIO_AUTOMATION_INVALID');
 for(const [key,env]of Object.entries(automation)){
  fields(env,['interpolation','points'],[],'AUDIO_AUTOMATION_INVALID');need(['linear','hold'].includes(env.interpolation)&&Array.isArray(env.points)&&env.points.length>=1&&env.points.length<=32,'AUDIO_AUTOMATION_INVALID');let last=-1;
  for(const p of env.points){fields(p,['frame','value'],[],'AUDIO_AUTOMATION_INVALID');need(Number.isSafeInteger(p.frame)&&p.frame>last&&p.frame<=duration&&num(p.value,key==='pan'?-1:-60,key==='pan'?1:12),'AUDIO_AUTOMATION_INVALID');last=p.frame;}
 }
 return {gainDb,pan,automation:structuredClone(automation),processors:processors(x.processors)};
}
export function normalizeAudioProduction(input){
 safeData(input,'AUDIO_DEFINITION_INVALID');need(Buffer.byteLength(JSON.stringify(input))<=131072,'AUDIO_LIMIT');
 fields(input,['schemaVersion','definitionId','frameRate','durationFrames','master','buses','tracks'],['timelineId','analysisRefs','sections','metadata'],'AUDIO_DEFINITION_INVALID');need(input.schemaVersion===1,'AUDIO_VERSION_UNSUPPORTED');
 const frameRate=normalizeTimelineRate(input.frameRate),duration=input.durationFrames;need(Number.isSafeInteger(duration)&&duration>0&&duration*frameRate.denominator/frameRate.numerator<=600,'AUDIO_TIME_INVALID');
 const ids=new Set();function id(v){need(validId(v)&&v.length<=128&&!ids.has(v)&&!['__proto__','constructor','prototype'].includes(v),'AUDIO_ID_INVALID');ids.add(v);}
 id(input.definitionId);need(input.timelineId===undefined||validId(input.timelineId));
 fields(input.master,['sampleRate','channels'],['gainDb','pan','automation','processors'],'AUDIO_MASTER_INVALID');need([44100,48000].includes(input.master.sampleRate)&&input.master.channels===2,'AUDIO_MASTER_INVALID');need(timelineSample(duration,frameRate,input.master.sampleRate)*4+4096<=67108864,'AUDIO_OUTPUT_LIMIT');
 const master={sampleRate:input.master.sampleRate,channels:2,...controls(input.master,duration)};
 need(Array.isArray(input.buses)&&input.buses.length>0&&input.buses.length<=8,'AUDIO_BUSES_INVALID');
 const buses=input.buses.map(b=>{fields(b,['id'],['gainDb','pan','automation','processors','duck'],'AUDIO_BUS_INVALID');id(b.id);return {id:b.id,...controls(b,duration),...(b.duck?{duck:structuredClone(b.duck)}:{})};}).sort((a,b)=>a.id<b.id?-1:1);
 need(buses.filter(b=>b.duck).length<=1,'AUDIO_DUCK_LIMIT');for(const b of buses)if(b.duck){const d=b.duck;fields(d,['triggerBus','thresholdDb','ratio','attackFrames','releaseFrames'],[],'AUDIO_DUCK_INVALID');need(buses.some(x=>x.id===d.triggerBus&&!x.duck)&&b.id!==d.triggerBus,'AUDIO_DUCK_INVALID');for(const key of ['thresholdDb','ratio','attackFrames','releaseFrames']){const [lo,hi]=processorSpecs.compressor[key];need(num(d[key],lo,hi)&&(!key.endsWith('Frames')||Number.isInteger(d[key])),'AUDIO_DUCK_INVALID');}}
 let count=0;need(Array.isArray(input.tracks)&&input.tracks.length>0&&input.tracks.length<=16,'AUDIO_TRACKS_INVALID');
 const tracks=input.tracks.map(t=>{
  fields(t,['id','category','busId','events'],['enabled','mute','gainDb','pan','automation','processors'],'AUDIO_TRACK_INVALID');id(t.id);need(['dialogue','music','sfx','ambience','generic'].includes(t.category)&&buses.some(b=>b.id===t.busId),'AUDIO_ROUTING_INVALID');need((t.enabled===undefined||typeof t.enabled==='boolean')&&(t.mute===undefined||typeof t.mute==='boolean'));
  need(Array.isArray(t.events)&&t.events.length<=32);const events=t.events.map(e=>{need(++count<=64,'AUDIO_EVENT_LIMIT');fields(e,['id','source','startFrame','durationFrames'],['sourceInFrame','fadeInFrames','fadeOutFrames','gainDb','pan','automation','processors','stem','manipulation'],'AUDIO_EVENT_INVALID');id(e.id);fields(e.source,['assetId','checksum'],[],'AUDIO_SOURCE_INVALID');need(validId(e.source.assetId)&&validHash(e.source.checksum),'AUDIO_SOURCE_INVALID');
   const p={sourceInFrame:0,fadeInFrames:0,fadeOutFrames:0,...e};for(const k of ['startFrame','sourceInFrame','fadeInFrames','fadeOutFrames','durationFrames'])need(Number.isSafeInteger(p[k])&&p[k]>=0,'AUDIO_TIME_INVALID');need(p.durationFrames>0&&p.startFrame+p.durationFrames<=duration&&p.fadeInFrames+p.fadeOutFrames<=p.durationFrames,'AUDIO_TIME_INVALID');need(e.stem===undefined||typeof e.stem==='string'&&e.stem.length<=128);
   if(e.manipulation){const m=e.manipulation;fields(m,['mode','sourceDurationFrames'],['pitchSemitones'],'AUDIO_MANIPULATION_INVALID');need(['stretch','pitch','playback'].includes(m.mode)&&Number.isSafeInteger(m.sourceDurationFrames)&&m.sourceDurationFrames>0,'AUDIO_MANIPULATION_INVALID');const ratio=m.sourceDurationFrames/p.durationFrames;need(ratio>=0.5&&ratio<=2,'AUDIO_STRETCH_RANGE');need(m.mode==='pitch'?m.sourceDurationFrames===p.durationFrames:true,'AUDIO_PITCH_DURATION');need(m.mode==='pitch'?num(m.pitchSemitones,-12,12):m.pitchSemitones===undefined,'AUDIO_MANIPULATION_INVALID');}
   return {...structuredClone(p),...controls(e,p.durationFrames)};
  }).sort((a,b)=>a.startFrame-b.startFrame||(a.id<b.id?-1:1));return {id:t.id,category:t.category,busId:t.busId,enabled:t.enabled??true,mute:t.mute??false,...controls(t,duration),events};
 }).sort((a,b)=>a.id<b.id?-1:1);
 for(const x of [master,...buses,...tracks,...tracks.flatMap(t=>t.events)])for(const p of [...x.processors,...(x.duck?[x.duck]:[])])if(p.attackFrames!==undefined)need(p.attackFrames*frameRate.denominator/frameRate.numerator*1000<=2000&&p.releaseFrames*frameRate.denominator/frameRate.numerator*1000<=9000,'AUDIO_PROCESSOR_TIME_UNSUPPORTED');
 const sections=input.sections??[];need(Array.isArray(sections)&&sections.length<=64);for(const s of sections){fields(s,['label','startFrame','endFrame','evidence'],[],'AUDIO_SECTION_INVALID');need(typeof s.label==='string'&&s.label.length>0&&s.label.length<=128&&['manual','provider','candidate'].includes(s.evidence)&&Number.isSafeInteger(s.startFrame)&&Number.isSafeInteger(s.endFrame)&&s.startFrame>=0&&s.endFrame>s.startFrame&&s.endFrame<=duration,'AUDIO_SECTION_INVALID');}
 const analysisRefs=input.analysisRefs??[];need(Array.isArray(analysisRefs)&&analysisRefs.length<=16);for(const r of analysisRefs){fields(r,['assetId','checksum'],[],'AUDIO_ANALYSIS_REF_INVALID');need(validId(r.assetId)&&validHash(r.checksum));}
 return {schemaVersion:1,definitionId:input.definitionId,...(input.timelineId?{timelineId:input.timelineId}:{}),frameRate,durationFrames:duration,master,buses,tracks,sections:structuredClone(sections),analysisRefs:structuredClone(analysisRefs)};
}
export function hashAudioMix(d){const {definitionId:_id,timelineId:_timeline,sections:_sections,analysisRefs:_analysis,...render}=d;return timelineHash(render);}

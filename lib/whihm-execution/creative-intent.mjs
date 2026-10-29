import {fields, safeData, validId} from '../../packages/whihm-workflow-core/src/project/io.js';
import {timelineHash} from './timeline-contract.mjs';
import {validateObjectiveRule} from './objective-evidence.mjs';

const need=(v,c)=>{if(!v)throw Object.assign(Error(c),{revisionCode:c});};
export const intentOperations=Object.freeze({move_start:'startFrame',move_event:'startFrame',change_duration:'durationFrames',change_event_duration:'durationFrames',trim_source:'sourceInFrame',adjust_gain:'gainDb',adjust_pan:'pan',adjust_fade:'fadeInFrames',adjust_pitch:'manipulation',adjust_time_stretch:'manipulation',change_canvas:'canvas'});
const targets=['timeline_item','audio_event','audio_master','timeline_output'];
export const creativeIntentSchema={type:'object',additionalProperties:false,required:['schemaVersion','sourceFindingIds','revisionGoal','requestedChanges','preserve','requires','acceptableSideEffects','expectedOutcomes'],properties:{schemaVersion:{const:1},sourceFindingIds:{type:'array',items:{type:'string'}},revisionGoal:{type:'string'},requestedChanges:{type:'array',items:{type:'object',additionalProperties:false,required:['findingId','target','operation','value'],properties:{findingId:{type:'string'},target:{type:'object',additionalProperties:false,required:['type','nodeId'],properties:{type:{enum:targets},nodeId:{type:'string'},id:{type:'string'}}},operation:{enum:Object.keys(intentOperations)},value:{}}}},preserve:{type:'array',items:{type:'object'}},requires:{type:'array',items:{type:'string'}},acceptableSideEffects:{type:'array',items:{enum:['rerender_timeline','rerender_audio','remote_provider']}},expectedOutcomes:{type:'array',items:{type:'object'}},rationale:{type:'string'}}};
creativeIntentSchema.properties.preserve.items={type:'object',additionalProperties:false,required:['type','nodeId'],properties:{type:{enum:['node','final_duration','audio_event','timeline_item']},nodeId:{type:'string'},id:{type:'string'}}};
creativeIntentSchema.properties.expectedOutcomes.items={type:'object',additionalProperties:false,required:['type','description'],properties:{type:{enum:['objective','subjective']},description:{type:'string'},id:{type:'string'},artifactId:{type:'string'},rule:{type:'object',description:'objective_measurement: family timeline/audio/visual/segment/face/mask/target/audio_timing; metric, operator eq/lte/gte, value, tolerance, unit; specialized families require evidenceId and source-bound QC evidence, target requires targetId, audio_timing requires itemId and candidateType, visual/segment require startFrame/frameCount/stepFrames'}}};
export function validateCreativeIntent(value){
  safeData(value,'REVISION_INTENT_UNSAFE');
  fields(value,creativeIntentSchema.required,['rationale'],'REVISION_INTENT_INVALID');
  need(value.schemaVersion===1,'REVISION_INTENT_VERSION');
  need(typeof value.revisionGoal==='string'&&value.revisionGoal.trim().length>0&&value.revisionGoal.length<=1000,'REVISION_INTENT_GOAL');
  for(const key of ['sourceFindingIds','requestedChanges','preserve','requires','acceptableSideEffects','expectedOutcomes'])need(Array.isArray(value[key])&&value[key].length<=8,'REVISION_INTENT_LIMIT');
  need(value.sourceFindingIds.length&&value.sourceFindingIds.every(validId)&&new Set(value.sourceFindingIds).size===value.sourceFindingIds.length,'REVISION_INTENT_FINDINGS');
  need(value.requestedChanges.length>0,'REVISION_INTENT_CHANGES');
  for(const c of value.requestedChanges){
    fields(c,['findingId','target','operation','value'],[],'REVISION_INTENT_CHANGE');fields(c.target,['type','nodeId'],['id'],'REVISION_INTENT_TARGET');
    need(value.sourceFindingIds.includes(c.findingId)&&targets.includes(c.target.type)&&validId(c.target.nodeId)&&(!c.target.id||validId(c.target.id)),'REVISION_INTENT_TARGET');
    need(Object.hasOwn(intentOperations,c.operation),'REVISION_UNSUPPORTED_CHANGE');
    const allowed=c.target.type==='audio_event'?['move_event','change_event_duration','trim_source','adjust_gain','adjust_pan','adjust_fade','adjust_pitch','adjust_time_stretch']:c.target.type==='timeline_item'?['move_start','change_duration','trim_source','adjust_gain']:c.target.type==='audio_master'?['adjust_gain']:['change_canvas','change_duration'];
    need(allowed.includes(c.operation),'REVISION_UNSUPPORTED_CHANGE');
    need(!['timeline_item','audio_event'].includes(c.target.type)||validId(c.target.id),'REVISION_INTENT_TARGET');
  }
  for(const p of value.preserve){fields(p,['type','nodeId'],['id'],'REVISION_INTENT_PRESERVE');need(['node','final_duration','audio_event','timeline_item'].includes(p.type)&&validId(p.nodeId)&&(!p.id||validId(p.id)),'REVISION_INTENT_PRESERVE');need(!['audio_event','timeline_item'].includes(p.type)||validId(p.id),'REVISION_INTENT_PRESERVE');}
  need(value.requires.every(validId)&&value.acceptableSideEffects.every(x=>['rerender_timeline','rerender_audio','remote_provider'].includes(x)),'REVISION_INTENT_REQUIREMENTS');
  for(const e of value.expectedOutcomes){fields(e,['type','description'],['id','artifactId','rule'],'REVISION_INTENT_OUTCOME');need(['objective','subjective'].includes(e.type)&&typeof e.description==='string'&&e.description.length>0&&e.description.length<=1000,'REVISION_INTENT_OUTCOME');if(e.rule){need(e.type==='objective'&&validId(e.id)&&validId(e.artifactId),'REVISION_INTENT_OUTCOME');validateObjectiveRule(e.rule);}}
  need(value.rationale===undefined||typeof value.rationale==='string'&&value.rationale.length<=2000,'REVISION_INTENT_RATIONALE');
  return structuredClone(value);
}
export function creativeIntentHash(value){const v=validateCreativeIntent(value);return timelineHash({...v,sourceFindingIds:[...v.sourceFindingIds].sort(),requires:[...v.requires].sort(),acceptableSideEffects:[...v.acceptableSideEffects].sort()});}
export function translateCreativeIntent(value,request,workflow){
  const v=validateCreativeIntent(value);
  need(v.sourceFindingIds.every(id=>request.findingIds.includes(id)),'REVISION_INTENT_FINDINGS');
  need(request.findingIds.every(id=>v.requestedChanges.some(c=>c.findingId===id)),'REVISION_INTENT_INCOMPLETE');
  const intents=v.requestedChanges.map(c=>{const family=c.target.type,capabilityId=family.startsWith('audio')?'PRODUCE_AUDIO_MIX':'COMPOSE_TIMELINE';need(v.acceptableSideEffects.includes(family.startsWith('audio')?'rerender_audio':'rerender_timeline'),'REVISION_INTENT_SIDE_EFFECT');return {findingId:c.findingId,nodeId:c.target.nodeId,family,...(c.target.id?{elementId:c.target.id}:{}),capabilityId,changes:{[intentOperations[c.operation]]:c.value},expectedOutcome:v.revisionGoal};});
  const available=new Set(workflow.nodes.map(n=>n.executor.tool==='audio-production'?'PRODUCE_AUDIO_MIX':n.executor.tool==='timeline-composition'?'COMPOSE_TIMELINE':null));
  need(v.requires.every(x=>available.has(x)),'REVISION_INTENT_CAPABILITY_UNAVAILABLE');
  return intents;
}
export function checkIntentPreservation(value,workflow,documents){
  for(const p of value.preserve){const node=workflow.nodes.find(n=>n.id===p.nodeId);need(node,'REVISION_INTENT_TARGET');const parameter=node.executor.tool==='audio-production'?'definition':'timeline',before=node.parameters[parameter],after=documents.get(JSON.stringify([node.id,parameter]))??before;need(before,'REVISION_INTENT_TARGET');
    const pick=d=>p.type==='final_duration'?d.durationFrames:p.type==='node'?d:d.tracks.flatMap(t=>p.type==='audio_event'?t.events??[]:t.items??[]).find(e=>e.id===p.id);
    need(pick(before)!==undefined&&timelineHash(pick(before))===timelineHash(pick(after)),'REVISION_INTENT_PRESERVE_CONFLICT');
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProject,createWorkflow} from 'whihm-workflow-core';
import {buildRecastRequest} from '../packages/studio/src/recastInputContracts.js';
import {buildMotionControlRequest} from '../packages/studio/src/motionControlInputContracts.js';
import {createExecutionBridge} from '../lib/whihm-execution/bridge.mjs';
import {createApplicationRuntime,findRemote} from '../lib/whihm-execution/runtime.mjs';
import {createWorkflowExecution} from '../lib/whihm-execution/workflow-execution.mjs';
import {createWorkflowNodeAdapter} from '../lib/whihm-execution/workflow-node-adapter.mjs';
import {createPerformanceBenchmarks} from '../lib/whihm-execution/performance-benchmark.mjs';
import {imageBytes} from './helpers/mediaInspectionFixtures.mjs';
import {projectCapabilities} from '../lib/whihm-execution/capability-projection.mjs';
import {getCapabilityContext,getExecutorContext,getPlanningOverview} from '../lib/whihm-execution/planning-context.mjs';
const source='https://example.com/source.mp4',image='https://example.com/character.png';
const cases=[
 ['kling-v3.0-pro-recast','recast',{},'PERFORMANCE_TRANSFER'],
 ['runway-act-two-recast','recast',{},'PERFORMANCE_TRANSFER'],
 ['wan2.2-animate-recast','recast',{mode:'animate'},'PERFORMANCE_TRANSFER'],
 ['wan2.2-animate-recast','recast',{mode:'replace'},'OBJECT_REPLACE_VIDEO'],
 ...['seedance-2.5-motion-control','seedance-2-motion-control','seedance-2.5-spicy-motion-control'].flatMap(id=>[['motion_transfer','PERFORMANCE_TRANSFER'],['objects_swap','OBJECT_REPLACE_VIDEO']].map(([mode,intent])=>[id,'motion_control',{mode},intent])),
];
function workflow(model,mode,parameters,intent){return createWorkflow({workflowId:'transformation',name:'Transformation',nodes:[{id:'transform',title:'Transform',kind:'generation',executor:{id:'existing',type:'remote-model',provider:'muapi',model,mayCostMoney:true,requiresConfirmation:false},inputs:[],outputs:[{id:'video',type:'video'}],parameters:{video_url:source,...(mode==='recast'?{image_url:image}:{images_list:[image]}),...parameters},metadata:{oga:{mode,intent}}}]});}
for(const [id,mode,parameters,intent] of cases){
 test(`${id}/${parameters.mode??'performance'} exact existing binding, plan and workflow dispatch`,async t=>{
  let calls=0;const seen=[];t.mock.method(globalThis,'fetch',async(url,init={})=>{calls++;seen.push({url,body:init.body?JSON.parse(init.body):null});return {ok:true,json:async()=>({status:'completed',request_id:'native-request',outputs:['https://example.com/output.mp4'],url:'https://example.com/output.mp4',cost:0,usage:{processed_frames:20}})};});
  const bridge=createExecutionBridge({runtime:createApplicationRuntime({getApiKey:()=> 'fixture-only-key'})}),w=workflow(id,mode,parameters,intent);
  const p=await bridge.plan({workflow:w,nodeId:'transform'});assert.equal(p.status,'planned',JSON.stringify(p));assert.equal(calls,0);assert.equal(p.request.transformation.capability,intent);assert.deepEqual(p.request.transformation.guidance.acceptedModes,['raw']);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-transform-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=path.join(dir,'project'),{project}=await createProject(root,{title:'Transformation fixture'});
  const e=createWorkflowExecution({adapter:createWorkflowNodeAdapter({bridge})});
  let r=await e.run({project,root,workflow:w,allowExecution:true});assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(calls,2);assert.equal(seen[0].url,`https://api.muapi.ai/api/v1/${findRemote(id,mode).model.endpoint}`);
  const result=r.nodes.transform.result;assert.equal(result.capability,intent);assert.equal(result.requestId,'native-request');assert.equal(result.cost,0);assert.deepEqual(result.usage,{processed_frames:20});assert.equal(result.transformation.path,mode==='motion_control'?'managed_provider_preprocessing':'direct_performance_transfer');
  r=await e.resume({project,root,workflow:w,runId:r.runId,expectedRevision:r.revision,allowExecution:true});assert.equal(calls,2);assert.equal(r.nodes.transform.attempts,1);
  const filename=path.join(dir,'fixture.png');await fs.writeFile(filename,await imageBytes());await project.importAsset({sourcePath:filename,assetId:'fixture',contentType:'image/png'});
  const book=createPerformanceBenchmarks({readRun:runId=>e.get({runId})});const created=await book.create({project,allowExecution:true,definition:{caseId:'case',title:'Recorded fixture',category:'performance',intent:{operation:'performance_transfer'},sources:[{role:'fixture',assetId:'fixture'}],references:[],preservation:{},metrics:[{id:'motion',label:'Motion'}]}});assert.equal(created.status,'created',JSON.stringify(created));const record=await book.recordCandidate({project,allowExecution:true,caseId:'case',expectedRevision:0,candidateId:'candidate',capabilityId:intent,runRef:{runId:r.runId,nodeId:'transform'}});assert.equal(record.status,'recorded',JSON.stringify(record));assert.equal(record.benchmark.candidates[0].attempts[0].evidence.technical.transformation.capability,intent);assert.equal(record.benchmark.candidates[0].attempts[0].evidence.cost.native,0);assert.equal((await book.compare({caseId:'case'})).ranking,false);
  const changed=structuredClone(w);changed.nodes[0].parameters.video_url='https://example.com/changed.mp4';const invalidated=await e.invalidate({project,root,workflow:changed,runId:r.runId,expectedRevision:r.revision,allowExecution:true});assert.equal(invalidated.nodes.transform.status,'stale');assert.equal(calls,2);
 });
}
for(const [id,mode,parameters,intent] of cases)test(`${id}/${parameters.mode??'performance'} rejects contradictory declared intent before dispatch`,async()=>{
 const w=workflow(id,mode,parameters,intent==='PERFORMANCE_TRANSFER'?'OBJECT_REPLACE_VIDEO':'PERFORMANCE_TRANSFER');const r=await createExecutionBridge().plan({workflow:w,nodeId:'transform'});assert.equal(r.diagnostics[0].code,'TRANSFORMATION_INTENT_MISMATCH');
});
test('Spicy exact typed controls, boundaries and independent endpoint',()=>{
 const p={model:'seedance-2.5-spicy-motion-control',mode:'motion_transfer',video_url:source,images_list:[image],duration:30,seed:0,high_bitrate:false,generate_audio:false};const r=buildMotionControlRequest(p);assert.equal(r.endpoint,p.model);assert.equal(r.payload.seed,0);assert.equal(r.payload.generate_audio,false);assert.equal(r.transformation.referenceImages.maximum,30);
 for(const change of [{duration:31},{seed:-2},{images_list:Array(31).fill(image)},{quality:'high'},{guidance:{mode:'depth_mask'}},{generate_audio:'false'}])assert.throws(()=>buildMotionControlRequest({...p,...change}));
});
test('Act Two rejects unrelated options and Wan replace is not universal V2V editing',()=>{
 assert.throws(()=>buildRecastRequest({model:'runway-act-two-recast',video_url:source,image_url:image,prompt:'invented'}));assert.throws(()=>buildRecastRequest({model:'wan2.2-animate-recast',video_url:source,image_url:image,mode:'object_mask_edit'}));
});
test('discovery exposes intent-specific views and exact original executor IDs',()=>{
 const all=projectCapabilities().capabilities.flatMap(c=>c.executors);for(const intent of ['PERFORMANCE_TRANSFER','OBJECT_REPLACE_VIDEO','VIDEO_RESTYLE'])assert.equal(getCapabilityContext(intent).status,'ok');
 for(const e of all.filter(e=>e.constraints?.some(c=>c.kind==='exact_intent_parameters'))){assert.equal(getExecutorContext(e.key).status,'ok');assert.ok(findRemote(e.id,e.mode)||!e.available);}
 assert.ok(getPlanningOverview().capabilities.some(c=>c.id==='PERFORMANCE_TRANSFER'));assert.ok(!all.some(e=>/body.swap.studio/i.test(e.id)));
});
test('Higgsfield native lifecycle and WHIHM prepared-guidance consumption remain unavailable',()=>{
 const p=projectCapabilities();for(const id of ['motion-transfer','object-swap','restyle']){const e=getExecutorContext(`higgsfield/genjutsu/${id}/v1.0`).executor;assert.equal(e.available,false);assert.equal(e.binding.available,false);assert.equal(e.reason.code,'HIGGSFIELD_LIFECYCLE_BINDING_UNREVIEWED');assert.equal(findRemote(e.id),null);}
 const e=getCapabilityContext('PERFORMANCE_TRANSFER').executors.find(e=>e.id==='seedance-2.5-motion-control');const s=e.constraints.find(c=>c.kind==='transformation_support');assert.equal(s.guidance.preparedGuidanceSupported,false);assert.equal(s.guidance.code,'GUIDANCE_INPUT_CONTRACT_UNSUPPORTED');assert.ok(!p.capabilities.some(c=>/GENJUTSU|AGENT/.test(c.id)));
});
test('missing native cost stays unknown and provider failure keeps exact route',async()=>{
 const w=workflow('seedance-2.5-spicy-motion-control','motion_control',{mode:'motion_transfer'},'PERFORMANCE_TRANSFER');let calls=0;
 const bridge=createExecutionBridge({runtime:{remote:async()=>{calls++;return {status:'completed',request_id:'native',outputs:['https://example.com/output.mp4']};}}});
 const r=await bridge.execute({workflow:w,nodeId:'transform'},{allowExecution:true});assert.equal(r.cost,null);assert.equal(calls,1);assert.equal(r.model,w.nodes[0].executor.model);
 const failing=createExecutionBridge({runtime:{remote:async()=>{calls++;throw Object.assign(new Error('Provider rejected'),{requestId:'failed-native'});}}});const failed=await failing.execute({workflow:w,nodeId:'transform'},{allowExecution:true});assert.notEqual(failed.status,'succeeded');assert.equal(calls,2);
});
test('intent discovery is deterministic and performs zero transport',t=>{
 t.mock.method(globalThis,'fetch',()=>{throw new Error('Forbidden provider call');});assert.deepEqual(projectCapabilities(),projectCapabilities());
 const p=getCapabilityContext('OBJECT_REPLACE_VIDEO');assert.equal(p.status,'ok');for(const e of p.executors.filter(e=>e.available)){const constraint=e.constraints.find(c=>c.kind==='exact_intent_parameters');assert.ok(['replace','objects_swap'].includes(constraint.parameters.mode));}
});

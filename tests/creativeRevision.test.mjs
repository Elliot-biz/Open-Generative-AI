import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createProject, createWorkflow, hashWorkflow} from 'whihm-workflow-core';
import {createAgentExecution, compileAgentWorkflowPlan} from '../lib/whihm-execution/agent-execution.mjs';
import {createWorkflowExecution} from '../lib/whihm-execution/workflow-execution.mjs';
import {createCreativeRevision} from '../lib/whihm-execution/creative-revision.mjs';
import {validateRevisionRequest} from '../lib/whihm-execution/creative-revision-contract.mjs';
import {evaluateCreativeQc, getCreativeQc} from '../lib/whihm-execution/creative-qc.mjs';
import {waveBytes, imageBytes} from './helpers/mediaInspectionFixtures.mjs';
import {projectCapabilities} from '../lib/whihm-execution/capability-projection.mjs';
import {getExecutorContext, getCapabilityContext} from '../lib/whihm-execution/planning-context.mjs';
import {runActionBenchmark} from './benchmarks/anime-action-runner.mjs';

import {getMultimediaRuntimeStatus} from '../lib/whihm-execution/multimedia-runtime.mjs';
test.before(async()=>assert.equal((await getMultimediaRuntimeStatus()).availability,'ready'));

const stopPolicy = ['pass','review','blocked','failed','uncertain','limit','stale'];
const ref = ({assetId,checksum}) => ({assetId,checksum});
const code = r => r.diagnostics?.[0]?.code;
const ctx = f => ({project: f.project, root: f.root, projectId: f.projectId});
const check = (r, status) => {assert.equal(r.status, status, JSON.stringify(r)); return r;};
const requirement = (rule, extra={}) => ({id: 'timing', category: 'OBJECTIVE_INTENT', required: true,
  severity: 'ERROR', humanReview: 'never', artifactId: 'master', target: {nodeId: 'mix', parameterFamily: 'audio', audioEventId: 'hit'}, rule, ...extra});
function qcRequest(f, output, requirements) {
  return {schemaVersion: 1, requestId: 'qc_original', objective: 'Execute explicit production intent',
    artifacts: [{id: 'master', assetId: output.assetId, checksum: output.checksum, role: 'master'}],
    requirements, evidence: [], reviewRefs: [], policy: {allowRecordedDeterministic: true, allowExternalAssessments: false},
    humanReview: {required: false}, association: {workflowId: f.workflow.workflowId, workflowHash: f.run.workflowHash, runId: f.run.runId}};
}
async function makeQc(f, requirements=[requirement({type: 'lineage_event', family: 'audio', itemId: 'hit', startFrame: 1, toleranceFrames: 0})]) {
  f.qc = check(await evaluateCreativeQc({...ctx(f), request: qcRequest(f, f.run.nodes.mix.result.output, requirements), allowExecution: true}), 'succeeded');
  f.request = {schemaVersion: 1, requestId: 'revision_one', projectId: f.projectId, workflowId: f.workflow.workflowId,
    expectedWorkflowHash: f.run.workflowHash, sourceQc: {assetId: f.qc.record.assetId, checksum: f.qc.record.checksum},
    agentExecutionId: 'original', runId: f.run.runId, findingIds: requirements.map(r=>r.id),
    scope: {nodeIds: ['mix'], families: ['audio_event']}, cycle: 1, maxCycles: 2,
    executionPolicy: 'safe_deterministic', stopPolicy, intents: []};
}
async function fixture(t, {gate=false}={}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-revision-test-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root = path.join(directory,'project'), {project,projectId} = check(await createProject(root,{title:'Revision'}),'created');
  const file=path.join(directory,'source.wav'); await fs.writeFile(file,waveBytes({durationSeconds:2,sampleRate:48000,channels:2}));
  const asset=check(await project.importAsset({assetId:'source',sourcePath:file,contentType:'audio/wav'}),'imported').asset;
  const definition={schemaVersion:1,definitionId:'mix_definition',frameRate:{numerator:25,denominator:1},durationFrames:25,
    master:{sampleRate:48000,channels:2},buses:[{id:'fx'}],tracks:[{id:'sfx',category:'sfx',busId:'fx',events:[{id:'hit',source:{assetId:'source',checksum:asset.checksum},startFrame:3,durationFrames:5}]}]};
  const mix={id:'mix',title:'Mix',kind:'utility',executor:{id:'whihm',type:'utility',tool:'audio-production',mayCostMoney:false,requiresConfirmation:false},
    inputs:[{id:'definition',type:'json',required:true},{id:'sources',type:'asset',required:true,cardinality:'many'}],outputs:[{id:'audio',type:'audio'}],parameters:{definition,sources:[{$asset:'source'}]}};
  const inspect={id:'inspect',title:'Inspect mix',kind:'utility',executor:{id:'whihm',type:'utility',tool:'media-inspection',mayCostMoney:false,requiresConfirmation:false},inputs:[{id:'assetId',type:'audio',required:true}],outputs:[{id:'facts',type:'json'}],parameters:{}};
  const unrelated={...structuredClone(inspect),id:'unrelated',title:'Unrelated source',parameters:{assetId:{$asset:'source'}}};
  const nodes=[mix,inspect,unrelated];
  if(gate) {nodes.push({id:'review',title:'Human',kind:'review',executor:{id:'human',type:'control',tool:'approval',mayCostMoney:false,requiresConfirmation:true},inputs:[],outputs:[{id:'approved',type:'boolean'}],parameters:{reason:'Review changed mix'},dependencies:['mix']});inspect.dependencies=['review'];}
  const workflow=createWorkflow({workflowId:'production',name:'Revision fixture',nodes,edges:[{id:'mixed_inspect',source:{nodeId:'mix',portId:'audio'},target:{nodeId:'inspect',portId:'assetId'}}],assets:[{id:'source',type:'audio',localPath:asset.path,checksum:{algorithm:'sha256',value:asset.checksum}}]});
  const base={...workflow,nodes:[],edges:[]};check(await project.addWorkflowToProject(base),'added');
  const engine=createWorkflowExecution(),agent=createAgentExecution({engine}),plan=compileAgentWorkflowPlan({planId:'original',projectId,base,workflow,objective:'Render the authored audio fixture'}),args={project,projectId,root};
  const planned=check(await agent.plan({...args,plan}),'validated'); check(await agent.apply({...args,executionId:'original',planHash:planned.planHash,allowExecution:true}),'ready');
  let original=await agent.execute({...args,executionId:'original',allowExecution:true});
  if(gate){assert.equal(original.status,'awaiting_approval');await engine.approve({runId:original.runId,nodeId:'review',decision:'approve',origin:'human',expectedRevision:original.run.revision,allowExecution:true});original=await agent.continue({...args,executionId:'original',allowExecution:true});}
  check(original,'completed');
  const f={directory,root,project,projectId,workflow,engine,agent,run:original.run};f.service=createCreativeRevision({agent,engine});await makeQc(f);return f;
}
async function execute(f, planned) {return f.service.run({...ctx(f),revisionId:f.request.requestId,planHash:planned.planHash,allowExecution:true});}

test('real timing correction uses Agent edits, same run, selective rerun and immutable new QC', async t=>{
  const f=await fixture(t);assert.equal(f.qc.result.state,'REVISION_NEEDED');
  const before=await fs.readFile(path.join(f.root,f.qc.record.path)),plan=await f.service.plan({...ctx(f),request:f.request});
  assert.equal(plan.state,'READY',JSON.stringify(plan));assert.equal(plan.classification,'SAFE_DETERMINISTIC');
  assert.deepEqual(plan.proposal.expectedStaleNodes,['inspect','mix']);assert.deepEqual(plan.proposal.preservedNodes,['unrelated']);
  assert.equal(plan.proposal.findingActionMapping[0].changes.startFrame,1);
  assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),f.run.workflowHash);
  assert.equal((await f.service.plan({...ctx(f),request:f.request})).planHash,plan.planHash);
  assert.equal(code(await f.service.run({...ctx(f),revisionId:'revision_one',planHash:plan.planHash})),'EXECUTION_NOT_AUTHORIZED');
  const r=await execute(f,plan);assert.equal(r.state,'PASS',JSON.stringify(r));
  assert.equal(r.agent.runId,f.run.runId);assert.equal(r.agent.run.nodes.mix.attempts,2);assert.equal(r.agent.run.nodes.inspect.attempts,2);
  assert.equal(r.agent.run.nodes.unrelated.attempts,1);assert.equal(r.agent.run.nodes.mix.history.at(-1).status,'stale');
  assert.equal(r.recheck.result.state,'PASS');assert.notEqual(r.recheck.record.assetId,f.qc.record.assetId);
  assert.deepEqual(await fs.readFile(path.join(f.root,f.qc.record.path)),before);
  assert.equal(check(await getCreativeQc({...ctx(f),record:f.qc.record}),'ok').result.state,'REVISION_NEEDED');
  assert.equal(r.records.length,2);assert.ok(r.agent.audit.some(a=>a.phase==='history'));
  assert.equal((await execute(f,plan)).status,'rejected');
});
for(const [name, mutate] of [
  ['schema',r=>r.schemaVersion=2],['qc_ref',r=>r.sourceQc.checksum='bad'],['duplicate_findings',r=>r.findingIds.push('timing')],
  ['cycle',r=>r.cycle=0],['max_cycles',r=>r.maxCycles=3],['unknown_field',r=>r.shell='echo'],['policy',r=>r.stopPolicy=[]]
])test(`contract rejects ${name}`,()=>{
  const r={schemaVersion:1,requestId:'r',projectId:'p',workflowId:'w',expectedWorkflowHash:'a'.repeat(64),sourceQc:{assetId:'qc',checksum:'b'.repeat(64)},agentExecutionId:'a',runId:'run',findingIds:['timing'],scope:{nodeIds:['mix'],families:['audio_event']},cycle:1,maxCycles:2,executionPolicy:'review',stopPolicy,intents:[]};mutate(r);assert.throws(()=>validateRevisionRequest(r));
});
test('QC checksum mismatch and changed workflow reject before mutation',async t=>{
  const f=await fixture(t),bad=structuredClone(f.request);bad.sourceQc.checksum='0'.repeat(64);
  assert.equal((await f.service.plan({...ctx(f),request:bad})).status,'rejected');
  const previous=await f.agent.get({executionId:'original'}),definition=structuredClone(f.workflow.nodes[0].parameters.definition);definition.master.gainDb=-1;
  const change={...previous.plan,planId:'other_edit',previousExecutionId:'original',expectedWorkflowHash:f.run.workflowHash,actions:[{id:'change',type:'set-node-parameter',dependsOn:[],command:{type:'set-node-parameter',targetId:'mix',parameterPath:'/definition',value:definition}},{id:'run',type:'run-workflow',dependsOn:['change']}]};
  const changed=check(await f.agent.plan({...ctx(f),plan:change}),'validated');check(await f.agent.apply({...ctx(f),executionId:'other_edit',planHash:changed.planHash,allowExecution:true}),'ready');
  assert.equal(code(await f.service.plan({...ctx(f),request:f.request})),'REVISION_STALE_REVIEW');
});
test('artifact mutation rejects stale QC without edits',async t=>{
  const f=await fixture(t),out=f.run.nodes.mix.result.output;await fs.appendFile(path.join(f.root,out.path),'mutation');
  assert.equal((await f.service.plan({...ctx(f),request:f.request})).status,'rejected');
});
test('compatible findings combine into one atomic parameter edit; conflicts reject',async t=>{
  const f=await fixture(t);await makeQc(f,[requirement({type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,toleranceFrames:0}),
    requirement({type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,durationFrames:4,toleranceFrames:0},{id:'duration'})]);
  const p=await f.service.plan({...ctx(f),request:f.request});assert.equal(p.state,'READY',JSON.stringify(p));
  assert.equal(p.proposal.agentPlan.actions.length,2);assert.equal(p.proposal.findingActionMapping.length,2);
  assert.equal((await execute(f,p)).state,'PASS');
  const g=await fixture(t);g.request.intents=[1,2].map(startFrame=>({findingId:'timing',nodeId:'mix',family:'audio_event',elementId:'hit',capabilityId:'PRODUCE_AUDIO_MIX',changes:{startFrame},expectedOutcome:'Restore authored onset'}));
  assert.equal(code(await g.service.plan({...ctx(g),request:g.request})),'REVISION_CONFLICT_REQUIRES_REASONING');
  assert.equal(hashWorkflow((await g.project.getProjectWorkflow('production')).workflow),g.run.workflowHash);
});
test('canonical invalid parameters reject the whole plan; scope cannot authorize executor edits',async t=>{
  const f=await fixture(t);f.request.intents=[{findingId:'timing',nodeId:'mix',family:'audio_event',elementId:'hit',capabilityId:'PRODUCE_AUDIO_MIX',changes:{startFrame:-1},expectedOutcome:'Fix'}];
  assert.equal((await f.service.plan({...ctx(f),request:f.request})).status,'rejected');
  f.request.intents[0].changes={executor:'other'};assert.equal(code(await f.service.plan({...ctx(f),request:f.request})),'REVISION_PARAMETER_UNSUPPORTED');
  assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),f.run.workflowHash);
});
test('human review and subjective criticism stop without edits',async t=>{
  const f=await fixture(t);await makeQc(f,[requirement({type:'assessment'},{category:'HUMAN_ONLY',humanReview:'required'})]);
  const p=await f.service.plan({...ctx(f),request:f.request});assert.equal(p.state,'HUMAN_REVIEW_REQUIRED');assert.equal(p.proposal.agentPlan,null);
  assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),f.run.workflowHash);
});
test('ambiguous provider state blocks before any apply/resume/submission',async t=>{
  const f=await fixture(t);let calls=0;const service=createCreativeRevision({agent:f.agent,engine:{get:async()=>({...f.run,nodes:{...f.run.nodes,remote:{uncertain:true}}}),resume:()=>calls++}});
  assert.equal(code(await service.plan({...ctx(f),request:f.request})),'REVISION_PROVIDER_UNCERTAIN');assert.equal(calls,0);
  assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),f.run.workflowHash);
});
test('existing approval checkpoint requires real human approval after corrected producer reruns',async t=>{
  const f=await fixture(t,{gate:true}),p=await f.service.plan({...ctx(f),request:f.request});assert.equal(p.classification,'APPROVAL_REQUIRED');
  assert.equal(code(await execute(f,p)),'REVISION_PROPOSAL_REVIEW_REQUIRED');
  const r=await f.service.run({...ctx(f),revisionId:'revision_one',planHash:p.planHash,allowExecution:true,approveProposal:true});
  assert.equal(r.state,'AWAITING_APPROVAL',JSON.stringify(r));assert.equal(r.recheck,null);
  const rejected=await f.service.continue({...ctx(f),revisionId:'revision_one',allowExecution:true});assert.equal(rejected.state,'AWAITING_APPROVAL');
  const latest=await f.engine.get({runId:r.agent.runId});await f.engine.approve({runId:latest.runId,nodeId:'review',decision:'approve',origin:'human',expectedRevision:latest.revision,allowExecution:true});
  const done=await f.service.continue({...ctx(f),revisionId:'revision_one',allowExecution:true});assert.equal(done.state,'PASS',JSON.stringify(done));
});
test('projection/planning expose bounded local revision contract dynamically',()=>{
  assert.ok(projectCapabilities().capabilities.some(c=>c.id==='PLAN_CREATIVE_REVISION'));
  const entry=getExecutorContext('creative-revision').executor;assert.equal(entry.runtime.class,'local');assert.equal(entry.controls.request.limits.cycles,2);
  assert.equal(getCapabilityContext('PLAN_CREATIVE_REVISION').executors[0].id,'creative-revision');
});

test('two explicit unsuccessful revisions reach a session-owned limit; root reset is refused',async t=>{
  const f=await fixture(t);
  const intent=startFrame=>({findingId:'timing',nodeId:'mix',family:'audio_event',elementId:'hit',capabilityId:'PRODUCE_AUDIO_MIX',changes:{startFrame},expectedOutcome:'Explicit candidate correction'});
  f.request.intents=[intent(2)];const p=await f.service.plan({...ctx(f),request:f.request}),first=await execute(f,p);
  assert.equal(first.state,'REVISION_NEEDED',JSON.stringify(first));
  const secondRequest={...f.request,requestId:'revision_two',sourceQc:ref(first.recheck.record),agentExecutionId:first.proposal.agentPlan.planId,
    expectedWorkflowHash:first.agent.resultingHash,cycle:2,previousRevisionId:'revision_one',intents:[intent(4)]};
  const second=await f.service.plan({...ctx(f),request:secondRequest});assert.equal(second.state,'READY',JSON.stringify(second));
  const done=await f.service.run({...ctx(f),revisionId:'revision_two',planHash:second.planHash,allowExecution:true});
  assert.equal(done.state,'LIMIT_REACHED',JSON.stringify(done));assert.equal(done.recheck.result.state,'REVISION_NEEDED');
  const reset={...secondRequest,requestId:'reset',cycle:1,sourceQc:ref(done.recheck.record),agentExecutionId:done.proposal.agentPlan.planId,expectedWorkflowHash:done.agent.resultingHash};delete reset.previousRevisionId;
  assert.equal(code(await f.service.plan({...ctx(f),request:reset})),'REVISION_CHAIN_REQUIRED');
  assert.equal(done.agent.run.nodes.mix.attempts,3);assert.equal(done.agent.run.nodes.unrelated.attempts,1);
});
test('real non-timing dimensions correction requires structured intent and canonical Timeline validation',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-revision-canvas-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'project'),{project,projectId}=check(await createProject(root,{title:'Canvas'}),'created');
  const file=path.join(directory,'image.png');await fs.writeFile(file,await imageBytes());
  const asset=check(await project.importAsset({assetId:'image',sourcePath:file,contentType:'image/png'}),'imported').asset;
  const timeline={schemaVersion:1,timelineId:'canvas',canvas:{width:64,height:64},frameRate:{numerator:25,denominator:1},durationFrames:10,audio:{policy:'none'},render:{container:'mp4',videoCodec:'h264',videoBitrate:100000},tracks:[{id:'images',type:'overlay',order:0,items:[{id:'still',type:'image',source:{assetId:'image',checksum:asset.checksum},startFrame:0,durationFrames:10}]}]};
  const node={id:'timeline',title:'Canvas',kind:'utility',executor:{id:'whihm',type:'utility',tool:'timeline-composition',mayCostMoney:false,requiresConfirmation:false},inputs:[{id:'timeline',type:'json',required:true},{id:'sources',type:'asset',required:true,cardinality:'many'}],outputs:[{id:'video',type:'video'}],parameters:{timeline,sources:[{$asset:'image'}]}};
  const workflow=createWorkflow({workflowId:'canvas_workflow',name:'Canvas',nodes:[node],assets:[{id:'image',type:'image',localPath:asset.path,checksum:{algorithm:'sha256',value:asset.checksum}}]}),base={...workflow,nodes:[]};check(await project.addWorkflowToProject(base),'added');
  const engine=createWorkflowExecution(),agent=createAgentExecution({engine}),args={root,project,projectId},plan=compileAgentWorkflowPlan({planId:'original',projectId,base,workflow,objective:'Exact dimensions'});
  const p=check(await agent.plan({...args,plan}),'validated');check(await agent.apply({...args,executionId:'original',planHash:p.planHash,allowExecution:true}),'ready');const original=check(await agent.execute({...args,executionId:'original',allowExecution:true}),'completed');
  const f={...args,workflow,run:original.run};const qc=check(await evaluateCreativeQc({...args,request:qcRequest(f,original.run.nodes.timeline.result.output,[requirement({type:'dimensions',width:32,height:32},{id:'size',category:'TECHNICAL',target:{nodeId:'timeline',parameterFamily:'canvas'}})]),allowExecution:true}),'succeeded');assert.equal(qc.result.state,'REVISION_NEEDED');
  const service=createCreativeRevision({agent,engine}),request={schemaVersion:1,requestId:'resize',projectId,workflowId:workflow.workflowId,expectedWorkflowHash:original.resultingHash,sourceQc:ref(qc.record),agentExecutionId:'original',runId:original.runId,findingIds:['size'],scope:{nodeIds:['timeline'],families:['timeline_output']},cycle:1,maxCycles:2,executionPolicy:'safe_deterministic',stopPolicy,intents:[]};
  // QC prose alone cannot produce a canvas edit.
  assert.equal((await service.plan({...args,request})).state,'EXTERNAL_REASONING_REQUIRED');
  request.requestId='resize_explicit';request.intents=[{findingId:'size',nodeId:'timeline',family:'timeline_output',changes:{canvas:{width:32,height:32}},capabilityId:'COMPOSE_TIMELINE',expectedOutcome:'32 by 32 delivery'}];
  const revision=await service.plan({...args,request});assert.equal(revision.state,'READY',JSON.stringify(revision));
  const done=await service.run({...args,revisionId:request.requestId,planHash:revision.planHash,allowExecution:true});assert.equal(done.state,'PASS',JSON.stringify(done));
  assert.equal(done.recheck.result.findings[0].observed.facts.streams[0].dimensions.width,32);
});
test('REAL anime/action defect +2 frames -> QC -> Agent revision -> selective workflow rerun -> QC PASS -> benchmark PASS',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-revision-action-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const result=await runActionBenchmark(directory,{dispatch:async({engine,project,root,workflow})=>{
    const projectId=(await project.getManifest()).manifest.projectId,base={...workflow,nodes:[],edges:[]};check(await project.addWorkflowToProject(base),'added');
    const defective=structuredClone(workflow);for(const e of defective.nodes.find(n=>n.id==='mix').parameters.definition.tracks.find(t=>t.id==='impacts').events)if(e.startFrame===75)e.startFrame+=2;
    const agent=createAgentExecution({engine}),args={project,projectId,root},plan=compileAgentWorkflowPlan({planId:'original',projectId,base,workflow:defective,objective:'Execute authored benchmark with a controlled shifted-impact defect'});
    const p=check(await agent.plan({...args,plan}),'validated');check(await agent.apply({...args,executionId:'original',planHash:p.planHash,allowExecution:true}),'ready');
    const original=check(await agent.execute({...args,executionId:'original',allowExecution:true}),'completed'),f={...args,workflow:defective,run:original.run};
    const requirements=['thump','crack','detail'].map(role=>requirement({type:'lineage_event',family:'audio',itemId:`${role}_0`,startFrame:75,toleranceFrames:0},{id:`${role}_sync`,target:{nodeId:'mix',parameterFamily:'audio',audioEventId:`${role}_0`}}));
    const qc=check(await evaluateCreativeQc({...args,request:qcRequest(f,original.run.nodes.mix.result.output,requirements),allowExecution:true}),'succeeded');assert.equal(qc.result.state,'REVISION_NEEDED');
    const service=createCreativeRevision({agent,engine}),request={schemaVersion:1,requestId:'repair_impacts',projectId,workflowId:workflow.workflowId,expectedWorkflowHash:original.resultingHash,sourceQc:ref(qc.record),agentExecutionId:'original',runId:original.runId,findingIds:requirements.map(r=>r.id),scope:{nodeIds:['mix'],families:['audio_event']},cycle:1,maxCycles:2,executionPolicy:'safe_deterministic',stopPolicy,intents:[]};
    const proposal=await service.plan({...args,request});assert.equal(proposal.state,'READY',JSON.stringify(proposal));
    assert.deepEqual(proposal.proposal.preservedNodes,['analysis','timeline']);
    const corrected=await service.run({...args,revisionId:request.requestId,planHash:proposal.planHash,allowExecution:true});assert.equal(corrected.state,'PASS',JSON.stringify(corrected));
    assert.equal(corrected.agent.run.nodes.analysis.attempts,1);assert.equal(corrected.agent.run.nodes.timeline.attempts,1);
    for(const id of ['mix','mux','inspect'])assert.equal(corrected.agent.run.nodes[id].attempts,2);
    assert.equal(corrected.agent.run.nodes.timeline.result.output.assetId,original.run.nodes.timeline.result.output.assetId);
    assert.notEqual(corrected.agent.run.nodes.mix.result.output.assetId,original.run.nodes.mix.result.output.assetId);
    assert.equal((await getCreativeQc({...args,record:qc.record})).result.state,'REVISION_NEEDED');
    return corrected.agent.run;
  }});assert.equal(result.status,'PASS',JSON.stringify(result.issues));
});

test('fixed host/preload surfaces retain permission and shared Agent/Workflow session boundaries',async t=>{
  const f=await fixture(t),{createWorkflowHost}=await import('../lib/whihm-execution/host.mjs');
  const host=createWorkflowHost({callRuntime:()=>{throw Error('No providers allowed');}});t.after(()=>host.dispose());
  const workflow={...f.workflow,workflowId:'host_production'},base={...workflow,nodes:[],edges:[]};check(await f.project.addWorkflowToProject(base),'added');
  const projectHandle=check(await host.invoke('openProject',{projectRoot:f.root}),'opened').projectHandle;
  const plan=compileAgentWorkflowPlan({planId:'host_original',projectId:f.projectId,base,workflow,objective:'Host revision'}),p=check(await host.invoke('planAgentExecution',{projectHandle,plan}),'validated');
  check(await host.invoke('applyAgentPlan',{projectHandle,executionId:plan.planId,planHash:p.planHash,allowExecution:true}),'ready');
  const run=check(await host.invoke('runAgentExecution',{projectHandle,executionId:plan.planId,allowExecution:true}),'completed');
  const q=qcRequest({...f,workflow,run:run.run},run.run.nodes.mix.result.output,[requirement({type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,toleranceFrames:0})]);
  const qc=check(await host.invoke('evaluateCreativeQc',{projectHandle,request:q,allowExecution:true}),'succeeded');
  const request={...f.request,requestId:'host_revision',workflowId:workflow.workflowId,expectedWorkflowHash:run.resultingHash,sourceQc:ref(qc.record),agentExecutionId:plan.planId,runId:run.runId};
  const proposed=await host.invoke('planCreativeRevision',{projectHandle,request});assert.equal(proposed.state,'READY',JSON.stringify(proposed));
  assert.equal(code(await host.invoke('runCreativeRevision',{projectHandle,revisionId:request.requestId,planHash:proposed.planHash})),'EXECUTION_NOT_AUTHORIZED');
  assert.equal(code(await host.invoke('continueCreativeRevision',{projectHandle,revisionId:request.requestId,allowExecution:true,rerunNodeIds:['unrelated']})),'HOST_REQUEST_INVALID');
  const done=await host.invoke('runCreativeRevision',{projectHandle,revisionId:request.requestId,planHash:proposed.planHash,allowExecution:true});assert.equal(done.state,'PASS',JSON.stringify(done));
  assert.equal((await host.invoke('getCreativeRevision',{projectHandle,revisionId:request.requestId})).planHash,proposed.planHash);
  assert.equal((await host.invoke('getWorkflowRun',{projectHandle,runId:run.runId})).nodes.unrelated.attempts,1);
});

test('subjective rejection needs structured external reasoning; neither prose nor new edits fabricate acceptance',async t=>{
  const f=await fixture(t),{recordCreativeQcHumanAssessment}=await import('../lib/whihm-execution/creative-qc.mjs');
  const request=qcRequest(f,f.run.nodes.mix.result.output,[requirement({type:'assessment'},{category:'SUBJECTIVE_CREATIVE',description:'Opening lacks energy'})]);
  const assessment=check(await recordCreativeQcHumanAssessment({...ctx(f),request,requirementId:'timing',origin:'human',decision:'REJECT',evaluator:{id:'fixture_human',version:'1'},notes:'Controlled rejection fixture, not an aesthetic model judgment',allowExecution:true}),'recorded');
  request.reviewRefs=[assessment.reviewId];const qc=check(await evaluateCreativeQc({...ctx(f),request,allowExecution:true}),'succeeded');assert.equal(qc.result.state,'REVISION_NEEDED');
  const revision={...f.request,requestId:'subjective',sourceQc:ref(qc.record),instructions:'Make it premium and high energy'};
  const stopped=await f.service.plan({...ctx(f),request:revision});assert.equal(stopped.state,'EXTERNAL_REASONING_REQUIRED');assert.equal(stopped.proposal.agentPlan,null);
  revision.requestId='subjective_structured';revision.intents=[{findingId:'timing',nodeId:'mix',family:'audio_event',elementId:'hit',capabilityId:'PRODUCE_AUDIO_MIX',changes:{startFrame:1},expectedOutcome:'Explicit user-directed onset adjustment'}];
  const proposal=await f.service.plan({...ctx(f),request:revision});assert.equal(proposal.state,'READY',JSON.stringify(proposal));
  const done=await f.service.run({...ctx(f),revisionId:revision.requestId,planHash:proposal.planHash,allowExecution:true});
  assert.equal(done.state,'HUMAN_REVIEW_REQUIRED');assert.deepEqual(done.recheck.result.request.reviewRefs,[]);
});
test('safe deterministic execution failure stops and cannot be blindly retried',async t=>{
  const f=await fixture(t),p=await f.service.plan({...ctx(f),request:f.request});let resumes=0;
  f.engine.resume=async()=>{resumes++;return {...f.run,status:'failed',nodes:{...f.run.nodes,mix:{...f.run.nodes.mix,status:'failed',uncertain:false,diagnostics:[{code:'FIXTURE_DETERMINISTIC_FAILURE'}]}}};};
  const stopped=await execute(f,p);assert.equal(stopped.state,'FAILED',JSON.stringify(stopped));assert.equal(resumes,1);
  assert.equal((await execute(f,p)).status,'rejected');assert.equal((await f.service.continue({...ctx(f),revisionId:f.request.requestId,allowExecution:true})).status,'rejected');
  assert.equal(resumes,1);assert.equal((await f.engine.get({runId:f.run.runId})).nodes.unrelated.status,'completed');
});
test('uncertainty introduced after planning blocks apply; submitted operations are never replaced',async t=>{
  const f=await fixture(t);let uncertain=false,calls=0;const engine={get:async()=>uncertain?{...f.run,nodes:{...f.run.nodes,remote:{uncertain:true}}}:f.run};
  const agent={get:args=>f.agent.get(args),plan:args=>f.agent.plan(args),apply:()=>{calls++;throw Error('must not apply');}};
  const service=createCreativeRevision({agent,engine}),p=await service.plan({...ctx(f),request:f.request});assert.equal(p.state,'READY',JSON.stringify(p));uncertain=true;
  const blocked=await service.run({...ctx(f),revisionId:f.request.requestId,planHash:p.planHash,allowExecution:true});assert.equal(code(blocked),'REVISION_PROVIDER_UNCERTAIN');assert.equal(calls,0);
});
test('unavailable runtime blocks revision validation through existing readiness checks',async t=>{
  const f=await fixture(t),{configureMultimediaRuntime}=await import('../lib/whihm-execution/multimedia-runtime.mjs');
  try {
    configureMultimediaRuntime({env:{},configuredDir:path.join(f.directory,'absent')});await getMultimediaRuntimeStatus();
    assert.equal((await f.service.plan({...ctx(f),request:f.request})).state,'BLOCKED');
    assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),f.run.workflowHash);
  } finally {configureMultimediaRuntime({env:process.env});assert.equal((await getMultimediaRuntimeStatus()).availability,'ready');}
});

test('unfinished source run is not adopted and runtime observation timestamps do not change plan identity',async t=>{
  const f=await fixture(t),unfinished=createCreativeRevision({agent:f.agent,engine:{get:async()=>({...f.run,status:'paused'})}});
  assert.equal(code(await unfinished.plan({...ctx(f),request:f.request})),'REVISION_SOURCE_RUN_NOT_COMPLETED');
  const first=await f.service.plan({...ctx(f),request:f.request});assert.equal(first.state,'READY');
  const changed=structuredClone(first.agent);changed.effects[0].runtimeRequirements.multimedia.snapshot.observedAt='2020-01-01T00:00:00.000Z';
  const other=createCreativeRevision({agent:{get:a=>f.agent.get(a),plan:async()=>changed},engine:f.engine});
  const second=await other.plan({...ctx(f),request:f.request});assert.equal(second.planHash,first.planHash);
  assert.equal(second.proposal.mappingHash,first.proposal.mappingHash);
});

test('old recorded measurements block recheck and cannot be blindly continued',async t=>{
  const f=await fixture(t),old=f.run.nodes.mix.result.output,file=path.join(f.directory,'measurement.json');
  await fs.writeFile(file,JSON.stringify({target:ref(old),value:true}));
  const evidence=check(await f.project.importAsset({sourcePath:file,contentType:'application/json',role:'recorded-measurement'}),'imported').asset;
  const q=qcRequest(f,old,[requirement({type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,toleranceFrames:0}),requirement({type:'evidence_value',evidenceId:'measurement',path:['value'],value:true},{id:'recorded_fact'})]);
  q.evidence=[{id:'measurement',...ref(evidence),sourceClass:'recorded_deterministic',artifactId:'master'}];
  const qc=check(await evaluateCreativeQc({...ctx(f),request:q,allowExecution:true}),'succeeded');assert.equal(qc.result.state,'REVISION_NEEDED');f.request.sourceQc=ref(qc.record);
  const plan=await f.service.plan({...ctx(f),request:f.request}),done=await execute(f,plan);assert.equal(done.state,'BLOCKED');
  assert.ok(done.recheck.result.findings.some(x=>x.reason==='QC_EVIDENCE_TARGET_MISMATCH'));
  assert.equal(code(await f.service.continue({...ctx(f),revisionId:f.request.requestId,allowExecution:true})),'REVISION_CONTINUATION_UNAVAILABLE');
  assert.equal((await f.engine.get({runId:f.run.runId})).nodes.mix.attempts,2);
});

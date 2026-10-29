import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createProject,createWorkflow,hashWorkflow} from 'whihm-workflow-core';
import {createExternalDirector,directorManifest} from '../lib/whihm-execution/external-director.mjs';
import {compileAgentWorkflowPlan} from '../lib/whihm-execution/agent-execution.mjs';
import {waveBytes} from './helpers/mediaInspectionFixtures.mjs';
import {qcDefinitionHash} from '../lib/whihm-execution/creative-qc-contract.mjs';

async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-director-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project'),{project,projectId}=await createProject(root,{title:'Director'});
  const file=path.join(dir,'source.wav');await fs.writeFile(file,waveBytes({durationSeconds:2,sampleRate:48000,channels:2}));
  const asset=(await project.importAsset({assetId:'source',sourcePath:file,contentType:'audio/wav'})).asset;
  const base=createWorkflow({workflowId:'production',name:'Director',assets:[{id:'source',type:'audio',localPath:asset.path,checksum:{algorithm:'sha256',value:asset.checksum}}]});
  assert.equal((await project.addWorkflowToProject(base)).status,'added');
  const definition={schemaVersion:1,definitionId:'mix',frameRate:{numerator:25,denominator:1},durationFrames:25,master:{sampleRate:48000,channels:2},buses:[{id:'fx'}],tracks:[{id:'sfx',category:'sfx',busId:'fx',events:[{id:'hit',source:{assetId:'source',checksum:asset.checksum},startFrame:3,durationFrames:5}]}]};
  const node={id:'mix',title:'Mix',kind:'utility',executor:{id:'whihm',type:'utility',tool:'audio-production',mayCostMoney:false,requiresConfirmation:false},inputs:[{id:'definition',type:'json',required:true},{id:'sources',type:'asset',required:true,cardinality:'many'}],outputs:[{id:'audio',type:'audio'}],parameters:{definition,sources:[{$asset:'source'}]}};
  const workflow={...base,nodes:[node]},plan=compileAgentWorkflowPlan({planId:'original',projectId,base,workflow,objective:'Execute explicit local intent'});
  const bridge=await createExternalDirector({projectRoot:root});t.after(()=>bridge.close());
  const call=async(tool,args={})=>{const r=await bridge.call({tool,arguments:args});assert.equal(r.status,'ok',JSON.stringify(r));return r.data;};
  return {dir,root,project,projectId,asset,base,workflow,plan,bridge,call};
}
test('fixed manifest separates read/plan/act and excludes credential, approval and arbitrary controls',()=>{
  const m=directorManifest();assert.equal(m.schemaVersion,1);assert.equal(m.transport,'json-lines-stdio');
  for(const t of m.tools){assert.ok(['READ','PLAN','ACT'].includes(t.class));assert.equal(t.inputSchema.additionalProperties,false);assert.ok(t.outputSchema);assert.equal(typeof t.providerSideEffects,'boolean');assert.ok(!/credential|shell|http|approve|import_asset/.test(t.name));}
});
test('real local Agent -> audio render -> inspection -> QC -> bounded Creative Revision -> new QC',async t=>{
  const f=await fixture(t),{call}=f;
  const context=await call('get_project_context');assert.equal(context.projectId,f.projectId);assert.equal(context.workflows[0].hash,hashWorkflow(f.base));assert.equal(context.assets[0].assetId,'source');assert.equal(context.assets[0].path,undefined);
  assert.ok((await call('get_capabilities')).capabilities.length);assert.ok((await call('get_provider_center')).providers.length);
  assert.equal((await call('get_workflow',{workflowId:'production'})).hash,hashWorkflow(f.base));
  const planned=await call('plan_agent_execution',{plan:f.plan});assert.equal(planned.status,'validated');
  await call('apply_agent_plan',{executionId:'original',planHash:planned.planHash,allowExecution:true,commandId:'apply'});
  const runArgs={executionId:'original',allowExecution:true,commandId:'run'};
  const result=await call('run_agent_execution',runArgs);assert.equal(result.status,'completed',JSON.stringify(result));
  assert.deepEqual(await call('run_agent_execution',runArgs),result);
  const run=await call('get_workflow_run',{runId:result.runId});assert.equal(run.nodes.mix.attempts,1);
  const output=run.nodes.mix.result.output;assert.equal((await call('inspect_media',{assetId:output.assetId})).status,'succeeded');
  const request={schemaVersion:1,requestId:'qc_original',objective:'Impact at frame 1',artifacts:[{id:'master',assetId:output.assetId,checksum:output.checksum,role:'master'}],requirements:[{id:'timing',category:'OBJECTIVE_INTENT',required:true,severity:'ERROR',humanReview:'never',artifactId:'master',target:{nodeId:'mix',parameterFamily:'audio',audioEventId:'hit'},rule:{type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,toleranceFrames:0}}],evidence:[],reviewRefs:[],policy:{allowRecordedDeterministic:true,allowExternalAssessments:false},humanReview:{required:false},association:{workflowId:'production',workflowHash:run.workflowHash,runId:run.runId}};
  const qc=await call('evaluate_creative_qc',{request,allowExecution:true,commandId:'qc'});assert.equal(qc.result.state,'REVISION_NEEDED');
  assert.equal((await call('get_creative_qc',{record:qc.record})).result.state,'REVISION_NEEDED');
  const revision={schemaVersion:1,requestId:'revision',projectId:f.projectId,workflowId:'production',expectedWorkflowHash:run.workflowHash,sourceQc:{assetId:qc.record.assetId,checksum:qc.record.checksum},agentExecutionId:'original',runId:run.runId,findingIds:['timing'],scope:{nodeIds:['mix'],families:['audio_event']},cycle:1,maxCycles:2,executionPolicy:'safe_deterministic',stopPolicy:['pass','review','blocked','failed','uncertain','limit','stale'],intents:[]};
  const rp=await call('plan_creative_revision',{request:revision});assert.equal(rp.state,'READY',JSON.stringify(rp));
  const revised=await call('run_creative_revision',{revisionId:'revision',planHash:rp.planHash,allowExecution:true,commandId:'revise'});assert.equal(revised.state,'PASS',JSON.stringify(revised));
  assert.equal(revised.agent.runId,run.runId);assert.equal(revised.agent.run.nodes.mix.attempts,2);
  assert.equal((await call('get_creative_revision',{revisionId:'revision'})).state,'PASS');
  assert.equal((await call('get_creative_qc',{record:qc.record})).result.state,'REVISION_NEEDED');
  assert.ok(f.bridge.getAudit().some(a=>a.tool==='run_creative_revision'&&a.class==='ACT'));
});
test('unknown tools, dangerous fields, stale plans and replay conflicts fail closed',async t=>{
  const f=await fixture(t);
  for(const input of [{tool:'set_provider_credential',arguments:{}},{tool:'get_project_assets',arguments:{path:'/etc/passwd'}},{tool:'inspect_media',arguments:{assetId:'/etc/passwd'}},{tool:'get_workflow',arguments:{workflowId:'production',projectRoot:'/etc'}}])assert.equal((await f.bridge.call(input)).status,'error');
  const p=await f.call('plan_agent_execution',{plan:f.plan});
  await f.project.updateWorkflowInProject({workflow:{...f.base,name:'Changed'},expectedHash:hashWorkflow(f.base)});
  const input={tool:'apply_agent_plan',arguments:{executionId:'original',planHash:p.planHash,allowExecution:true,commandId:'apply'}};
  const r=await f.bridge.call(input);assert.equal(r.error.code,'STALE_STATE');assert.deepEqual(await f.bridge.call(input),r);
  input.arguments.planHash='f'.repeat(64);assert.equal((await f.bridge.call(input)).error.nativeCode,'DIRECTOR_COMMAND_CONFLICT');
});
test('fake credentials never appear in discovery, responses or audit; failures are sanitized',async t=>{
  const f=await fixture(t),fake='RECOGNIZABLE_SECRET_98765',meta='RECOGNIZABLE_META_12345',muapi='RECOGNIZABLE_MUAPI_12345';
  const bridge=await createExternalDirector({projectRoot:f.root,env:{HF_API_KEY_SECRET:fake,WHIHM_META_API_KEY:meta,MUAPI_KEY:muapi},host:{invoke:async method=>method==='openProject'?{status:'opened',projectHandle:'fixed'}:method==='getProviderStatus'?{credential:{presence:'present',source:'environment'},Authorization:fake,notes:[fake,meta,muapi]}:{status:'rejected',diagnostics:[{code:fake,stack:fake}]},dispose(){}}});t.after(()=>bridge.close());
  const r=await bridge.call({tool:'get_provider_status',arguments:{providerId:'higgsfield'}});assert.equal(r.data.credential.presence,'present');
  const failure=await bridge.call({tool:'get_capabilities',arguments:{}});
  for(const secret of [fake,meta,muapi])assert.ok(!JSON.stringify([bridge.manifest(),r,failure,bridge.getAudit()]).includes(secret));
});
test('stdio process starts explicitly, handles structured tools, and closes on EOF',async t=>{
  const f=await fixture(t);
  const child=spawn(process.execPath,['scripts/external-director.mjs','--project',f.root],{cwd:process.cwd(),env:process.env,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  child.stdin.end(JSON.stringify({tool:'get_project_assets',arguments:{}})+'\n');
  const exit=await new Promise(resolve=>child.on('close',resolve));assert.equal(exit,0,stderr);
  const lines=stdout.trim().split('\n').map(JSON.parse);assert.equal(lines[0].status,'ready');assert.equal(lines[1].data.assets[0].assetId,'source');
});
test('human checkpoint pauses canonical execution; bridge has no approval authority',async t=>{
  const f=await fixture(t);
  f.workflow.nodes.push({id:'approval',title:'Human review',kind:'review',executor:{id:'human',type:'control',tool:'approval',mayCostMoney:false,requiresConfirmation:true},inputs:[],outputs:[{id:'approved',type:'boolean'}],parameters:{reason:'Owner checkpoint'}});
  f.workflow.nodes[0].dependencies=['approval'];
  const plan=compileAgentWorkflowPlan({...f,planId:'gate',objective:'Wait for human'});
  const p=await f.call('plan_agent_execution',{plan});
  await f.call('apply_agent_plan',{executionId:'gate',planHash:p.planHash,allowExecution:true,commandId:'apply_gate'});
  const r=await f.call('run_agent_execution',{executionId:'gate',allowExecution:true,commandId:'run_gate'});
  assert.equal(r.status,'awaiting_approval');assert.equal(r.run.nodes.mix.attempts,0);
  const continued=await f.call('continue_agent_execution',{executionId:'gate',allowExecution:true,commandId:'continue_gate'});
  assert.equal(continued.status,'awaiting_approval');assert.equal(continued.run.nodes.mix.attempts,0);
  assert.equal((await f.bridge.call({tool:'approve_workflow_checkpoint',arguments:{}})).status,'error');
});
test('transport interruption consumes the action ID; remote permission is never inferred',async t=>{
  const f=await fixture(t);let submits=0;const forwarded=[];
  const bridge=await createExternalDirector({projectRoot:f.root,host:{invoke:async(method,args)=>{
    if(method==='openProject')return {status:'opened',projectHandle:'fixed'};
    forwarded.push(args);
    if(!args.allowRemoteExecution)return {status:'rejected',diagnostics:[{code:'AGENT_REMOTE_PERMISSION_REQUIRED'}]};
    submits++;throw Error('secret provider payload that must not escape');
  },dispose(){}}});t.after(()=>bridge.close());
  const request={tool:'run_agent_execution',arguments:{executionId:'remote',allowExecution:true,commandId:'missing_permission'}};
  assert.equal((await bridge.call(request)).error.code,'PAID_ACTION_REQUIRES_CONFIRMATION');assert.equal(submits,0);
  request.arguments={...request.arguments,commandId:'explicit',allowRemoteExecution:true};
  const r=await bridge.call(request);assert.equal(r.error.code,'INTERNAL_ERROR');assert.deepEqual(await bridge.call(request),r);assert.equal(submits,1);
  assert.equal(forwarded[0].allowRemoteExecution,undefined);
});
test('external assessment uses existing registered evidence contract and retains human boundary',async t=>{
  const f=await fixture(t);
  const request={schemaVersion:1,requestId:'external_qc',objective:'Externally assess supplied source',artifacts:[{id:'output',assetId:f.asset.assetId,checksum:f.asset.checksum,role:'audio'}],requirements:[{id:'pacing',category:'SUBJECTIVE_CREATIVE',required:true,severity:'ERROR',humanReview:'required',artifactId:'output',rule:{type:'assessment'}}],evidence:[],reviewRefs:[],policy:{allowRecordedDeterministic:false,allowExternalAssessments:true},humanReview:{required:false}};
  request.requirements[0].humanReview='never';
  const assessment={schemaVersion:1,evaluator:{id:'fixture_harness',type:'model',version:'1'},target:{assetId:f.asset.assetId,checksum:f.asset.checksum},definitionHash:qcDefinitionHash(request),requirementId:'pacing',decision:'ACCEPT',notes:'Structured fixture assessment',confidence:0.7,timestamp:'2026-10-28T00:00:00.000Z'};
  const file=path.join(f.dir,'assessment.json');await fs.writeFile(file,JSON.stringify(assessment));
  const a=(await f.project.importAsset({sourcePath:file,contentType:'application/json'})).asset;
  request.evidence=[{id:'model',assetId:a.assetId,checksum:a.checksum,sourceClass:'model_assessment',artifactId:'output'}];
  const r=await f.call('evaluate_creative_qc',{request,allowExecution:true,commandId:'external'});
  assert.equal(r.result.state,'PASS');
  assert.ok(JSON.stringify(r).includes('fixture_harness'));
  request.requirements[0].humanReview='required';
  const human=await f.call('evaluate_creative_qc',{request,allowExecution:true,commandId:'human_boundary'});
  assert.equal(human.result.state,'HUMAN_REVIEW_REQUIRED');
});

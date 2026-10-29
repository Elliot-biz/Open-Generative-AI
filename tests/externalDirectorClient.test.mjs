import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProject,createWorkflow,hashWorkflow} from 'whihm-workflow-core';
import {compileAgentWorkflowPlan} from '../lib/whihm-execution/agent-execution.mjs';
import {createExternalDirectorClient,ExternalDirectorClientError} from '../lib/whihm-execution/external-director-client.mjs';
import {waveBytes} from './helpers/mediaInspectionFixtures.mjs';

const repo=path.resolve(new URL('..',import.meta.url).pathname);
const ok=response=>{assert.equal(response.status,'ok',JSON.stringify(response));return response.data;};

async function fixture(t,{approval=false}={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-director-client-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'project'),created=await createProject(root,{title:'External client'}),{project,projectId}=created;
  const source=path.join(directory,'source.wav');await fs.writeFile(source,waveBytes({durationSeconds:2,sampleRate:48000,channels:2}));
  const asset=(await project.importAsset({assetId:'source',sourcePath:source,contentType:'audio/wav'})).asset;
  const base=createWorkflow({workflowId:'production',name:'External client',assets:[{id:'source',type:'audio',localPath:asset.path,checksum:{algorithm:'sha256',value:asset.checksum}}]});assert.equal((await project.addWorkflowToProject(base)).status,'added');
  const definition={schemaVersion:1,definitionId:'mix',frameRate:{numerator:25,denominator:1},durationFrames:25,master:{sampleRate:48000,channels:2},buses:[{id:'fx'}],tracks:[{id:'sfx',category:'sfx',busId:'fx',events:[{id:'hit',source:{assetId:'source',checksum:asset.checksum},startFrame:3,durationFrames:5}]}]};
  const mix={id:'mix',title:'Mix',kind:'utility',executor:{id:'whihm',type:'utility',tool:'audio-production',mayCostMoney:false,requiresConfirmation:false},inputs:[{id:'definition',type:'json',required:true},{id:'sources',type:'asset',required:true,cardinality:'many'}],outputs:[{id:'audio',type:'audio'}],parameters:{definition,sources:[{$asset:'source'}]}};
  const nodes=[mix];if(approval){nodes.push({id:'approval',title:'Owner checkpoint',kind:'review',executor:{id:'human',type:'control',tool:'approval',mayCostMoney:false,requiresConfirmation:true},inputs:[],outputs:[{id:'approved',type:'boolean'}],parameters:{reason:'External review'}});mix.dependencies=['approval'];}
  const workflow={...base,nodes},plan=compileAgentWorkflowPlan({planId:'original',projectId,base,workflow,objective:'Execute the explicit local production fixture'});
  return {directory,root,project,projectId,asset,base,workflow,plan};
}
function clientFor(f,options={}){return createExternalDirectorClient({projectRoot:f.root,env:process.env,requestTimeoutMs:120000,...options});}

test('stdio semantic review snapshot, external submission and structured revision preserve QC authority',async t=>{
 const f=await fixture(t),client=clientFor(f);t.after(()=>client.stop());await client.start();await client.refreshContext();
 const p=ok(await client.call('plan_agent_execution',{plan:f.plan}));ok(await client.call('apply_agent_plan',{executionId:'original',planHash:p.planHash,allowExecution:true}));const run=ok(await client.call('run_agent_execution',{executionId:'original',allowExecution:true})),output=run.run.nodes.mix.result.output;
 const request={schemaVersion:1,requestId:'before_review',objective:'Explicit energetic impact',artifacts:[{id:'master',assetId:output.assetId,checksum:output.checksum,role:'master'}],requirements:[{id:'timing',category:'OBJECTIVE_INTENT',required:true,severity:'ERROR',humanReview:'never',artifactId:'master',target:{nodeId:'mix',audioEventId:'hit'},rule:{type:'objective_measurement',family:'audio',metric:'startFrame',itemId:'hit',operator:'lte',value:3,tolerance:0,unit:'frames'}}],evidence:[],reviewRefs:[],policy:{allowRecordedDeterministic:true,allowExternalAssessments:false},humanReview:{required:false},association:{workflowId:'production',workflowHash:run.resultingHash,runId:run.runId}};
 request.association.workflowHash=ok(await client.call('get_workflow',{workflowId:'production'})).hash;
 const qc=ok(await client.call('evaluate_creative_qc',{request,allowExecution:true}));assert.equal(qc.result.state,'PASS');
 const review={schemaVersion:1,requestId:'semantic',projectId:f.projectId,workflowId:'production',workflowHash:request.association.workflowHash,runId:run.runId,sourceQc:{assetId:qc.record.assetId,checksum:qc.record.checksum},productionIntent:'An energetic impact opening',dimensions:['pacing_energy'],policy:{minimumActionableConfidence:'MODERATE',humanOnlyDimensions:[],allowSuggestions:true,maxFindings:4}};
 const plan=ok(await client.call('plan_semantic_creative_qc',{request:review}));const submission={schemaVersion:1,snapshotHash:plan.snapshot.snapshotHash,evaluator:{id:'external_fixture',class:'external',version:'1'},submittedAt:'2026-10-29T12:00:00.000Z',findings:[{id:'energy',interpretation:'SUBJECTIVE',dimension:'pacing_energy',target:{artifactId:'master',nodeId:'mix',audioEventId:'hit'},statement:'The impact could enter earlier for the stated direction.',evidenceRefs:['timing','production_intent'],confidence:'MODERATE',importance:'ERROR',actionability:'ACTIONABLE',rationale:'Authored impact at frame 3 is a fact; moving it to frame 1 is an explicit creative choice.',claims:[{evidenceId:'timing',value:3}],suggestedDirection:'Move the hit using structured intent.'}]};
 const reviewed=ok(await client.call('evaluate_semantic_creative_qc',{request:review,submission,allowExecution:true},{actionId:'semantic_submit'}));assert.equal(reviewed.result.state,'REVISION_NEEDED');assert.deepEqual(ok(await client.call('evaluate_semantic_creative_qc',{request:review,submission,allowExecution:true},{actionId:'semantic_submit'})),reviewed);assert.equal(ok(await client.call('get_creative_qc',{record:reviewed.record})).currentness.state,'CURRENT');assert.equal(client.getSessionState().qcId,reviewed.record.assetId);
 const revision={schemaVersion:1,requestId:'creative_change',projectId:f.projectId,workflowId:'production',expectedWorkflowHash:review.workflowHash,sourceQc:{assetId:reviewed.record.assetId,checksum:reviewed.record.checksum},agentExecutionId:'original',runId:run.runId,findingIds:['energy'],scope:{nodeIds:['mix'],families:['audio_event']},cycle:1,maxCycles:2,executionPolicy:'safe_deterministic',stopPolicy:['pass','review','blocked','failed','uncertain','limit','stale'],intents:[],structuredIntent:{schemaVersion:1,sourceFindingIds:['energy'],revisionGoal:'Move impact explicitly',requestedChanges:[{findingId:'energy',target:{type:'audio_event',nodeId:'mix',id:'hit'},operation:'move_event',value:1}],preserve:[{type:'final_duration',nodeId:'mix'}],requires:['PRODUCE_AUDIO_MIX'],acceptableSideEffects:['rerender_audio'],expectedOutcomes:[]}};
 const rp=ok(await client.call('plan_creative_revision',{request:revision}));assert.equal(rp.state,'READY',JSON.stringify(rp));const revised=ok(await client.call('run_creative_revision',{revisionId:'creative_change',planHash:rp.planHash,allowExecution:true}));assert.equal(revised.state,'HUMAN_REVIEW_REQUIRED',JSON.stringify(revised));assert.equal(ok(await client.call('get_creative_qc',{record:reviewed.record})).currentness.state,'STALE');
});

test('manifest-driven read session negotiates schemas and correlates request IDs',async t=>{
  const f=await fixture(t),client=clientFor(f);t.after(()=>client.stop());
  const manifest=await client.start();assert.equal(manifest.schemaVersion,1);assert.equal(manifest.transport,'json-lines-stdio');assert.ok(manifest.tools.length>=18);assert.ok(manifest.tools.every(tool=>tool.inputSchema&&tool.outputSchema));
  const context=await client.refreshContext();assert.equal(context.projectId,f.projectId);assert.equal(client.getSessionState().workflowHash,hashWorkflow(f.base));
  const capabilities=ok(await client.call('get_capabilities'));assert.ok(capabilities.capabilities.length);
  const providers=ok(await client.call('get_provider_center'));assert.ok(providers.providers.length);
  const assets=ok(await client.call('get_project_assets'));assert.equal(assets.assets[0].assetId,'source');assert.equal(assets.assets[0].path,undefined);
  const workflow=ok(await client.call('get_workflow',{workflowId:'production'}));assert.equal(workflow.hash,hashWorkflow(f.base));
  const responses=[await client.call('get_capabilities'),await client.call('get_provider_center')];assert.notEqual(responses[0].requestId,responses[1].requestId);
  await assert.rejects(client.call('unknown_tool',{}),error=>error.code==='CLIENT_UNKNOWN_TOOL');
});

test('real external client completes Agent, media inspection, QC and bounded Creative Revision',async t=>{
  const f=await fixture(t),client=clientFor(f);t.after(()=>client.stop());await client.start();
  const planned=ok(await client.call('plan_agent_execution',{plan:f.plan}));assert.equal(planned.status,'validated');
  ok(await client.call('apply_agent_plan',{executionId:'original',planHash:planned.planHash,allowExecution:true},{actionId:'apply_agent'}));
  const ran=ok(await client.call('run_agent_execution',{executionId:'original',allowExecution:true},{actionId:'run_agent'}));assert.equal(ran.status,'completed');
  const agent=ok(await client.call('get_agent_execution',{executionId:'original'}));assert.equal(agent.runId,ran.runId);
  const run=ok(await client.call('get_workflow_run',{runId:ran.runId}));assert.equal(run.nodes.mix.attempts,1);const output=run.nodes.mix.result.output;
  const inspected=ok(await client.call('inspect_media',{assetId:output.assetId}));assert.equal(inspected.status,'succeeded');assert.equal(inspected.source.assetId,output.assetId);
  const request={schemaVersion:1,requestId:'qc_original',objective:'Impact at frame 1',artifacts:[{id:'master',assetId:output.assetId,checksum:output.checksum,role:'master'}],requirements:[{id:'timing',category:'OBJECTIVE_INTENT',required:true,severity:'ERROR',humanReview:'never',artifactId:'master',target:{nodeId:'mix',parameterFamily:'audio',audioEventId:'hit'},rule:{type:'lineage_event',family:'audio',itemId:'hit',startFrame:1,toleranceFrames:0}}],evidence:[],reviewRefs:[],policy:{allowRecordedDeterministic:true,allowExternalAssessments:false},humanReview:{required:false},association:{workflowId:'production',workflowHash:run.workflowHash,runId:run.runId}};
  const qc=ok(await client.call('evaluate_creative_qc',{request,allowExecution:true},{actionId:'qc'}));assert.equal(qc.result.state,'REVISION_NEEDED');assert.equal(ok(await client.call('get_creative_qc',{record:qc.record})).result.state,'REVISION_NEEDED');
  await client.refreshContext();const revision={schemaVersion:1,requestId:'revision',projectId:f.projectId,workflowId:'production',expectedWorkflowHash:run.workflowHash,sourceQc:{assetId:qc.record.assetId,checksum:qc.record.checksum},agentExecutionId:'original',runId:run.runId,findingIds:['timing'],scope:{nodeIds:['mix'],families:['audio_event']},cycle:1,maxCycles:2,executionPolicy:'safe_deterministic',stopPolicy:['pass','review','blocked','failed','uncertain','limit','stale'],intents:[],structuredIntent:{schemaVersion:1,sourceFindingIds:['timing'],revisionGoal:'Align the impact with the authored frame',requestedChanges:[{findingId:'timing',target:{type:'audio_event',nodeId:'mix',id:'hit'},operation:'move_event',value:1}],preserve:[{type:'final_duration',nodeId:'mix'}],requires:['PRODUCE_AUDIO_MIX'],acceptableSideEffects:['rerender_audio'],expectedOutcomes:[{type:'objective',description:'Impact begins at frame 1'},{type:'subjective',description:'Stronger impact'}]}};
  Object.assign(revision.structuredIntent.expectedOutcomes[0],{id:'explicit_alignment',artifactId:'master',rule:{type:'objective_measurement',family:'audio',metric:'startFrame',itemId:'hit',operator:'eq',value:1,tolerance:0,unit:'frames'}});
  const revisionPlan=ok(await client.call('plan_creative_revision',{request:revision}));assert.equal(revisionPlan.state,'READY');const revised=ok(await client.call('run_creative_revision',{revisionId:'revision',planHash:revisionPlan.planHash,allowExecution:true},{actionId:'run_revision'}));assert.equal(revised.state,'PASS');assert.equal(revised.recheck.result.findings.find(f=>f.id==='explicit_alignment').observed.status,'PASS');assert.equal(ok(await client.call('get_creative_revision',{revisionId:'revision'})).state,'PASS');
  const state=client.getSessionState();assert.equal(state.projectId,f.projectId);assert.equal(state.agentRunId,ran.runId);assert.ok(state.creativeRevisionId);assert.ok(state.qcId);assert.ok(Object.keys(state.assets).length>=1);
});

test('client surfaces stale state and never silently replans or reuses a conflicting action ID',async t=>{
  const f=await fixture(t),client=clientFor(f);t.after(()=>client.stop());await client.start();const planned=ok(await client.call('plan_agent_execution',{plan:f.plan}));
  await f.project.updateWorkflowInProject({workflow:{...f.base,name:'Changed'},expectedHash:hashWorkflow(f.base)});
  const args={executionId:'original',planHash:planned.planHash,allowExecution:true};const stale=await client.call('apply_agent_plan',args,{actionId:'stale_apply'});assert.equal(stale.status,'error');assert.equal(stale.error.code,'STALE_STATE');assert.deepEqual(await client.call('apply_agent_plan',args,{actionId:'stale_apply'}),stale);
  await assert.rejects(client.call('apply_agent_plan',{...args,planHash:'f'.repeat(64)},{actionId:'stale_apply'}),error=>error.code==='CLIENT_ACTION_CONFLICT');await client.refreshContext();assert.notEqual(client.getSessionState().workflowHash,hashWorkflow(f.base));
});

test('approval state is returned to the client and no approval tool is invented',async t=>{
  const f=await fixture(t,{approval:true}),client=clientFor(f);t.after(()=>client.stop());await client.start();const planned=ok(await client.call('plan_agent_execution',{plan:f.plan}));await client.call('apply_agent_plan',{executionId:'original',planHash:planned.planHash,allowExecution:true},{actionId:'apply'});const result=ok(await client.call('run_agent_execution',{executionId:'original',allowExecution:true},{actionId:'run'}));assert.equal(result.status,'awaiting_approval');assert.equal(result.run.nodes.mix.attempts,0);await assert.rejects(client.call('approve_workflow_checkpoint',{}),error=>error.code==='CLIENT_UNKNOWN_TOOL');
});

test('ACT timeout becomes an ambiguous state and is never replayed',async t=>{
  const f=await fixture(t),client=clientFor(f,{requestTimeoutMs:1});t.after(()=>client.stop());await client.start();const planned=ok(await client.call('plan_agent_execution',{plan:f.plan},{timeoutMs:10000}));await client.call('apply_agent_plan',{executionId:'original',planHash:planned.planHash,allowExecution:true},{actionId:'apply',timeoutMs:10000});
  await assert.rejects(client.call('run_agent_execution',{executionId:'original',allowExecution:true},{actionId:'ambiguous',timeoutMs:1}),error=>error.code==='CLIENT_ACT_AMBIGUOUS');await assert.rejects(client.call('run_agent_execution',{executionId:'original',allowExecution:true},{actionId:'ambiguous'}),error=>error.code==='CLIENT_ACT_AMBIGUOUS');
});

test('client does not retain recognizable credentials and stderr stays separate',async t=>{
  const f=await fixture(t),secret='EXTERNAL_CLIENT_FAKE_SECRET_98765',client=clientFor(f,{env:{...process.env,HF_API_KEY_SECRET:secret}});t.after(()=>client.stop());await client.start();const provider=ok(await client.call('get_provider_status',{providerId:'higgsfield'}));assert.equal(provider.provider.credential.presence,'malformed');assert.equal(JSON.stringify([client.getSessionState(),client.getStderr(),provider]).includes(secret),false);
});

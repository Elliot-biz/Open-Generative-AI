import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, createWorkflow } from 'whihm-workflow-core';
import { createPerformanceBenchmarks, validatePerformanceBenchmark, comparePerformanceBenchmark } from '../lib/whihm-execution/performance-benchmark.mjs';
import { nativeCostEvidence, sumReportedCosts, costThroughAcceptance } from '../lib/whihm-execution/benchmark-cost.mjs';
import { createWorkflowExecution } from '../lib/whihm-execution/workflow-execution.mjs';
import { createWorkflowNodeAdapter } from '../lib/whihm-execution/workflow-node-adapter.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { imageBytes } from './helpers/mediaInspectionFixtures.mjs';
const time='2026-10-27T12:00:00.000Z',code=r=>r.diagnostics?.[0]?.code;
const executor={id:'observed_executor',type:'remote-model',provider:'external_vendor',model:'future-performance-path'};
const definition=()=>({caseId:'dance_case',title:'Performance comparison',category:'character_performance',intent:{operation:'performance_transfer'},sources:[{role:'performance',assetId:'source'}],references:[{role:'identity',assetId:'reference'}],
  preservation:{body_motion:{policy:'preserve',basis:{group:'source',role:'performance'}},identity:{policy:'preserve',basis:{group:'reference',role:'identity'}},audio:{policy:'allow_change'}},metrics:[{id:'motion',label:'Motion fidelity'},{id:'identity',label:'Identity fidelity'}]});
const recordedAttempt=(nativeCost={amount:0.1,currency:'USD'})=>({status:'completed',inputs:[{role:'performance',assetId:'source'}],references:[{role:'identity',assetId:'reference'}],outputs:[{role:'result',assetId:'output'}],nativeCost,technical:{durationSeconds:1},controls:{seed:0},notes:'Recorded observation, not a live benchmark'});
const assessment=(acceptance='ACCEPT')=>({origin:'human',evaluator:{id:'reviewer',label:'Human evaluator'},acceptance,metrics:{motion:{score:5},identity:{score:4,notes:'Small difference'}},notes:'Explicit human review',issues:['Hand issue to review']});
function fakeProject() {
  const records=Object.fromEntries(['source','reference','output'].map((assetId,i)=>[assetId,{assetId,path:`assets/${assetId}.bin`,contentType:'image/png',checksum:String(i+1).repeat(64),size:1}]));
  return {getProjectAsset:async assetId=>records[assetId]?{status:'ok',asset:structuredClone(records[assetId])}:{status:'rejected',diagnostics:[{code:'ASSET_NOT_FOUND'}]}};
}
async function realProject(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-benchmark-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'project'),{project}=await createProject(root,{title:'Benchmark records only'}),records={};
  for(const [i,assetId]of ['source','reference','output'].entries()){const filename=path.join(directory,`${assetId}.png`);await fs.writeFile(filename,await imageBytes(4+i,2+i));const r=await project.importAsset({assetId,sourcePath:filename,contentType:'image/png'});assert.equal(r.status,'imported');records[assetId]=r.asset;}
  return {root,project,records};
}
async function setup(options={}) {
  const project=options.project??fakeProject(),service=createPerformanceBenchmarks({now:()=>time,...options}),r=await service.create({definition:definition(),project,allowExecution:true});assert.equal(r.status,'created',JSON.stringify(r));return {project,service,record:r.benchmark};
}
const recordCandidate=(f,record,extra={})=>f.service.recordCandidate({caseId:record.definition.caseId,expectedRevision:record.revision,candidateId:'candidate',executor,attempt:recordedAttempt(),project:f.project,allowExecution:true,...extra});
const evaluate=(f,record,extra={})=>f.service.recordEvaluation({caseId:record.definition.caseId,expectedRevision:record.revision,candidateId:'candidate',attemptNumber:1,evaluation:assessment(),allowExecution:true,...extra});

test('creation has stable case/hash identity independent of timestamps or object key order',async()=>{
  const f=await setup(),d=definition(),other=createPerformanceBenchmarks({now:()=> '2026-10-28T12:00:00.000Z'}),r=await other.create({definition:Object.fromEntries(Object.entries(d).reverse()),project:f.project,allowExecution:true});
  assert.equal(r.status,'created');assert.equal(r.benchmark.definition.caseId,f.record.definition.caseId);assert.equal(r.benchmark.definitionHash,f.record.definitionHash);assert.notEqual(r.benchmark.createdAt,f.record.createdAt);assert.equal(f.record.revision,0);assert.equal(validatePerformanceBenchmark(f.record).valid,true);
  assert.equal(code(await f.service.create({definition:d,project:f.project,allowExecution:true})),'BENCHMARK_CASE_EXISTS');
});
test('preservation is executor-independent and binds explicit source/reference roles',async()=>{
  const f=await setup();assert.deepEqual(f.record.definition.preservation,definition().preservation);assert.equal(f.record.candidates.length,0);assert.equal(f.record.definition.sources[0].checksum,'1'.repeat(64));assert.equal(f.record.definition.references[0].checksum,'2'.repeat(64));
});
for(const [label,change,expected]of[
  ['unknown preservation axis',d=>{d.preservation.universal_quality={policy:'preserve'};},'BENCHMARK_PRESERVATION_INVALID'],
  ['unknown preservation policy',d=>{d.preservation.identity.policy='best';},'BENCHMARK_PRESERVATION_INVALID'],
  ['missing preservation basis role',d=>{d.preservation.identity.basis.role='absent';},'BENCHMARK_PRESERVATION_INVALID'],
  ['duplicate metrics',d=>{d.metrics.push(d.metrics[0]);},'BENCHMARK_DUPLICATE_ID'],
  ['no metrics',d=>{d.metrics=[];},'BENCHMARK_METRICS_INVALID'],
  ['missing source',d=>{d.sources=[];},'BENCHMARK_ASSET_INVALID'],
  ['missing asset',d=>{d.sources[0].assetId='missing';},'ASSET_NOT_FOUND'],
  ['wrong checksum',d=>{d.sources[0].checksum='0'.repeat(64);},'ASSET_HASH_MISMATCH'],
  ['filesystem input',d=>{d.sources[0].assetId='/etc/passwd';},'PROJECT_PATH_UNSAFE'],
  ['unknown definition field',d=>{d.provider_options={};},'BENCHMARK_DEFINITION_INVALID'],
])test(`definition rejects ${label}`,async()=>{
  const d=definition();change(d);const r=await createPerformanceBenchmarks({now:()=>time}).create({definition:d,project:fakeProject(),allowExecution:true});assert.equal(code(r),expected,JSON.stringify(r));
});
for(const category of ['object_replacement','video_restyle','custom_research'])test(`category ${category} uses its own custom metric set`,async()=>{
  const d=definition();d.category=category;d.intent.operation=category;d.metrics=[{id:'custom_geometry',label:'Target geometry',description:'Case-specific human judgment'}];
  const r=await createPerformanceBenchmarks({now:()=>time}).create({definition:d,project:fakeProject(),allowExecution:true});assert.equal(r.status,'created');assert.deepEqual(r.benchmark.definition.metrics,d.metrics);
});
test('multiple candidates/attempts append without changing the benchmark definition',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record,{candidateId:'z_candidate',label:'Later lexical ID'});assert.equal(a.status,'recorded',JSON.stringify(a));
  const b=await recordCandidate(f,a.benchmark,{candidateId:'a_candidate'}),c=await recordCandidate(f,b.benchmark,{candidateId:'z_candidate'});assert.equal(c.status,'recorded');assert.equal(c.benchmark.candidates.length,2);assert.equal(c.benchmark.candidates[0].attempts[1].attemptNumber,2);assert.equal(c.benchmark.candidates[0].attempts[1].recordOrder,3);assert.equal(c.benchmark.definitionHash,f.record.definitionHash);
  const comparison=await f.service.compare({caseId:'dance_case'});assert.deepEqual(comparison.candidates.map(c=>c.candidateId),['a_candidate','z_candidate']);assert.equal(comparison.summary.attemptCount,3);assert.equal(comparison.ranking,false);assert.equal(comparison.recommendations,false);
});
test('candidate identity cannot change on subsequent attempts',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record),before=a.benchmark.snapshotHash,r=await recordCandidate(f,a.benchmark,{executor:{...executor,model:'different'}});assert.equal(code(r),'BENCHMARK_CANDIDATE_IDENTITY_CHANGED');assert.equal((await f.service.get({caseId:'dance_case'})).benchmark.snapshotHash,before);
});
for(const acceptance of ['ACCEPT','USABLE_WITH_ISSUES','REJECT'])test(`human acceptance ${acceptance}, notes and metric evidence preserved`,async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record),r=await evaluate(f,a.benchmark,{evaluation:assessment(acceptance)});assert.equal(r.status,'recorded',JSON.stringify(r));const item=r.benchmark.candidates[0].attempts[0];assert.deepEqual(item.evaluations[0].assessment,assessment(acceptance));assert.equal(item.evaluations[0].evidenceHash,item.evidenceHash);assert.equal(item.evaluations[0].definitionHash,f.record.definitionHash);
  const compared=await f.service.compare({caseId:'dance_case'});assert.equal(compared.candidates[0].attempts[0].acceptance,acceptance);assert.deepEqual(compared.candidates[0].attempts[0].outputs,item.evidence.outputs);
});
for(const value of [-1,6,1.5,'5',true])test(`metric value ${JSON.stringify(value)} rejects atomically`,async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record),evaluation=assessment();evaluation.metrics.motion.score=value;const r=await evaluate(f,a.benchmark,{evaluation});assert.equal(code(r),'BENCHMARK_SCORE_INVALID');assert.equal((await f.service.get({caseId:'dance_case'})).benchmark.revision,a.benchmark.revision);
});
test('missing/foreign metric keys reject and null requires an explicit not-assessed note',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record);
  for(const metrics of [{motion:{score:5}},{motion:{score:5},identity:{score:4},foreign:{score:1}}])assert.equal(code(await evaluate(f,a.benchmark,{evaluation:{...assessment(),metrics}})),'BENCHMARK_METRICS_INVALID');
  assert.equal(code(await evaluate(f,a.benchmark,{evaluation:{...assessment(),metrics:{motion:{score:null},identity:{score:4}}}})),'BENCHMARK_NOT_ASSESSED_REASON_REQUIRED');
  const r=await evaluate(f,a.benchmark,{evaluation:{...assessment(),metrics:{motion:{score:null,notes:'Not assessed'},identity:{score:4}}}});assert.equal(r.status,'recorded');
});
test('human origin is required, with no automatic acceptance or score thresholds',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record);assert.equal((await f.service.compare({caseId:'dance_case'})).candidates[0].attempts[0].acceptance,null);
  assert.equal(code(await evaluate(f,a.benchmark,{evaluation:{...assessment(),origin:'llm'}})),'BENCHMARK_HUMAN_EVALUATION_REQUIRED');
  const r=await evaluate(f,a.benchmark,{evaluation:{...assessment('ACCEPT'),metrics:{motion:{score:0},identity:{score:0}}}});assert.equal(r.status,'recorded');assert.equal(r.benchmark.candidates[0].attempts[0].evaluations[0].assessment.acceptance,'ACCEPT');
});
test('re-evaluation appends history; comparisons explicitly use latest assessment per attempt',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record),b=await evaluate(f,a.benchmark),c=await evaluate(f,b.benchmark,{evaluation:assessment('REJECT')});assert.equal(c.status,'recorded');assert.equal(c.benchmark.candidates[0].attempts[0].evaluations.length,2);assert.equal(c.benchmark.candidates[0].attempts[0].evaluations[0].assessment.acceptance,'ACCEPT');
  const r=await f.service.compare({caseId:'dance_case'});assert.equal(r.assessmentPolicy,'latest_evaluation_per_attempt');assert.equal(r.candidates[0].costs.throughFirstAccept.status,'not_reached');
});
test('failed attempts record cost without automatic REJECT; ACCEPT requires a completed output',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record,{attempt:{...recordedAttempt(),status:'failed',outputs:[]}});assert.equal(a.status,'recorded');assert.equal(code(await evaluate(f,a.benchmark)),'BENCHMARK_OUTPUT_REQUIRED');
  const r=await evaluate(f,a.benchmark,{evaluation:assessment('REJECT')});assert.equal(r.status,'recorded');assert.equal(r.benchmark.candidates[0].attempts[0].evidence.cost.amount,0.1);
});
const costAttempt=(id,cost,acceptance)=>({attemptId:id,evidence:{cost:nativeCostEvidence(cost)},evaluations:acceptance?[{assessment:{acceptance}}]:[]});
for(const native of [undefined,null])test(`not-reported cost ${native} stays unknown`,()=>{
  assert.deepEqual(nativeCostEvidence(native),{status:'not_reported',native:null,aggregatable:false});assert.equal(sumReportedCosts([costAttempt('a',native)]).status,'incomplete');
});
test('reported zero is retained with or without currency; no currency is invented',()=>{
  assert.deepEqual(nativeCostEvidence(0),{status:'reported',native:0,aggregatable:false});const r=sumReportedCosts([costAttempt('zero',{amount:0,currency:'USD'})]);assert.equal(r.status,'complete');assert.equal(r.amount,0);assert.equal(r.exactAmount,'0');assert.equal(r.currency,'USD');
});
for(const native of [{amount_credits:2},{amount:2,currency:'USD',estimated:true},'2 credits',{amount:-2,currency:'USD'},{amount:1e-13,currency:'USD'}])test(`opaque or non-aggregatable cost ${JSON.stringify(native)} is preserved`,()=>{
  const evidence=nativeCostEvidence(native);assert.equal(evidence.status,'reported');assert.deepEqual(evidence.native,native);assert.equal(evidence.aggregatable,false);assert.equal(sumReportedCosts([costAttempt('opaque',native)]).amount,null);
});
test('exact native decimal sums avoid binary rounding and retain large exact totals',()=>{
  assert.equal(sumReportedCosts([costAttempt('a',{amount:0.1,currency:'USD'}),costAttempt('b',{amount:0.2,currency:'USD'})]).exactAmount,'0.3');
  const result=sumReportedCosts([costAttempt('a',{amount:Number.MAX_SAFE_INTEGER,currency:'USD'}),costAttempt('b',{amount:2,currency:'USD'})]);assert.equal(result.amount,null);assert.equal(result.exactAmount,'9007199254740993');
});
test('incomplete or mixed-currency spend never becomes a total',()=>{
  const r=sumReportedCosts([costAttempt('paid',{amount:1,currency:'USD'}),costAttempt('unknown',undefined)]);assert.equal(r.status,'incomplete');assert.equal(r.amount,null);assert.deepEqual(r.missingAttemptIds,['unknown']);
  const mixed=sumReportedCosts([costAttempt('usd',{amount:1,currency:'USD'}),costAttempt('eur',{amount:1,currency:'EUR'})]);assert.equal(mixed.amount,null);assert.ok(mixed.reasons.includes('CURRENCY_MISMATCH'));assert.equal(sumReportedCosts([]).status,'not_applicable');
});
test('cost through first ACCEPT/usable counts the complete ordered prefix including failures',()=>{
  const attempts=[costAttempt('a',{amount:0.1,currency:'USD'},'REJECT'),costAttempt('b',{amount:0.2,currency:'USD'},'USABLE_WITH_ISSUES'),costAttempt('c',{amount:0.4,currency:'USD'},'ACCEPT'),costAttempt('d',{amount:9,currency:'USD'},'ACCEPT')];
  assert.equal(costThroughAcceptance(attempts,['ACCEPT']).exactAmount,'0.7');assert.equal(costThroughAcceptance(attempts,['ACCEPT','USABLE_WITH_ISSUES']).exactAmount,'0.3');
  attempts[0]=costAttempt('a',undefined,'REJECT');assert.equal(costThroughAcceptance(attempts,['ACCEPT']).status,'incomplete');assert.equal(costThroughAcceptance([],['ACCEPT']).status,'not_reached');
});
test('recorded unknown and zero native cost survive the full snapshot/comparison path',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record,{attempt:recordedAttempt(null)}),b=await recordCandidate(f,a.benchmark,{attempt:recordedAttempt({amount:0,currency:'USD'})}),c=await evaluate(f,b.benchmark,{attemptNumber:2});
  assert.equal(c.status,'recorded');const r=await f.service.compare({caseId:'dance_case'});assert.equal(r.candidates[0].attempts[0].cost.status,'not_reported');assert.equal(r.candidates[0].attempts[1].cost.amount,0);assert.equal(r.candidates[0].costs.throughFirstAccept.status,'incomplete');
});
test('complete recorded attempts produce exact cost-to-first-accept/usable facts end to end',async()=>{
  const f=await setup();let record=f.record;
  for(const [index,[amount,acceptance]]of [[0.1,'REJECT'],[0.2,'USABLE_WITH_ISSUES'],[0.4,'ACCEPT']].entries()){
    const a=await recordCandidate(f,record,{attempt:recordedAttempt({amount,currency:'USD'})}),e=await evaluate(f,a.benchmark,{attemptNumber:index+1,evaluation:assessment(acceptance)});assert.equal(e.status,'recorded');record=e.benchmark;
  }
  const result=await f.service.compare({caseId:'dance_case'});assert.equal(result.summary.costs.reportedSpend.exactAmount,'0.7');assert.equal(result.candidates[0].costs.throughFirstAccept.exactAmount,'0.7');assert.equal(result.candidates[0].costs.throughFirstUsable.exactAmount,'0.3');assert.equal(result.ranking,false);
});
test('a comparison is deterministic and cannot expose ranking/recommendation/weighted score',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record);await evaluate(f,a.benchmark);const x=await f.service.compare({caseId:'dance_case'});assert.deepEqual(x,await f.service.compare({caseId:'dance_case'}));
  for(const c of x.candidates)for(const key of ['rank','score','weightedScore','preferred','fallback'])assert.equal(Object.hasOwn(c,key),false);assert.equal(x.executionAuthority,false);
});
test('snapshots round-trip and detect changed definitions, evidence and evaluation data',async()=>{
  const f=await setup(),a=await recordCandidate(f,f.record),b=await evaluate(f,a.benchmark),copy=JSON.parse(JSON.stringify(b.benchmark));assert.deepEqual(copy,b.benchmark);assert.equal(validatePerformanceBenchmark(copy).valid,true);assert.equal(comparePerformanceBenchmark(copy).status,'ok');
  for(const change of [r=>{r.definition.title='changed';},r=>{r.candidates[0].attempts[0].evidence.notes='changed';},r=>{r.candidates[0].attempts[0].evaluations[0].assessment.acceptance='REJECT';}]){const r=structuredClone(copy);change(r);assert.equal(validatePerformanceBenchmark(r).valid,false);}
  copy.schemaVersion=2;assert.equal(code(comparePerformanceBenchmark(copy)),'BENCHMARK_VERSION_UNSUPPORTED');
});
test('snapshots are detached, records require permission/revision, and lost sessions cannot be adopted',async()=>{
  const f=await setup();assert.equal(code(await f.service.create({definition:definition(),project:f.project})),'EXECUTION_NOT_AUTHORIZED');assert.equal(code(await recordCandidate(f,f.record,{allowExecution:false})),'EXECUTION_NOT_AUTHORIZED');
  const a=await recordCandidate(f,f.record);assert.equal(code(await recordCandidate(f,f.record)),'BENCHMARK_REVISION_MISMATCH');a.benchmark.definition.title='caller mutation';assert.equal((await f.service.get({caseId:'dance_case'})).benchmark.definition.title,definition().title);
  f.service.dispose();assert.equal(code(await f.service.get({caseId:'dance_case'})),'BENCHMARK_NOT_FOUND');assert.equal(code(await createPerformanceBenchmarks().get({caseId:'dance_case'})),'BENCHMARK_NOT_FOUND');
});
test('case transition lock rejects concurrent attempts without partial append',async()=>{
  const f=await setup();let release,entered;const waiting=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});const project={getProjectAsset:async id=>{entered();await waiting;return f.project.getProjectAsset(id);}};
  const pending=recordCandidate(f,f.record,{project});await started;assert.equal(code(await recordCandidate(f,f.record)),'BENCHMARK_TRANSITION_BUSY');release();const r=await pending;assert.equal(r.status,'recorded');assert.equal(r.benchmark.candidates[0].attempts.length,1);
});
test('project integrity and logical asset boundaries use the existing registry',async t=>{
  const f=await realProject(t),book=await setup({project:f.project});assert.equal(book.record.definition.sources[0].checksum,f.records.source.checksum);assert.ok(!JSON.stringify(book.record).includes(f.root));
  await fs.appendFile(path.join(f.root,f.records.output.path),'tampered');assert.equal(code(await recordCandidate(book,book.record)),'ASSET_HASH_MISMATCH');
});
test('existing workflow evidence is captured without transport, result mutation or continuation authority',async t=>{
  const f=await realProject(t);let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('No provider');});
  const workflow=createWorkflow({workflowId:'performance_run',name:'Recorded fixture',assets:[],nodes:[{id:'performer',title:'Performer',kind:'generation',executor:{type:'remote-model',id:'studio',provider:'muapi',model:'runway-act-two-recast',mayCostMoney:true,requiresConfirmation:false},inputs:[],outputs:[{id:'performance',type:'video'}],metadata:{oga:{mode:'recast'}},parameters:{image_url:'https://example.com/character.png',video_url:'https://example.com/performance.mp4',aspect_ratio:'9:16'}}]});
  let executions=0;const runtime={remote:async method=>{executions++;assert.equal(method,'processRecast');return {status:'completed',outputs:['https://example.com/result.mp4'],cost:{amount:0,currency:'USD'},request_id:'observed_job'};}};
  const engine=createWorkflowExecution({now:()=>time,adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})}),run=await engine.run({...f,workflow,allowExecution:true});assert.equal(run.status,'completed');
  const book=await setup({project:f.project,readRun:runId=>engine.get({runId})}),recorded=await recordCandidate(book,book.record,{executor:run.nodes.performer.executor,attempt:undefined,runRef:{runId:run.runId,nodeId:'performer'}});assert.equal(recorded.status,'recorded',JSON.stringify(recorded));
  const candidate=recorded.benchmark.candidates[0],evidence=candidate.attempts[0].evidence;assert.equal(candidate.route.route,'specialized');assert.equal(evidence.workflowRef.runId,run.runId);assert.equal(evidence.workflowRef.workflowHash,run.workflowHash);assert.equal(evidence.requestId,'observed_job');assert.equal(evidence.cost.amount,0);assert.equal(evidence.outputs[0].url,'https://example.com/result.mp4');assert.equal(evidence.controls.aspect_ratio,'9:16');assert.equal(evidence.mediaInputs.length,2);
  assert.deepEqual(await engine.get({runId:run.runId}),run);assert.equal(code(await recordCandidate(book,recorded.benchmark,{candidateId:'duplicate',executor:run.nodes.performer.executor,attempt:undefined,runRef:{runId:run.runId,nodeId:'performer'}})),'BENCHMARK_ATTEMPT_ALREADY_RECORDED');
  const exported=JSON.parse(JSON.stringify(recorded.benchmark));engine.dispose();assert.equal(comparePerformanceBenchmark(exported).status,'ok');assert.equal(code(await createWorkflowExecution().get({runId:run.runId})),'RUN_NOT_FOUND');assert.equal(executions,1);assert.equal(calls,0);
});
test('unknown/active workflow references and caller identity overrides reject',async()=>{
  const f=await setup();assert.equal(code(await recordCandidate(f,f.record,{attempt:undefined,runRef:{runId:'lost',nodeId:'n'}})),'BENCHMARK_RUN_UNAVAILABLE');
  const active=await setup({readRun:async()=>({schemaVersion:1,runId:'r',nodes:{n:{status:'awaiting_user',continuationRequired:true}}})});assert.equal(code(await recordCandidate(active,active.record,{attempt:undefined,runRef:{runId:'r',nodeId:'n'}})),'BENCHMARK_RUN_NOT_FINAL');
});
test('benchmark ACCEPT cannot approve or resume a waiting workflow checkpoint',async t=>{
  const f=await realProject(t),workflow=createWorkflow({workflowId:'pending_review',name:'Separate approval boundary',nodes:[{id:'approval',title:'Human gate',kind:'review',executor:{type:'control',id:'human',tool:'approval',mayCostMoney:false,requiresConfirmation:true},inputs:[],outputs:[],parameters:{reason:'A separate workflow approval'}}]}),engine=createWorkflowExecution({now:()=>time}),run=await engine.run({...f,workflow,allowExecution:true});assert.equal(run.status,'awaiting_user');
  const book=await setup({project:f.project}),a=await recordCandidate(book,book.record),evaluation=await evaluate(book,a.benchmark);assert.equal(evaluation.status,'recorded');assert.deepEqual(await engine.get({runId:run.runId}),run);assert.equal(typeof book.service.resume,'undefined');
});
test('record-only capability and all progressive planning views derive without benchmark payloads',()=>{
  const p=projectCapabilities(),overview=getPlanningOverview(),context=getCapabilityContext('BENCHMARK_PERFORMANCE'),detail=getExecutorContext('performance-benchmark');assert.equal(p.counts.capabilities,54);assert.equal(p.counts.executorEntries,622);assert.ok(overview.capabilities.some(c=>c.id==='BENCHMARK_PERFORMANCE'));assert.equal(context.executors[0].id,'performance-benchmark');assert.equal(detail.executor.runtime.benchmark.recordOnly,true);assert.equal(detail.executor.runtime.benchmark.globalRanking,false);assert.ok(!JSON.stringify(overview).includes('dance_case'));assert.equal(detail.executor.result.executionAuthority,false);
});
test('fixed host API records/evaluates only, with no authentication or project mutation',async t=>{
  const f=await realProject(t);let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('No provider');});const host=createWorkflowHost({callRuntime:()=>{calls++;throw Error('No credentials');}}),opened=await host.invoke('openProject',{projectRoot:f.root}),before=await fs.readFile(path.join(f.root,'project.json'));
  const base={projectHandle:opened.projectHandle};assert.equal(code(await host.invoke('createPerformanceBenchmark',{...base,definition:definition()})),'EXECUTION_NOT_AUTHORIZED');const created=await host.invoke('createPerformanceBenchmark',{...base,definition:definition(),allowExecution:true});assert.equal(created.status,'created');
  const a=await host.invoke('recordBenchmarkCandidate',{...base,caseId:'dance_case',expectedRevision:0,candidateId:'candidate',executor,attempt:recordedAttempt(),allowExecution:true});assert.equal(a.status,'recorded',JSON.stringify(a));
  const e=await host.invoke('recordBenchmarkEvaluation',{...base,caseId:'dance_case',candidateId:'candidate',attemptNumber:1,expectedRevision:1,evaluation:assessment(),allowExecution:true});assert.equal(e.status,'recorded');assert.equal((await host.invoke('getPerformanceBenchmark',{...base,caseId:'dance_case'})).benchmark.revision,2);assert.equal((await host.invoke('comparePerformanceBenchmark',{...base,caseId:'dance_case'})).candidates[0].attempts[0].acceptance,'ACCEPT');
  assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),before);assert.equal(calls,0);assert.equal(code(await host.invoke('getPerformanceBenchmark',{projectHandle:'foreign',caseId:'dance_case'})),'PROJECT_HANDLE_INVALID');assert.equal(code(await host.invoke('recordBenchmarkCandidate',{...base,caseId:'dance_case',expectedRevision:2,run:{},allowExecution:true})),'HOST_REQUEST_INVALID');
});

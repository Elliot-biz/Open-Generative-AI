import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject, createWorkflow, hashWorkflow } from 'whihm-workflow-core';
import { createWorkflowExecution } from '../lib/whihm-execution/workflow-execution.mjs';
import { createWorkflowNodeAdapter } from '../lib/whihm-execution/workflow-node-adapter.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { configureMultimediaRuntime } from '../lib/whihm-execution/multimedia-runtime.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { runSunoVoiceClone } from '../packages/studio/src/muapi.js';
import { imageBytes, movieBytes, waveBytes } from './helpers/mediaInspectionFixtures.mjs';
const time='2026-10-27T12:00:00.000Z',code=r=>r.diagnostics?.[0]?.code;
const utility=(id,tool,parameters={},extra={})=>({id,title:id,kind:'utility',executor:{type:'utility',id:'whihm',tool,mayCostMoney:false,requiresConfirmation:false},inputs:[{id:'assetId',type:'asset',required:true}],outputs:[{id:'result',type:'json'}],parameters,...extra});
const inspection=id=>utility(id,'media-inspection',{assetId:{$asset:'original'}});
const finish=id=>utility(id,'media-finishing',{operation:'resize',parameters:{width:8,height:6,fit:'fill',outputFormat:'png'}},{inputs:[{id:'assetId',type:'image',required:true}],outputs:[{id:'image',type:'image'}]});
const checkpoint=(id='approval')=>({id,title:'Review',kind:'review',executor:{type:'control',id:'human',tool:'approval',mayCostMoney:false,requiresConfirmation:true},inputs:[],outputs:[{id:'approved',type:'boolean'}],parameters:{reason:'Human review before continuing'}});
const remote=(id='remote',model='nano-banana',mode='t2i',parameters={prompt:'A fixture'})=>({id,title:id,kind:'generation',executor:{type:'remote-model',id:'studio',provider:'muapi',model,mayCostMoney:true,requiresConfirmation:false},inputs:[],outputs:[{id:'image',type:'image'}],parameters,metadata:{oga:{mode}}});
const edge=(source,target,sourcePort='result',targetPort='assetId',id=`${source}_${target}`)=>({id,source:{nodeId:source,portId:sourcePort},target:{nodeId:target,portId:targetPort}});
async function fixture(t,kind='image') {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-run-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root=path.join(dir,'project'),{project}=await createProject(root,{title:'Execution fixture'}),file=path.join(dir,'input.bin');
  const bytes=kind==='image'?await imageBytes():kind==='video'?movieBytes():waveBytes();await fs.writeFile(file,bytes);
  const imported=await project.importAsset({sourcePath:file,assetId:'original',contentType:kind==='image'?'image/png':kind==='video'?'video/mp4':'audio/wav'});assert.equal(imported.status,'imported');
  const asset={id:'original',type:kind,localPath:imported.asset.path,checksum:{algorithm:'sha256',value:imported.asset.checksum}};
  return {root,project,asset,bytes,record:imported.asset};
}
const graph=(f,nodes,edges=[],outputs=[])=>createWorkflow({workflowId:'fixture',name:'Execution',nodes,edges,outputs,assets:[f.asset]});
const engine=options=>createWorkflowExecution({now:()=>time,...options});
const approve=(e,run,nodeId='approval',decision='approve')=>e.approve({runId:run.runId,nodeId,decision,origin:'human',expectedRevision:run.revision,allowExecution:true});
const resume=(e,run,f,workflow,extra={})=>e.resume({...f,workflow,runId:run.runId,expectedRevision:run.revision,allowExecution:true,...extra});
test.beforeEach(()=>configureMultimediaRuntime({env:{PATH:''}}));test.after(()=>configureMultimediaRuntime({}));

test('inspection -> image finishing executes existing tools and binds an immutable project asset',async t=>{
  const f=await fixture(t),a={...inspection('inspect'),outputs:[{id:'source',type:'image'},{id:'facts',type:'json'}]},workflow=graph(f,[finish('finish'),a],[edge('inspect','finish','source')],[{id:'final',type:'image',source:{nodeId:'finish',portId:'image'}}]);
  const before=hashWorkflow(workflow),e=engine(),plan=await e.plan({...f,workflow});assert.equal(plan.status,'planned',JSON.stringify(plan));assert.deepEqual(plan.order,['inspect','finish']);assert.equal(plan.nodes.finish.status,'pending');
  const run=await e.run({...f,workflow,allowExecution:true});assert.equal(run.status,'completed',JSON.stringify(run));assert.equal(run.nodes.inspect.status,'completed');assert.equal(run.nodes.finish.status,'completed');assert.equal(run.outputs.final.kind,'project_asset');assert.notEqual(run.outputs.final.assetId,'original');
  assert.equal(hashWorkflow(workflow),before);assert.deepEqual(await fs.readFile(path.join(f.root,f.record.path)),f.bytes);assert.equal((await f.project.verifyProjectIntegrity()).status,'valid');assert.equal(run.workflowHash,before);assert.equal(run.workflowVersion,1);assert.equal(run.nodes.finish.executor.tool,'media-finishing');assert.deepEqual(run.nodes.finish.dependencies,['inspect']);assert.equal(run.nodes.finish.normalizedInputs.bindings.assetId.assetId,'original');assert.equal(run.startedAt,time);assert.ok(run.nodes.finish.result.backend.versions.sharp);assert.ok(!JSON.stringify(run).includes(f.root));
});
test('ready order is independent of document insertion and join waits for both branches',async t=>{
  const f=await fixture(t),join={...inspection('join'),dependencies:['b','a']},workflow=graph(f,[join,inspection('b'),inspection('a')]),e=engine();
  assert.deepEqual((await e.plan({...f,workflow})).order,['a','b','join']);const run=await e.run({...f,workflow,allowExecution:true});assert.equal(run.status,'completed');assert.deepEqual(run.events.filter(e=>e.status==='running').map(e=>e.nodeId),['a','b','join']);
});
for(const [name,mutate,expected]of[
  ['missing node',w=>w.edges.push(edge('missing','inspect')),'WORKFLOW_INVALID'],
  ['duplicate node',w=>w.nodes.push(structuredClone(w.nodes[0])),'WORKFLOW_INVALID'],
  ['missing port',w=>w.edges.push(edge('inspect','inspect','absent')),'WORKFLOW_INVALID'],
  ['incompatible type',w=>{w.nodes.push(finish('finish'));w.edges.push(edge('inspect','finish'));},'WORKFLOW_INVALID'],
  ['cycle',w=>{w.nodes[0].dependencies=['inspect'];},'RUN_CYCLE_UNSUPPORTED'],
  ['required port',w=>{w.nodes[0].parameters={};},'REQUIRED_INPUT_MISSING'],
  ['missing workflow input',w=>{w.inputs=[{id:'source',type:'asset',required:true,targets:[{nodeId:'inspect',portId:'assetId'}]}];w.nodes[0].parameters={};},'WORKFLOW_INPUT_MISSING'],
  ['invalid executor',w=>{delete w.nodes[0].executor.tool;},'WORKFLOW_INVALID'],
  ['raw script',w=>{w.nodes[0].executor.tool='shell';},null],
  ['fallback request',w=>{w.nodes[0].fallbackPolicy={allowed:true};},'RUN_POLICY_UNSUPPORTED'],
  ['retry request',w=>{w.nodes[0].retryPolicy={maxAttempts:3};},'RUN_POLICY_UNSUPPORTED'],
])test(`graph guard ${name} executes nothing`,async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]);mutate(workflow);const e=engine(),r=await e.plan({...f,workflow});
  if(expected)assert.equal(code(r),expected);else assert.equal(r.nodes.inspect.status,'blocked');assert.equal((await f.project.listProjectAssets()).assets.length,1);
});
test('plan is deterministic and performs no generation, tool execution or project mutation',async t=>{
  const f=await fixture(t),workflow=graph(f,[remote()]),before=await fs.readFile(path.join(f.root,'project.json'));let calls=0;
  const bridge=createExecutionBridge({runtime:{remote:()=>{calls++;throw Error();},localAvailable:()=>false}}),e=engine({adapter:createWorkflowNodeAdapter({bridge})});
  const a=await e.plan({...f,workflow}),b=await e.plan({...f,workflow});assert.deepEqual(a,b);assert.equal(a.nodes.remote.status,'ready');assert.equal(a.nodes.remote.binding.assurance,'generic');assert.equal(calls,0);assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),before);
});
test('run requires literal permission and returns no run on rejection',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]);for(const allowExecution of [undefined,false,1,'true'])assert.equal(code(await engine().run({...f,workflow,allowExecution})),'EXECUTION_NOT_AUTHORIZED');
});
test('completed nodes are never executed again on ordinary resume and returned state is detached',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});const count=run.nodes.inspect.attempts;
  const next=await resume(e,run,f,workflow);assert.equal(next.status,'completed');assert.equal(next.nodes.inspect.attempts,count);next.nodes.inspect.status='failed';assert.equal((await e.get({runId:run.runId})).nodes.inspect.status,'completed');
});
test('checkpoint pauses, explicit approval enables separately authorized same-run resume',async t=>{
  const f=await fixture(t),workflow=graph(f,[checkpoint(),{...inspection('after'),dependencies:['approval']}]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});
  assert.equal(run.status,'awaiting_user');assert.equal(run.nodes.after.attempts,0);assert.equal(run.nodes.approval.waitingFor,'generic_approval');
  assert.equal((await resume(e,run,f,workflow)).status,'awaiting_user');const current=await e.get({runId:run.runId}),approved=await approve(e,current);assert.equal(approved.status,'paused');assert.equal(approved.nodes.after.attempts,0);
  assert.equal(code(await approve(e,approved)),'RUN_APPROVAL_NOT_PENDING');const completed=await resume(e,approved,f,workflow);assert.equal(completed.runId,run.runId);assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.nodes.approval.approval.decision,'APPROVED');
});
test('human rejection blocks downstream; declaration and authorization cannot be omitted',async t=>{
  const f=await fixture(t),workflow=graph(f,[checkpoint(),{...inspection('after'),dependencies:['approval']}]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});
  assert.equal(code(await e.approve({runId:run.runId,nodeId:'approval',decision:'approve',expectedRevision:run.revision,allowExecution:true})),'RUN_HUMAN_DECISION_REQUIRED');
  assert.equal(code(await e.approve({runId:run.runId,nodeId:'approval',decision:'approve',origin:'human',expectedRevision:run.revision})),'EXECUTION_NOT_AUTHORIZED');
  const rejected=await approve(e,run,'approval','reject'),r=await resume(e,rejected,f,workflow);assert.equal(r.status,'blocked');assert.equal(r.nodes.after.attempts,0);assert.equal(r.nodes.approval.diagnostics[0].code,'APPROVAL_REJECTED');
});
test('executor requiresConfirmation uses the existing manual gate before provider execution',async t=>{
  const f=await fixture(t),n=remote();n.executor.requiresConfirmation=true;let calls=0;
  const bridge=createExecutionBridge({runtime:{remote:async()=>{calls++;return {status:'completed',url:'https://example.com/result.png'};}}}),e=engine({adapter:createWorkflowNodeAdapter({bridge})}),workflow=graph(f,[n]);
  const run=await e.run({...f,workflow,allowExecution:true});assert.equal(run.status,'awaiting_user');assert.equal(calls,0);const approved=await approve(e,run,'remote');assert.equal((await resume(e,approved,f,workflow)).status,'completed');assert.equal(calls,1);
});
for(const kind of ['video','audio'])test(`${kind} finishing preserves multimedia blocker before execution`,async t=>{
  const f=await fixture(t,kind),parameters=kind==='video'?{container:'mp4',videoCodec:'h264',audio:'remove'}:{container:'wav',audioCodec:'pcm_s16le'},n=utility('finish','media-finishing',{assetId:{$asset:'original'},operation:kind==='video'?'transcode':'convert',parameters}),workflow=graph(f,[n]),e=engine();
  const p=await e.plan({...f,workflow});assert.equal(p.nodes.finish.status,'blocked');assert.equal(p.nodes.finish.runtime.snapshot.availability,'unverified');const r=await e.run({...f,workflow,allowExecution:true});assert.equal(r.status,'blocked');assert.equal(r.nodes.finish.runtime.snapshot.availability,'missing');assert.equal(r.nodes.finish.attempts,0);assert.equal(r.nodes.finish.diagnostics[0].code,'FINISH_RUNTIME_NOT_READY');
});
for(const model of ['mmaudio-v2-video-to-video','seedance-2.5-spicy-video-edit-480p','made-up-model'])test(`unavailable exact executor ${model} never dispatches or substitutes`,async t=>{
  const f=await fixture(t);let calls=0;const bridge=createExecutionBridge({runtime:{remote:()=>{calls++;throw Error();}}}),e=engine({adapter:createWorkflowNodeAdapter({bridge})}),workflow=graph(f,[remote('blocked',model,'v2v')]);
  const r=await e.run({...f,workflow,allowExecution:true});assert.equal(r.status,'blocked');assert.equal(calls,0);assert.equal(r.nodes.blocked.attempts,0);if(model==='mmaudio-v2-video-to-video')assert.equal(r.nodes.blocked.binding.availability,'provider_blocked');
});
test('bound specialized Depth delegates through the shared processV2V route and preserves image type',async t=>{
  const f=await fixture(t);let calls=[];const runtime={remote:async(method,p)=>{calls.push({method,p});return {status:'completed',output:{video:'https://example.com/depth.png'}};}};
  const node={...remote('depth','depth-anything','depth',{image_url:'https://example.com/source.png'}),outputs:[{id:'depth_image',type:'image'}]},workflow=graph(f,[node]),e=engine({adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})});
  const p=await e.plan({...f,workflow});assert.equal(p.nodes.depth.binding.route,'specialized');const r=await e.run({...f,workflow,allowExecution:true});assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(calls[0].method,'processV2V');assert.equal(r.nodes.depth.outputs.depth_image.type,'image');assert.equal(r.nodes.depth.result.resultKind,'depth-image');
});
test('mocked existing bridge preserves provider cost metadata and safe remote output bindings',async t=>{
  const f=await fixture(t),calls=[],runtime={remote:async(method,p)=>{calls.push({method,p});return {status:'completed',url:'https://example.com/generated.png',cost:{amount:0.125,currency:'USD'}};}};
  const a=remote('a'),b={...remote('b','nano-banana-edit','i2i',{prompt:'Edit fixture'}),inputs:[{id:'image_url',type:'image',required:true}]};
  const workflow=graph(f,[b,a],[edge('a','b','image','image_url')]),e=engine({adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})}),r=await e.run({...f,workflow,allowExecution:true});
  assert.equal(r.status,'completed',JSON.stringify(r));assert.equal(calls.length,2);assert.equal(calls[1].p.image_url,'https://example.com/generated.png');assert.deepEqual(r.nodes.a.cost,{amount:0.125,currency:'USD'});assert.equal(r.nodes.a.outputs.image.kind,'remote_media');
});
test('local configuration remains constrained without trusted operational readiness',async t=>{
  const f=await fixture(t),n={...remote('local'),executor:{type:'local-ai',id:'local',provider:'sdcpp',model:'z-image-turbo',mayCostMoney:false,requiresConfirmation:false}},workflow=graph(f,[n]),e=engine();
  const p=await e.plan({...f,workflow});assert.equal(p.nodes.local.status,'blocked');assert.equal(p.nodes.local.binding.code,'LOCAL_RUNTIME_UNVERIFIED');assert.equal((await e.run({...f,workflow,allowExecution:true})).nodes.local.attempts,0);
});
test('trusted local readiness can execute a portable local/MCP result through the existing bridge',async t=>{
  const f=await fixture(t),n={...remote('local'),executor:{type:'local-ai',id:'local',provider:'sdcpp',model:'z-image-turbo',mayCostMoney:false,requiresConfirmation:false}},workflow=graph(f,[n]);let calls=0;
  const bridge=createExecutionBridge({runtime:{localAvailable:()=>true,local:async()=>{calls++;return {status:'completed',url:'https://example.com/local-mcp-output.png'};}}}),e=engine({adapter:createWorkflowNodeAdapter({bridge,localReadiness:async()=>({available:true})})});
  const run=await e.run({...f,workflow,allowExecution:true});assert.equal(run.status,'completed');assert.equal(calls,1);assert.equal(run.nodes.local.binding.route,'local');
});
test('trusted local readiness can use the same local bridge; local filesystem results fail portable output guards',async t=>{
  const f=await fixture(t),n={...remote('local'),executor:{type:'local-ai',id:'local',provider:'sdcpp',model:'z-image-turbo',mayCostMoney:false,requiresConfirmation:false}},workflow=graph(f,[n]);let calls=0;
  const bridge=createExecutionBridge({runtime:{localAvailable:()=>true,local:async()=>{calls++;return {status:'completed',url:'file:///private/output.png'};}}}),e=engine({adapter:createWorkflowNodeAdapter({bridge,localReadiness:async()=>({available:true})})}),r=await e.run({...f,workflow,allowExecution:true});
  assert.equal(calls,1);assert.equal(r.nodes.local.status,'failed');assert.ok(!JSON.stringify(r).includes('/private/'));assert.equal((await resume(e,r,f,workflow)).nodes.local.attempts,1);
});
test('concurrent resume, stale revision and lost run fail without duplicate calls',async t=>{
  const f=await fixture(t),workflow=graph(f,[checkpoint(),{...remote(),dependencies:['approval']}]);let calls=0,release,started;
  const entered=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;}),runtime={remote:async()=>{calls++;started();await gate;return {status:'completed',url:'https://example.com/result.png'};}};
  const e=engine({adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})}),initial=await e.run({...f,workflow,allowExecution:true}),approved=await approve(e,initial),pending=resume(e,approved,f,workflow);await entered;
  assert.equal(code(await resume(e,approved,f,workflow)),'RUN_TRANSITION_BUSY');release();const r=await pending;assert.equal(r.status,'completed');assert.equal(calls,1);assert.equal(code(await resume(e,approved,f,workflow)),'RUN_REVISION_MISMATCH');assert.equal(code(await e.get({runId:'lost'})),'RUN_NOT_FOUND');
});
for(const [label,change]of[
  ['parameters',w=>{w.nodes.find(n=>n.id==='a').parameters.requirements={minWidth:1};}],
  ['executor',w=>{w.nodes.find(n=>n.id==='a').executor.id='changed_exact_identity';}],
])test(`${label} change invalidates actual descendants and preserves other branch`,async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('a'),{...inspection('downstream'),dependencies:['a']},inspection('unaffected')]),e=engine(),run=await e.run({...f,workflow,allowExecution:true}),next=structuredClone(workflow);change(next);
  assert.equal(code(await resume(e,run,f,next)),'RUN_DEFINITION_CHANGED');
  const stale=await e.invalidate({...f,workflow:next,runId:run.runId,expectedRevision:run.revision,allowExecution:true});assert.equal(stale.status,'stale',JSON.stringify(stale));assert.equal(stale.nodes.a.status,'stale');assert.equal(stale.nodes.downstream.status,'stale');assert.equal(stale.nodes.unaffected.status,'completed');
  const paused=await resume(e,stale,f,next);assert.equal(paused.status,'stale');assert.equal(paused.nodes.a.attempts,1);
  const complete=await resume(e,paused,f,next,{rerunNodeIds:['a','downstream']});assert.equal(complete.status,'completed');assert.equal(complete.nodes.a.attempts,2);assert.equal(complete.nodes.unaffected.attempts,1);assert.ok(complete.definitionChanges[0].diff.length);
});
test('explicit changed upstream output marks producer/descendants stale, never accepts injected output',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('a'),{...inspection('b'),dependencies:['a']},inspection('other')]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});
  const r=await e.invalidate({...f,workflow,runId:run.runId,expectedRevision:run.revision,allowExecution:true,changedOutputNodeIds:['a']});assert.equal(r.nodes.a.status,'stale');assert.equal(r.nodes.b.status,'stale');assert.equal(r.nodes.other.status,'completed');assert.deepEqual(r.nodes.a.outputs,run.nodes.a.outputs);assert.equal(r.nodes.a.attempts,1);
});
test('cosmetic reconciliation retains valid output/completion time without regenerating',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]),e=engine(),run=await e.run({...f,workflow,allowExecution:true}),next=structuredClone(workflow);next.nodes[0].title='Cosmetic title';
  const r=await e.invalidate({...f,workflow:next,runId:run.runId,expectedRevision:run.revision,allowExecution:true});assert.equal(r.status,'completed');assert.equal(r.completedAt,run.completedAt);assert.equal(r.nodes.inspect.attempts,1);assert.deepEqual(r.definitionChanges[0].affectedNodeIds,[]);
});
test('prototype names and invalid rerun lists cannot mutate run state',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});
  assert.equal(code(await e.invalidate({...f,workflow,runId:run.runId,expectedRevision:run.revision,allowExecution:true,changedOutputNodeIds:['constructor']})),'RUN_INVALIDATION_INVALID');
  assert.equal(code(await resume(e,run,f,workflow,{rerunNodeIds:'inspect'})),'RUN_RERUN_INVALID');assert.equal((await e.get({runId:run.runId})).nodes.inspect.attempts,1);
});
test('schema-compatible any target does not bypass the declared workflow-input number type',async t=>{
  const f=await fixture(t),n=checkpoint(),workflow=graph(f,[n]);n.inputs=[{id:'reviewData',type:'any',required:true}];workflow.nodes=[n];workflow.inputs=[{id:'amount',type:'number',required:true,targets:[{nodeId:'approval',portId:'reviewData'}]}];
  assert.equal(code(await engine().plan({...f,workflow,inputs:{amount:'not a number'}})),'WORKFLOW_INPUT_MISSING');
});
for(const legacy of [false,true])test(`${legacy?'legacy':'structured'} output references use the canonical dependency map`,async t=>{
  const f=await fixture(t),a={...inspection('a'),outputs:[{id:'image',type:'image'}]},b=finish('b');b.parameters.assetId=legacy?'{{ a.outputs[0].value }}':{$nodeOutput:{nodeId:'a',portId:'image'}};
  const workflow=graph(f,[b,a]),e=engine(),p=await e.plan({...f,workflow});assert.deepEqual(p.order,['a','b']);const r=await e.run({...f,workflow,allowExecution:true});assert.equal(r.status,'completed',JSON.stringify(r));
});
test('disabled source cannot satisfy a dependent node',async t=>{
  const f=await fixture(t),workflow=graph(f,[{...inspection('disabled'),enabled:false},{...inspection('after'),dependencies:['disabled']}]),r=await engine().run({...f,workflow,allowExecution:true});assert.equal(r.nodes.disabled.status,'skipped');assert.equal(r.nodes.after.status,'blocked');assert.equal(r.nodes.after.attempts,0);
});
for(const [failureCode,expectedCategory]of [['FINISH_OUTPUT_VERIFICATION_FAILED','output_verification'],['UPSTREAM_FAILED','provider'],['CAPABILITY_INPUT_INVALID','contract']])test(`executor failure preserves ${expectedCategory} diagnostic`,async t=>{
  const f=await fixture(t),workflow=graph(f,[remote()]),base=createWorkflowNodeAdapter(),adapter={...base,execute:async()=>({status:'rejected',diagnostics:[{code:failureCode}]})},e=engine({adapter}),r=await e.run({...f,workflow,allowExecution:true});assert.equal(r.nodes.remote.diagnostics[0].code,failureCode);assert.equal(r.nodes.remote.diagnostics[0].category,expectedCategory);assert.equal((await resume(e,r,f,workflow)).nodes.remote.attempts,1);
});
test('execution exception remains uncertain even after explicit invalidation',async t=>{
  const f=await fixture(t),workflow=graph(f,[remote()]);let calls=0;const base=createWorkflowNodeAdapter(),e=engine({adapter:{...base,execute:async()=>{calls++;throw Error('Outcome unknown /private/path');}}}),run=await e.run({...f,workflow,allowExecution:true});
  const stale=await e.invalidate({...f,workflow,runId:run.runId,expectedRevision:run.revision,allowExecution:true,changedOutputNodeIds:['remote']});assert.equal(code(await resume(e,stale,f,workflow,{rerunNodeIds:['remote']})),'RUN_RERUN_INVALID');assert.equal(calls,1);assert.ok(!JSON.stringify(run).includes('/private/path'));
});
test('definition changed during execution blocks the next node without reinterpreting completed work',async t=>{
  const f=await fixture(t),workflow=graph(f,[remote(),{...inspection('after'),dependencies:['remote']}]);let current=workflow,calls=0;
  const runtime={remote:async()=>{calls++;current=structuredClone(workflow);current.nodes[1].parameters.requirements={minWidth:1};return {status:'completed',url:'https://example.com/old-version-result.png'};}};
  const e=engine({currentWorkflow:async()=>current,adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})}),r=await e.run({...f,workflow,allowExecution:true});
  assert.equal(r.status,'blocked');assert.equal(r.workflowHash,hashWorkflow(workflow));assert.equal(r.nodes.remote.status,'completed');assert.equal(r.nodes.after.attempts,0);assert.equal(r.nodes.after.diagnostics[0].code,'RUN_DEFINITION_CHANGED');assert.equal(calls,1);
});
test('changed registered binding/checksum invalidates only its dependency scope',async t=>{
  const f=await fixture(t),file=path.join(f.root,'new.png');await fs.writeFile(file,await imageBytes(8,8));const imported=await f.project.importAsset({sourcePath:file,assetId:'replacement',contentType:'image/png'});
  const workflow=graph(f,[inspection('a'),inspection('other')]);workflow.inputs=[{id:'chosen',type:'asset',required:true,targets:[{nodeId:'a',portId:'assetId'}]}];workflow.nodes[0].parameters={};workflow.assets.push({id:'replacement',type:'image',localPath:imported.asset.path});
  const e=engine(),run=await e.run({...f,workflow,inputs:{chosen:'original'},allowExecution:true}),r=await e.invalidate({...f,workflow,inputs:{chosen:'replacement'},runId:run.runId,expectedRevision:run.revision,allowExecution:true});assert.equal(r.nodes.a.status,'stale');assert.equal(r.nodes.other.status,'completed');
});
for(const [label,raw]of[['provider failure',{status:'failed'}],['pending unknown',{status:'processing',request_id:'in_flight'}]])test(`${label} does not create another provider job on resume`,async t=>{
  const f=await fixture(t);let calls=0;const runtime={remote:async()=>{calls++;return raw;}},workflow=graph(f,[remote(),{...inspection('after'),dependencies:['remote']}]),e=engine({adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})}),run=await e.run({...f,workflow,allowExecution:true});
  assert.ok(['failed','blocked'].includes(run.status));assert.equal(run.nodes.after.attempts,0);await resume(e,run,f,workflow);assert.equal(calls,1);
});
test('project corruption rejects before tools and leaves source untouched by the executor',async t=>{
  const f=await fixture(t),workflow=graph(f,[inspection('inspect')]);await fs.appendFile(path.join(f.root,f.record.path),'tampered');const r=await engine().run({...f,workflow,allowExecution:true});assert.equal(code(r),'ASSET_HASH_MISMATCH');
});
test('run state cannot be restored after session loss or silently restart',async t=>{
  const f=await fixture(t),workflow=graph(f,[checkpoint()]),e=engine(),run=await e.run({...f,workflow,allowExecution:true});e.dispose();assert.equal(code(await e.get({runId:run.runId})),'RUN_NOT_FOUND');assert.equal(code(await resume(engine(),run,f,workflow)),'RUN_NOT_FOUND');
});
test('guided Suno pauses at exact provider phrase; generic approval cannot replace distinct human recording',async t=>{
  const f=await fixture(t,'audio'),file=path.join(f.root,'confirmation.wav');await fs.writeFile(file,waveBytes({sampleRate:16000}));const recording=await f.project.importAsset({sourcePath:file,assetId:'confirmation',contentType:'audio/wav'});assert.equal(recording.status,'imported');
  const phrase='  Fresh provider phrase — EXACT!  ',requestId='workflow_clone_123',responses=[{request_id:requestId},{status:'processing',output:{stage:'awaiting_phrase',phrase}},
    {status:'processing',output:{stage:'awaiting_phrase',phrase}},{},{status:'completed',output:{stage:'completed',voice_id:'voice_opaque_123'}}],calls=[];
  t.mock.method(globalThis,'fetch',async(url,init={})=>{calls.push({url,...init});const response=responses.shift();assert.ok(response,'Unexpected provider request');return {ok:true,json:async()=>response};});
  const runtime={canUpload:()=>true,upload:async asset=>`https://example.com/${asset.assetId}.wav`,remote:(method,params)=>{assert.equal(method,'runSunoVoiceClone');return runSunoVoiceClone('fixture-key',params);}},n={...remote('clone','suno-voice-clone','voice_clone_guided',{action:'start',audio_url:{$asset:'original'}}),inputs:[{id:'audio_url',type:'audio',required:true}],outputs:[{id:'voice',type:'selection',metadata:{providerIdentifier:true}}]},workflow=graph(f,[n]),e=engine({adapter:createWorkflowNodeAdapter({bridge:createExecutionBridge({runtime})})});
  const run=await e.run({...f,workflow,allowExecution:true});assert.equal(run.status,'awaiting_user',JSON.stringify(run));assert.equal(run.nodes.clone.result.operationState.phrase,phrase);assert.equal(calls.length,2);assert.equal(run.nodes.clone.attempts,1);
  assert.equal(code(await approve(e,run,'clone')),'RUN_APPROVAL_NOT_PENDING');assert.equal((await resume(e,run,f,workflow)).status,'awaiting_user');assert.equal(calls.length,2);
  const current=await e.get({runId:run.runId}),bad=await resume(e,current,f,workflow,{continuation:{nodeId:'clone',action:'confirm',confirmationAssetId:'original',recordingOrigin:'user_recorded_challenge'}});assert.equal(bad.status,'rejected');assert.equal(calls.length,2);
  const unchanged=await e.get({runId:run.runId});assert.equal(unchanged.nodes.clone.attempts,1);
  const completed=await resume(e,unchanged,f,workflow,{continuation:{nodeId:'clone',action:'confirm',confirmationAssetId:'confirmation',recordingOrigin:'user_recorded_challenge'}});
  assert.equal(completed.status,'completed',JSON.stringify(completed));assert.equal(completed.nodes.clone.result.requestId,requestId);assert.equal(completed.nodes.clone.outputs.voice.kind,'provider_identity');assert.equal(completed.nodes.clone.outputs.voice.value,'voice_opaque_123');assert.equal(calls.filter(c=>c.method==='POST').length,2);assert.ok(!calls.some(c=>/tts|speech/.test(c.url)));assert.equal(responses.length,0);
});
test('Workflow Execution discovery is dynamic and does not add an agent capability',()=>{
  const p=projectCapabilities(),context=getExecutorContext('workflow-execution');assert.equal(p.counts.capabilities,54);assert.equal(p.counts.executorEntries,622);assert.ok(getPlanningOverview().capabilities.some(c=>c.id==='RUN_WORKFLOW'));assert.equal(getCapabilityContext('RUN_WORKFLOW').executors[0].id,'workflow-execution');assert.equal(context.executor.runtime.orchestration.dagOnly,true);assert.equal(context.executor.runtime.orchestration.automaticFallback,false);assert.ok(!p.capabilities.some(c=>c.id==='AGENT_EXECUTION'));assert.equal(context.executor.result.kind,'workflow-run-state');
});
test('host plan/run/get/approve/resume are scoped, explicit and project-definition preserving',async t=>{
  const f=await fixture(t),workflow=graph(f,[checkpoint(),{...inspection('inspect'),dependencies:['approval']}]);assert.equal((await f.project.addWorkflowToProject(workflow)).status,'added');let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error();});
  const host=createWorkflowHost({callRuntime:()=>{calls++;throw Error();}}),opened=await host.invoke('openProject',{projectRoot:f.root}),base={projectHandle:opened.projectHandle,workflowId:workflow.workflowId},before=await fs.readFile(path.join(f.root,'project.json'));
  assert.equal((await host.invoke('planWorkflowExecution',base)).status,'planned');assert.equal(code(await host.invoke('runWorkflow',base)),'EXECUTION_NOT_AUTHORIZED');const run=await host.invoke('runWorkflow',{...base,allowExecution:true});assert.equal(run.status,'awaiting_user',JSON.stringify(run));
  const read={projectHandle:base.projectHandle,runId:run.runId};assert.deepEqual(await host.invoke('getWorkflowRun',read),run);
  assert.equal(code(await host.invoke('resumeWorkflow',{...read,expectedRevision:run.revision})),'EXECUTION_NOT_AUTHORIZED');
  const approved=await host.invoke('approveWorkflowCheckpoint',{...read,nodeId:'approval',decision:'approve',origin:'human',expectedRevision:run.revision,allowExecution:true});assert.equal(approved.status,'paused');
  const completed=await host.invoke('resumeWorkflow',{...read,expectedRevision:approved.revision,allowExecution:true});assert.equal(completed.status,'completed',JSON.stringify(completed));
  assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),before);assert.equal(calls,0);assert.equal(code(await host.invoke('getWorkflowRun',{...read,projectHandle:'foreign'})),'PROJECT_HANDLE_INVALID');assert.equal(code(await host.invoke('runWorkflow',{...base,allowExecution:true,workflow:{}})),'HOST_REQUEST_INVALID');
});

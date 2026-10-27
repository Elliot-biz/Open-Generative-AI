import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { t2vModels } from '../packages/studio/src/models.js';
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const all = p => p.capabilities.flatMap(c => c.executors);
const sourceEntry = (id, mode) => all(projectCapabilities()).find(e => e.id === id && (!mode || e.mode === mode));
const offline = t => { let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('Provider forbidden');});return()=>calls; };

test('overview is versioned, deterministic, JSON compatible and includes all exact capabilities', () => {
  const overview=getPlanningOverview(),projection=projectCapabilities();
  assert.equal(overview.status,'ok');assert.equal(overview.schemaVersion,1);assert.equal(overview.projectionSchemaVersion,projection.schemaVersion);
  assert.deepEqual(overview,getPlanningOverview());assert.deepEqual(JSON.parse(JSON.stringify(overview)),overview);
  assert.deepEqual(overview.capabilities.map(c=>c.id),projection.capabilities.map(c=>c.id));
  assert.equal(overview.counts.executorEntries,all(projection).length);assert.equal(overview.counts.availableForPlanning,536);
  assert.equal(overview.counts.availableByAssurance.reviewed,140);assert.equal(overview.counts.availableByAssurance.generic,396);
});
test('overview omits executor/control records and is materially smaller than the full projection', () => {
  const overview=getPlanningOverview(),projection=projectCapabilities();
  for(const capability of overview.capabilities){assert.equal(Object.hasOwn(capability,'executors'),false);assert.equal(Object.hasOwn(capability,'controls'),false);}
  assert.ok(bytes(overview)<bytes(projection)*0.1);
});
test('overview exposes blocked/deferred, specialized, local and human lifecycle facts', () => {
  const overview=getPlanningOverview();
  assert.equal(overview.counts.byAvailability.provider_blocked,34);assert.equal(overview.counts.byAvailability.deferred,22);
  assert.equal(overview.counts.byAvailability.local_constrained,13);assert.equal(overview.guards.observed.runtimeUnverifiedPresent,true);
  assert.equal(overview.capabilities.find(c=>c.id==='CLONE_VOICE_GUIDED').flags.humanLifecycleActionRequired,true);
  assert.equal(overview.capabilities.find(c=>c.id==='TRANSFER_PERFORMANCE').flags.specializedRoutingPresent,true);
});
test('exact capability context returns only that group, multiple executors and deterministic summaries', () => {
  const context=getCapabilityContext('VIDEO_EDIT'),source=projectCapabilities().capabilities.find(c=>c.id==='VIDEO_EDIT');
  assert.equal(context.status,'ok');assert.equal(context.capability.id,'VIDEO_EDIT');assert.equal(context.projectionSchemaVersion,1);
  assert.deepEqual(context.executors.map(e=>e.key),source.executors.map(e=>e.key));assert.ok(context.executors.length>1);
  assert.deepEqual(context,getCapabilityContext('VIDEO_EDIT'));
  for(const e of context.executors){assert.equal(Object.hasOwn(e,'controls'),false);assert.ok(Array.isArray(e.controlFields));}
});
test('capability summaries preserve every source limitation through lossless shared deduplication', () => {
  const source=projectCapabilities().capabilities.find(c=>c.id==='VIDEO_EDIT'),context=getCapabilityContext(source.id);
  for(const original of source.executors){
    const summary=context.executors.find(e=>e.key===original.key);
    assert.deepEqual([...new Set([...context.sharedLimitations,...summary.limitations])].sort(),[...new Set(original.limitations)].sort());
    assert.deepEqual(summary.constraints,original.constraints);assert.deepEqual(summary.result,original.result);
    assert.deepEqual(summary.requiredFields,original.requiredFields);assert.deepEqual(summary.projectAssets,original.projectAssets);
  }
});
for(const [id,mode,availability,assurance]of[
  ['gemini-omni-video-edit','v2v','available','reviewed'],
  ['seedance-2.5-spicy-video-edit','v2v','available','reviewed'],
  ['seedance-2.5-spicy-text-to-video','t2v','deferred','unreviewed'],
  ['seedance-2.5-spicy-image-to-video','i2v','deferred','unreviewed'],
  ['mmaudio-v2-video-to-video','v2v','provider_blocked','unreviewed'],
  ['seedance-2.5-spicy-video-edit-4k','v2v','provider_blocked','unreviewed'],
  ['seedance-2-spicy-text-to-video-fast','t2v','available','generic'],
  ['z-image-turbo','local','local_constrained','generic'],
  ['kling-v3.0-pro-recast','recast','available','reviewed'],
])test(`${id}: exact source availability and assurance preserved at both disclosure levels`,()=>{
  const original=sourceEntry(id,mode),detail=getExecutorContext(original.key),summary=getCapabilityContext(detail.capability.id).executors.find(e=>e.key===original.key);
  assert.equal(detail.status,'ok');assert.equal(summary.availability,availability);assert.equal(summary.assurance,assurance);
  assert.equal(summary.available,original.available);assert.equal(summary.route,original.route);assert.equal(summary.runtime.class,original.runtime.class);
  assert.equal(summary.runtimeVerification,'unverified');assert.deepEqual(detail.executor,original);
  if(availability!=='available')assert.equal(summary.available,false);
});
test('MMAudio stays MUST_REVISIT, provider-blocked and not an execution candidate',()=>{
  const context=getCapabilityContext('GENERATE_VIDEO_SOUND'),e=context.executors.find(e=>e.id==='mmaudio-v2-video-to-video');
  assert.equal(e.mustRevisit,true);assert.equal(e.available,false);assert.equal(e.result.kind,'unknown');
  assert.equal(e.reason.requiresProviderClarification,true);assert.equal(context.guards.rules.knownUnavailableAreExecutionCandidates,false);
});
test('Gemini full detail preserves controls, enums/ranges/defaults, assets and opaque identities exactly',()=>{
  const context=getExecutorContext('gemini-omni-video-edit'),source=sourceEntry('gemini-omni-video-edit','v2v'),e=context.executor;
  assert.deepEqual(e,source);assert.equal(e.controls.seed.default,0);assert.equal(e.controls.seed.minimum,0);
  assert.deepEqual(e.controls.resolution.enum,['720p','1080p','4k']);
  for(const identity of e.providerIdentifiers){assert.equal(identity.projectAsset,false);assert.equal(e.projectAssets.some(a=>a.field===identity.field),false);}
  assert.equal(context.guards.observed.declaredOpaqueProviderIdentitiesPresent,true);assert.equal(context.guards.rules.opaqueProviderIdentifiersAreProjectAssets,false);
});
test('false boolean defaults survive executor detail without injecting extra metadata',()=>{
  const context=getExecutorContext('seedance-2.5-spicy-video-edit'),source=sourceEntry('seedance-2.5-spicy-video-edit','v2v');
  assert.equal(context.executor.controls.high_bitrate.default,false);assert.deepEqual(context.executor,source);
});
test('Depth capability preserves XOR, typed image/video results and logical role constraints',()=>{
  const context=getCapabilityContext('DEPTH_ESTIMATION'),e=context.executors.find(e=>e.id==='depth-anything');
  assert.equal(e.route,'specialized');assert.deepEqual(e.constraints,[{kind:'exactly_one',fields:['image_url','video_url']}]);
  assert.deepEqual(e.result.variants.map(v=>v.kind),['depth-image','depth-video']);
  assert.deepEqual(e.inputs.map(i=>[i.type,i.projectAsset]),[['image',true],['video',true]]);
  assert.ok(e.inputs.every(i=>!Object.hasOwn(i,'schema')));
});
test('Suno summaries preserve human/liveness, distinct registered recording roles and same-session continuation',()=>{
  const context=getCapabilityContext('CLONE_VOICE_GUIDED'),e=context.executors[0];
  assert.equal(e.lifecycle.multiStage,true);assert.equal(e.lifecycle.humanActionRequired,true);assert.equal(e.lifecycle.providerLivenessRequired,true);
  assert.equal(e.lifecycle.automaticLiveness,false);assert.equal(e.lifecycle.continuation,'same_live_runtime_session');
  const confirm=e.lifecycle.operations.find(op=>op.action==='confirm');assert.equal(confirm.inputs[0].role,'user-challenge-recording');assert.equal(confirm.inputs[0].projectAssetRequired,true);
  assert.equal(e.result.providerField,'voice_id');assert.equal(e.result.projectAsset,false);assert.equal(e.result.kind,'provider-voice-identity');
  assert.equal(context.guards.rules.humanLifecycleActionMayBeAutomated,false);assert.equal(context.guards.rules.availabilityGrantsExecutionAuthorization,false);
  assert.equal(context.guards.observed.providerLivenessRequired,true);
});
test('specialized aliases, local requirements and runtime-unverified distinctions remain explicit',()=>{
  const alias=getExecutorContext('kling-v3.0-pro-motion-control').executor;assert.equal(alias.available,false);assert.ok(alias.specializedRoutes.some(r=>r.mode==='recast'));
  const local=getExecutorContext(sourceEntry('wan2gp:wan22-i2v','local').key);
  assert.equal(local.executor.available,false);assert.equal(local.guards.observed.localRuntimeConstrained,true);
  assert.equal(local.guards.rules.runtimeUnverifiedMeansRuntimeFailed,false);assert.equal(local.guards.rules.localConfigurationProvesRuntimeAvailability,false);
  assert.equal(local.guards.rules.specializedRoutesMayBeSilentlySubstituted,false);
  assert.equal(local.environment.packagedExecution,'shipping_blocker_only');assert.equal(local.guards.rules.sourceUseImpliesPackagedReadiness,false);
});
for(const id of ['NO_SUCH_CAPABILITY','video_edit','make this video longer','__proto__'])test(`unknown capability ${id}: structured not-found, no fuzzy fallback`,()=>{
  const result=getCapabilityContext(id);assert.equal(result.status,'not_found');assert.equal(result.diagnostics[0].code,'PLANNING_CAPABILITY_NOT_FOUND');assert.equal(Object.hasOwn(result,'executors'),false);
});
for(const id of ['no-such-executor','Gemini Omni Video Edit','/private/missing.wav','__proto__'])test(`unknown executor ${id}: structured not-found, no fallback`,()=>{
  const result=getExecutorContext(id);assert.equal(result.status,'not_found');assert.equal(result.diagnostics[0].code,'PLANNING_EXECUTOR_NOT_FOUND');assert.equal(Object.hasOwn(result,'executor'),false);
});
for(const id of [undefined,null,{},[],42,'',' VIDEO_EDIT','x\n'])test(`malformed identifier ${JSON.stringify(id)} rejects`,()=>{
  for(const get of [getCapabilityContext,getExecutorContext]){const result=get(id);assert.equal(result.status,'rejected');assert.equal(result.diagnostics[0].code,'PLANNING_ID_INVALID');}
});
test('ambiguous logical model ID requires explicit exact key; no route preference is applied',()=>{
  const result=getExecutorContext('flux-pulid');assert.equal(result.status,'ambiguous');assert.equal(result.diagnostics[0].code,'PLANNING_EXECUTOR_ID_AMBIGUOUS');
  assert.equal(result.matches.length,2);assert.deepEqual(result.matches.map(e=>e.mode).sort(),['i2i','t2i']);assert.equal(Object.hasOwn(result,'executor'),false);
  for(const match of result.matches)assert.equal(getExecutorContext(match.key).executor.key,match.key);
});
test('filters/options are explicitly unsupported rather than ignored',()=>{
  for(const result of [getPlanningOverview({}),getCapabilityContext('VIDEO_EDIT',{assurance:'reviewed'}),getExecutorContext('gemini-omni-video-edit',{})]){
    assert.equal(result.status,'rejected');assert.equal(result.diagnostics[0].code,'PLANNING_FILTERS_UNSUPPORTED');
  }
});
test('reads are transport-free, deterministic, detached and leave the full projection unchanged',t=>{
  const network=offline(t),before=projectCapabilities();
  const overview=getPlanningOverview(),cap=getCapabilityContext('VIDEO_EDIT'),detail=getExecutorContext('gemini-omni-video-edit');
  assert.deepEqual(getPlanningOverview(),overview);assert.deepEqual(getCapabilityContext('VIDEO_EDIT'),cap);assert.deepEqual(getExecutorContext('gemini-omni-video-edit'),detail);
  detail.executor.controls.seed.default=999;cap.executors[0].available=false;overview.capabilities.length=0;
  assert.deepEqual(projectCapabilities(),before);assert.equal(getExecutorContext('gemini-omni-video-edit').executor.controls.seed.default,0);assert.equal(network(),0);
});
test('new metadata-described capability/executor appears in all views without planning-context model logic',t=>{
  const model={id:'planning-context-fixture',endpoint:'fixture-wire',capability:'PLANNING_CONTEXT_FIXTURE',inputs:{prompt:{type:'string'},seed:{type:'integer',default:0}}};
  t2vModels.push(model);t.after(()=>t2vModels.splice(t2vModels.indexOf(model),1));
  assert.ok(getPlanningOverview().capabilities.some(c=>c.id===model.capability));
  const cap=getCapabilityContext(model.capability);assert.equal(cap.executors.length,1);assert.equal(cap.executors[0].id,model.id);
  const detail=getExecutorContext(model.id);assert.equal(detail.executor.controls.seed.default,0);assert.equal(detail.capability.id,model.capability);
});
test('host reads require no project/auth/runtime and reject override/filter fields',async t=>{
  const network=offline(t);let runtime=0;const host=createWorkflowHost({callRuntime:()=>{runtime++;throw Error('Forbidden');}});
  assert.equal((await host.invoke('getPlanningOverview',{})).status,'ok');
  assert.equal((await host.invoke('getCapabilityContext',{capabilityId:'VIDEO_EDIT'})).status,'ok');
  assert.equal((await host.invoke('getExecutorContext',{executorId:'gemini-omni-video-edit'})).status,'ok');
  for(const [method,request]of[
    ['getPlanningOverview',{filters:{}}],['getCapabilityContext',{capabilityId:'VIDEO_EDIT',projectHandle:'fake'}],
    ['getExecutorContext',{executorId:'gemini-omni-video-edit',allowExecution:true}],['getExecutorContext',{executorId:'gemini-omni-video-edit',source:{}}],
    ['getCapabilityContext',{}],['getExecutorContext',{}],
  ])assert.equal((await host.invoke(method,request)).status,'rejected');
  assert.equal((await host.invoke('getCapabilityContext',{capabilityId:'UNKNOWN'})).status,'not_found');
  assert.equal((await host.invoke('getExecutorContext',{executorId:'unknown'})).status,'not_found');
  assert.equal(network(),0);assert.equal(runtime,0);
});
test('all capability summaries preserve role metadata, states, results and lifecycle facts without full schemas',()=>{
  for(const capability of projectCapabilities().capabilities){
    const context=getCapabilityContext(capability.id);assert.equal(context.executors.length,capability.executors.length);
    for(const original of capability.executors){
      const e=context.executors.find(e=>e.key===original.key);assert.equal(e.available,original.available);assert.equal(e.availability,original.availability);assert.equal(e.assurance,original.assurance);
      assert.deepEqual(e.inputs,original.inputs.map(role=>{const value=structuredClone(role);delete value.schema;return value;}));
      assert.deepEqual(e.result,original.result);assert.deepEqual(e.providerIdentifiers,original.providerIdentifiers);
      if(original.lifecycle){assert.equal(e.lifecycle.humanActionRequired,original.lifecycle.humanActionRequired);assert.equal(e.lifecycle.automaticLiveness,original.lifecycle.automaticLiveness);}
    }
  }
});
test('guard observations are scoped to the requested capability, not unrelated executors',()=>{
  const video=getCapabilityContext('VIDEO_EDIT'),clone=getCapabilityContext('CLONE_VOICE_GUIDED');
  assert.equal(video.guards.observed.humanLifecycleActionRequired,false);assert.equal(clone.guards.observed.humanLifecycleActionRequired,true);
  assert.equal(video.guards.observed.runtimeUnverifiedPresent,true);assert.equal(video.guards.rules.runtimeUnverifiedMeansRuntimeFailed,false);
  assert.equal(video.guards.rules.catalogPresenceGrantsAvailability,false);assert.equal(video.guards.rules.availabilityGrantsExecutionAuthorization,false);
});

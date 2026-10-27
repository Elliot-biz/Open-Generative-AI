import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { resolveExecutionBinding } from '../lib/whihm-execution/runtime.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { t2vModels, v2vModels } from '../packages/studio/src/models.js';
const entries = p => p.capabilities.flatMap(c => c.executors);
function entry(id, mode, p = projectCapabilities()) {
  const value = entries(p).find(e => e.id === id && (!mode || mode === e.mode));
  assert.ok(value, `missing ${mode || ''}:${id}`); return value;
}
function capability(id) { const p = projectCapabilities(); return p.capabilities.find(c => c.executors.some(e => e.id === id))?.id; }
function offline(t) { let calls = 0; t.mock.method(globalThis, 'fetch', () => { calls++; throw Error('Provider forbidden'); }); return () => calls; }

test('schema version, deterministic ordering, JSON roundtrip and fresh immutable snapshots', () => {
  const p = projectCapabilities(), second = projectCapabilities();
  assert.equal(p.schemaVersion, 1); assert.deepEqual(p, second); assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  assert.deepEqual(p.capabilities.map(c => c.id), p.capabilities.map(c => c.id).sort());
  for (const c of p.capabilities) assert.deepEqual(c.executors.map(e => e.key), c.executors.map(e => e.key).sort());
  const controls = entry('gemini-omni-video-edit', 'v2v', p).controls; controls.seed.default = 999;
  assert.equal(entry('gemini-omni-video-edit', 'v2v').controls.seed.default, 0);
});
test('capability-first grouping has multiple exact executors without ranking', () => {
  const group = projectCapabilities().capabilities.find(c => c.id === 'VIDEO_EDIT');
  for (const id of ['gemini-omni-video-edit', 'seedance-2.5-spicy-video-edit', 'kling-o1-video-edit']) assert.ok(group.executors.some(e => e.id === id));
  for (const e of entries(projectCapabilities())) for (const key of ['score', 'rank', 'preferred', 'fallbacks', 'qualityScore', 'costRank']) assert.equal(Object.hasOwn(e, key), false);
});
test('all advertised available executors have exact existing canonical binding evidence', () => {
  const all = entries(projectCapabilities());
  for (const e of all.filter(e => e.available && e.runtime.class === 'remote')) {
    const bound = resolveExecutionBinding({ executor: { type: 'remote-model', provider: e.provider, model: e.id }, metadata: { oga: { mode: e.mode } } });
    assert.equal(bound.selected.model.id, e.id); assert.equal(bound.runtime, e.runtime.method); assert.equal(e.binding.available, true);
  }
  const p = projectCapabilities(); assert.equal(p.counts.availableReviewed + p.counts.availableGeneric, all.filter(e=>e.available).length);
  assert.equal(p.counts.availableReviewed, 142); assert.equal(p.counts.availableGeneric, 396);
  const inspection = entry('media-inspection', 'inspect_media', p);
  assert.equal(inspection.binding.source, 'host.inspectMedia'); assert.equal(inspection.binding.available, true);
  const finishing = entry('media-finishing', 'finish_media', p);
  assert.equal(finishing.binding.source, 'host.finishMedia'); assert.equal(finishing.binding.available, true);
});
for (const [id, cap] of [
  ['gemini-omni-video-edit', 'VIDEO_EDIT'], ['seedance-2.5-spicy-video-edit', 'VIDEO_EDIT'],
  ['seedance-2.5-spicy-video-extend', 'VIDEO_EXTEND'], ['ltx-2.3-video-extend', 'VIDEO_EXTEND'],
  ['pixverse-v6-extend', 'VIDEO_EXTEND'], ['seedance-v1.5-pro-video-extend', 'VIDEO_EXTEND'],
]) test(`${id}: reviewed exact capability, controls and remote binding`, () => {
  const e = entry(id, 'v2v'); assert.equal(e.available, true); assert.equal(e.assurance, 'reviewed'); assert.equal(capability(id), cap);
  assert.equal(e.runtime.class, 'remote'); assert.equal(e.runtimeVerification, 'unverified'); assert.equal(e.route, 'canonical');
});
for (const [id, mode, status] of [
  ['seedance-2.5-spicy-text-to-video', 't2v', 'deferred'], ['seedance-2.5-spicy-image-to-video', 'i2v', 'deferred'],
  ['seedance-2.5-spicy-video-edit-4k', 'v2v', 'provider_blocked'], ['seedance-2.5-spicy-first-last-frame-1080p', 'i2v', 'provider_blocked'],
  ['seedance-2.5-spicy-text-to-video-480p', 't2v', 'provider_blocked'], ['seedance-2.5-video-edit-4k', 'v2v', 'provider_blocked'],
  ['qwen-image-edit-plus-lora', 'i2i', 'provider_blocked'], ['kling-o1-reference-to-video', 'i2v', 'provider_blocked'],
  ['happy-horse-1-video-edit', 'v2v', 'deferred'],
]) test(`${id}: catalog presence does not grant availability`, () => {
  const e = entry(id, mode); assert.equal(e.available, false); assert.equal(e.availability, status); assert.equal(e.binding.available, false);
  assert.ok(e.reason.code);
});
test('MMAudio is provider-blocked, unknown result, important and must revisit', () => {
  const e = entry('mmaudio-v2-video-to-video', 'v2v');
  assert.equal(e.available, false); assert.equal(e.availability, 'provider_blocked'); assert.equal(e.mustRevisit, true);
  assert.equal(e.result.kind, 'unknown'); assert.equal(e.reason.code, 'MMAUDIO_RESULT_CONTRACT_CONFLICT');
  assert.equal(capability(e.id), 'GENERATE_VIDEO_SOUND'); assert.equal(e.runtime.method, null);
});
test('generic binding is available with lower assurance; no automatic fast preference', () => {
  const e = entry('seedance-2-spicy-text-to-video-fast', 't2v'); assert.equal(e.available, true); assert.equal(e.assurance, 'generic');
  assert.equal(e.partial, true); assert.ok(e.limitations.some(v=>v.includes('not a deeply reviewed contract')));
});
for (const [id, mode] of [['kling-v3.0-pro-recast','recast'], ['seedance-2.5-motion-control','motion_control'], ['sync-lipsync','lipsync'], ['ai-clipping','clipping'], ['motion-graphics','motion_graphics']]) test(`${id}: specialized route retained`, () => {
  const e=entry(id,mode); assert.equal(e.available,true); assert.equal(e.route,'specialized'); assert.equal(e.assurance,'reviewed');
});
test('underlying Recast provider IDs expose explicit specialized aliases, not silent generic fallback', () => {
  const e = entry('kling-v3.0-pro-motion-control', 'v2v'); assert.equal(e.available, false); assert.equal(e.route, 'specialized');
  assert.deepEqual(e.specializedRoutes, [{ id: 'kling-v3.0-pro-recast', mode: 'recast' }]);
});
test('Depth has image/video XOR roles and distinct result kinds, no generic V2V entry', () => {
  const e=entry('depth-anything','depth'); assert.equal(e.route,'specialized'); assert.equal(e.available,true);
  assert.deepEqual(e.inputs.map(r=>[r.field,r.type,r.projectAsset]), [['image_url','image',true],['video_url','video',true]]);
  assert.deepEqual(e.constraints,[{kind:'exactly_one',fields:['image_url','video_url']}]);
  assert.deepEqual(e.result.variants.map(v=>v.kind),['depth-image','depth-video']); assert.equal(capability(e.id),'DEPTH_ESTIMATION');
  assert.equal(entries(projectCapabilities()).filter(x=>x.id===e.id).length,1); assert.deepEqual(e.controls,{});
  assert.ok(e.limitations.some(v=>v.includes('No metric depth')));
});
test('guided Suno describes separate human-required operations and opaque voice identity', () => {
  const e=entry('suno-voice-clone','voice_clone_guided'); assert.equal(e.available,true); assert.equal(e.route,'specialized');
  assert.equal(e.lifecycle.multiStage,true); assert.equal(e.lifecycle.humanActionRequired,true); assert.equal(e.lifecycle.providerLivenessRequired,true);
  assert.equal(e.lifecycle.automaticLiveness,false); assert.equal(e.lifecycle.continuation,'same_live_runtime_session');
  assert.deepEqual(e.controls.action.enum,['start','confirm','poll']);
  const confirm=e.lifecycle.operations.find(op=>op.action==='confirm'); assert.equal(confirm.inputs[0].projectAssetRequired,true);
  assert.equal(confirm.inputs[0].role,'user-challenge-recording'); assert.deepEqual(confirm.controls.recording_origin.enum,['user_recorded_challenge']);
  assert.equal(e.result.kind,'provider-voice-identity'); assert.equal(e.result.providerField,'voice_id'); assert.equal(e.result.projectAsset,false);
  assert.deepEqual(e.projectAssets.map(a=>a.action),['start','confirm']); assert.equal(entries(projectCapabilities()).filter(x=>x.id===e.id).length,1);
});
test('Gemini opaque ID controls never enter media roles or project assets', () => {
  const e=entry('gemini-omni-video-edit','v2v');
  assert.deepEqual(e.providerIdentifiers.map(i=>i.field),['audio_ids','character_ids']);
  for(const id of e.providerIdentifiers){assert.equal(id.projectAsset,false);assert.equal(e.inputs.some(r=>r.field===id.field),false);assert.equal(e.projectAssets.some(r=>r.field===id.field),false);}
  assert.equal(e.controls.audio_ids.maxItems,3); assert.equal(e.controls.audio_ids.projectAsset,false);
});
test('known enums, ranges, false/zero defaults and provider engine namespace survive', () => {
  const e=entry('seedance-2.5-spicy-video-edit','v2v'); assert.equal(e.controls.duration.minimum,4); assert.equal(e.controls.duration.maximum,30);assert.equal(e.controls.duration.default,5);
  assert.deepEqual(e.controls.resolution.enum,['480p','720p','1080p','4k']);assert.equal(e.controls.high_bitrate.default,false);assert.equal(e.controls.generate_audio.default,true);
  assert.equal(entry('gemini-omni-video-edit','v2v').controls.seed.default,0);
  const topaz=entry('topaz-upscale-video-generative','v2v'); assert.equal(topaz.controls.topaz_model.providerField,'model');assert.equal(Object.hasOwn(topaz.controls,'model'),false);
  assert.equal(topaz.id,'topaz-upscale-video-generative'); assert.equal(Object.hasOwn(e.controls,'draft'),false);
});
test('ordered source/image/audio arrays retain count bounds and project roles', () => {
  const edit=entry('seedance-2.5-spicy-video-edit','v2v');
  for(const [field,max] of [['images_list',30],['audios_list',10]]) { const r=edit.inputs.find(r=>r.field===field);assert.equal(r.ordered,true);assert.equal(r.maximum,max);assert.equal(r.projectAsset,true);assert.equal(r.duplicates,'preserved'); }
  const source=entry('seedance-2-video-edit','v2v').inputs.find(r=>r.field==='video_urls');assert.equal(source.isArray,true);assert.equal(source.ordered,true);
});
test('keyframes and image auxiliary roles stay distinct', () => {
  const frames=entry('seedance-2.5-spicy-first-last-frame','i2v');assert.ok(frames.inputs.some(r=>r.role==='start-frame'));const pair=frames.inputs.find(r=>r.frameOrder);assert.deepEqual(pair.frameOrder,['start','end']);assert.equal(pair.minimum,2);assert.equal(pair.endRequired,true);
  for(const [id,field] of [['ai-object-eraser','mask_image_url'],['ai-dress-change','garment_image_url'],['add-image-watermark','watermark_image_url']]) assert.ok(entry(id,'i2i').inputs.some(r=>r.field===field&&r.type==='image'));
});
test('local configurations are bound but constrained/unverified, with no portable asset staging claim', () => {
  const e=entry('z-image-turbo','local');assert.equal(e.binding.available,true);assert.equal(e.available,false);assert.equal(e.availability,'local_constrained');assert.equal(e.runtime.class,'local');
  assert.equal(e.modelRequirement.backend,'sdcpp');assert.deepEqual(e.projectAssets,[]);assert.equal(e.runtimeVerification,'unverified');
  const video=entry('wan2gp:wan22-i2v','local');assert.equal(video.inputs[0].required,true);assert.equal(video.inputs[0].projectAsset,false);assert.equal(video.inputs[0].field,null);
});
test('projection is transport-free and marks shipping/runtime boundaries without authorizing execution', t => {
  const calls=offline(t),p=projectCapabilities();assert.equal(calls(),0);assert.equal(p.environment.packagedExecution,'shipping_blocker_only');
  for(const e of entries(p))assert.equal(e.runtimeVerification,'unverified');assert.equal(p.counts.localConstrained,13);
});
test('future metadata-described generic executor enters dynamically without projection edits', t => {
  const id='projection-fixture-t2v',model={id,name:'Fixture',endpoint:'fixture-wire',capability:'FIXTURE_VIDEO_INTENT',inputs:{prompt:{type:'string'},seed:{type:'integer',default:0},enabled:{type:'boolean',default:false}}};
  t2vModels.push(model);t.after(()=>t2vModels.splice(t2vModels.indexOf(model),1));
  const e=entry(id,'t2v');assert.equal(capability(id),'FIXTURE_VIDEO_INTENT');assert.equal(e.endpoint,'fixture-wire');assert.equal(e.available,true);assert.equal(e.assurance,'generic');assert.equal(e.controls.seed.default,0);assert.equal(e.controls.enabled.default,false);
});
test('future catalog-only V2V executor remains deferred without reviewed admission', t => {
  const model={id:'projection-fixture-unbound',name:'Unbound',endpoint:'fixture-unbound',capability:'FIXTURE_EDIT_INTENT',inputs:{video_url:{type:'string',field:'video'}}};
  v2vModels.push(model);t.after(()=>v2vModels.splice(v2vModels.indexOf(model),1));
  const e=entry(model.id,'v2v');assert.equal(capability(model.id),'FIXTURE_EDIT_INTENT');assert.equal(e.available,false);assert.equal(e.availability,'deferred');assert.equal(e.binding.available,false);
});
for(const [flag,status] of [[{enabled:false},'disabled'],[{deprecated:true},'deprecated']])test(`explicit fixture metadata preserves ${status}`,t=>{
  const model={id:'projection-fixture-status',endpoint:'fixture-status',...flag};t2vModels.push(model);t.after(()=>t2vModels.splice(t2vModels.indexOf(model),1));
  const e=entry(model.id,'t2v');assert.equal(e.binding.available,true);assert.equal(e.available,false);assert.equal(e.availability,status);
});
test('host read operation needs no project/runtime/auth and rejects caller override fields', async t => {
  const calls=offline(t);let runtime=0;const host=createWorkflowHost({callRuntime:()=>{runtime++;throw Error('Runtime forbidden');}});
  const p=await host.invoke('getCapabilityProjection',{});assert.equal(p.schemaVersion,1);assert.equal(calls(),0);assert.equal(runtime,0);
  for(const request of [{projectHandle:'fake'},{source:{}},{allowExecution:true},{provider_options:{}},{localState:{hostAvailable:true}}])assert.equal((await host.invoke('getCapabilityProjection',request)).status,'rejected');
});
test('extend last-image remains optional scalar, distinct from edit reference lists', () => {
  const e=entry('seedance-2.5-spicy-video-extend','v2v'),last=e.inputs.find(r=>r.field==='last_image');
  assert.ok(last);assert.equal(last.isArray,false);assert.equal(last.required,false);assert.equal(last.projectAsset,true);
  assert.equal(e.inputs.some(r=>r.field==='images_list'||r.field==='audios_list'),false);
});
test('nested speech/dialogue structures remain schemas rather than flattened text', () => {
  const e=entry('gemini-3-1-flash-tts','audio');
  assert.equal(e.controls.speakers.type,'array');assert.equal(e.controls.speakers.items.type,'object');
  assert.ok(e.controls.speakers.items.properties.speaker_id);assert.equal(e.controls.dialogue_turns.type,'array');
  assert.ok(e.controls.dialogue_turns.items.properties.text);
});
test('bounded layers and clipping expose partial result guarantees and operation-specific requirements', () => {
  const layers=entry('seedream-5.0-flash-layerize','i2i');assert.equal(layers.result.kind,'layers');assert.equal(layers.partial,true);
  assert.ok(layers.limitations.some(v=>v.includes('stacking')));
  const create=entry('motion-graphics','motion_graphics'),edit=entry('motion-graphics-edit','motion_graphics');
  assert.equal(create.operation,'create');assert.equal(edit.operation,'edit');assert.ok(edit.requiredFields.includes('request_id'));
  assert.ok(create.constraints.some(c=>c.kind==='conditional_required'&&c.required.includes('images_list')));
  assert.equal(entry('ai-clipping','clipping').result.kind,'clipping-selection-or-clips');
});
test('catalog insertion order does not change projection ordering or semantics', () => {
  const before=projectCapabilities(),saved=[...t2vModels];
  try { t2vModels.reverse();assert.deepEqual(projectCapabilities(),before); }
  finally { t2vModels.splice(0,t2vModels.length,...saved); }
});
test('generic I2V retains the existing canonical image-alias requirement without certifying native optional media', () => {
  const e=entries(projectCapabilities()).find(e=>e.mode==='i2v'&&e.available&&e.assurance==='generic');assert.ok(e);
  assert.ok(e.constraints.some(c=>c.kind==='canonical_image_alias_required'&&c.fields.includes('image_url')&&c.fields.includes('images_list')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflow, createProject, hashWorkflow } from 'whihm-workflow-core';
import { t2vModels, i2vModels, v2vModels } from '../packages/studio/src/models.js';
import { getSeedanceConfiguration } from '../packages/studio/src/seedanceModels.js';
import { buildV2VRequest, getV2VExecutionModel, getV2VMediaInputs } from '../packages/studio/src/v2vInputContracts.js';
import { buildVideoInputRequest, getVideoInputModel, getVideoInputMedia, getVideoInputStatus } from '../packages/studio/src/videoInputContracts.js';
import { processV2V, generateI2V, generateVideo } from '../packages/studio/src/muapi.js';
import { MuapiClient } from '../src/lib/muapi.js';
import { createApplicationRuntime, findRemote } from '../lib/whihm-execution/runtime.mjs';
import { createExecutionBridge } from '../lib/whihm-execution/bridge.mjs';
import { assessProjectWorkflowReadiness } from '../lib/whihm-execution/readiness.mjs';
const image = 'https://example.com/start.png', end = 'https://example.com/end.png', video = 'https://example.com/source.mp4', audio = 'https://example.com/audio.wav', key = 'test-video-only';
const v2v = [
  ['seedance-2.5-spicy-video-edit', { video_url: video, prompt: '  Change the lighting  ', images_list: [end, image, end], audios_list: [audio, audio], duration: 30, resolution: '4k', aspect_ratio: '9:21', seed: 0, high_bitrate: false, generate_audio: false }],
  ['seedance-2.5-spicy-video-extend', { video_url: video, prompt: '  Continue the action  ', last_image: end, duration: 4, resolution: '480p', aspect_ratio: 'adaptive', seed: 4294967295, high_bitrate: true, generate_audio: false }],
  ['gemini-omni-video-edit', { video_url: video, prompt: 'Edit', image_urls: [end, image, end], trim_start: 1.25, trim_end: 7.5, duration: 8, resolution: '4k', aspect_ratio: '9:16', seed: 0, audio_ids: ['voice:one', 'voice:one'], character_ids: ['character-1'] }],
  ['ltx-2.3-video-extend', { video_url: video, duration: 20 }],
  ['pixverse-v6-extend', { video_url: video, prompt: 'Continue', duration: 15, resolution: '1080p', generate_audio_switch: false, negative_prompt: 'Blur', style: 'anime' }],
  ['seedance-v1.5-pro-video-extend', { video_url: video, prompt: 'Continue', duration: 12, resolution: '480p', generate_audio: false, camera_fixed: false }],
];
const i2v = [
  ['seedance-2.5-spicy-first-last-frame', { prompt: 'Transition', images_list: [image, end], duration: 30, resolution: '4k', aspect_ratio: '21:9', seed: 0, high_bitrate: false }],
  ['seedance-2.5-spicy-omni-reference', { prompt: 'Use reference motion', images_list: [end, image, end], videos_list: [video, video], audios_list: [audio, audio], duration: 30, resolution: '1080p', seed: 4294967295, omni_reference_task_type: 'reference', high_bitrate: true }],
  ['wan2.2-spicy-image-to-video', { prompt: 'Animate', image_url: image, duration: 8, resolution: '720p' }],
  ['wan3.0-spicy-reference-to-video', { prompt: 'References', images_list: [image, end, image], videos_list: [video], audios_list: [audio], duration: 30, resolution: '1080p', aspect_ratio: 'adaptive', seed: 0, enable_audio: false, thinking_mode: false }],
  ['minimax-h3-image-to-video-spicy', { image_url: image, last_image: end, resolution: '768p', duration: 15, seed: 0 }],
];
const cases = [...v2v.map(v => [...v, 'v2v']), ...i2v.map(v => [...v, 'i2v'])];
const contract = (id, mode, params) => mode === 'v2v' ? buildV2VRequest({ ...params, model: id }) : buildVideoInputRequest(mode, { ...params, model: id });
function workflow(model, mode, parameters) {
  return createWorkflow({ workflowId: 'final_video', name: 'Final video contracts', nodes: [{ id: 'shot', title: 'Creative goal', kind: 'video', inputs: [], outputs: [{ id: 'out', type: 'video' }], metadata: { oga: { mode } }, parameters: structuredClone(Object.fromEntries(Object.entries(parameters).filter(([, v]) => v !== undefined))), executor: { type: 'remote-model', id: 'studio', provider: 'muapi', model, mayCostMoney: true, requiresConfirmation: true } }] });
}
function fake(t, poll = false) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, ...init }); return { ok: true, json: async () => poll && init.method === 'POST' ? { request_id: 'final-video-job' }
      : { status: 'completed', output: { video: 'https://example.com/result.mp4', metadata: { native: true } } } };
  }); return calls;
}
for (const [id, params, mode] of cases) {
  test(`${id}: shared/application preserve exact request roles, options, identity and native result`, async t => {
    const poll = ['seedance-2.5-spicy-video-edit', 'seedance-2.5-spicy-first-last-frame'].includes(id), calls = fake(t, poll), client = new MuapiClient(); client.getKey = () => key;
    const request = { ...params, model: id }, before = structuredClone(request), expected = contract(id, mode, params);
    const result = await (mode === 'v2v' ? processV2V : generateI2V)(key, request), application = await client[mode === 'v2v' ? 'processV2V' : 'generateI2V'](request);
    assert.deepEqual(application, result); assert.equal(result.url, 'https://example.com/result.mp4'); assert.equal(result.output.metadata.native, true);
    assert.ok(calls[0].url.endsWith('/api/v1/' + id)); assert.deepEqual(JSON.parse(calls[0].body), expected.payload);
    for (const [field, value] of Object.entries(params)) assert.deepEqual(expected.payload[field], value, field);
    if (poll) assert.equal(result.request_id, 'final-video-job');
    assert.equal(Object.hasOwn(expected.payload, 'model'), false); assert.deepEqual(request, before);
  });
  test(`${id}: canonical plan/readiness need no auth or transport; authorized execution uses existing service`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const w = workflow(id, mode, params), before = hashWorkflow(w), request = { workflow: w, nodeId: 'shot' }, plan = await bridge.plan(request);
    assert.equal(plan.status, 'planned', JSON.stringify(plan)); assert.equal(plan.runtime, mode === 'v2v' ? 'studio.processV2V' : 'studio.generateI2V'); assert.equal(plan.model, id);
    assert.deepEqual(plan.request.effectiveOptions, contract(id, mode, params).effectiveOptions);
    const readiness = await assessProjectWorkflowReadiness({ workflow: w, evaluatedAt: '2026-10-26T20:00:00Z' }); assert.equal(readiness.provenance.executors.shot.state, 'AVAILABLE');
    assert.equal(auth, 0); assert.equal(calls.length, 0); assert.equal((await bridge.execute(request)).diagnostics[0].code, 'EXECUTION_NOT_AUTHORIZED');
    const result = await bridge.execute(request, { allowExecution: true }); assert.equal(result.status, 'succeeded', JSON.stringify(result)); assert.equal(result.model, id); assert.equal(result.outputs[0].value, 'https://example.com/result.mp4');
    assert.deepEqual(JSON.parse(calls[0].body), contract(id, mode, params).payload); assert.equal(auth, 1); assert.equal(hashWorkflow(w), before);
  });
  for (const [field, value] of [['provider_options', {}], ['model', 'another-model'], ['raw', {}]]) test(`${id}: rejects ${field} override before auth/transport`, async t => {
    const calls = fake(t); let auth = 0;
    const bridge = createExecutionBridge({ runtime: createApplicationRuntime({ getApiKey: () => { auth++; return key; } }) });
    const result = await bridge.execute({ workflow: workflow(id, mode, { ...params, [field]: value }), nodeId: 'shot' }, { allowExecution: true });
    assert.equal(result.status, 'rejected'); if (field === 'model') assert.equal(result.diagnostics[0].code, 'IDENTITY_OVERRIDE');
    else await assert.rejects((mode === 'v2v' ? processV2V : generateI2V)(key, { ...params, [field]: value, model: id }));
    assert.equal(auth, 0); assert.equal(calls.length, 0);
  });
}
const invalid = [
  ...v2v.flatMap(([id]) => [[id, { video_url: undefined }, 'video_url'], [id, { video_url: 'invalid' }, 'video_url']]),
  ...['seedance-2.5-spicy-video-edit', 'seedance-2.5-spicy-video-extend'].flatMap(id => [
    [id, { prompt: ' ' }, 'prompt'], [id, { duration: 3 }, 'duration'], [id, { duration: 31 }, 'duration'], [id, { resolution: '4K' }, 'resolution'],
    [id, { aspect_ratio: '2:1' }, 'aspect_ratio'], [id, { seed: -2 }, 'seed'], [id, { seed: 4294967296 }, 'seed'], [id, { generate_audio: 'false' }, 'generate_audio'],
  ]),
  ['seedance-2.5-spicy-video-edit', { images_list: Array(31).fill(image) }, 'images_list'],
  ['seedance-2.5-spicy-video-edit', { audios_list: Array(11).fill(audio) }, 'audios_list'],
  ['seedance-2.5-spicy-video-extend', { last_image: [end] }, 'last_image'],
  ['seedance-2.5-spicy-video-extend', { audios_list: [audio] }, 'audios_list'],
  ['gemini-omni-video-edit', { image_urls: Array(8).fill(image) }, 'image_urls'],
  ['gemini-omni-video-edit', { trim_start: -1 }, 'trim_start'], ['gemini-omni-video-edit', { trim_start: 8, trim_end: 7 }, 'trim_end'],
  ['gemini-omni-video-edit', { audio_ids: [audio] }, 'audio_ids'], ['gemini-omni-video-edit', { character_ids: ['../person'] }, 'character_ids'],
  ['gemini-omni-video-edit', { audio_ids: ['bad id'] }, 'audio_ids'], ['gemini-omni-video-edit', { character_ids: [''] }, 'character_ids'],
  ['gemini-omni-video-edit', { duration: 5 }, 'duration'], ['gemini-omni-video-edit', { seed: -1 }, 'seed'],
  ['ltx-2.3-video-extend', { duration: 0 }, 'duration'], ['ltx-2.3-video-extend', { resolution: '720p' }, 'resolution'],
  ['pixverse-v6-extend', { style: 'cinematic' }, 'style'], ['pixverse-v6-extend', { duration: 16 }, 'duration'],
  ['seedance-v1.5-pro-video-extend', { camera_fixed: 'true' }, 'camera_fixed'], ['seedance-v1.5-pro-video-extend', { resolution: '1080p' }, 'resolution'],
  ['seedance-2.5-spicy-first-last-frame', { images_list: [] }, 'images_list'],
  ['seedance-2.5-spicy-first-last-frame', { images_list: [image] }, 'images_list'],
  ['seedance-2.5-spicy-first-last-frame', { images_list: [image, end, image] }, 'images_list'],
  ['seedance-2.5-spicy-omni-reference', { images_list: [], videos_list: [], audios_list: [] }, 'references'],
  ['seedance-2.5-spicy-omni-reference', { omni_reference_task_type: 'edit' }, 'omni_reference_task_type'],
  ['seedance-2.5-spicy-omni-reference', { videos_list: Array(11).fill(video) }, 'videos_list'],
  ['seedance-2.5-spicy-omni-reference', { draft: true }, 'draft'],
  ['wan2.2-spicy-image-to-video', { image_url: undefined }, 'image_url'], ['wan2.2-spicy-image-to-video', { duration: 6 }, 'duration'],
  ['wan3.0-spicy-reference-to-video', { images_list: [], videos_list: [], audios_list: [] }, 'references'],
  ['wan3.0-spicy-reference-to-video', { images_list: Array(11).fill(image) }, 'images_list'],
  ['minimax-h3-image-to-video-spicy', { image_url: undefined }, 'image_url'], ['minimax-h3-image-to-video-spicy', { aspect_ratio: '16:9' }, 'aspect_ratio'],
];
for (const [id, patch, expectedPath] of invalid) test(`${id}: rejects invalid ${expectedPath}`, async t => {
  const [,,mode] = cases.find(([m]) => m === id), params = { ...cases.find(([m]) => m === id)[1], ...patch }, calls = fake(t);
  await assert.rejects((mode === 'v2v' ? processV2V : generateI2V)(key, { ...params, model: id }), e => e.path === expectedPath);
  const plan = await createExecutionBridge().plan({ workflow: workflow(id, mode, params), nodeId: 'shot' }); assert.equal(plan.status, 'rejected'); assert.equal(plan.diagnostics[0].path, expectedPath); assert.equal(calls.length, 0);
});
test('defaults, optional prompts and keyframe roles retain exact source semantics', () => {
  for (const id of ['seedance-2.5-spicy-video-edit','seedance-2.5-spicy-video-extend']) {
    const r = buildV2VRequest({ model: id, video_url: video, prompt: 'Intent' }); assert.equal(r.payload.resolution, '720p'); assert.equal(r.payload.duration, 5); assert.equal(r.payload.generate_audio, true); assert.equal(r.payload.high_bitrate, false); assert.equal(r.payload.seed, undefined);
    assert.equal(getSeedanceConfiguration(id).usesNativeResolution, true);
    if (id.endsWith('video-edit')) {
      const maximal = buildV2VRequest({ model:id, video_url:video, prompt:'Edit', images_list:Array(30).fill(image), audios_list:Array(10).fill(audio), seed:-1 });
      assert.equal(maximal.payload.images_list.length,30); assert.equal(maximal.payload.audios_list.length,10);
      assert.deepEqual(buildV2VRequest({model:id,video_url:video,prompt:'Edit',images_list:[],audios_list:[]}).payload.images_list,[]);
    }
  }
  assert.deepEqual(buildV2VRequest({ model: 'ltx-2.3-video-extend', video_url: video }).payload, { video_url: video, duration: 5 });
  const gemini = buildV2VRequest({ model: 'gemini-omni-video-edit', video_url: video, prompt: 'Edit', trim_start: 1, trim_end: 1 });
  assert.deepEqual(gemini.v2v.providerIdentifiers.map(r => [r.field,r.projectAsset]), [['audio_ids',false],['character_ids',false]]);
  const mini = buildVideoInputRequest('i2v', { model: 'minimax-h3-image-to-video-spicy', image_url: image }); assert.equal(mini.payload.prompt, undefined); assert.equal(mini.payload.seed, -1);
  assert.deepEqual(getVideoInputMedia('minimax-h3-image-to-video-spicy').map(r => r.role), ['start-frame','end-frame']);
  const first = buildVideoInputRequest('i2v', { model: 'seedance-2.5-spicy-first-last-frame', prompt: 'Start', image_url: image, last_image: image }); assert.deepEqual(first.payload.images_list, [image,image]);
});
test('fixed-suffix, fast and parked families receive no wildcard admission; audio conflict remains explicit', async t => {
  const calls = fake(t), bridge = createExecutionBridge();
  assert.equal(v2vModels.filter(m => getV2VExecutionModel(m.id)).length, 35); assert.equal(i2vModels.filter(m => getVideoInputModel(m.id)).length, 36);
  let fixedCount = 0;
  for (const [list, mode] of [[t2vModels,'t2v'],[i2vModels,'i2v'],[v2vModels,'v2v']]) for (const m of list.filter(m => m.id.startsWith('seedance-2.5-spicy-') && ['-480p','-1080p','-4k'].some(suffix => m.id.endsWith(suffix)))) { fixedCount++; assert.equal(findRemote(m.id,mode), null); assert.equal(getSeedanceConfiguration(m.id).usesNativeResolution, undefined); }
  assert.equal(fixedCount, 18);
  for (const [id,mode] of [['seedance-2.5-spicy-text-to-video','t2v'],['seedance-2.5-spicy-image-to-video','i2v']]) {
    assert.equal(getVideoInputStatus(id,mode).code, 'VIDEO_AUDIO_CONTRACT_CONFLICT'); assert.equal(findRemote(id,mode), null);
    assert.equal((await bridge.plan({ workflow: workflow(id,mode,{prompt:'Intent',image_url:image}), nodeId:'shot' })).status,'rejected');
  }
  for (const id of ['seedance-v1.5-pro-video-extend-fast','mmaudio-v2-video-to-video','depth-anything','ai-dance-effects','kling-v3.0-pro-motion-control']) assert.equal(findRemote(id,'v2v'),null);
  assert.equal(calls.length,0);
});

test('all admitted project roles use existing resolver while opaque Gemini IDs remain untouched', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'high-value-video-')), root = path.join(directory,'project'); t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const {project}=await createProject(root,{title:'Video evidence'}), assets=[];
  for(const [id,type]of [['picture','image'],['clip','video'],['sound','audio']]) {const sourcePath=path.join(directory,id);await fs.writeFile(sourcePath,id);const imported=await project.importAsset({sourcePath,assetId:id,contentType:type+'/fixture'});assets.push({id,type,localPath:imported.asset.path});}
  const calls=fake(t), uploaded=[],runtime=createApplicationRuntime({getApiKey:()=>key});runtime.canUpload=()=>true;runtime.upload=async a=>{uploaded.push(a.assetId);return `https://example.com/upload-${uploaded.length}`;};const bridge=createExecutionBridge({runtime});
  for(const [id,original,mode]of cases){
    const params=structuredClone(original),roles=mode==='v2v'?getV2VMediaInputs(id):getVideoInputMedia(id),bindings={};
    for(const r of roles)if(params[r.field]!==undefined){delete params[r.field];const assetId={image:'picture',video:'clip',audio:'sound'}[r.type];bindings[r.field]=r.isArray?[assetId,{image,end,video,audio}[r.type]||image,assetId]:assetId;}
    // Native one/two-frame arrays have their own strict cardinality/order.
    if(id==='seedance-2.5-spicy-first-last-frame')bindings.images_list=['picture','picture'];
    if(id==='gemini-omni-video-edit'){params.audio_ids=['sound'];params.character_ids=['picture'];}
    const w=workflow(id,mode,params);w.assets=assets;w.nodes[0].inputs=Object.keys(bindings).map(field=>({id:field,type:roles.find(r=>r.field===field).type}));w.nodes[0].assetRefs=['picture','clip','sound'];
    const request={workflow:w,nodeId:'shot',project,assetBindings:bindings},count=calls.length,uploadCount=uploaded.length,plan=await bridge.plan(request);
    assert.equal(plan.status,'planned',JSON.stringify(plan));assert.equal(calls.length,count);assert.equal(uploaded.length,uploadCount);assert.ok(!JSON.stringify(plan).includes(root));
    assert.equal((await bridge.execute(request,{allowExecution:true})).status,'succeeded',id);
    if(id==='gemini-omni-video-edit'){
      const body=JSON.parse(calls.at(-1).body);assert.deepEqual(body.audio_ids,['sound']);assert.deepEqual(body.character_ids,['picture']);
      assert.equal((await bridge.plan({...request,assetBindings:{...bindings,audio_ids:['sound']}})).status,'rejected');
    }
    for(const [field,binding]of Object.entries(bindings)){const wrong=roles.find(r=>r.field===field).type==='image'?'clip':'picture';assert.equal((await bridge.plan({...request,assetBindings:{...bindings,[field]:Array.isArray(binding)?[wrong]:wrong}})).status,'rejected',id+'/'+field);}
  }
  assert.ok(uploaded.length>0);await fs.writeFile(path.join(root,assets[0].localPath),'corrupt');
  const w=workflow('seedance-2.5-spicy-video-extend','v2v',{prompt:'Intent',video_url:video});w.assets=assets;w.nodes[0].inputs=[{id:'last_image',type:'image'}];w.nodes[0].assetRefs=['picture'];
  assert.equal((await bridge.plan({workflow:w,nodeId:'shot',project,assetBindings:{last_image:'picture'}})).status,'rejected');
});


test('generic T2V and existing generation service remain intact without transport during planning', async t => {
  const calls=fake(t); const w=workflow('seedance-lite-t2v','t2v',{prompt:'Generate a landscape',duration:5});
  assert.equal((await createExecutionBridge().plan({workflow:w,nodeId:'shot'})).status,'planned');assert.equal(calls.length,0);
  await generateVideo(key,{model:'seedance-lite-t2v',prompt:'Generate a landscape',duration:5});
  assert.equal(JSON.parse(calls[0].body).prompt,'Generate a landscape');
});

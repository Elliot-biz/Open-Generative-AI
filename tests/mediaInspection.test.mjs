import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProject } from 'whihm-workflow-core';
import { inspectMedia, planMediaInspection, validateInspectionRequirements, validateTechnicalFacts } from '../lib/whihm-execution/media-inspection.mjs';
import { probeMediaBytes, probeImage } from '../lib/whihm-execution/media-header-probe.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { imageBytes, waveBytes, movieBytes, box } from './helpers/mediaInspectionFixtures.mjs';
async function fixture(t, bytes, contentType, filename = 'sample.bin') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'whihm-inspect-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'project'), created = await createProject(root, { title: 'Inspection fixture' }), file = path.join(dir, filename); assert.equal(created.status, 'created');
  const { project } = created; await fs.writeFile(file, bytes);
  const imported = await project.importAsset({ sourcePath: file, assetId: 'sample', contentType }); assert.equal(imported.status, 'imported');
  return { project, root, assetId: 'sample', record: imported.asset };
}
const code = r => r.diagnostics?.[0]?.code;
const offline = t => { let calls = 0; t.mock.method(globalThis, 'fetch', () => { calls++; throw Error('Transport forbidden'); }); return () => calls; };
test('registered PNG returns versioned deterministic technical facts without absolute paths or mutation', async t => {
  const f = await fixture(t, await imageBytes(), 'image/png', 'picture.png'), before = await fs.readFile(path.join(f.root, 'project.json'), 'utf8'), network = offline(t);
  const result = await inspectMedia(f); assert.equal(result.status, 'succeeded'); assert.equal(result.schemaVersion, 1); assert.equal(result.facts.mediaKind, 'image');
  assert.deepEqual(result.facts.image.dimensions, { width: 4, height: 2, aspectRatio: 2, orientation: 'landscape' });
  assert.equal(result.facts.container, 'png'); assert.equal(result.facts.image.hasAlphaChannel, true); assert.equal(result.facts.fileSize, f.record.size);
  assert.deepEqual(result.source, { assetId: 'sample', path: f.record.path, checksum: f.record.checksum, declaredMime: 'image/png', extension: 'png' });
  assert.equal(result.unavailable.durationSeconds, 'not_applicable'); assert.equal(result.validation.status, 'not_requested'); assert.deepEqual(result.validation.technicalWarnings, []);
  assert.equal(result.inspection.backend.id, 'sharp-metadata'); assert.equal(result.inspection.decoded, false); assert.equal(network(), 0);
  assert.deepEqual(await inspectMedia(f), result); assert.deepEqual(JSON.parse(JSON.stringify(result)), result); assert.ok(!JSON.stringify(result).includes(f.root));
  assert.equal(await fs.readFile(path.join(f.root, 'project.json'), 'utf8'), before);
});
for (const [width,height,orientation] of [[2,4,'portrait'],[3,3,'square']]) test(`image orientation ${orientation}`, async () => {
  assert.equal((await probeMediaBytes(await imageBytes(width,height),'image')).image.dimensions.orientation, orientation);
});
for (const format of ['jpeg','webp','gif','tiff']) test(`existing Sharp metadata supports ${format}`, async () => {
  const facts = await probeMediaBytes(await imageBytes(4,2,format),'image'); assert.equal(facts.container, format); assert.equal(facts.image.dimensions.width, 4);
  if (format === 'jpeg') assert.equal(facts.image.hasAlphaChannel, false);
});
test('WAVE PCM exposes measured header duration, rate, channels, codec and bitrate', async t => {
  const result = await inspectMedia(await fixture(t, waveBytes(), 'audio/wav', 'sound.wav')); assert.equal(result.status, 'succeeded');
  assert.equal(result.facts.durationSeconds, 1); assert.equal(result.facts.container, 'wav'); assert.equal(result.facts.hasAudio, true);
  assert.deepEqual(result.facts.streams[0], { index: 0, type: 'audio', codec: 'pcm', durationSeconds: 1, sampleRate: 8000, channels: 1, channelLayout: null, bitsPerSample: 16, bitrate: 128000 });
  assert.equal(result.facts.bitrate.estimated, false); assert.equal(result.unavailable['streams[0].channelLayout'], 'not_reported');
});
test('MP4 preserves video/audio streams, rational average frame rate and estimated file bitrate', async t => {
  const result = await inspectMedia(await fixture(t, movieBytes(), 'video/mp4')); assert.equal(result.status, 'succeeded'); const f = result.facts;
  assert.equal(f.container, 'mp4'); assert.equal(f.durationSeconds, 1); assert.equal(f.hasAudio, true); assert.equal(f.streams.length, 2);
  const v = f.streams[0], a = f.streams[1]; assert.equal(v.codec, 'avc1'); assert.equal(v.dimensions.width, 320); assert.equal(v.dimensions.height, 180); assert.equal(v.dimensions.aspectRatio, 16/9);
  assert.equal(v.frameRate.value, 25); assert.deepEqual(v.pixelAspectRatio, { numerator: 1, denominator: 1, value: 1 }); assert.equal(v.rotationDegrees, 0);
  assert.equal(a.codec, 'mp4a'); assert.equal(a.channels, 2); assert.equal(a.sampleRate, 48000); assert.equal(f.bitrate.value, f.fileSize * 8); assert.equal(f.bitrate.estimated, true);
  assert.deepEqual(f.streamCounts,{video:1,audio:1,other:0});
  assert.equal(result.unavailable['streams[0].bitrate'], 'not_reported'); assert.equal(result.inspection.evidence, 'headers_only');
});
test('rotated video retains encoded dimensions and distinct presentation orientation', async () => {
  const v = (await probeMediaBytes(movieBytes({rotation:90}), 'video')).streams[0]; assert.equal(v.rotationDegrees, 90);
  assert.equal(v.dimensions.orientation, 'landscape'); assert.equal(v.displayDimensions.orientation, 'portrait'); assert.equal(v.displayAspectRatio.value,9/16);
});
test('variable sample deltas remain explicit; no constant frame-rate guarantee', async () => {
  const v = (await probeMediaBytes(movieBytes({variable:true}), 'video')).streams[0]; assert.equal(v.timing, 'variable_sample_deltas'); assert.equal(v.frameRate.value, 30);
});
test('unsupported perspective transform remains unknown rather than inventing a rotation',async()=>{
  const b=movieBytes(),payload=b.indexOf('tkhd')+4; b.writeInt32BE(1,payload+48);
  const s=(await probeMediaBytes(b,'video')).streams[0]; assert.equal(s.rotationDegrees,null); assert.equal(s.displayDimensions,null); assert.equal(s.displayAspectRatio,null);
});
test('multiple video tracks remain in file order without choosing a primary track', async () => {
  const f = await probeMediaBytes(movieBytes({duplicateVideo:true}), 'video'); assert.deepEqual(f.streams.map(s=>s.type), ['video','audio','video']); assert.deepEqual(f.streams.map(s=>s.index), [0,1,2]);
});
test('MOV major brand and absent audio are explicit', async () => {
  const f = await probeMediaBytes(movieBytes({audio:false,brand:'qt  '}), 'video'); assert.equal(f.container,'mov'); assert.equal(f.hasAudio,false);
});
test('missing raster backend rejects with structured code', async () => {
  await assert.rejects(probeImage(await imageBytes(), async()=>{throw Error('/private/backend');}), {inspectionCode:'MEDIA_BACKEND_UNAVAILABLE'});
});
test('malformed metadata backend output rejects instead of inventing dimensions', async () => {
  await assert.rejects(probeImage(await imageBytes(), async()=>()=>({metadata:async()=>({format:'png',width:null,height:2})})), {inspectionCode:'MEDIA_BACKEND_OUTPUT_INVALID'});
});
for (const [name,bytes,mime,expected] of [
  ['unsupported audio',Buffer.from('unsupported mp3 bytes'),'audio/mpeg','MEDIA_FORMAT_UNSUPPORTED'],
  ['unreadable PNG',Buffer.from([137,80,78,71,13,10,26,10]),'image/png','MEDIA_UNREADABLE'],
  ['truncated WAVE',waveBytes().subarray(0,40),'audio/wav','MEDIA_UNREADABLE'],
  ['truncated MP4',movieBytes().subarray(0,40),'video/mp4','MEDIA_UNREADABLE'],
  ['mismatched media role',waveBytes(),'video/mp4','MEDIA_TYPE_MISMATCH'],
  ['unsupported MIME',Buffer.from('fixture'),'text/plain','MEDIA_TYPE_UNSUPPORTED'],
]) test(`${name} fails safely`, async t => {
  const r = await inspectMedia(await fixture(t,bytes,mime)); assert.equal(r.status,'rejected'); assert.equal(code(r),expected); assert.equal(r.schemaVersion,1); assert.equal(r.facts,undefined);
});
test('missing registered asset rejects', async t => { const f=await fixture(t,waveBytes(),'audio/wav'); assert.equal(code(await inspectMedia({...f,assetId:'absent'})),'ASSET_NOT_FOUND'); });
test('project checksum remains enforced', async t => { const f=await fixture(t,waveBytes(),'audio/wav'); await fs.writeFile(path.join(f.root,f.record.path),waveBytes().subarray(0,50)); assert.equal(code(await inspectMedia(f)),'ASSET_HASH_MISMATCH'); });
test('asset IDs cannot grant filesystem traversal', async t => {
  const f=await fixture(t,waveBytes(),'audio/wav'); for(const assetId of ['/etc/passwd','../outside','file:///etc/passwd','https://example.com/audio.wav']) assert.equal(code(await inspectMedia({...f,assetId})),'ASSET_ID_INVALID');
});
test('registered file symlinks cannot escape project boundaries', async t => {
  const f=await fixture(t,waveBytes(),'audio/wav'); await fs.unlink(path.join(f.root,f.record.path)); await fs.symlink('/etc/passwd',path.join(f.root,f.record.path)); assert.equal(code(await inspectMedia(f)),'PROJECT_PATH_UNSAFE');
});
test('plan retains logical identity, validates requirements and performs no header probe or transport', async t => {
  const network=offline(t),f=await fixture(t,Buffer.from('unreadable but registered'),'video/mp4'); const r=await planMediaInspection({...f,requirements:{maxDuration:10}});
  assert.equal(r.status,'planned'); assert.equal(r.source.path,f.record.path); assert.equal(r.providerCost,0); assert.equal(r.remoteTransport,false); assert.equal(r.expectedResultKind,'media-inspection'); assert.equal(r.facts,undefined); assert.equal(network(),0); assert.ok(!JSON.stringify(r).includes(f.root));
});
for (const requirements of [{arbitrary:1},{minWidth:0},{minWidth:1.1},{minDuration:-1},{maxDuration:NaN},{expectedAudio:'true'},{expectedMediaKind:'text'},{allowedCodecs:[]},{allowedContainers:['unknown']},{aspectRatios:[0]},{minDuration:3,maxDuration:2},{aspectTolerance:0.1},{minFrameRate:30,maxFrameRate:20}]) test(`invalid profile ${JSON.stringify(requirements)} rejects`, () => {
  assert.throws(()=>validateInspectionRequirements(requirements));
});
const videoFacts=async()=>({...await probeMediaBytes(movieBytes(),'video'),fileSize:1000});
for(const [requirements,status,warning]of[
  [{minWidth:300,minHeight:180},'pass',null],[{minWidth:321},'fail','DIMENSION_BELOW_MINIMUM'],
  [{aspectRatios:[16/9]},'pass',null],[{aspectRatios:[1]},'fail','ASPECT_MISMATCH'],
  [{minDuration:1,maxDuration:1},'pass',null],[{maxDuration:0.5},'fail','DURATION_ABOVE_MAXIMUM'],
  [{expectedAudio:true},'pass',null],[{expectedAudio:false},'fail','AUDIO_PRESENCE_MISMATCH'],
  [{allowedCodecs:['avc1','mp4a'],allowedContainers:['mp4']},'pass',null],[{allowedCodecs:['pcm']},'fail','CODEC_NOT_ALLOWED'],
  [{allowedContainers:['wav']},'fail','CONTAINER_NOT_ALLOWED'],[{minFrameRate:24,maxFrameRate:30},'pass',null],
  [{maxFrameRate:24},'fail','FRAME_RATE_OUT_OF_RANGE'],[{maxFileSize:999},'fail','FILE_SIZE_EXCEEDED'],
  [{expectedMediaKind:'image'},'fail','MEDIA_KIND_MISMATCH'],
]) test(`explicit technical profile ${JSON.stringify(requirements)} => ${status}`,async()=>{
  const result=validateTechnicalFacts(await videoFacts(),requirements); assert.equal(result.status,status); if(warning)assert.ok(result.warnings.some(w=>w.code===warning)); else assert.deepEqual(result.warnings,[]);
});
test('unknown required facts are unevaluable rather than passing or fabricated', async()=>{
  const f=await videoFacts(); f.streams[0].frameRate=null; const r=validateTechnicalFacts(f,{minFrameRate:24}); assert.equal(r.status,'unknown'); assert.equal(r.warnings[0].code,'REQUIREMENT_UNEVALUABLE');
});
test('sparse or oversized requirement arrays reject rather than bypassing item validation',()=>{
  for(const aspectRatios of [Array(1),Array(33).fill(1),[undefined],[Infinity]]) assert.throws(()=>validateInspectionRequirements({aspectRatios}));
});
test('no unstated resolution/aspect/frame-rate/bitrate quality threshold exists', async()=>{
  const r=validateTechnicalFacts(await videoFacts()); assert.equal(r.status,'not_requested'); assert.deepEqual(r.warnings,[]); assert.deepEqual(r.technicalWarnings,[]);
});
test('zero duration produces an intrinsic technical warning, not a quality score',async()=>{
  const f=await videoFacts(); f.durationSeconds=0; assert.deepEqual(validateTechnicalFacts(f).technicalWarnings,[{code:'NONPOSITIVE_DURATION',field:'durationSeconds'}]);
});
test('missing pixel-aspect metadata remains unknown for display-aspect validation',async()=>{
  const f={...await probeMediaBytes(movieBytes({pasp:false}),'video'),fileSize:1000}; assert.equal(f.streams[0].pixelAspectRatio,null);
  const result=validateTechnicalFacts(f,{aspectRatios:[16/9]}); assert.equal(result.status,'unknown'); assert.equal(result.warnings[0].code,'REQUIREMENT_UNEVALUABLE');
});
test('malformed sizes, extended box lengths and chunk sizes cannot read beyond buffers',async()=>{
  const wave=waveBytes(); wave.writeUInt32LE(0xffffffff,40);
  const movie=movieBytes(); movie.writeUInt32BE(0xffffffff,0);
  const extended=Buffer.alloc(16); extended.writeUInt32BE(1); extended.write('ftyp',4); extended.writeBigUInt64BE(0xffffffffffffffffn,8);
  for(const [bytes,kind]of[[wave,'audio'],[movie,'video'],[extended,'video']]) await assert.rejects(probeMediaBytes(bytes,kind));
});
test('box bounds and fragmented/unsupported variants reject deterministically',async()=>{
  for(const b of [Buffer.concat([movieBytes(),box('moof')]),Buffer.concat([movieBytes(),Buffer.from([0,0,0,1])])]) await assert.rejects(probeMediaBytes(b,'video'));
});
test('projection and all three planning views derive the tool automatically with v1 semantics',()=>{
  const p=projectCapabilities(),cap=p.capabilities.find(c=>c.id==='INSPECT_MEDIA'),e=cap.executors[0]; assert.equal(p.schemaVersion,1); assert.equal(e.id,'media-inspection'); assert.equal(e.runtime.class,'local'); assert.equal(e.operation,'inspect');
  assert.equal(e.available,true); assert.equal(e.result.kind,'media-inspection'); assert.equal(e.inputs[0].projectAssetRequired,true); assert.deepEqual(e.inputs[0].acceptedTypes,['image','video','audio']);
  assert.equal(e.binding.planOperation,'planMediaInspection'); assert.equal(e.binding.executeOperation,'inspectMedia'); assert.equal(e.binding.deterministic,true); assert.equal(e.binding.readOnly,true); assert.equal(e.binding.requiresAllowExecution,true);
  assert.ok(getPlanningOverview().capabilities.some(c=>c.id==='INSPECT_MEDIA')); assert.deepEqual(getCapabilityContext('INSPECT_MEDIA').executors[0].inputs,e.inputs);
  assert.deepEqual(getExecutorContext('media-inspection').executor,e); assert.equal(getCapabilityContext('INSPECT_MEDIA').executors[0].runtime.method,'inspectMedia');
});
test('direct host inspection is authorized, project-scoped, transport-free and nonmutating',async t=>{
  const f=await fixture(t,waveBytes(),'audio/wav'),before=await fs.readFile(path.join(f.root,'project.json'),'utf8'),network=offline(t); let calls=0;
  const host=createWorkflowHost({callRuntime:()=>{calls++;throw Error('Forbidden');}}),opened=await host.invoke('openProject',{projectRoot:f.root}),request={projectHandle:opened.projectHandle,assetId:'sample'};
  assert.equal(code(await host.invoke('inspectMedia',request)),'EXECUTION_NOT_AUTHORIZED'); assert.equal((await host.invoke('planMediaInspection',request)).status,'planned');
  const result=await host.invoke('inspectMedia',{...request,allowExecution:true,requirements:{minDuration:1}}); assert.equal(result.status,'succeeded'); assert.equal(result.validation.status,'pass');
  for(const extra of [{path:'/etc/passwd'},{backend:'shell'},{provider_options:{}},{root:f.root}]) assert.equal((await host.invoke('inspectMedia',{...request,allowExecution:true,...extra})).status,'rejected');
  assert.equal((await host.invoke('inspectMedia',{...request,allowExecution:true,projectHandle:'foreign'})).status,'rejected');
  assert.equal(calls,0); assert.equal(network(),0); assert.equal(await fs.readFile(path.join(f.root,'project.json'),'utf8'),before);
});

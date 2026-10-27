import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { createProject } from 'whihm-workflow-core';
import { createMediaFinishing, planMediaFinishing, finishMedia, validateFinishingRequest } from '../lib/whihm-execution/media-finishing.mjs';
import { createImageFinisher, transformImageBytes } from '../lib/whihm-execution/image-finishing-backend.mjs';
import { inspectMedia } from '../lib/whihm-execution/media-inspection.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { imageBytes, movieBytes, waveBytes } from './helpers/mediaInspectionFixtures.mjs';
async function fixture(t, bytes, type = 'image/png') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'whihm-finishing-test-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const root = path.join(dir,'project'), created = await createProject(root,{title:'Finishing fixture'}); assert.equal(created.status,'created');
  const filename = path.join(dir,'source.bin'); await fs.writeFile(filename, bytes ?? await imageBytes());
  const imported = await created.project.importAsset({sourcePath:filename,assetId:'original',contentType:type}); assert.equal(imported.status,'imported');
  return {project:created.project,root,assetId:'original',record:imported.asset,operation:'resize',parameters:{width:8,height:6,fit:'fill',outputFormat:'png'}};
}
const code = r=>r.diagnostics?.[0]?.code;
const assets = async f=>(await f.project.listProjectAssets()).assets;
test('deterministic plan exposes upright source facts/effective defaults and creates no files or transform job',async t=>{
  const f=await fixture(t),before=await fs.readFile(path.join(f.root,'project.json'),'utf8');let calls=0;
  const finisher=createMediaFinishing({transform:()=>{calls++;throw Error('No transform');}}),p=await finisher.plan(f);
  assert.equal(p.status,'planned'); assert.equal(p.mode,'finish_media'); assert.deepEqual(p,await finisher.plan(f));
  assert.deepEqual(p.parameters,{compressionLevel:6,fit:'fill',height:6,metadata:'strip',outputFormat:'png',width:8});
  assert.equal(p.sourceInspection.facts.image.displayDimensions.width,4); assert.deepEqual(p.expectedOutput,{mediaKind:'image',container:'png',width:8,height:6});
  assert.equal(p.providerCost,0); assert.equal(p.remoteTransport,false); assert.equal(calls,0); assert.equal(await fs.readFile(path.join(f.root,'project.json'),'utf8'),before); assert.ok(!JSON.stringify(p).includes(f.root));
});
test('finishing requires separate explicit execution permission',async t=>{const f=await fixture(t);assert.equal(code(await finishMedia(f)),'EXECUTION_NOT_AUTHORIZED');assert.equal((await assets(f)).length,1);});
for(const [operation,parameters,expected]of[
  ['resize',{width:8,height:6,fit:'fill',outputFormat:'png'},[8,6,'png']],
  ['resize',{width:3,height:3,fit:'cover',outputFormat:'png'},[3,3,'png']],
  ['crop',{left:1,top:0,width:2,height:2,outputFormat:'png'},[2,2,'png']],
  ['contain',{width:8,height:8,background:'#ff0000',outputFormat:'png'},[8,8,'png']],
  ['convert',{outputFormat:'jpeg',quality:92,flattenBackground:'#ffffff'},[4,2,'jpeg']],
  ['convert',{outputFormat:'webp',quality:87},[4,2,'webp']],
])test(`${operation} ${JSON.stringify(parameters)} produces a separate inspected project asset`,async t=>{
  const f=await fixture(t),original=await fs.readFile(path.join(f.root,f.record.path)),r=await finishMedia({...f,operation,parameters,allowExecution:true});
  assert.equal(r.status,'succeeded',JSON.stringify(r)); assert.notEqual(r.output.assetId,'original'); assert.notEqual(r.output.path,f.record.path);
  const inspected=await inspectMedia({...f,assetId:r.output.assetId}); assert.equal(inspected.status,'succeeded'); const d=inspected.facts.image.displayDimensions;
  assert.deepEqual([d.width,d.height,inspected.facts.container],expected); assert.equal(r.output.verification.status,'verified');
  assert.deepEqual(await fs.readFile(path.join(f.root,f.record.path)),original); assert.equal((await f.project.verifyProjectIntegrity()).status,'valid'); assert.ok(!JSON.stringify(r).includes(f.root));
});
test('contain uses the requested exact canvas background without semantic crop',async t=>{
  const f=await fixture(t),r=await finishMedia({...f,operation:'contain',parameters:{width:8,height:8,background:'#ff0000',outputFormat:'png'},allowExecution:true});
  const decoded=await sharp(await fs.readFile(path.join(f.root,r.output.path))).raw().toBuffer({resolveWithObject:true}); assert.deepEqual([...decoded.data.subarray(0,4)],[255,0,0,255]);
});
test('crop selects exact coordinate pixels',async t=>{
  const bytes=await sharp(Buffer.from([255,0,0,0,255,0,0,0,255,255,255,0]),{raw:{width:2,height:2,channels:3}}).png().toBuffer();
  const f=await fixture(t,bytes),r=await finishMedia({...f,operation:'crop',parameters:{left:1,top:0,width:1,height:1,outputFormat:'png'},allowExecution:true});
  assert.equal(r.status,'succeeded'); const pixels=await sharp(await fs.readFile(path.join(f.root,r.output.path))).removeAlpha().raw().toBuffer(); assert.deepEqual([...pixels],[0,255,0]);
});
test('identical recipe yields identical bytes but distinct registered outputs',async t=>{
  const f=await fixture(t),a=await finishMedia({...f,allowExecution:true}),b=await finishMedia({...f,allowExecution:true});
  assert.equal(a.status,'succeeded'); assert.equal(b.status,'succeeded'); assert.equal(a.output.checksum,b.output.checksum); assert.notEqual(a.output.assetId,b.output.assetId); assert.notEqual(a.output.path,b.output.path);
});
test('output records parent/checksum/normalized recipe and protects the referenced parent',async t=>{
  const f=await fixture(t),r=await finishMedia({...f,allowExecution:true}),{asset}=await f.project.getProjectAsset(r.output.assetId);
  assert.deepEqual(asset.source,{assetId:'original',checksum:f.record.checksum}); assert.equal(asset.metadata.deterministicFinishing.operation,'resize');
  assert.deepEqual(asset.metadata.deterministicFinishing.parameters,r.parameters); assert.ok(asset.metadata.deterministicFinishing.backend.versions.sharp);
  assert.equal(asset.checksum,r.output.checksum); assert.equal(asset.size,r.output.size); assert.equal((await f.project.removeProjectAsset('original')).diagnostics[0].code,'ASSET_REFERENCED_REMOVE_BLOCKED');
});
for(const metadata of ['strip','preserve'])test(`EXIF orientation and metadata policy ${metadata}`,async t=>{
  const bytes=await sharp({create:{width:6,height:4,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer(),f=await fixture(t,bytes,'image/jpeg');
  const r=await finishMedia({...f,operation:'convert',parameters:{outputFormat:'png',metadata},allowExecution:true});assert.equal(r.status,'succeeded');
  const m=await sharp(await fs.readFile(path.join(f.root,r.output.path))).metadata(); assert.deepEqual([m.width,m.height],[4,6]); assert.equal(Boolean(m.exif),metadata==='preserve'); assert.ok(m.orientation===undefined||m.orientation===1);
});
test('crop bounds use upright EXIF-oriented pixels before extraction',async t=>{
  const b=await sharp({create:{width:6,height:4,channels:3,background:'red'}}).png().withMetadata({orientation:6}).toBuffer(),f=await fixture(t,b);
  const r=await finishMedia({...f,operation:'crop',parameters:{left:0,top:4,width:4,height:2,outputFormat:'png'},allowExecution:true});assert.equal(r.status,'succeeded');assert.equal(r.output.inspection.facts.image.displayDimensions.width,4);assert.equal(r.output.inspection.facts.image.displayDimensions.height,2);
});
test('multi-page/animated input is rejected rather than silently taking the first frame',async t=>{
  const raw=Buffer.concat([Buffer.alloc(12,0),Buffer.alloc(12,255)]),b=await sharp(raw,{raw:{width:2,height:4,channels:3,pageHeight:2}}).gif({delay:[100,100]}).toBuffer();
  assert.equal((await sharp(b).metadata()).pages,2);const f=await fixture(t,b,'image/gif');assert.equal(code(await planMediaFinishing(f)),'FINISH_MULTIPAGE_UNSUPPORTED');assert.equal((await assets(f)).length,1);
});
for(const outputFormat of ['jpeg','webp'])test(`${outputFormat} repeated encoding is reproducible on the recorded backend`,async t=>{
  const f=await fixture(t),parameters={outputFormat,quality:80,...(outputFormat==='jpeg'?{flattenBackground:'#ffffff'}:{})};
  const a=await finishMedia({...f,operation:'convert',parameters,allowExecution:true}),b=await finishMedia({...f,operation:'convert',parameters,allowExecution:true});assert.equal(a.status,'succeeded');assert.equal(b.status,'succeeded');assert.equal(a.output.checksum,b.output.checksum);assert.deepEqual(a.backend,b.backend);
});
test('zero compression is retained and encoding controls are normalized only for the selected writer',()=>{
  assert.equal(validateFinishingRequest('convert',{outputFormat:'png',compressionLevel:0}).compressionLevel,0);assert.equal(validateFinishingRequest('convert',{outputFormat:'jpeg',quality:1}).quality,1);
  assert.equal(validateFinishingRequest('convert',{outputFormat:'webp'}).quality,80);
});
for(const [operation,parameters,expected]of[
  ['resize',{width:0,height:1,fit:'fill',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['resize',{width:2.5,height:1,fit:'fill',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['resize',{width:2,height:-1,fit:'fill',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['resize',{width:8193,height:1,fit:'fill',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['resize',{width:2,height:1,fit:'attention',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['resize',{width:2,height:1,outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['crop',{left:-1,top:0,width:2,height:1,outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['contain',{width:4,height:4,background:'red; rm -rf /',outputFormat:'png'},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'avif'},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',quality:80},'FINISH_WRITER_OPTION_UNSUPPORTED'],
  ['convert',{outputFormat:'jpeg',compressionLevel:6},'FINISH_WRITER_OPTION_UNSUPPORTED'],
  ['convert',{outputFormat:'webp',quality:101},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',compressionLevel:10},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',metadata:'all'},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',command:'touch injected'},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',provider_options:{}},'FINISH_PARAMETERS_INVALID'],
  ['convert',{outputFormat:'png',outputPath:'/etc/overwrite'},'FINISH_PARAMETERS_INVALID'],
  ['resize; touch injected',{outputFormat:'png'},'FINISH_OPERATION_UNSUPPORTED'],
  [['resize'],{outputFormat:'png'},'FINISH_OPERATION_UNSUPPORTED'],
])test(`invalid typed request ${JSON.stringify({operation,parameters})}`,()=>{assert.throws(()=>validateFinishingRequest(operation,parameters),e=>(e.finishingCode||e.diagnostic?.code)===expected);});
for(const [operation,parameters,expected]of[
  ['crop',{left:3,top:0,width:2,height:1,outputFormat:'png'},'FINISH_CROP_OUT_OF_BOUNDS'],
  ['resize',{width:8192,height:8192,fit:'fill',outputFormat:'png'},'FINISH_PIXEL_LIMIT'],
  ['convert',{outputFormat:'jpeg'},'FINISH_JPEG_FLATTEN_REQUIRED'],
  ['contain',{width:4,height:4,background:'#00000000',outputFormat:'jpeg',flattenBackground:'#ffffff'},'FINISH_JPEG_BACKGROUND_INVALID'],
])test(`input-aware rejection ${expected} creates no transform/output`,async t=>{
  const f=await fixture(t);let calls=0;const finisher=createMediaFinishing({transform:()=>{calls++;throw Error('Forbidden');}});
  assert.equal(code(await finisher.finish({...f,operation,parameters,allowExecution:true})),expected);assert.equal(calls,0);assert.equal((await assets(f)).length,1);
});
test('project integrity and asset-ID boundaries remain authoritative',async t=>{
  const f=await fixture(t);for(const assetId of ['/etc/passwd','../outside','file:///tmp/source'])assert.equal(code(await planMediaFinishing({...f,assetId})),'ASSET_ID_INVALID');
  assert.equal(code(await planMediaFinishing({...f,assetId:'missing'})),'ASSET_NOT_FOUND');await fs.writeFile(path.join(f.root,f.record.path),'tampered');assert.equal(code(await finishMedia({...f,allowExecution:true})),'ASSET_HASH_MISMATCH');
});
for(const [type,bytes]of[['video/mp4',movieBytes()],['audio/wav',waveBytes()]])test(`${type} finishing remains unavailable`,async t=>{
  const f=await fixture(t,bytes,type);assert.equal(code(await planMediaFinishing(f)),'FINISH_MEDIA_KIND_UNSUPPORTED');assert.equal((await assets(f)).length,1);
});
test('missing Sharp backend fails structurally',async()=>{await assert.rejects(transformImageBytes(await imageBytes(),'convert',{outputFormat:'png'},async()=>{throw Error('/private/backend');}),{finishingCode:'FINISH_BACKEND_UNAVAILABLE'});});
for(const [name,transform,expected]of[
  ['failure',async()=>{throw Error('/private/failure');},'FINISH_FAILED'],
  ['empty',async()=>({bytes:Buffer.alloc(0),backend:{versions:{sharp:'fixture'}}}),'FINISH_BACKEND_OUTPUT_INVALID'],
  ['wrong dimensions',async()=>({bytes:await imageBytes(),backend:{versions:{sharp:'fixture'}}}),'FINISH_OUTPUT_VERIFICATION_FAILED'],
  ['wrong format',async()=>({bytes:await imageBytes(8,6,'jpeg'),backend:{versions:{sharp:'fixture'}}}),'FINISH_OUTPUT_VERIFICATION_FAILED'],
])test(`backend ${name} cannot publish output`,async t=>{
  const f=await fixture(t),r=await createMediaFinishing({transform}).finish({...f,allowExecution:true});assert.equal(code(r),expected);assert.equal((await assets(f)).length,1);assert.ok(!JSON.stringify(r).includes('/private'));
});
test('private temporary output is removed after success and importer rejection',async t=>{
  const f=await fixture(t);let transient;
  const project={...f.project,importAsset:async request=>{transient=request.sourcePath;return f.project.importAsset(request);}};
  const r=await finishMedia({...f,project,allowExecution:true});assert.equal(r.status,'succeeded');await assert.rejects(fs.stat(transient),{code:'ENOENT'});
  const badProject={...f.project,importAsset:async request=>{transient=request.sourcePath;return {status:'rejected',diagnostics:[{code:'PROJECT_BUSY'}]};}};
  assert.equal(code(await finishMedia({...f,project:badProject,allowExecution:true})),'PROJECT_BUSY');await assert.rejects(fs.stat(transient),{code:'ENOENT'});assert.equal((await assets(f)).length,2);
});
test('worker timeout terminates its worker and publishes nothing',async t=>{
  const f=await fixture(t);let worker;
  class WaitingWorker {constructor(){worker=new Worker('setInterval(()=>{},1000)',{eval:true});return worker;}}
  const finisher=createMediaFinishing({transform:createImageFinisher({WorkerClass:WaitingWorker,timeoutMs:10})});
  const r=await finisher.finish({...f,allowExecution:true});assert.equal(code(r),'FINISH_TIMEOUT');assert.equal(worker.threadId,-1);assert.equal((await assets(f)).length,1);
});
test('worker startup/exit/malformed output errors are structured',async()=>{
  class MissingWorker {constructor(){throw Error('/private/executable');}}
  await assert.rejects(createImageFinisher({WorkerClass:MissingWorker})(Buffer.from('x'),'convert',{}),{finishingCode:'FINISH_BACKEND_UNAVAILABLE'});
  class ExitingWorker {constructor(){return new Worker('process.exit(3)',{eval:true});}}
  await assert.rejects(createImageFinisher({WorkerClass:ExitingWorker})(Buffer.from('x'),'convert',{}),{finishingCode:'FINISH_WORKER_EXITED'});
  class BadWorker {constructor(){return new Worker('require("node:worker_threads").parentPort.postMessage({ok:true,bytes:1})',{eval:true});}}
  await assert.rejects(createImageFinisher({WorkerClass:BadWorker})(Buffer.from('x'),'convert',{}),{finishingCode:'FINISH_BACKEND_OUTPUT_INVALID'});
});
test('projection and all planning views derive local image finishing',()=>{
  const p=projectCapabilities(),e=p.capabilities.find(c=>c.id==='FINISH_MEDIA').executors[0];assert.equal(p.schemaVersion,1);assert.equal(e.runtime.class,'local');assert.equal(e.available,true);assert.equal(e.partial,true);
  assert.deepEqual(e.controls.operation.enum,['resize','crop','contain','convert']);assert.equal(e.inputs[0].type,'image');assert.equal(e.binding.readOnly,false);assert.equal(e.result.kind,'derived-project-image');
  assert.ok(getPlanningOverview().capabilities.some(c=>c.id==='FINISH_MEDIA'));assert.equal(getCapabilityContext('FINISH_MEDIA').executors[0].id,'media-finishing');assert.deepEqual(getExecutorContext('media-finishing').executor,e);
});
test('host finishing is project-scoped, explicit, provider-free and rejects raw options',async t=>{
  const f=await fixture(t);let calls=0,network=0;t.mock.method(globalThis,'fetch',()=>{network++;throw Error('Transport forbidden');});
  const host=createWorkflowHost({callRuntime:()=>{calls++;throw Error('Runtime forbidden');}}),opened=await host.invoke('openProject',{projectRoot:f.root});
  const req={projectHandle:opened.projectHandle,assetId:'original',operation:f.operation,parameters:f.parameters};
  assert.equal(code(await host.invoke('finishMedia',req)),'EXECUTION_NOT_AUTHORIZED');assert.equal((await host.invoke('planMediaFinishing',req)).status,'planned');assert.equal((await host.invoke('finishMedia',{...req,allowExecution:true})).status,'succeeded');
  for(const extra of [{outputPath:'/etc/overwrite'},{command:'anything'},{backend:'shell'},{provider_options:{}}])assert.equal(code(await host.invoke('finishMedia',{...req,...extra,allowExecution:true})),'HOST_REQUEST_INVALID');
  assert.equal(code(await host.invoke('finishMedia',{...req,projectHandle:'foreign',allowExecution:true})),'PROJECT_HANDLE_INVALID');assert.equal(calls,0);assert.equal(network,0);
});

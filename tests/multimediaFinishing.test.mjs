// Scope C acceptance: fake transform processes and generated technical headers.
// These tests do NOT certify FFmpeg decoding, encoded pixels/samples, or real transforms.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createProject } from 'whihm-workflow-core';
import { createMediaFinishing, planMediaFinishing, finishMedia } from '../lib/whihm-execution/media-finishing.mjs';
import { prepareMultimediaOperation, buildMultimediaArguments, verifyMultimediaOutput } from '../lib/whihm-execution/multimedia-finishing-contract.mjs';
import { createMultimediaFinisher } from '../lib/whihm-execution/multimedia-finishing-backend.mjs';
import { createMultimediaRuntime, configureMultimediaRuntime, getMultimediaRuntimeStatus } from '../lib/whihm-execution/multimedia-runtime.mjs';
import { runBoundedMediaProcess } from '../lib/whihm-execution/multimedia-process.mjs';
import { inspectMediaBuffer } from '../lib/whihm-execution/media-inspection.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { imageBytes, movieBytes, waveBytes } from './helpers/mediaInspectionFixtures.mjs';
import { runtimeFixture, probeFixture, versionText, tableText } from './helpers/multimediaRuntimeFixtures.mjs';

const video={container:'mp4',videoCodec:'h264',audio:'preserve',audioCodec:'aac'};
const audio={container:'wav',audioCodec:'pcm_s16le'};
const code=r=>r.diagnostics?.[0]?.code;
const videoFacts=(await inspectMediaBuffer(movieBytes(),'video')).facts;
const audioFacts=(await inspectMediaBuffer(waveBytes(),'audio')).facts;
const planFor=(kind,operation,parameters)=>({operation,sourceInspection:{facts:kind==='video'?videoFacts:audioFacts},...prepareMultimediaOperation(kind,operation,parameters,kind==='video'?videoFacts:audioFacts)});
async function projectFixture(t,kind='video') {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-av-finish-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'project'),{project,status}=await createProject(root,{title:'Mock transform boundary'});assert.equal(status,'created');
  const sourcePath=path.join(directory,'source.bin'),bytes=kind==='video'?movieBytes():kind==='audio'?waveBytes():await imageBytes();
  await fs.writeFile(sourcePath,bytes);
  const imported=await project.importAsset({sourcePath,assetId:'original',contentType:kind==='video'?'video/mp4':kind==='audio'?'audio/wav':'image/png'});assert.equal(imported.status,'imported');
  return {project,root,assetId:'original',operation:kind==='video'?'transcode':'convert',parameters:kind==='video'?video:kind==='audio'?audio:{outputFormat:'png'},record:imported.asset,bytes};
}
async function fixtureRuntime(t,probe=probeFixture) {
  const f=await runtimeFixture(t),directory=await f.pair(path.join(f.root,'runtime pair'));
  return createMultimediaRuntime({configuredDir:directory,env:{PATH:''},probe});
}
function outputFor(plan) {
  const e=plan.expectedOutput;
  return e.mediaKind==='video'?movieBytes({width:e.width,height:e.height,durationSeconds:e.durationSeconds,fps:e.fps,audio:e.hasAudio,brand:e.container==='mov'?'qt  ':'mp42'}):waveBytes({sampleRate:e.sampleRate,channels:e.channels,durationSeconds:e.durationSeconds});
}
async function mockedFinisher(t,{run,output=outputFor}={}) {
  const runtime=await fixtureRuntime(t),paths=[];
  let selectedPlan;
  const backend=createMultimediaFinisher({acquire:()=>runtime.acquire(),run:run??(async(_exe,args)=>{
    paths.push(args.at(-1));await fs.writeFile(args.at(-1),output(selectedPlan));return {ok:true};
  })});
  return {paths,runtime,finisher:createMediaFinishing({multimediaTransform:(bytes,plan)=>{selectedPlan=plan;return backend(bytes,plan);}})};
}
test.beforeEach(()=>configureMultimediaRuntime({env:{PATH:''}}));
test.after(()=>configureMultimediaRuntime({}));

for(const kind of ['video','audio'])test(`${kind} plan is deterministic, non-mutating and does not probe or transform`,async t=>{
  let probes=0,transforms=0;configureMultimediaRuntime({env:{PATH:''},probe:()=>{probes++;throw Error();}});
  const f=await projectFixture(t,kind),before=await fs.readFile(path.join(f.root,'project.json'));
  const service=createMediaFinishing({multimediaTransform:()=>{transforms++;throw Error();}}),p=await service.plan(f);
  assert.equal(p.status,'planned',JSON.stringify(p));assert.deepEqual(p,await service.plan(f));assert.equal(p.expectedOutput.mediaKind,kind);
  assert.equal(p.execution.executable,false);assert.equal(p.runtime.snapshot.availability,'unverified');assert.equal(p.providerCost,0);assert.equal(p.remoteTransport,false);
  assert.ok(p.requiredRuntimeFeatures.includes('ffmpeg.encoders.libx264'));assert.deepEqual([probes,transforms],[0,0]);
  assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),before);assert.ok(!JSON.stringify(p).includes(f.root));assert.equal((await f.project.listProjectAssets()).assets.length,1);
  await getMultimediaRuntimeStatus();const missing=await service.plan(f);assert.equal(missing.runtime.snapshot.availability,'missing');assert.equal(missing.execution.executable,false);
});
test('Sharp image finishing is independent of missing multimedia pair',async t=>{
  const f=await projectFixture(t,'image');await getMultimediaRuntimeStatus();const r=await finishMedia({...f,allowExecution:true});assert.equal(r.status,'succeeded');assert.ok(r.backend.versions.sharp);
});
for(const [name,probe,pair]of[
  ['missing',probeFixture,{ffmpeg:false,ffprobe:false}],['partial',probeFixture,{ffprobe:false}],
  ['incompatible',async(_f,b,q)=>({ok:true,stdout:q==='version'?versionText(b,b==='ffmpeg'?'7.1':'8.0.1'):tableText(q)}),{}],
  ['unverified',async()=>({ok:false,code:'MM_PROBE_TIMEOUT'}),{}],
  ['missing baseline encoder',async(f,b,q)=>q==='encoders'?{ok:true,stdout:tableText(q,['aac','pcm_s16le'])}:probeFixture(f,b,q),{}],
])for(const kind of ['video','audio'])test(`${kind} execution blocks ${name} runtime without a transform/output`,async t=>{
  const f=await projectFixture(t,kind),rf=await runtimeFixture(t),dir=await rf.pair(path.join(rf.root,'pair'),pair);let transforms=0;
  const runtime=createMultimediaRuntime({configuredDir:dir,env:{PATH:''},probe});
  const service=createMediaFinishing({multimediaTransform:createMultimediaFinisher({acquire:()=>runtime.acquire(),run:()=>{transforms++;throw Error();}})});
  const r=await service.finish({...f,allowExecution:true});assert.equal(code(r),'FINISH_RUNTIME_NOT_READY');assert.equal(transforms,0);assert.notEqual(r.runtime.availability,'ready');assert.equal((await f.project.listProjectAssets()).assets.length,1);
});
test('execution separately requires literal permission before lease acquisition',async t=>{
  const f=await projectFixture(t);let calls=0;const service=createMediaFinishing({multimediaTransform:()=>{calls++;throw Error();}});
  for(const allowExecution of [undefined,false,'true',1])assert.equal(code(await service.finish({...f,allowExecution})),'EXECUTION_NOT_AUTHORIZED');assert.equal(calls,0);
});

const videoCases=[['trim',{start:0.2,end:0.6}],['resize',{width:160,height:90}],['crop',{left:2,top:2,width:160,height:90}],['contain',{width:400,height:400,background:'#1234AB'}],['fps',{fps:50}],['transcode',{container:'mov',videoBitrate:1000000}],['transcode',{audio:'remove',audioCodec:undefined}]];
const audioCases=[['trim',{start:0.2,duration:0.4}],['fade_in',{seconds:0.2}],['fade_out',{seconds:0.2}],['gain',{gainDb:0}],['resample',{sampleRate:16000}],['channels',{channels:2}],['convert',{}]];
for(const [kind,cases,base]of[['video',videoCases,video],['audio',audioCases,audio]])for(const [operation,extra]of cases)test(`mocked ${kind} ${operation} command and verified publication boundary ${JSON.stringify(extra)}`,async t=>{
  const f=await projectFixture(t,kind),parameters=Object.fromEntries(Object.entries({...base,...extra}).filter(([,v])=>v!==undefined)),m=await mockedFinisher(t);
  const r=await m.finisher.finish({...f,operation,parameters,allowExecution:true});assert.equal(r.status,'succeeded',JSON.stringify(r));assert.notEqual(r.output.assetId,f.assetId);assert.equal(r.output.verification.status,'verified');
  assert.equal(r.output.inspection.inspection.evidence,'headers_only');assert.deepEqual(await fs.readFile(path.join(f.root,f.record.path)),f.bytes);
  const {asset}=await f.project.getProjectAsset(r.output.assetId);assert.deepEqual(asset.source,{assetId:f.assetId,checksum:f.record.checksum});assert.equal(asset.metadata.deterministicFinishing.operation,operation);assert.deepEqual(asset.metadata.deterministicFinishing.parameters,r.parameters);assert.equal(asset.metadata.deterministicFinishing.backend.versions.ffmpeg.major,8);
  assert.equal((await f.project.verifyProjectIntegrity()).status,'valid');assert.equal(r.output.checksum,asset.checksum);assert.ok(!JSON.stringify(r).includes(path.dirname(f.root)));
  for(const filename of m.paths)await assert.rejects(fs.stat(path.dirname(filename)),{code:'ENOENT'});
});
test('trim start/end and start/duration normalize identically, retaining zero',()=>{
  assert.deepEqual(planFor('video','trim',{...video,start:0,end:0.4}),planFor('video','trim',{...video,start:0,duration:0.4}));
  assert.equal(planFor('audio','gain',{...audio,gainDb:0}).parameters.gainDb,0);
});
test('zero-duration fades are explicit no-ops, never backend default-length fades',()=>{
  for(const operation of ['fade_in','fade_out']) {
    const p=planFor('audio',operation,{...audio,seconds:0}),args=buildMultimediaArguments(p,'/private/input.wav','/private/output.wav');
    assert.equal(p.parameters.seconds,0);assert.ok(!args.includes('-af'));
    assert.throws(()=>planFor('audio',operation,{...audio,seconds:0.000001}),{finishingCode:'FINISH_FADE_OUT_OF_BOUNDS'});
  }
});
test('sub-frame/sub-sample trim requests reject before an unrepresentable output',()=>{
  for(const [kind,base]of [['video',video],['audio',audio]])assert.throws(()=>planFor(kind,'trim',{...base,start:0,duration:0.000001}),{finishingCode:'FINISH_DURATION_UNREPRESENTABLE'});
});
for(const [label,change]of[
  ['multiple video streams',f=>{f.streams.push({...f.streams[0]});}],
  ['other stream',f=>{f.streams.push({type:'other'});}],
  ['unknown pixel aspect',f=>{f.streams[0].pixelAspectRatio=null;}],
  ['non-square pixel aspect',f=>{f.streams[0].pixelAspectRatio.value=2;}],
  ['rotation',f=>{f.streams[0].rotationDegrees=90;}],
  ['variable sample timing',f=>{f.streams[0].timing='variable_sample_deltas';}],
  ['unknown duration',f=>{f.durationSeconds=null;}],
])test(`source ${label} rejects conservatively before any runtime acquisition`,()=>{
  const f=structuredClone(videoFacts);change(f);assert.throws(()=>prepareMultimediaOperation('video','transcode',video,f));
});
test('silent video needs no invented audio stream or encoder options',async()=>{
  const f=(await inspectMediaBuffer(movieBytes({audio:false}),'video')).facts,p=prepareMultimediaOperation('video','transcode',{container:'mp4',videoCodec:'h264',audio:'preserve'},f);
  assert.equal(p.expectedOutput.hasAudio,false);assert.equal(p.parameters.audioBitrate,undefined);
  assert.throws(()=>prepareMultimediaOperation('video','transcode',video,f));
});
test('AAC audio-only MP4 headers plan conversion to PCM WAV without inventing video',async()=>{
  const facts=(await inspectMediaBuffer(movieBytes({video:false}),'audio')).facts,p=prepareMultimediaOperation('audio','convert',audio,facts);
  assert.equal(p.expectedOutput.mediaKind,'audio');assert.equal(p.expectedOutput.sampleRate,48000);assert.equal(p.expectedOutput.channels,2);
  const args=buildMultimediaArguments({operation:'convert',sourceInspection:{facts},...p},'/private/input.mp4','/private/output.wav');
  assert.ok(args.includes('-vn'));assert.ok(args.includes('pcm_s16le'));assert.equal(args[args.indexOf('-f')+1],'mov');assert.ok(!args.includes('libx264'));
});
const invalidVideo=[
  ['trim',{start:-1,duration:0.2}],['trim',{start:0}],['trim',{start:0,duration:0.2,end:0.5}],['trim',{start:0.8,end:0.2}],['trim',{start:0.8,duration:0.3}],
  ['resize',{width:0,height:90}],['resize',{width:161,height:90}],['resize',{width:8194,height:90}],['resize',{width:160,height:90,fit:'cover'}],
  ['crop',{left:-2,top:0,width:160,height:90}],['crop',{left:1,top:0,width:160,height:90}],['crop',{left:200,top:0,width:160,height:90}],
  ['contain',{width:400,height:400,background:'red; touch /tmp/owned'}],['contain',{width:400,height:400,background:'#ffffff00'}],
  ['fps',{fps:0}],['fps',{fps:121}],['fps',{fps:'25;evil'}],['transcode',{container:'webm'}],['transcode',{videoCodec:'hevc'}],
  ['transcode',{videoBitrate:1}],['transcode',{videoBitrate:'1M'}],['transcode',{audio:'copy'}],['transcode',{audio:'remove'}],
];
const invalidAudio=[['trim',{start:0,end:0}],['fade_in',{seconds:-1}],['fade_out',{seconds:2}],['gain',{gainDb:25}],['gain',{gainDb:NaN}],['resample',{sampleRate:123}],['channels',{channels:6}],['convert',{container:'mp3'}],['convert',{audioCodec:'flac'}],['convert',{audioBitrate:128000}]];
for(const [kind,cases,base]of[['video',invalidVideo,video],['audio',invalidAudio,audio]])for(const [operation,extra]of cases)test(`${kind} invalid typed ${operation} ${JSON.stringify(extra)}`,()=>assert.throws(()=>planFor(kind,operation,{...base,...extra})));
for(const key of ['args','filtergraph','command','outputPath','executable','env','provider_options'])for(const kind of ['video','audio'])test(`${kind} rejects raw ${key}`,()=>assert.throws(()=>planFor(kind,kind==='video'?'transcode':'convert',{...(kind==='video'?video:audio),[key]:'injected'})));
for(const operation of ['unknown','loudness','__proto__', ['trim']])test(`unsupported operation ${JSON.stringify(operation)} rejects`,()=>assert.throws(()=>planFor('audio',operation,audio)));

test('command construction is bounded, typed and source-specific',()=>{
  const argsFor=p=>buildMultimediaArguments(p,'/private/source with spaces.mp4','/private/output with spaces.mp4');
  const trim=argsFor(planFor('video','trim',{...video,start:0.2,end:0.6}));assert.ok(trim.includes('trim=start=0.200000:duration=0.400000,setpts=PTS-STARTPTS'));assert.ok(trim.includes('atrim=start=0.200000:duration=0.400000,asetpts=PTS-STARTPTS'));
  for(const [operation,extra,filter]of [['resize',{width:160,height:90},'scale=160:90'],['crop',{left:2,top:2,width:160,height:90},'crop=160:90:2:2'],['contain',{width:400,height:400,background:'#abcdef'},'scale=400:224,pad=400:400:0:88:color=0xabcdef'],['fps',{fps:50},'fps=50:round=near']])assert.ok(argsFor(planFor('video',operation,{...video,...extra})).includes(filter));
  for(const [operation,extra,filter]of [['gain',{gainDb:-6},'volume=-6dB'],['fade_in',{seconds:0.2},'afade=t=in:st=0.000000:d=0.200000'],['fade_out',{seconds:0.2},'afade=t=out:st=0.800000:d=0.200000']])assert.ok(argsFor(planFor('audio',operation,{...audio,...extra})).includes(filter));
  const removed=argsFor(planFor('video','transcode',{container:'mov',videoCodec:'h264',audio:'remove',videoBitrate:1000000}));assert.ok(removed.includes('-an'));assert.ok(!removed.includes('aac'));assert.equal(removed[removed.indexOf('-b:v')+1],'1000000');
  assert.equal(trim[trim.indexOf('-protocol_whitelist')+1],'file');assert.equal(trim[trim.indexOf('-enable_drefs')+1],'0');assert.ok(trim.includes('-n'));assert.ok(!trim.includes('-y'));assert.ok(!trim.includes('-hwaccel'));assert.equal(trim.at(-1),'/private/output with spaces.mp4');
});
for(const [kind,mutate,label]of[
  ['video',f=>{f.container='mov';},'container'],['video',f=>{f.streams[0].codec='hev1';},'codec'],['video',f=>{f.streams[0].displayDimensions.width=100;},'dimensions'],['video',f=>{f.streams[0].rotationDegrees=90;},'rotation'],['video',f=>{f.durationSeconds=0.9;},'duration'],['video',f=>{f.streams[0].frameRate.value=24;},'fps'],['video',f=>{f.hasAudio=false;},'audio presence'],['video',f=>{f.streams[1].codec='alac';},'audio codec'],
  ['audio',f=>{f.durationSeconds=0.999;},'duration'],['audio',f=>{f.streams[0].sampleRate=16000;},'sample rate'],['audio',f=>{f.streams[0].channels=2;},'channels'],['audio',f=>{f.streams[0].codec='ieee_float';},'codec'],['audio',f=>{f.fileSize=0;},'empty'],
])test(`${kind} verification rejects mismatched ${label}`,()=>{
  const p=planFor(kind,kind==='video'?'transcode':'convert',kind==='video'?video:audio),facts=structuredClone(kind==='video'?videoFacts:audioFacts);mutate(facts);assert.throws(()=>verifyMultimediaOutput(p,facts),{finishingCode:'FINISH_OUTPUT_VERIFICATION_FAILED'});
});
test('documented duration and frame-rate tolerances reject values just beyond boundary',()=>{
  const p=planFor('video','transcode',video),f=structuredClone(videoFacts);f.durationSeconds+=p.verificationTolerance.durationSeconds;assert.ok(verifyMultimediaOutput(p,f).length);f.durationSeconds+=0.00001;assert.throws(()=>verifyMultimediaOutput(p,f));
  const a=planFor('audio','convert',audio),af=structuredClone(audioFacts);af.durationSeconds+=1/8000;assert.ok(verifyMultimediaOutput(a,af).length);af.durationSeconds+=0.000001;assert.throws(()=>verifyMultimediaOutput(a,af));
});
for(const [name,output]of[['malformed',()=>Buffer.from('not a movie')],['mismatch',()=>movieBytes({width:160})],['empty',()=>Buffer.alloc(0)]])test(`${name} mocked output cannot register and is cleaned`,async t=>{
  const f=await projectFixture(t),m=await mockedFinisher(t,{output});const r=await m.finisher.finish({...f,allowExecution:true});assert.equal(r.status,'rejected');assert.equal((await f.project.listProjectAssets()).assets.length,1);assert.deepEqual(await fs.readFile(path.join(f.root,f.record.path)),f.bytes);
  for(const filename of m.paths)await assert.rejects(fs.stat(path.dirname(filename)),{code:'ENOENT'});
});
test('missing process output cannot register',async t=>{
  const f=await projectFixture(t),m=await mockedFinisher(t,{run:async()=>({ok:true})});assert.equal(code(await m.finisher.finish({...f,allowExecution:true})),'FINISH_BACKEND_OUTPUT_INVALID');assert.equal((await f.project.listProjectAssets()).assets.length,1);
});
for(const [name,script,expected]of[
  ['timeout','setInterval(()=>{},1000)','FINISH_PROCESS_TIMEOUT'],['nonzero','process.exit(3)','FINISH_PROCESS_NONZERO_EXIT'],['bounded output',"process.stderr.write('x'.repeat(400000));setInterval(()=>{},1000)",'FINISH_PROCESS_OUTPUT_LIMIT'],
])test(`real child fixture ${name} cleans failed output and does not publish`,async t=>{
  const f=await projectFixture(t),runtime=await fixtureRuntime(t);let output;
  const backend=createMultimediaFinisher({acquire:()=>runtime.acquire(),timeoutMs:name==='timeout'?200:2000,run:async(exe,args,options)=>{
    output=args.at(-1);await fs.writeFile(output,'incomplete');return runBoundedMediaProcess(exe,args,{...options,spawnProcess:(_e,_a,opts)=>spawn(process.execPath,['-e',script],opts)});
  }});
  const r=await createMediaFinishing({multimediaTransform:backend}).finish({...f,allowExecution:true});assert.equal(code(r),expected);await assert.rejects(fs.stat(path.dirname(output)),{code:'ENOENT'});assert.equal((await f.project.listProjectAssets()).assets.length,1);
});
test('shared process runner uses no shell, bounded diagnostics and OS-only environment',async()=>{
  let observed;
  const r=await runBoundedMediaProcess(process.execPath,['-e','process.stdout.write("ok")'],{env:{PATH:process.env.PATH,FFREPORT:'/private/report',API_KEY:'secret',NODE_OPTIONS:'bad'},spawnProcess:(e,a,o)=>{observed=o;return spawn(e,a,o);}});
  assert.equal(r.ok,true);assert.equal(r.stdout,'ok');assert.equal(observed.shell,false);assert.equal(observed.windowsHide,true);assert.deepEqual(observed.stdio,['ignore','pipe','pipe']);assert.equal(observed.env.API_KEY,undefined);assert.equal(observed.env.FFREPORT,undefined);assert.equal(observed.env.NODE_OPTIONS,undefined);
});
test('fresh execution lease does not rely on cached readiness and detects replacement',async t=>{
  let calls=0;const runtime=await fixtureRuntime(t,async(...args)=>{calls++;return probeFixture(...args);});await runtime.getStatus();const count=calls,lease=await runtime.acquire();assert.equal(lease.ok,true);assert.ok(calls>count);await fs.appendFile(lease.paths.ffmpeg,'changed');assert.equal(await lease.unchanged(),false);
});
test('trusted invalidation revokes a lease even when binary identities are unchanged',async t=>{
  const runtime=await fixtureRuntime(t),lease=await runtime.acquire();assert.equal(lease.ok,true);runtime.invalidate();assert.equal(await lease.unchanged(),false);
});
test('runtime changed after transform rejects output and cleans staging',async t=>{
  const f=await projectFixture(t),runtime=await fixtureRuntime(t);let output;
  const backend=createMultimediaFinisher({acquire:()=>runtime.acquire(),run:async(exe,args)=>{output=args.at(-1);await fs.writeFile(output,movieBytes());await fs.appendFile(exe,'changed');return {ok:true};}});
  const r=await createMediaFinishing({multimediaTransform:backend}).finish({...f,allowExecution:true});assert.equal(code(r),'FINISH_RUNTIME_CHANGED');assert.equal((await f.project.listProjectAssets()).assets.length,1);await assert.rejects(fs.stat(path.dirname(output)),{code:'ENOENT'});
});
test('a cached ready observation cannot bypass a fresh failing probe',async t=>{
  const f=await projectFixture(t);let healthy=true,transforms=0;
  const runtime=await fixtureRuntime(t,(...args)=>healthy?probeFixture(...args):Promise.resolve({ok:false,code:'MM_PROBE_TIMEOUT'}));
  assert.equal((await runtime.getStatus()).availability,'ready');healthy=false;
  const backend=createMultimediaFinisher({acquire:()=>runtime.acquire(),run:()=>{transforms++;throw Error();}});
  assert.equal(code(await createMediaFinishing({multimediaTransform:backend}).finish({...f,allowExecution:true})),'FINISH_RUNTIME_NOT_READY');assert.equal(transforms,0);
});
test('asset identity/traversal checks remain authoritative before multimedia execution',async t=>{
  const f=await projectFixture(t);for(const assetId of ['../outside','/etc/passwd','file:///tmp/test'])assert.equal(code(await planMediaFinishing({...f,assetId})),'ASSET_ID_INVALID');await fs.appendFile(path.join(f.root,f.record.path),'changed');assert.equal(code(await finishMedia({...f,allowExecution:true})),'ASSET_HASH_MISMATCH');
});
test('projection and generic planning automatically expose implemented runtime-gated multimedia scope',()=>{
  const p=projectCapabilities(),e=getExecutorContext('media-finishing').executor;assert.equal(p.counts.executorEntries,608);assert.equal(e.runtime.scopes.image.availability,'available');
  for(const kind of ['video','audio']){assert.equal(e.runtime.scopes[kind].implemented,true);assert.equal(e.runtime.scopes[kind].availability,'runtime_blocked');assert.ok(e.runtime.scopes[kind].operations.trim);}
  assert.deepEqual(e.runtime.scopes.video.parameterProperties.container.enum,['mp4','mov']);assert.deepEqual(e.runtime.scopes.audio.parameterProperties.container.enum,['wav']);
  assert.deepEqual(e.runtime.scopes.video.parameterProperties.audioCodec.enum,['aac']);assert.deepEqual(e.runtime.scopes.audio.parameterProperties.audioCodec.enum,['pcm_s16le']);
  assert.equal(e.runtime.scopes.audio.parameterProperties.videoBitrate,undefined);
  assert.equal(e.available,true);assert.ok(e.controls.operation.enum.includes('gain'));assert.ok(e.controls.operation.enum.includes('transcode'));assert.deepEqual(e.inputs[0].acceptedTypes,['image','video','audio']);
  assert.ok(getPlanningOverview().capabilities.some(c=>c.id==='FINISH_MEDIA'));assert.deepEqual(getCapabilityContext('FINISH_MEDIA').executors[0].runtime,e.runtime);assert.ok(!p.capabilities.some(c=>c.id==='FFMPEG'));
});
test('fixed host plans video/audio and gates execute without auth, provider or project mutation',async t=>{
  let provider=0;t.mock.method(globalThis,'fetch',()=>{provider++;throw Error('No providers');});const host=createWorkflowHost({callRuntime:()=>{provider++;throw Error('No auth or renderer runtime');}});
  for(const kind of ['video','audio']) {
    const f=await projectFixture(t,kind),before=await fs.readFile(path.join(f.root,'project.json')),opened=await host.invoke('openProject',{projectRoot:f.root}),req={projectHandle:opened.projectHandle,assetId:f.assetId,operation:f.operation,parameters:f.parameters};
    assert.equal((await host.invoke('planMediaFinishing',req)).status,'planned');assert.equal(code(await host.invoke('finishMedia',req)),'EXECUTION_NOT_AUTHORIZED');assert.equal(code(await host.invoke('finishMedia',{...req,allowExecution:true})),'FINISH_RUNTIME_NOT_READY');
    assert.deepEqual(await fs.readFile(path.join(f.root,'project.json')),before);assert.equal(code(await host.invoke('finishMedia',{...req,allowExecution:true,executable:'/tmp/evil'})),'HOST_REQUEST_INVALID');
  }
  assert.equal(provider,0);
});

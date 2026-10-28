import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createProject } from 'whihm-workflow-core';
import { createMultimediaRuntime, discoverMultimediaRuntime, multimediaCandidates, configureMultimediaRuntime, getMultimediaRuntimeStatus } from '../lib/whihm-execution/multimedia-runtime.mjs';
import { getMultimediaBaseline, parseRuntimeVersion, assessVersionPair, parseCapabilityTable, evaluateRuntimeFeatures, runRuntimeProbe } from '../lib/whihm-execution/multimedia-probe.mjs';
import { projectCapabilities } from '../lib/whihm-execution/capability-projection.mjs';
import { getPlanningOverview, getCapabilityContext, getExecutorContext } from '../lib/whihm-execution/planning-context.mjs';
import { createWorkflowHost } from '../lib/whihm-execution/host.mjs';
import { runtimeFixture, versionText, tableText, fixtureNames, probeFixture, virtualWindowsFs } from './helpers/multimediaRuntimeFixtures.mjs';
const reasons=r=>r.blockingReasons.map(x=>x.code);
const options={env:{PATH:''},probe:probeFixture,now:()=>1000};
test('Electron trusted initialization distinguishes dev/packaged and Windows user-data paths',()=>{
  const {multimediaHostEnvironment}=createRequire(import.meta.url)('../electron/lib/whihm-host.js');
  for(const packaged of [false,true]){const app={isPackaged:packaged,getPath:name=>{assert.equal(name,'userData');return 'C:\\Users\\Example User\\AppData\\Roaming\\WHIHM';}};
    const r=multimediaHostEnvironment(app,{platform:'win32',arch:'x64',resourcesPath:'C:\\Program Files\\WHIHM\\resources'});assert.equal(r.packaged,packaged);assert.equal(r.managedRoot,'C:\\Users\\Example User\\AppData\\Roaming\\WHIHM\\multimedia');assert.equal(r.arch,'x64');}
  assert.equal(multimediaHostEnvironment(null),null);
});
test('unsupported runtime platform/architecture fails without probing',async()=>{
  let calls=0;const r=await createMultimediaRuntime({...options,arch:'ia32',probe:()=>{calls++;}}).getStatus();assert.equal(r.availability,'incompatible');assert.ok(reasons(r).includes('MM_PLATFORM_UNSUPPORTED'));assert.equal(calls,0);
});
test('packaged then application-managed then configured then development PATH precedence is explicit',async t=>{
  const f=await runtimeFixture(t),resources=path.join(f.root,'resources'),managed=path.join(f.root,'managed'),configured=path.join(f.root,'configured'),system=path.join(f.root,'system');
  const packaged=await f.pair(path.join(resources,'multimedia',`${process.platform}-${process.arch}`,'bin'));await f.pair(path.join(managed,`${process.platform}-${process.arch}`,'bin'));await f.pair(configured);await f.pair(system);
  const opts={...options,resourcesPath:resources,managedRoot:managed,configuredDir:configured,env:{PATH:system},packaged:true};
  assert.equal((await discoverMultimediaRuntime(opts)).source,'packaged');await fs.rm(packaged,{recursive:true});assert.equal((await discoverMultimediaRuntime(opts)).source,'application_managed');
  assert.equal((await discoverMultimediaRuntime({...opts,managedRoot:undefined})).source,'configured');assert.equal((await discoverMultimediaRuntime({...options,env:{PATH:system}})).source,'system');
});
test('a valid higher-priority source ignores invalid lower configuration',async t=>{
  const f=await runtimeFixture(t),resources=path.join(f.root,'resources');await f.pair(path.join(resources,'multimedia',`${process.platform}-${process.arch}`,'bin'));
  assert.equal((await discoverMultimediaRuntime({...options,packaged:true,resourcesPath:resources,configuredDir:'relative-invalid'})).source,'packaged');
});
test('incomplete higher source never falls back or combines binaries from directories',async t=>{
  const f=await runtimeFixture(t),first=await f.pair(path.join(f.root,'first'),{ffprobe:false}),second=await f.pair(path.join(f.root,'second'));
  const r=await createMultimediaRuntime({...options,env:{PATH:[first,second].join(path.delimiter)}}).getStatus();assert.equal(r.availability,'partial');assert.ok(reasons(r).includes('MM_PAIR_INCOMPLETE'));assert.equal(r.source,'system');
});
test('explicit missing configuration is not hidden by a working PATH pair',async t=>{
  const f=await runtimeFixture(t),system=await f.pair(path.join(f.root,'system'));const r=await createMultimediaRuntime({...options,configuredDir:path.join(f.root,'absent'),env:{PATH:system}}).getStatus();assert.equal(r.availability,'missing');assert.equal(r.source,'configured');
});
for(const [name,pair,availability]of[['absent',{ffmpeg:false,ffprobe:false},'missing'],['ffmpeg only',{ffprobe:false},'partial'],['ffprobe only',{ffmpeg:false},'partial']])test(`${name} runtime is not ready`,async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'),pair),r=await createMultimediaRuntime({...options,configuredDir:dir}).getStatus();assert.equal(r.availability,availability);assert.ok(r.blockingReasons.length);assert.equal(r.executionVerified,false);
});
test('non-file executable is unsafe and never probed',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));const exe=path.join(dir,'ffmpeg'+(process.platform==='win32'?'.exe':''));await fs.unlink(exe);await fs.mkdir(exe);let called=0;
  const r=await createMultimediaRuntime({...options,configuredDir:dir,probe:()=>{called++;throw Error();}}).getStatus();assert.equal(r.availability,'unverified');assert.ok(reasons(r).includes('MM_BINARY_UNSAFE'));assert.equal(called,0);
});
test('symlink and nonexecutable candidates fail closed on POSIX', {skip:process.platform==='win32'},async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));await fs.chmod(path.join(dir,'ffmpeg'),0o600);assert.ok(reasons(await createMultimediaRuntime({...options,configuredDir:dir}).getStatus()).includes('MM_BINARY_UNREADABLE'));
  await fs.unlink(path.join(dir,'ffmpeg'));await fs.symlink(path.join(dir,'ffprobe'),path.join(dir,'ffmpeg'));assert.ok(reasons(await createMultimediaRuntime({...options,configuredDir:dir}).getStatus()).includes('MM_BINARY_UNSAFE'));
});
for(const configuredDir of ['relative','/tmp/../outside','/tmp/bad\nvalue','/tmp/app.asar/runtime',42])test(`unsafe configured location ${JSON.stringify(configuredDir)} is structured`,async()=>{
  const r=await createMultimediaRuntime({...options,configuredDir}).getStatus();assert.equal(r.availability,'unverified');assert.ok(reasons(r).includes('MM_CONFIGURATION_INVALID'));assert.equal(Object.hasOwn(r,'paths'),false);
});
test('packaged resolution never uses system PATH',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'system'));const r=await createMultimediaRuntime({...options,packaged:true,env:{PATH:dir}}).getStatus();assert.equal(r.availability,'missing');assert.equal(r.source,'unavailable');
});
test('development PATH is bounded and rejects empty/current/relative entries',async()=>{
  const separator=process.platform==='win32'?';':':',root=process.platform==='win32'?'C:\\test':'/test';const p=multimediaCandidates({env:{PATH:['','.','relative',...Array.from({length:70},(_,i)=>path.join(root,String(i)))].join(separator)}});
  assert.equal(p.candidates.length,64);assert.equal(p.limited,true);assert.ok(p.candidates.every(c=>path.isAbsolute(c.directory)));
  const env={PATH:Array.from({length:70},(_,i)=>path.join(root,String(i))).join(separator)},fsApi={realpath:async()=>{throw Object.assign(Error(),{code:'ENOENT'});}};
  const r=await createMultimediaRuntime({...options,env,fsApi}).getStatus();assert.equal(r.availability,'unverified');assert.ok(reasons(r).includes('MM_DISCOVERY_LIMIT'));
});
test('Windows paths with spaces resolve only .exe pairs and case-insensitive Path',async()=>{
  const dir='C:\\Program Files\\WHIHM Multimedia\\bin',files=[dir+'\\ffmpeg.exe',dir+'\\ffprobe.exe'],r=await discoverMultimediaRuntime({platform:'win32',arch:'x64',env:{Path:`.;"${dir}"`},fsApi:virtualWindowsFs(files)});
  assert.equal(r.source,'system');assert.equal(r.paths.ffmpeg,files[0]);assert.equal(r.binaries.ffprobe.usable,true);
});
test('Windows packaged resource layout is explicit and architecture scoped',async()=>{
  const resources='C:\\Program Files\\WHIHM\\resources',dir=resources+'\\multimedia\\win32-x64\\bin',files=[dir+'\\ffmpeg.exe',dir+'\\ffprobe.exe'];
  const r=await createMultimediaRuntime({...options,platform:'win32',arch:'x64',packaged:true,resourcesPath:resources,fsApi:virtualWindowsFs(files)}).getStatus();assert.equal(r.source,'packaged');assert.equal(r.availability,'ready');assert.equal(r.arch,'x64');assert.ok(!JSON.stringify(r).includes('Program Files'));
});
test('Windows UNC and drive-relative PATH locations are not executed',()=>{assert.deepEqual(multimediaCandidates({platform:'win32',env:{Path:'\\\\server\\share;C:relative;.;'}}).candidates,[]);});
test('PATH case handling is deterministic and platform-specific',()=>{
  const a=multimediaCandidates({platform:'win32',env:{Path:'C:\\Other',PATH:'C:\\Canonical'}}),b=multimediaCandidates({platform:'win32',env:{PATH:'C:\\Canonical',Path:'C:\\Other'}});assert.deepEqual(a,b);assert.equal(a.candidates[0].directory,'C:\\Canonical');
  assert.deepEqual(multimediaCandidates({platform:'linux',env:{Path:'/ignored'}}).candidates,[]);
  assert.equal(multimediaCandidates({platform:'win32',env:{whihm_multimedia_bin_dir:'C:\\Configured'}}).candidates[0].source,'configured');
  assert.deepEqual(multimediaCandidates({platform:'linux',env:{whihm_multimedia_bin_dir:'/ignored'}}).candidates,[]);
});
for(const binary of ['ffmpeg','ffprobe'])test(`${binary} stable version parsing preserves only safe identity`,()=>{
  const r=parseRuntimeVersion(versionText(binary,'8.1.2-0+vendor'),binary);assert.equal(r.major,8);assert.equal(r.minor,1);assert.equal(r.patch,2);assert.equal(r.libraries.libavcodec.runtimeMajor,62);assert.match(r.configurationDigest,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(r).includes('/private'));
});
for(const release of ['6.1','7.1.2','8.0.1','9.0.2'])test(`known metadata protocol release ${release} can satisfy version policy`,()=>{assert.equal(assessVersionPair({ffmpeg:parseRuntimeVersion(versionText('ffmpeg',release),'ffmpeg'),ffprobe:parseRuntimeVersion(versionText('ffprobe',release),'ffprobe')}).state,'compatible');});
for(const [a,b,state,expected]of[['8.0.1','7.1','incompatible','MM_PAIR_VERSION_MISMATCH'],['10.0','10.0','incompatible','MM_VERSION_UNSUPPORTED'],['4.4','4.4','incompatible','MM_VERSION_UNSUPPORTED'],['N-12345-gabc','N-12345-gabc','unverified','MM_VERSION_COMPATIBILITY_UNVERIFIED']])test(`version pair ${a}/${b} => ${state}`,()=>{
  const r=assessVersionPair({ffmpeg:parseRuntimeVersion(versionText('ffmpeg',a),'ffmpeg'),ffprobe:parseRuntimeVersion(versionText('ffprobe',b),'ffprobe')});assert.equal(r.state,state);assert.equal(r.code,expected);
});
test('patch differences do not require exact pins; missing/mismatched library ABI never claims compatibility',()=>{
  const a=parseRuntimeVersion(versionText('ffmpeg'),'ffmpeg'),b=parseRuntimeVersion(versionText('ffprobe','8.0.2'),'ffprobe');assert.equal(assessVersionPair({ffmpeg:a,ffprobe:b}).exactReleaseMatch,false);
  delete b.libraries.libavutil;assert.equal(assessVersionPair({ffmpeg:a,ffprobe:b}).code,'MM_LIBRARY_ABI_UNVERIFIED');b.libraries.libavutil={builtMajor:59,runtimeMajor:59};assert.equal(assessVersionPair({ffmpeg:a,ffprobe:b}).code,'MM_LIBRARY_ABI_MISMATCH');
  assert.equal(parseRuntimeVersion('not a version /private/path','ffmpeg'),null);
});
for(const query of ['encoders','decoders','filters','muxers','demuxers'])for(const legacy of [false,true])test(`${query} ${legacy?'legacy':'current'} table is parsed by flags, not descriptions`,()=>{
  const names=parseCapabilityTable(tableText(query,undefined,legacy),query);assert.ok(names instanceof Set);assert.ok(names.has(fixtureNames[query][0].split(',')[0]));assert.equal(names.has('Fixture'),false);
});
test('unknown table headers/flags are unknown; encoder and decoder direction remain distinct',()=>{
  assert.equal(parseCapabilityTable('Filters changed beyond recognition','filters'),null);assert.equal(parseCapabilityTable('Encoders:\n ??? libx264 invented','encoders'),null);
  const r=evaluateRuntimeFeatures({ffmpeg:{decoders:new Set(['h264']),encoders:new Set(['h264_nvenc'])}});assert.equal(r.features.find(f=>f.id==='ffmpeg.decoders.h264').status,'available');assert.equal(r.features.find(f=>f.id==='ffmpeg.encoders.libx264').status,'missing');
});
test('baseline is bounded and optional features never imply actual media operations',()=>{
  const p=getMultimediaBaseline();assert.equal(p.id,'WHIHM_MEDIA_FINISHING_BASELINE_V1');assert.equal(p.mediaTransformsImplemented,true);assert.ok(p.features.find(f=>f.id==='ffmpeg.filters.volume').required);assert.equal(p.features.find(f=>f.id==='ffmpeg.filters.loudnorm').required,false);assert.ok(!p.features.some(f=>/av1|libx265|nvenc/.test(f.name)));
});
test('complete fixture is ready while actual media execution remains unverified',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair')),r=await createMultimediaRuntime({...options,configuredDir:dir}).getStatus();assert.equal(r.availability,'ready');assert.deepEqual(r.blockingReasons,[]);assert.deepEqual(r.baseline.missing,[]);assert.deepEqual(r.baseline.unknown,[]);assert.equal(r.executionVerified,false);assert.equal(r.mediaTransformsImplemented,true);assert.ok(!JSON.stringify(r).includes(f.root));
});
test('missing required encoder makes runtime partial; absent optional features do not block baseline',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));
  const probe=async(exe,b,q)=>q==='encoders'?{ok:true,stdout:tableText(q,['aac','pcm_s16le'])}:probeFixture(exe,b,q);
  const r=await createMultimediaRuntime({...options,configuredDir:dir,probe}).getStatus();assert.equal(r.availability,'partial');assert.ok(r.baseline.missing.includes('ffmpeg.encoders.libx264'));
  const minimal=async(exe,b,q)=>q==='version'?probeFixture(exe,b,q):{ok:true,stdout:tableText(q,getMultimediaBaseline().features.filter(f=>f.binary===b&&f.query===q&&f.required).map(f=>f.name))};
  assert.equal((await createMultimediaRuntime({...options,configuredDir:dir,probe:minimal}).getStatus()).availability,'ready');
});
test('runtime replacement during probes never yields ready or leaks file identities',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));let changed=false;
  const probe=async(exe,b,q)=>{if(!changed&&q==='filters'){changed=true;await fs.appendFile(exe,'changed');}return probeFixture(exe,b,q);};
  const r=await createMultimediaRuntime({...options,configuredDir:dir,probe}).getStatus();assert.equal(r.availability,'unverified');assert.ok(reasons(r).includes('MM_RUNTIME_CHANGED_DURING_PROBE'));assert.equal(r.binaries.ffmpeg.identity,undefined);
});
for(const condition of ['malformed-version','timeout','malformed-capabilities','unknown-version','mismatch'])test(`readiness ${condition} fails closed with structured reasons`,async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));
  const probe=async(exe,b,q)=>condition==='timeout'&&q==='version'?{ok:false,code:'MM_PROBE_TIMEOUT'}:condition==='malformed-version'&&q==='version'?{ok:true,stdout:'bad'}:condition==='unknown-version'&&q==='version'?{ok:true,stdout:versionText(b,'N-123-gabc')}:condition==='mismatch'&&b==='ffprobe'&&q==='version'?{ok:true,stdout:versionText(b,'7.1')}:condition==='malformed-capabilities'&&q==='filters'?{ok:true,stdout:'not a table'}:probeFixture(exe,b,q);
  const r=await createMultimediaRuntime({...options,configuredDir:dir,probe}).getStatus();assert.equal(r.availability,condition==='mismatch'?'incompatible':'unverified');assert.ok(r.blockingReasons.length);
});
test('process cache is detached, coalesces concurrent reads, expires and can be refreshed/invalidated',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));let clock=1000,calls=0;const service=createMultimediaRuntime({...options,configuredDir:dir,now:()=>clock,ttlMs:100,probe:async(...args)=>{calls++;return probeFixture(...args);}});
  assert.equal(service.peek().observation,'not_probed');const [a,b]=await Promise.all([service.getStatus(),service.getStatus()]);assert.deepEqual(a,b);const count=calls;assert.deepEqual(await service.getStatus(),a);assert.equal(calls,count);
  a.source='tampered';assert.equal(service.peek().source,'configured');clock=1200;await service.getStatus();assert.ok(calls>count);const next=calls;await service.getStatus({refresh:true});assert.ok(calls>next);const prior=calls;clock=0;await service.getStatus();assert.ok(calls>prior);service.invalidate();assert.equal(service.peek().observation,'not_probed');
});
test('fixed process probes use argv without shell and sanitize inherited environment',async t=>{
  const f=await runtimeFixture(t),script=path.join(f.root,'probe.cjs');await fs.writeFile(script,'process.stdout.write(JSON.stringify(process.argv.slice(2)))');let seen;
  const result=await runRuntimeProbe(path.join(f.root,'runtime with spaces'), 'ffmpeg','version',{env:{PATH:process.env.PATH,FFREPORT:'file=/private/report',API_KEY:'secret',NODE_OPTIONS:'--bad-option'},spawnProcess:(exe,args,opts)=>{seen={exe,args,opts};return spawn(process.execPath,[script,...args],opts);}});
  assert.equal(result.ok,true);assert.deepEqual(JSON.parse(result.stdout),['-version']);assert.deepEqual(seen.args,['-version']);assert.equal(seen.opts.shell,false);assert.equal(seen.opts.windowsHide,true);assert.equal(seen.opts.env.FFREPORT,undefined);assert.equal(seen.opts.env.API_KEY,undefined);assert.equal(seen.opts.env.NODE_OPTIONS,undefined);assert.equal(seen.opts.env.LC_ALL,'C');
});
test('paired fixture readiness runs the complete fixed CLI protocol through real child processes',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair with spaces')),script=path.join(f.root,'metadata.cjs'),payload={};
  for(const binary of ['ffmpeg','ffprobe']){payload[binary]={version:versionText(binary)};for(const query of Object.keys(fixtureNames))payload[binary][query]=tableText(query);}
  await fs.writeFile(script,`const payload=${JSON.stringify(payload)};process.stdout.write(payload[process.argv[2]][process.argv[3]]);`);let calls=0;
  const probe=(exe,binary,query,{env})=>runRuntimeProbe(exe,binary,query,{env,spawnProcess:(file,args,opts)=>{calls++;assert.equal(file,path.join(dir,binary+(process.platform==='win32'?'.exe':'')));assert.equal(opts.shell,false);assert.ok(!args.includes('-i'));return spawn(process.execPath,[script,binary,query],opts);}});
  const r=await createMultimediaRuntime({...options,configuredDir:dir,probe}).getStatus();assert.equal(r.availability,'ready');assert.equal(calls,9);assert.equal(r.executionVerified,false);assert.equal(r.providerTransport,false);assert.equal(r.projectMutation,false);
});
test('spawn errors are structured and contain no private executable path',async t=>{
  const f=await runtimeFixture(t),r=await runRuntimeProbe(path.join(f.root,'absent'),'ffmpeg','version');assert.equal(r.ok,false);assert.equal(r.code,'MM_PROBE_SPAWN_FAILED');assert.ok(!JSON.stringify(r).includes(f.root));
});
for(const [behavior,expected]of[['setInterval(()=>{},1000)','MM_PROBE_TIMEOUT'],['process.stdout.write("x".repeat(4096))','MM_PROBE_OUTPUT_LIMIT'],['process.exit(4)','MM_PROBE_NONZERO_EXIT']])test(`process safety ${expected}`,async t=>{
  const f=await runtimeFixture(t),script=path.join(f.root,'probe.cjs');await fs.writeFile(script,behavior);let child;
  const r=await runRuntimeProbe(path.join(f.root,'ffmpeg'),'ffmpeg','version',{timeoutMs:expected==='MM_PROBE_TIMEOUT'?100:3000,outputLimit:1024,spawnProcess:(_exe,args,opts)=>{child=spawn(process.execPath,[script,...args],opts);return child;}});assert.equal(r.ok,false);assert.equal(r.code,expected);assert.ok(child.exitCode!==null||child.signalCode!==null);assert.equal(r.stdout,undefined);assert.equal(r.stderr,undefined);
});
test('unsupported raw probe arguments never spawn',async()=>{
  let calls=0;for(const query of ['-i','help','protocols',['version']]){const r=await runRuntimeProbe('/tmp/ffmpeg','ffmpeg',query,{spawnProcess:()=>{calls++;}});assert.equal(r.code,'MM_PROBE_REQUEST_INVALID');}assert.equal(calls,0);
});
test('planning uses the last safe runtime observation without probing or authorizing transforms',async t=>{
  const f=await runtimeFixture(t),dir=await f.pair(path.join(f.root,'pair'));let calls=0;configureMultimediaRuntime({...options,configuredDir:dir,probe:async(...a)=>{calls++;return probeFixture(...a);}});t.after(()=>configureMultimediaRuntime());
  const initial=getExecutorContext('media-finishing');assert.equal(initial.executor.runtime.multimedia.snapshot.observation,'not_probed');assert.equal(calls,0);
  await getMultimediaRuntimeStatus();const count=calls,detail=getExecutorContext('media-finishing'),cap=getCapabilityContext('FINISH_MEDIA'),overview=getPlanningOverview();assert.equal(calls,count);assert.equal(detail.executor.runtime.multimedia.snapshot.availability,'ready');assert.deepEqual(cap.executors[0].runtime,detail.executor.runtime);
  for(const e of [detail.executor,cap.executors[0]]){assert.equal(e.available,true);assert.equal(e.runtime.scopes.image.implemented,true);assert.equal(e.runtime.scopes.video.implemented,true);assert.equal(e.runtime.scopes.audio.implemented,true);}
  assert.equal(overview.capabilities.length,54);assert.equal(projectCapabilities().counts.executorEntries,622);assert.ok(!overview.capabilities.some(c=>/FFMPEG|MULTIMEDIA_RUNTIME/.test(c.id)));
});
test('host read is project-independent, strict, unauthenticated and nonmutating',async t=>{
  const f=await runtimeFixture(t),root=path.join(f.root,'project');await createProject(root,{title:'Runtime read fixture'});const before=await fs.readFile(path.join(root,'project.json'),'utf8');let runtime=0,network=0;
  configureMultimediaRuntime({...options});t.after(()=>configureMultimediaRuntime());t.mock.method(globalThis,'fetch',()=>{network++;throw Error('Transport forbidden');});
  const host=createWorkflowHost({callRuntime:()=>{runtime++;throw Error();}}),a=await host.invoke('getMultimediaRuntimeStatus',{}),b=await host.invoke('getMultimediaRuntimeStatus',{});assert.equal(a.availability,'missing');assert.deepEqual(a,b);
  for(const request of [{path:'/tmp/ffmpeg'},{args:['-i']},{projectHandle:'anything'},{refresh:'yes'}])assert.equal((await host.invoke('getMultimediaRuntimeStatus',request)).status,'rejected');
  assert.equal(await fs.readFile(path.join(root,'project.json'),'utf8'),before);assert.equal(runtime,0);assert.equal(network,0);assert.equal((await getMultimediaRuntimeStatus({args:[]})).status,'rejected');
});

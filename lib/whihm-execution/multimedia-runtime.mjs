// Runtime readiness only. Candidate locations are trusted host configuration, never IPC input.
import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { VERSION_POLICY, getMultimediaBaseline, parseRuntimeVersion, assessVersionPair, parseCapabilityTable, evaluateRuntimeFeatures, runRuntimeProbe } from './multimedia-probe.mjs';

export const MULTIMEDIA_DIR_ENV = 'WHIHM_MULTIMEDIA_BIN_DIR';
const binaries=['ffmpeg','ffprobe'];
const environmentValue=(env,key,platform)=>env[platform==='win32'?Object.keys(env).filter(k=>k.toLowerCase()===key.toLowerCase()).sort()[0]:key];
function absoluteDirectory(value, platform) {
  const p=platform==='win32'?path.win32:path.posix;
  return typeof value==='string' && value.length<=4096 && p.isAbsolute(value) && !/[\x00-\x1f"<>|]/.test(value) && !value.split(/[\\/]/).some(s=>s==='..'||s==='.'||s.endsWith('.asar')) && (platform!=='win32'||/^[A-Za-z]:[\\/]/.test(value));
}
export function multimediaCandidates({platform=process.platform,arch=process.arch,packaged=false,resourcesPath,managedRoot,configuredDir,env=process.env}={}) {
  const p=platform==='win32'?path.win32:path.posix,candidates=[];
  for(const [source,base] of [['packaged',packaged?resourcesPath:undefined],['application_managed',managedRoot]]) if(base) {
    candidates.push(!absoluteDirectory(base,platform)?{source,invalid:true}:{source,directory:p.join(base,...(source==='packaged'?['multimedia']:[]),`${platform}-${arch}`,'bin')});
  }
  const configured=configuredDir??environmentValue(env,MULTIMEDIA_DIR_ENV,platform);
  if(configured && typeof configured!=='string')candidates.push({source:'configured',invalid:true});
  else if(configured?.trim()) {
    candidates.push(!absoluteDirectory(configured.trim(),platform)?{source:'configured',invalid:true}:{source:'configured',directory:configured.trim(),explicit:true});
  }
  let limited=false;
  if(!packaged) {
    const searchPath=environmentValue(env,'PATH',platform),parts=typeof searchPath==='string'?searchPath.split(platform==='win32'?';':':'):[],seen=new Set();
    for(let value of parts) {
      if(platform==='win32' && value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1);
      if(!absoluteDirectory(value,platform))continue;
      const normalized=p.normalize(value),identity=platform==='win32'?normalized.toLowerCase():normalized;
      if(seen.has(identity))continue;seen.add(identity);
      if(seen.size>64){limited=true;break;}candidates.push({source:'system',directory:normalized});
    }
  }
  return {candidates,limited};
}
async function checkBinary(filename,platform,fsApi) {
  try {const stat=await fsApi.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink())return {present:true,usable:false,code:'MM_BINARY_UNSAFE'};await fsApi.access(filename,platform==='win32'?constants.F_OK:constants.X_OK);return {present:true,usable:true,identity:[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].map(v=>v??null)};}
  catch(error){return error.code==='ENOENT'?{present:false,usable:false}:{present:null,usable:false,code:'MM_BINARY_UNREADABLE'};}
}
export async function discoverMultimediaRuntime(options={}) {
  const platform=options.platform??process.platform,p=platform==='win32'?path.win32:path.posix,fsApi=options.fsApi??fs,plan=multimediaCandidates(options),attemptedSources=[];
  for(const [index,candidate]of plan.candidates.entries()) {
    if(!attemptedSources.includes(candidate.source))attemptedSources.push(candidate.source);
    if(candidate.invalid)return {source:candidate.source,binaries:{},discovery:{attemptedSources,candidateIndex:index,searchLimited:plan.limited},code:'MM_CONFIGURATION_INVALID'};
    let directory;
    try{directory=await fsApi.realpath(candidate.directory);}
    catch(error){if(error.code==='ENOENT'&&!candidate.explicit)continue;return {source:candidate.source,binaries:{},discovery:{attemptedSources,candidateIndex:index,searchLimited:plan.limited},code:error.code==='ENOENT'?'MM_PAIR_ABSENT':'MM_BINARY_UNREADABLE'};}
    const paths=Object.fromEntries(binaries.map(binary=>[binary,p.join(directory,`${binary}${platform==='win32'?'.exe':''}`)]));
    const found=Object.fromEntries(await Promise.all(binaries.map(async b=>[b,await checkBinary(paths[b],platform,fsApi)])));
    // Do not combine directories, silently bypass partial installations or hide explicit misconfiguration.
    if(candidate.explicit||Object.values(found).some(f=>f.present!==false))return {source:candidate.source,paths,binaries:found,discovery:{attemptedSources,candidateIndex:index,searchLimited:plan.limited}};
  }
  return {source:'unavailable',binaries:Object.fromEntries(binaries.map(b=>[b,{present:false,usable:false}])),discovery:{attemptedSources,searchLimited:plan.limited},code:plan.limited?'MM_DISCOVERY_LIMIT':'MM_PAIR_ABSENT'};
}
export function createMultimediaRuntime({env=process.env,platform=process.platform,arch=process.arch,packaged=false,resourcesPath,managedRoot,configuredDir,fsApi=fs,probe=runRuntimeProbe,now=Date.now,ttlMs=30000}={}) {
  env=Object.fromEntries(Object.entries(env).filter(([key])=>['path','systemroot','windir','temp','tmp','home','userprofile',MULTIMEDIA_DIR_ENV.toLowerCase()].includes(key.toLowerCase())));
  let cached=null,completedAt=0,pending=null,generation=0;
  function initial() {return {schemaVersion:1,runtime:'whihm-multimedia',availability:'unverified',source:null,platform,arch,packaged,architectureEvidence:'host_only',observation:'not_probed',observedAt:null,
    versions:{ffmpeg:null,ffprobe:null},versionPolicy:structuredClone(VERSION_POLICY),compatibility:{state:'unverified',code:'MM_NOT_PROBED'},baseline:evaluateRuntimeFeatures({}),blockingReasons:[{code:'MM_NOT_PROBED'}],
    mediaTransformsImplemented:false,executionVerified:false,probeScope:'versions_and_advertised_capabilities',providerTransport:false,projectMutation:false,cache:{ttlMs,persistent:false,revalidationRequiredBeforeExecution:true}};}
  async function inspect() {
    const result=initial();result.observation='metadata_probe';result.observedAt=new Date(now()).toISOString();result.blockingReasons=[];
    if(!['win32','linux','darwin'].includes(platform)||!['x64','arm64'].includes(arch)){result.availability='incompatible';result.blockingReasons=[{code:'MM_PLATFORM_UNSUPPORTED'}];return result;}
    const discovered=await discoverMultimediaRuntime({env,platform,arch,packaged,resourcesPath,managedRoot,configuredDir,fsApi});
    result.source=discovered.source;result.discovery=discovered.discovery;result.binaries=Object.fromEntries(Object.entries(discovered.binaries).map(([name,{identity: _identity,...value}])=>[name,value]));
    if(discovered.code){result.availability=discovered.code==='MM_PAIR_ABSENT'?'missing':'unverified';result.blockingReasons=[{code:discovered.code}];return result;}
    const unsafe=binaries.filter(b=>discovered.binaries[b].present!==false&&!discovered.binaries[b].usable);
    if(unsafe.length){result.blockingReasons=unsafe.map(b=>({binary:b,code:discovered.binaries[b].code}));return result;}
    const present=binaries.filter(b=>discovered.binaries[b].present===true);
    if(present.length!==2){result.availability=present.length?'partial':'missing';result.blockingReasons=[{code:present.length?'MM_PAIR_INCOMPLETE':'MM_PAIR_ABSENT'}];return result;}
    const versions=await Promise.all(binaries.map(async binary=>{
      const response=await probe(discovered.paths[binary],binary,'version',{env});
      if(!response.ok)result.blockingReasons.push({binary,query:'version',code:response.code});
      return [binary,response.ok?parseRuntimeVersion(response.stdout,binary):null];
    }));
    result.versions=Object.fromEntries(versions);result.compatibility=assessVersionPair(result.versions);
    if(result.compatibility.code)result.blockingReasons.push({code:result.compatibility.code});
    if(result.compatibility.state==='incompatible'){result.availability='incompatible';return result;}
    if(versions.some(([,v])=>!v))return result;
    const profile=getMultimediaBaseline(),requests=[...new Set(profile.features.map(f=>`${f.binary}:${f.query}`))],tables={ffmpeg:{},ffprobe:{}};
    await Promise.all(requests.map(async request=>{
      const [binary,query]=request.split(':'),response=await probe(discovered.paths[binary],binary,query,{env});
      tables[binary][query]=response.ok?parseCapabilityTable(response.stdout,query):null;
      if(!tables[binary][query])result.blockingReasons.push({binary,query,code:response.ok?'MM_CAPABILITY_OUTPUT_INVALID':response.code});
    }));
    result.baseline=evaluateRuntimeFeatures(tables);
    const stablePair=await Promise.all(binaries.map(async binary=>{
      const after=await checkBinary(discovered.paths[binary],platform,fsApi);
      return after.usable && JSON.stringify(after.identity)===JSON.stringify(discovered.binaries[binary].identity);
    }));
    if(stablePair.some(value=>!value))result.blockingReasons.push({code:'MM_RUNTIME_CHANGED_DURING_PROBE'});
    if(result.baseline.missing.length)result.blockingReasons.push({code:'MM_BASELINE_CAPABILITIES_MISSING',features:result.baseline.missing});
    if(result.baseline.unknown.length)result.blockingReasons.push({code:'MM_BASELINE_CAPABILITIES_UNKNOWN',features:result.baseline.unknown});
    result.availability=stablePair.some(value=>!value)||result.compatibility.state!=='compatible'||result.baseline.unknown.length?'unverified':result.baseline.missing.length?'partial':'ready';
    return result;
  }
  return {
    peek:()=>structuredClone(cached??initial()),
    invalidate(){generation++;cached=null;},
    async getStatus({refresh=false}={}) {
      if(pending)return structuredClone(await pending);
      const age=now()-completedAt;
      if(!refresh&&cached&&age>=0&&age<ttlMs)return structuredClone(cached);
      const token=generation;
      pending=inspect().catch(()=>({...initial(),observation:'probe_failed',blockingReasons:[{code:'MM_PROBE_FAILED'}]})).then(value=>{
        value.blockingReasons.sort((a,b)=>{const x=JSON.stringify(a),y=JSON.stringify(b);return x<y?-1:x>y?1:0;});return value;
      });
      try{const value=await pending;if(token===generation){cached=value;completedAt=now();}return structuredClone(value);}finally{pending=null;}
    },
  };
}
let current=createMultimediaRuntime();
// Called only by trusted Electron initialization/tests. Never accepts renderer configuration.
export function configureMultimediaRuntime(options){current=createMultimediaRuntime(options);}
export function getMultimediaRuntimeStatus(options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='refresh')||(options.refresh!==undefined&&typeof options.refresh!=='boolean'))return Promise.resolve({schemaVersion:1,status:'rejected',diagnostics:[{code:'MM_STATUS_REQUEST_INVALID'}]});
  return current.getStatus(options);
}
export const peekMultimediaRuntimeStatus=()=>current.peek();
export function getMultimediaRuntimeRequirement(){return {id:'whihm-multimedia',profileId:getMultimediaBaseline().id,statusOperation:'getMultimediaRuntimeStatus',snapshot:peekMultimediaRuntimeStatus(),
  limitation:'Last observation only; no execution, media verification or authorization. Re-probe before any future use; video/audio transform contracts are not implemented.'};}

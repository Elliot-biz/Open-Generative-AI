// Fixed metadata commands only. No media input, transform, shell, caller argv or raw diagnostics.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const VERSION_POLICY = Object.freeze({ id: 'WHIHM_MULTIMEDIA_PROBE_PROTOCOL_V1', supportedMajors: Object.freeze([6,7,8,9]), sameMajor: true, libraryAbiMatch: true, scope: 'metadata_protocol_and_advertised_features_only' });
const required = {
  ffmpeg: { decoders: ['h264','aac','pcm_s16le'], encoders: ['libx264','aac','pcm_s16le'], filters: ['scale','crop','pad','fps','trim','setpts','atrim','asetpts','aresample','aformat','pan','volume','afade'], muxers: ['mp4','mov','wav'], demuxers: ['mov','wav'] },
  ffprobe: { decoders: ['h264','aac','pcm_s16le'], demuxers: ['mov','wav'] },
};
const optional = {
  ffmpeg: { decoders: ['hevc','vp9','mp3','flac'], encoders: ['libvpx-vp9','libmp3lame','flac'], filters: ['loudnorm'], muxers: ['webm','mp3','flac'], demuxers: ['matroska','mp3','flac'] },
  ffprobe: { decoders: ['hevc','vp9','mp3','flac'], demuxers: ['matroska','mp3','flac'] },
};
export function getMultimediaBaseline() {
  const features = [];
  for (const [mandatory, groups] of [[true,required],[false,optional]]) for (const [binary, queries] of Object.entries(groups)) for (const [query, names] of Object.entries(queries)) for (const name of names) features.push({ id: `${binary}.${query}.${name}`, binary, query, name, required: mandatory });
  return { id: 'WHIHM_MEDIA_FINISHING_BASELINE_V1', features: features.sort((a,b)=>a.id < b.id ? -1 : a.id > b.id ? 1 : 0), excluded: ['hevc_encoding','av1','hardware_acceleration'], mediaTransformsImplemented: false };
}
export function parseRuntimeVersion(text, binary) {
  if (typeof text !== 'string' || !['ffmpeg','ffprobe'].includes(binary)) return null;
  const first = text.split(/\r?\n/)[0], match = first.match(new RegExp(`^${binary} version ([A-Za-z0-9_.+-]{1,100})(?:\\s|$)`));
  if (!match) return null;
  const release = match[1], numeric = release.match(/^n?(\d{1,2})\.(\d{1,3})(?:\.(\d{1,3}))?(?:[-+][A-Za-z0-9_.+-]+)?$/), libraries = {};
  for (const line of text.split(/\r?\n/)) {
    const lib = line.match(/^\s*(libavutil|libavcodec|libavformat)\s+(\d+)\.\s*(\d+)\.\s*(\d+)\s*\/\s*(\d+)\.\s*(\d+)\.\s*(\d+)\s*$/);
    if (lib) libraries[lib[1]] = { builtMajor: Number(lib[2]), runtimeMajor: Number(lib[5]) };
  }
  const configuration = text.split(/\r?\n/).find(line=>line.startsWith('configuration:'));
  return { release, major: numeric ? Number(numeric[1]) : null, minor: numeric ? Number(numeric[2]) : null, patch: numeric?.[3] ? Number(numeric[3]) : null,
    buildDigest: createHash('sha256').update(text).digest('hex'), configurationDigest: configuration ? createHash('sha256').update(configuration).digest('hex') : null, libraries };
}
export function assessVersionPair(versions) {
  const a=versions.ffmpeg,b=versions.ffprobe;
  if (!a || !b) return { state: 'unverified', code: 'MM_VERSION_OUTPUT_INVALID' };
  if (a.major === null || b.major === null) return { state: 'unverified', code: 'MM_VERSION_COMPATIBILITY_UNVERIFIED' };
  if (!VERSION_POLICY.supportedMajors.includes(a.major) || !VERSION_POLICY.supportedMajors.includes(b.major)) return { state: 'incompatible', code: 'MM_VERSION_UNSUPPORTED' };
  if (a.major !== b.major) return { state: 'incompatible', code: 'MM_PAIR_VERSION_MISMATCH' };
  for (const name of ['libavcodec','libavformat','libavutil']) {
    const x=a.libraries[name],y=b.libraries[name];
    if (!x || !y) return { state: 'unverified', code: 'MM_LIBRARY_ABI_UNVERIFIED' };
    if (x.builtMajor !== x.runtimeMajor || y.builtMajor !== y.runtimeMajor || x.runtimeMajor !== y.runtimeMajor) return { state: 'incompatible', code: 'MM_LIBRARY_ABI_MISMATCH' };
  }
  return { state: 'compatible', scope: VERSION_POLICY.scope, exactReleaseMatch: a.release === b.release };
}
export function parseCapabilityTable(text, query) {
  const titles = { encoders:'Encoders',decoders:'Decoders',filters:'Filters',muxers:'Muxers',demuxers:'Demuxers' };
  if (typeof text !== 'string' || !Object.hasOwn(titles,query)) return null;
  const formatTable=['muxers','demuxers'].includes(query);
  if (!new RegExp(`^\\s*(?:${titles[query]}${formatTable?'|File formats|Formats':''}):\\s*$`,'m').test(text)) return null;
  const expression = ['encoders','decoders'].includes(query) ? /^\s*[VAS][A-Z.]{5}\s+([a-zA-Z0-9_,-]+)\s+/ : /^\s*[TSC.]{2,3}\s+([a-zA-Z0-9_]+)\s+[A-ZN|]+->[A-ZN|]+\s+/;
  const names = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (formatTable) {
      const row=line.match(/^ ([D ])([E ])(?:[d ])?\s+([a-zA-Z0-9_,-]+)\s+/);
      if(row && (query==='muxers'?row[2]==='E':row[1]==='D')) for(const name of row[3].split(','))names.add(name);
    } else { const row=line.match(expression); if(row) for(const name of row[1].split(','))names.add(name); }
  }
  return names.size ? names : null; // unknown output is never converted to an available/missing claim
}
export function evaluateRuntimeFeatures(tables) {
  const p=getMultimediaBaseline(),features=p.features.map(f=>({ ...f, status: tables[f.binary]?.[f.query] instanceof Set ? tables[f.binary][f.query].has(f.name) ? 'available' : 'missing' : 'unknown' }));
  const requiredFeatures=features.filter(f=>f.required);
  return { id:p.id, features, satisfied:requiredFeatures.filter(f=>f.status==='available').map(f=>f.id), missing:requiredFeatures.filter(f=>f.status==='missing').map(f=>f.id), unknown:requiredFeatures.filter(f=>f.status==='unknown').map(f=>f.id) };
}

export function runRuntimeProbe(executable, binary, query, { spawnProcess = spawn, timeoutMs = 3000, outputLimit = 262144, env = process.env } = {}) {
  if (!['ffmpeg','ffprobe'].includes(binary) || !['version',...(binary==='ffmpeg'?['encoders','decoders','filters','muxers','demuxers']:['decoders','demuxers'])].includes(query) || typeof executable !== 'string' || !path.isAbsolute(executable)) return Promise.resolve({ ok:false,code:'MM_PROBE_REQUEST_INVALID' });
  const args=query==='version'?['-version']:['-hide_banner',`-${query}`];
  const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>['path','systemroot','windir','temp','tmp','home','userprofile'].includes(key.toLowerCase())));
  Object.assign(childEnv,{LC_ALL:'C',LANG:'C',AV_LOG_FORCE_NOCOLOR:'1'}); // never inherit FFREPORT, preload hooks or provider credentials
  return new Promise(resolve=>{
    let child,timer,killTimer,done=false,reason,stdout=[],stderr=[],size=0;
    function finish(value){if(done)return;done=true;clearTimeout(timer);clearTimeout(killTimer);child?.stdout?.destroy();child?.stderr?.destroy();resolve(value);}
    function stop(code){if(reason||done)return;reason=code;try{child.kill('SIGKILL');}catch{/* close/error or bounded fallback reports uncertainty */}killTimer=setTimeout(()=>finish({ok:false,code:'MM_TERMINATION_UNCONFIRMED',cause:reason}),1000);}
    try {
      child=spawnProcess(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:childEnv,cwd:path.dirname(executable)});
      const collect=target=>data=>{if(done||reason)return;size+=data.length;if(size>outputLimit)return stop('MM_PROBE_OUTPUT_LIMIT');target.push(Buffer.from(data));};
      child.stdout.on('data',collect(stdout));child.stderr.on('data',collect(stderr));
      child.stdout.once('error',()=>stop('MM_PROBE_IO_FAILED'));child.stderr.once('error',()=>stop('MM_PROBE_IO_FAILED'));
      child.once('error',()=>finish({ok:false,code:'MM_PROBE_SPAWN_FAILED'}));
      child.once('close',exitCode=>finish(reason?{ok:false,code:reason}:exitCode===0?{ok:true,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')}:{ok:false,code:'MM_PROBE_NONZERO_EXIT',exitCode:Number.isInteger(exitCode)?exitCode:null}));
      timer=setTimeout(()=>stop('MM_PROBE_TIMEOUT'),timeoutMs);
    }catch{finish({ok:false,code:'MM_PROBE_SPAWN_FAILED'});}
  });
}

import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
export const fixtureNames={
  encoders:['libx264','aac','pcm_s16le','libvpx-vp9','libmp3lame','flac'],decoders:['h264','aac','pcm_s16le','hevc','vp9','mp3','flac'],
  filters:['scale','crop','pad','fps','trim','setpts','atrim','asetpts','aresample','aformat','pan','volume','afade','loudnorm'],muxers:['mp4','mov','wav','webm','mp3','flac'],demuxers:['mov,mp4,m4a,3gp,3g2,mj2','wav','matroska,webm','mp3','flac'],
};
export function versionText(binary,release='8.0.1') {return `${binary} version ${release} Copyright fixture\nbuilt with fixture compiler\nconfiguration: --enable-gpl --enable-libx264 --prefix=/private/build\nlibavutil      60.  8.100 / 60.  8.100\nlibavcodec     62. 11.100 / 62. 11.100\nlibavformat    62.  3.100 / 62.  3.100\n`;}
export function tableText(query,names=fixtureNames[query],legacy=false) {
  const header={encoders:'Encoders',decoders:'Decoders',filters:'Filters',muxers:legacy?'File formats':'Formats',demuxers:legacy?'File formats':'Formats'}[query];
  const flags=query==='filters'?(legacy?'...':'..'):query==='muxers'?' E ':query==='demuxers'?'D  ':'V.....';
  return `${header}:\n`+names.map(name=>` ${flags} ${name} ${query==='filters'?'V->V ':''}Fixture description`).join('\n')+'\n';
}
export const probeFixture=async(_file,binary,query)=>({ok:true,stdout:query==='version'?versionText(binary):tableText(query),stderr:''});
export async function runtimeFixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-runtime-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  async function pair(directory,{ffmpeg=true,ffprobe=true}={}){await fs.mkdir(directory,{recursive:true});for(const [name,yes]of[['ffmpeg',ffmpeg],['ffprobe',ffprobe]])if(yes)await fs.writeFile(path.join(directory,name+(process.platform==='win32'?'.exe':'')),'fixture',{mode:0o700});return directory;}
  return {root,pair};
}
export function virtualWindowsFs(files) {
  const missing=()=>Object.assign(new Error('Fixture missing'),{code:'ENOENT'});
  return {realpath:async d=>{if(files.some(f=>path.win32.dirname(f)===d))return d;throw missing();},lstat:async f=>{if(!files.includes(f))throw missing();return {isFile:()=>true,isSymbolicLink:()=>false};},access:async()=>{}};
}

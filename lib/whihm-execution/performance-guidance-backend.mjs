// Deterministic staging/composition through the one reviewed multimedia resolver.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { acquireMultimediaRuntime } from './multimedia-runtime.mjs';
import { runBoundedMediaProcess } from './multimedia-process.mjs';
import { extractFaceGuidanceFrames } from './face-guidance-runtime.mjs';
import { guidanceNeed as need, guidanceReadiness, guidanceLimits, validateFaceFrames } from './performance-guidance-contract.mjs';
const fixed=['-hide_banner','-loglevel','error','-xerror','-nostdin','-n','-threads','1','-filter_threads','1','-filter_complex_threads','1','-max_alloc','67108864'];
const input=name=>['-protocol_whitelist','file','-enable_drefs','0','-use_absolute_path','0','-i',name];
export function buildGuidanceArguments(plan,files) {
  const args=[...fixed,...input(files.source)];
  if(plan.mode!=='face_mesh')args.push(...input(files.depth),...input(files.mask));
  const face=plan.mode!=='depth_mask',rate=`${plan.timeline.frameRate.numerator}/${plan.timeline.frameRate.denominator}`;
  if(face)args.push('-protocol_whitelist','file','-framerate',rate,'-start_number','0','-i',files.mesh);
  let graph=plan.mode==='face_mesh'?'[0:v:0]format=rgba[base]':'[0:v:0]format=gbrp[s];[1:v:0]format=gbrp[d];[2:v:0]format=gbrp[m];[s][d][m]maskedmerge,format=rgba[base]';
  if(face)graph+=`;[base][${plan.mode==='face_mesh'?1:3}:v:0]overlay=format=rgb:shortest=1:eof_action=endall[guide]`;
  else graph+=';[base]format=yuv444p[guide]';
  return [...args,'-filter_complex',graph,'-map','[guide]','-an','-map_metadata','-1','-map_chapters','-1','-c:v','libx264','-threads','1','-crf','0','-pix_fmt','yuv444p','-fps_mode','passthrough','-frames:v',String(plan.timeline.frameCount),'-fs','67108865','-movflags','+faststart','-f','mp4',files.output];
}
export function validateDecodedFrames(value,timeline) {
  need(value&&Array.isArray(value.frames)&&value.frames.length===timeline.frameCount,'GUIDANCE_DECODED_FRAME_COUNT_INVALID');
  for(const [i,f]of value.frames.entries())need(f.width===timeline.width&&f.height===timeline.height&&typeof f.best_effort_timestamp_time==='string'&&f.best_effort_timestamp_time.trim()!==''&&Number.isFinite(Number(f.best_effort_timestamp_time))&&Math.abs(Number(f.best_effort_timestamp_time)*1000-timeline.timestampsMs[i])<=0.001,'GUIDANCE_DECODED_TIMING_INVALID');
}
export async function measureMaskFrames(frames,timeline) {
  need(frames.length===timeline.frameCount,'GUIDANCE_MASK_FRAME_COUNT_INVALID');const coverage=[];
  for(const bytes of frames){
    const {data,info}=await sharp(bytes,{limitInputPixels:guidanceLimits.pixels}).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
    need(info.width===timeline.width&&info.height===timeline.height&&info.channels===3,'GUIDANCE_MASK_DIMENSIONS_INVALID');let foreground=0;
    for(let i=0;i<data.length;i+=3){need(Math.abs(data[i]-data[i+1])<=1&&Math.abs(data[i]-data[i+2])<=1,'GUIDANCE_MASK_NOT_GRAYSCALE');if(data[i]>=128)foreground++;}
    coverage.push(foreground/(info.width*info.height));
  }
  return {threshold:128,coverage,emptyFrames:coverage.flatMap((x,i)=>x===0?[i]:[]),fullFrames:coverage.flatMap((x,i)=>x===1?[i]:[]),nearFullFrames:coverage.flatMap((x,i)=>x>=0.98&&x<1?[i]:[]),interpretation:'pixel_occupancy_only_not_semantic_quality'};
}
async function meshFrames(result,timeline) {
  need(Array.isArray(result.connections)&&result.connections.length>0&&result.connections.length<=4096,'FACE_CONNECTIONS_INVALID');
  for(const edge of result.connections)need(Array.isArray(edge)&&edge.length===2&&edge.every(i=>Number.isSafeInteger(i)&&i>=0&&i<478),'FACE_CONNECTIONS_INVALID');
  const output=[];
  for(const frame of result.frames){const points=frame.landmarks;const lines=result.connections.map(([a,b])=>`<line x1="${points[a].x*timeline.width}" y1="${points[a].y*timeline.height}" x2="${points[b].x*timeline.width}" y2="${points[b].y*timeline.height}"/>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${timeline.width}" height="${timeline.height}"><g stroke="#00ff00" stroke-width="1" fill="none">${lines}</g></svg>`;
    output.push(await sharp(Buffer.from(svg),{limitInputPixels:guidanceLimits.pixels}).png({compressionLevel:6}).toBuffer());
  }
  return output;
}
// Trusted test seams only. No host request accepts acquire/run/face overrides or executable paths.
export function createGuidanceBackend({acquire=acquireMultimediaRuntime,run=runBoundedMediaProcess,face=extractFaceGuidanceFrames,timeoutMs=120000}={}) {
  return async (inputs,plan)=>{
    const lease=await acquire();need(lease.ok&&guidanceReadiness(lease.status).executable,'GUIDANCE_RUNTIME_NOT_READY');let directory;
    try {
      directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-guidance-'));
      async function command(binary,args){need(await lease.unchanged(),'GUIDANCE_RUNTIME_CHANGED');const r=await run(lease.paths[binary],args,{env:lease.env,timeoutMs,outputLimit:262144,codePrefix:'GUIDANCE_PROCESS'});need(r.ok,r.code);need(await lease.unchanged(),'GUIDANCE_RUNTIME_CHANGED');return r;}
      async function verify(filename){const r=await command('ffprobe',['-v','error','-protocol_whitelist','file','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,width,height','-of','json',filename]);let data;try{data=JSON.parse(r.stdout);}catch{need(false,'GUIDANCE_PROBE_OUTPUT_INVALID');}validateDecodedFrames(data,plan.timeline);}
      async function boundedRead(filename){const stat=await fs.lstat(filename);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=guidanceLimits.bytes,'GUIDANCE_OUTPUT_INVALID');const b=await fs.readFile(filename);need(b.length===stat.size,'GUIDANCE_OUTPUT_INVALID');return b;}
      const files={};for(const [role,bytes]of Object.entries(inputs)){files[role]=path.join(directory,`${role}.mp4`);await fs.writeFile(files[role],bytes,{flag:'wx',mode:0o600});await verify(files[role]);}
      async function decode(role){const folder=path.join(directory,role);await fs.mkdir(folder);await command('ffmpeg',[...fixed,...input(files[role]),'-map','0:v:0','-an','-frames:v',String(plan.timeline.frameCount),'-fps_mode','passthrough','-start_number','0','-c:v','png','-threads','1','-f','image2',path.join(folder,'frame-%06d.png')]);
        const names=(await fs.readdir(folder)).sort();need(names.length===plan.timeline.frameCount&&names.every((n,i)=>n===`frame-${String(i).padStart(6,'0')}.png`),'GUIDANCE_FRAME_EXTRACTION_INVALID');let size=0;const frames=[];for(const name of names){const b=await boundedRead(path.join(folder,name));size+=b.length;need(size<=guidanceLimits.bytes,'GUIDANCE_FRAME_BYTES_LIMIT');frames.push(b);}return frames;}
      let maskValidation=null,faceResult=null,faceCoverage=null;
      if(plan.mode!=='face_mesh'){maskValidation=await measureMaskFrames(await decode('mask'),plan.timeline);need(!maskValidation.emptyFrames.length,'GUIDANCE_EMPTY_MASK');}
      if(plan.mode!=='depth_mask'){
        faceResult=await face(await decode('source'),plan.timeline);faceCoverage=validateFaceFrames(faceResult.frames,plan.timeline);need(faceCoverage.complete,'FACE_COVERAGE_INCOMPLETE');
        const meshes=await meshFrames(faceResult,plan.timeline),folder=path.join(directory,'mesh');await fs.mkdir(folder);let size=0;
        for(const [i,b]of meshes.entries()){size+=b.length;need(size<=guidanceLimits.bytes,'GUIDANCE_FRAME_BYTES_LIMIT');await fs.writeFile(path.join(folder,`frame-${String(i).padStart(6,'0')}.png`),b,{flag:'wx',mode:0o600});}files.mesh=path.join(folder,'frame-%06d.png');
      }
      files.output=path.join(directory,'guidance.mp4');await command('ffmpeg',buildGuidanceArguments(plan,files));await verify(files.output);
      const bytes=await boundedRead(files.output);
      return {bytes,landmarks:faceResult?{frames:faceResult.frames,connections:faceResult.connections}:null,validation:{mask:maskValidation,face:faceCoverage,decodedTimingVerified:true},
        backend:{id:'ffmpeg-performance-guidance',profileId:guidanceReadiness(lease.status).profileId,source:lease.status.source,versions:lease.status.versions,...(faceResult?{face:faceResult.backend}:{})}};
    } finally {if(directory)try{await fs.rm(directory,{recursive:true,force:true});}catch{need(false,'GUIDANCE_TEMP_CLEANUP_REQUIRED');}}
  };
}

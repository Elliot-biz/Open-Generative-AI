// Compiler and staging over the existing matched runtime and bounded process primitive.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MAX_IMPORT_BYTES } from '../../packages/whihm-workflow-core/src/project/io.js';
import { acquireMultimediaRuntime } from './multimedia-runtime.mjs';
import { runBoundedMediaProcess } from './multimedia-process.mjs';
import { timelineNeed as need, timelineReadiness, frameSeconds, timelineSample } from './timeline-contract.mjs';

const fixed=['-hide_banner','-loglevel','error','-xerror','-nostdin','-n','-threads','1','-filter_threads','1','-filter_complex_threads','1','-max_alloc','67108864'];
const seconds=(n,rate)=>frameSeconds(n,rate).toFixed(9);
export function buildTimelineArguments(plan,files,output) {
  const t=plan.timeline,rate=t.frameRate,r=`${rate.numerator}/${rate.denominator}`,tb=`${rate.denominator}/${rate.numerator}`;
  const args=[...fixed],graph=[`color=c=black:s=${t.canvas.width}x${t.canvas.height}:r=${r}:d=${seconds(t.durationFrames,rate)},format=rgba[base0]`];
  const audio=[];let visual=0;
  for(const [i,item] of plan.layers.entries()){
    const record=plan.sources.find(s=>s.assetId===item.source.assetId);
    args.push('-protocol_whitelist','file');
    if(item.type==='image')args.push('-loop','1','-framerate',r,'-f','image2','-pattern_type','none');
    else if(item.type==='video')args.push('-noautorotate','-enable_drefs','0','-use_absolute_path','0');
    args.push('-i',files[record.assetId]);
    if(item.type!=='audio'){
      const p=item.placement,pre=item.type==='image'?'':`trim=start=${seconds(item.sourceInFrame,rate)}:duration=${seconds(item.durationFrames,rate)},`;
      graph.push(`[${i}:v:0]${pre}setpts=PTS-STARTPTS,fps=fps=${r}:start_time=0,trim=end_frame=${item.durationFrames},scale=${p.width}:${p.height}:flags=bicubic,setsar=1,format=rgba,settb=expr=${tb},setpts=N+${item.startFrame}[v${i}]`);
      graph.push(`[base${visual}][v${i}]overlay=x=${p.x}:y=${p.y}:eof_action=pass:repeatlast=0:format=auto:enable='gte(t,${item.startFrame}*${rate.denominator}/${rate.numerator})*lt(t,${item.startFrame+item.durationFrames}*${rate.denominator}/${rate.numerator})'[base${visual+1}]`);visual++;
    }
    if(item.type==='audio'||item.sourceAudio==='use'){
      const sr=t.audio.sampleRate,layout=t.audio.channels===1?'mono':'stereo';
      const sample=n=>timelineSample(n,rate,sr),start=sample(item.sourceInFrame),end=sample(item.sourceInFrame+item.durationFrames);
      graph.push(`[${i}:a:0]aresample=${sr},atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=${sr}:channel_layouts=${layout},volume=${item.gainDb}dB,adelay=delays=${sample(item.startFrame)}S:all=1[a${i}]`);audio.push(`[a${i}]`);
    }
  }
  graph.push(`[base${visual}]format=yuv420p[vout]`);
  if(t.audio.policy==='mix'){
    const sr=t.audio.sampleRate,layout=t.audio.channels===1?'mono':'stereo',samples=timelineSample(t.durationFrames,rate,sr);
    graph.push(`anullsrc=r=${sr}:cl=${layout},atrim=end_sample=${samples}[silence]`);
    graph.push(`[silence]${audio.join('')}amix=inputs=${audio.length+1}:duration=first:dropout_transition=0:normalize=0,atrim=end_sample=${samples}[aout]`);
  }
  args.push('-filter_complex',graph.join(';'),'-map','[vout]','-map_metadata','-1','-map_chapters','-1','-c:v','libx264','-threads','1','-preset','medium','-b:v',String(t.render.videoBitrate),'-pix_fmt','yuv420p','-r',r,'-fps_mode','cfr','-frames:v',String(t.durationFrames));
  if(t.audio.policy==='mix')args.push('-map','[aout]','-c:a','aac','-ar',String(t.audio.sampleRate),'-ac',String(t.audio.channels),'-b:a',String(t.audio.bitrate));
  else args.push('-an');
  return [...args,'-t',seconds(t.durationFrames,rate),'-fs',String(MAX_IMPORT_BYTES+1),'-movflags','+faststart','-f','mp4',output];
}

export function createTimelineBackend({acquire=acquireMultimediaRuntime,run=runBoundedMediaProcess,timeoutMs=120000,buildArguments=buildTimelineArguments,extension='mp4',backendId='ffmpeg-timeline-v1'}={}) {
  return async (inputs,plan)=>{
    const lease=await acquire();need(lease.ok&&lease.status.baseline.id==='WHIHM_MEDIA_FINISHING_BASELINE_V1'&&timelineReadiness(lease.status,plan.requiredRuntimeFeatures).executable,'TIMELINE_RUNTIME_NOT_READY');
    let directory;
    try{
      directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-timeline-'));const files=Object.create(null);
      for(const [index,source]of plan.sources.entries()){
        const bytes=inputs.get(source.assetId);need(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=MAX_IMPORT_BYTES,'TIMELINE_INPUT_INVALID');
        files[source.assetId]=path.join(directory,`input-${index}.${source.container}`);await fs.writeFile(files[source.assetId],bytes,{flag:'wx',mode:0o600});
      }
      const output=path.join(directory,`output.${extension}`);
      need(await lease.unchanged(),'TIMELINE_RUNTIME_CHANGED');
      const result=await run(lease.paths.ffmpeg,buildArguments(plan,files,output),{env:lease.env,timeoutMs,outputLimit:262144,codePrefix:'TIMELINE_PROCESS'});
      need(result.ok,result.code);need(await lease.unchanged(),'TIMELINE_RUNTIME_CHANGED');
      const stat=await fs.lstat(output);need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=MAX_IMPORT_BYTES,'TIMELINE_OUTPUT_INVALID');
      const bytes=await fs.readFile(output);need(bytes.length===stat.size,'TIMELINE_OUTPUT_INVALID');
      return {bytes,backend:{id:backendId,profileId:lease.status.baseline.id,source:lease.status.source,versions:lease.status.versions}};
    }finally{if(directory)await fs.rm(directory,{recursive:true,force:true});}
  };
}

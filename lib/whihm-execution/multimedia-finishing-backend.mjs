// Private staging and one typed transform through the existing paired runtime.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MAX_IMPORT_BYTES } from '../../packages/whihm-workflow-core/src/project/io.js';
import { acquireMultimediaRuntime } from './multimedia-runtime.mjs';
import { runBoundedMediaProcess } from './multimedia-process.mjs';
import { buildMultimediaArguments } from './multimedia-finishing-contract.mjs';

const fail = (code, details) => { throw Object.assign(new Error(code), { finishingCode:code, ...details }); };
// Injection is trusted Node/test configuration only; no renderer request can change it.
export function createMultimediaFinisher({ acquire=acquireMultimediaRuntime, run=runBoundedMediaProcess, timeoutMs=120000 }={}) {
  return async (bytes,plan,audioBytes) => {
    const lease=await acquire();
    if(!lease.ok||lease.status.availability!=='ready'||lease.status.baseline.id!=='WHIHM_MEDIA_FINISHING_BASELINE_V1')
      fail('FINISH_RUNTIME_NOT_READY',{runtime:lease.status});
    let directory;
    try {
      directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-multimedia-finish-'));
      const input=path.join(directory,`input.${plan.sourceInspection.facts.container}`),output=path.join(directory,`output.${plan.parameters.container}`);
      await fs.writeFile(input,bytes,{flag:'wx',mode:0o600});
      let audioInput;
      if(plan.audioSource){if(!Buffer.isBuffer(audioBytes)||audioBytes.length>MAX_IMPORT_BYTES)fail('FINISH_BACKEND_OUTPUT_INVALID');audioInput=path.join(directory,`soundtrack.${plan.audioSourceInspection.facts.container}`);await fs.writeFile(audioInput,audioBytes,{flag:'wx',mode:0o600});}
      if(!await lease.unchanged())fail('FINISH_RUNTIME_CHANGED');
      const result=await run(lease.paths.ffmpeg,buildMultimediaArguments(plan,input,output,audioInput),{env:lease.env,timeoutMs,outputLimit:262144,codePrefix:'FINISH_PROCESS'});
      if(!result.ok)fail(result.code,{terminationUnconfirmed:result.code==='MM_TERMINATION_UNCONFIRMED'});
      if(!await lease.unchanged())fail('FINISH_RUNTIME_CHANGED');
      const stat=await fs.lstat(output);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0||stat.size>MAX_IMPORT_BYTES)fail('FINISH_BACKEND_OUTPUT_INVALID');
      const outputBytes=await fs.readFile(output);
      if(outputBytes.length!==stat.size)fail('FINISH_BACKEND_OUTPUT_INVALID');
      return {bytes:outputBytes,backend:{id:'ffmpeg-media-finishing',profileId:lease.status.baseline.id,source:lease.status.source,versions:lease.status.versions}};
    } catch(error) {
      if(error.finishingCode)throw error;
      fail('FINISH_BACKEND_OUTPUT_INVALID');
    } finally {
      if(directory)try{await fs.rm(directory,{recursive:true,force:true});}catch{fail('FINISH_TEMP_CLEANUP_REQUIRED');}
    }
  };
}

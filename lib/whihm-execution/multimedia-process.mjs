// Trusted internal process primitive shared by metadata probes and typed finishing.
// Never exposed through IPC. Call sites own their fixed/validated argument construction.
import { spawn } from 'node:child_process';
import path from 'node:path';
export function runBoundedMediaProcess(executable,args,{spawnProcess=spawn,timeoutMs=3000,outputLimit=262144,env=process.env,codePrefix='MM_PROBE'}={}) {
  const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>['path','systemroot','windir','temp','tmp','home','userprofile'].includes(key.toLowerCase())));
  Object.assign(childEnv,{LC_ALL:'C',LANG:'C',AV_LOG_FORCE_NOCOLOR:'1'}); // never inherit FFREPORT, preload hooks or provider credentials
  return new Promise(resolve=>{
    let child,timer,killTimer,done=false,reason,stdout=[],stderr=[],size=0;
    function finish(value){if(done)return;done=true;clearTimeout(timer);clearTimeout(killTimer);child?.stdout?.destroy();child?.stderr?.destroy();resolve(value);}
    function stop(code){if(reason||done)return;reason=code;try{child.kill('SIGKILL');}catch{/* close/error or bounded fallback reports uncertainty */}killTimer=setTimeout(()=>finish({ok:false,code:'MM_TERMINATION_UNCONFIRMED',cause:reason}),1000);}
    try {
      child=spawnProcess(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],env:childEnv,cwd:path.dirname(executable)});
      const collect=target=>data=>{if(done||reason)return;size+=data.length;if(size>outputLimit)return stop(`${codePrefix}_OUTPUT_LIMIT`);target.push(Buffer.from(data));};
      child.stdout.on('data',collect(stdout));child.stderr.on('data',collect(stderr));
      child.stdout.once('error',()=>stop(`${codePrefix}_IO_FAILED`));child.stderr.once('error',()=>stop(`${codePrefix}_IO_FAILED`));
      child.once('error',()=>finish({ok:false,code:`${codePrefix}_SPAWN_FAILED`}));
      child.once('close',exitCode=>finish(reason?{ok:false,code:reason}:exitCode===0?{ok:true,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')}:{ok:false,code:`${codePrefix}_NONZERO_EXIT`,exitCode:Number.isInteger(exitCode)?exitCode:null}));
      timer=setTimeout(()=>stop(`${codePrefix}_TIMEOUT`),timeoutMs);
    }catch{finish({ok:false,code:`${codePrefix}_SPAWN_FAILED`});}
  });
}

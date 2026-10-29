// Explicit source-mode startup. The owner selects the only accessible project.
import {register} from 'node:module';
register(new URL('../electron/lib/whihm-esm-loader.mjs',import.meta.url));
const {createExternalDirector}=await import('../lib/whihm-execution/external-director.mjs');
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--project'){
  process.stderr.write('Usage: node scripts/external-director.mjs --project /absolute/project\n');process.exit(1);
}
let bridge;
try{bridge=await createExternalDirector({projectRoot:args[1]});}catch{process.stderr.write('DIRECTOR_PROJECT_UNAVAILABLE\n');process.exit(1);}
process.stdout.write(JSON.stringify({schemaVersion:1,status:'ready',sessionId:bridge.sessionId,manifest:bridge.manifest()})+'\n');
// Bounded framing and sequential backpressure. No sockets, shell or arbitrary host dispatch.
let pending='';
process.stdin.setEncoding('utf8');
try{
  for await(const chunk of process.stdin){
    pending+=chunk.toString('utf8');
    if(Buffer.byteLength(pending)>1048576)throw Error('limit');
    let end;
    while((end=pending.indexOf('\n'))>=0){
      const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.trim())continue;
      let result;
      let parsed;
      try{parsed=JSON.parse(line);result=await bridge.call(parsed);}catch{result={schemaVersion:1,status:'error',...(typeof parsed?.requestId==='string'?{requestId:parsed.requestId}:{}),error:{code:'INVALID_REQUEST',nativeCode:'DIRECTOR_JSON_INVALID'}};}
      if(!process.stdout.write(JSON.stringify(result)+'\n'))await new Promise(resolve=>process.stdout.once('drain',resolve));
    }
  }
  if(pending.trim())process.stderr.write('DIRECTOR_INCOMPLETE_FRAME\n');
}catch{process.stderr.write('DIRECTOR_TRANSPORT_CLOSED\n');process.exitCode=1;}
finally{bridge.close();}

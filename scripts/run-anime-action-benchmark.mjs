// Source the existing local runtime env helper before invoking this development tool.
import path from 'node:path';
import os from 'node:os';
import {runActionBenchmark} from '../tests/benchmarks/anime-action-runner.mjs';
const directory=path.join(os.tmpdir(),`anime-action-${Date.now()}`);
try{const result=await runActionBenchmark(directory);console.log(JSON.stringify({status:result.status,benchmarkId:result.benchmarkId,issues:result.issues,metrics:result.metrics,hashes:result.hashes,artifacts:result.artifacts,runtime:result.runtime,directory},null,2));if(result.status!=='PASS')process.exitCode=1;}catch(error){console.error(JSON.stringify({schemaVersion:1,benchmarkId:'anime_action_edit_v1',status:'FAIL',issues:[error.message]}));process.exitCode=1;}

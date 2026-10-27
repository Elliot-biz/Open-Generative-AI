// Trusted app configuration only: no paths, model URLs or backend overrides accepted over IPC.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hashBytes } from '../../packages/whihm-workflow-core/src/project/io.js';
const require=createRequire(import.meta.url);
export const facePackageVersion='0.10.32';
let renderer=null;
let observed={available:null,code:'FACE_RUNTIME_NOT_OBSERVED',runtimeVerification:'unverified',downloads:false};
export const peekFaceGuidanceStatus=()=>structuredClone(observed);
export function configureFaceGuidanceRenderer(value){renderer=value;}
export async function readFaceRuntimeAssets({env=process.env}={}) {
  const modelPath=env.WHIHM_FACE_MODEL_PATH,expected=env.WHIHM_FACE_MODEL_SHA256;
  if(!modelPath||!expected)return {ok:false,code:'FACE_MODEL_NOT_CONFIGURED'};
  if(!path.isAbsolute(modelPath)||modelPath.includes('\0')||! /^[a-f0-9]{64}$/.test(expected))return {ok:false,code:'FACE_MODEL_CONFIGURATION_INVALID'};
  try {
    const stat=await fs.lstat(modelPath);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<=0||stat.size>10485760)return {ok:false,code:'FACE_MODEL_INVALID'};
    const model=await fs.readFile(modelPath);if(hashBytes(model)!==expected)return {ok:false,code:'FACE_MODEL_HASH_MISMATCH'};
    const root=path.dirname(require.resolve('@mediapipe/tasks-vision'));
    const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
    if(pkg.version!==facePackageVersion)return {ok:false,code:'FACE_PACKAGE_VERSION_MISMATCH'};
    const files={'model.task':model,'runner.mjs':await fs.readFile(fileURLToPath(new URL('../../electron/lib/face-guidance-runner.mjs',import.meta.url)))};
    for(const name of ['vision_bundle.mjs','wasm/vision_wasm_internal.js','wasm/vision_wasm_internal.wasm','wasm/vision_wasm_nosimd_internal.js','wasm/vision_wasm_nosimd_internal.wasm']) {
      const filename=path.join(root,name),info=await fs.lstat(filename);if(!info.isFile()||info.isSymbolicLink()||info.size>16777216)return {ok:false,code:'FACE_PACKAGE_INVALID'};
      files[name]=await fs.readFile(filename);
    }
    return {ok:true,files,identity:{id:'mediapipe-face-landmarker',packageVersion:facePackageVersion,modelChecksum:expected,modelVersion:'sha256-pinned',assetChecksums:Object.fromEntries(Object.entries(files).map(([name,b])=>[name,hashBytes(b)])),delegate:'CPU',runningMode:'VIDEO',maxDetectedFaces:2,selectedFaces:1,confidence:0.5}};
  }catch{return {ok:false,code:'FACE_RUNTIME_ASSETS_UNAVAILABLE'};}
}
export async function getFaceGuidanceStatus(){const assets=await readFaceRuntimeAssets();observed={runtimeVerification:'unverified',available:assets.ok&&typeof renderer==='function',code:!assets.ok?assets.code:typeof renderer!=='function'?'FACE_ELECTRON_RUNNER_UNAVAILABLE':null,...(assets.ok?{identity:assets.identity}:{}),downloads:false};return structuredClone(observed);}
export async function extractFaceGuidanceFrames(frames,timeline) {
  const assets=await readFaceRuntimeAssets();if(!assets.ok||typeof renderer!=='function')throw Object.assign(new Error('Face runtime unavailable'),{guidanceCode:assets.code??'FACE_ELECTRON_RUNNER_UNAVAILABLE'});
  return {...await renderer({frames,timeline,assets}),backend:assets.identity};
}

// Internal native transport. Not a workflow binding or renderer API.
import {randomUUID} from 'node:crypto';
const origin='https://api.higgsfield.ai';
export const higgsfieldRoutes=Object.freeze({
 'higgsfield/genjutsu/motion-transfer/v1.0':{capability:'PERFORMANCE_TRANSFER',minimum:1,maximum:8},
 'higgsfield/genjutsu/object-swap/v1.0':{capability:'OBJECT_REPLACE_VIDEO',minimum:1,maximum:8,minimumPixels:409600},
 'higgsfield/genjutsu/restyle/v1.0':{capability:'VIDEO_RESTYLE',minimum:0,maximum:5,preset:true},
});
const need=(condition,code)=>{if(!condition)throw Object.assign(new Error(code),{higgsfieldCode:code});};
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]{1,512}$/.test(value);
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&value.length<=2083;}catch{return false;}};
export function higgsfieldNativeReadiness(env=process.env){
 const key=env.HF_API_KEY_ID,secret=env.HF_API_KEY_SECRET;
 const code=!key&&!secret?'HIGGSFIELD_CREDENTIALS_MISSING':!token(key)||!token(secret)?'HIGGSFIELD_CONFIGURATION_INVALID':null;
 return {schemaVersion:1,adapterReady:!code,code,provider:'higgsfield',providerTransport:false,accountAccessVerified:false};
}
export function buildHiggsfieldRequest(model,input,facts){
 need(Object.hasOwn(higgsfieldRoutes,model),'HIGGSFIELD_MODEL_UNSUPPORTED');const route=higgsfieldRoutes[model];
 need(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['video_url','image_urls','prompt','resolution',...(route.preset?['preset_id']:[])].includes(k)),'HIGGSFIELD_INPUT_INVALID');
 need(https(input.video_url),'HIGGSFIELD_VIDEO_INVALID');const images=input.image_urls??[];
 need(Array.isArray(images)&&images.length>=route.minimum&&images.length<=route.maximum&&images.every(https),'HIGGSFIELD_REFERENCES_INVALID');
 need(facts&&Number.isFinite(facts.durationSeconds)&&facts.durationSeconds>=4&&facts.durationSeconds<=30&&Number.isSafeInteger(facts.width)&&Number.isSafeInteger(facts.height)&&facts.width>0&&facts.height>0,'HIGGSFIELD_SOURCE_FACTS_INVALID');
 need(!route.minimumPixels||facts.width*facts.height>=route.minimumPixels,'HIGGSFIELD_SOURCE_PIXELS_INVALID');
 const prompt=input.prompt??'',resolution=input.resolution??'720p';need(typeof prompt==='string'&&prompt.length<=10000&&['480p','720p','1080p'].includes(resolution),'HIGGSFIELD_CONTROL_INVALID');
 need(!route.preset||token(input.preset_id),'HIGGSFIELD_PRESET_REQUIRED');
 return {model,capability:route.capability,payload:{video_url:input.video_url,image_urls:[...images],prompt,resolution,...(route.preset?{preset_id:input.preset_id}:{})}};
}
export function createHiggsfieldNative({env=process.env,fetchImpl=(...args)=>fetch(...args),timeoutMs=15000,now=()=>new Date().toISOString()}={}){
 const sessions=new Map(),busy=new Set();let disposed=false;
 const readiness=()=>higgsfieldNativeReadiness(env);
 async function http(url,method,payload){
  const r=readiness();need(r.adapterReady,r.code);const abort=new AbortController();let timer,reader;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(new Error('timeout'));},timeoutMs);});
  try{
   const response=await Promise.race([fetchImpl(url,{method,redirect:'error',signal:abort.signal,headers:{Authorization:`Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),deadline]);
   if(!response.ok)throw Object.assign(new Error('provider error'),{higgsfieldCode:`HIGGSFIELD_HTTP_${response.status}`,definitiveRejection:method==='POST'&&[400,401,403,404,422,423,429].includes(response.status)});
   need(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'HIGGSFIELD_RESPONSE_INVALID');reader=response.body?.getReader();need(reader,'HIGGSFIELD_RESPONSE_INVALID');const chunks=[];let size=0;
   while(true){const item=await Promise.race([reader.read(),deadline]);if(item.done)break;size+=item.value.byteLength;need(size<=1048576,'HIGGSFIELD_RESPONSE_LIMIT');chunks.push(Buffer.from(item.value));}
   return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{clearTimeout(timer);abort.abort();try{await reader?.cancel();}catch{/* no accepted incomplete response */}}
 }
 function normalize(native,state){
  need(native&&native.request_id===state.requestId,'HIGGSFIELD_REQUEST_ID_MISMATCH');
  const states={queued:'processing',in_progress:'processing',completed:'succeeded',failed:'failed',nsfw:'failed',canceled:'cancelled'};need(Object.hasOwn(states,native.status),'HIGGSFIELD_STATUS_UNKNOWN');const status=states[native.status];
  if(status==='succeeded')need(https(native.video?.url),'HIGGSFIELD_OUTPUT_INVALID');
  state.providerStatus=native.status;state.status=status;
  return {schemaVersion:1,status,provider:'higgsfield',model:state.model,capability:state.capability,requestId:state.requestId,continuationId:state.continuationId,submittedAt:state.submittedAt,providerStatus:native.status,
   outputs:status==='succeeded'?[{mediaType:'video',value:native.video.url}]:[],cost:native.cost??null,usage:native.usage??null,executionUncertain:false,
   diagnostics:status==='failed'?[{code:native.status==='nsfw'?'HIGGSFIELD_MODERATED':'HIGGSFIELD_PROVIDER_FAILED'}]:[]};
 }
 function blocked(error,state){return {schemaVersion:1,status:'blocked',provider:'higgsfield',model:state?.model??null,requestId:state?.requestId??null,continuationId:state?.continuationId??null,executionUncertain:true,diagnostics:[{code:error.higgsfieldCode??'HIGGSFIELD_TRANSPORT_UNCERTAIN'}]};}
 return {readiness,
  async submit({model,input,facts,allowExecution}){
   need(!disposed,'HIGGSFIELD_SESSION_CLOSED');need(allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const request=buildHiggsfieldRequest(model,input,facts);const ready=readiness();need(ready.adapterReady,ready.code);need(sessions.size<128,'HIGGSFIELD_SESSION_LIMIT');
   let state;
   try{const raw=await http(`${origin}/${model}`,'POST',request.payload);
    need(typeof raw.request_id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.request_id),'HIGGSFIELD_REQUEST_ID_INVALID');
    // Store identity before validating the remaining response, so a malformed status cannot cause resubmission.
    state={model,capability:request.capability,requestId:raw.request_id,continuationId:randomUUID(),submittedAt:now(),status:'processing'};sessions.set(state.continuationId,state);
    need(raw.status_url===`${origin}/requests/${raw.request_id}/status`,'HIGGSFIELD_STATUS_URL_INVALID');state.statusUrl=raw.status_url;return normalize(raw,state);
   }catch(error){if(error.definitiveRejection)return {schemaVersion:1,status:'failed',provider:'higgsfield',model,requestId:null,executionUncertain:false,diagnostics:[{code:error.higgsfieldCode}]};return blocked(error,state);}
  },
  async poll({continuationId,allowExecution}){
   need(!disposed,'HIGGSFIELD_SESSION_CLOSED');need(allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const state=sessions.get(continuationId);need(state,'HIGGSFIELD_CONTINUATION_LOST');need(!busy.has(continuationId),'HIGGSFIELD_CONTINUATION_BUSY');need(state.statusUrl,'HIGGSFIELD_STATUS_URL_INVALID');
   if(state.result)return structuredClone(state.result);busy.add(continuationId);
   try{const result=normalize(await http(state.statusUrl,'GET'),state);if(result.status!=='processing')state.result=structuredClone(result);return result;}catch(error){return blocked(error,state);}finally{busy.delete(continuationId);}
  },
  dispose(){disposed=true;sessions.clear();},
 };
}

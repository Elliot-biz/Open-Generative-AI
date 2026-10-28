// Project/session adapter. Provider lifecycle remains exclusively in higgsfield-native.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {readBytes,hashBytes,safeData,fields} from '../../packages/whihm-workflow-core/src/project/io.js';
import {inspectMedia,inspectMediaBuffer} from './media-inspection.mjs';
import {createHiggsfieldNative,buildHiggsfieldRequest,higgsfieldRoutes,higgsfieldAuthorization} from './higgsfield-native.mjs';
import {higgsfieldMediaRequest,mediaURL,uploadHeaders} from './higgsfield-media.mjs';
import {need} from './workflow-bindings.mjs';
const endpoint='https://api.higgsfield.ai/files/generate-upload-url';
const fingerprint=url=>({origin:mediaURL(url).origin,referenceHash:createHash('sha256').update(url).digest('hex')});
const controls=request=>Object.fromEntries(Object.entries(request.payload).filter(([key])=>!['video_url','image_urls'].includes(key)));
const ref=a=>({assetId:a.assetId,checksum:a.checksum});
export function createHiggsfieldProject({env=process.env,native=createHiggsfieldNative({env}),transfer=higgsfieldMediaRequest}={}){
 const sessions=new Map();let disposed=false;
 async function read(project,root,binding,type,budget=67108864){
  need(binding?.kind==='project_asset'&&binding.type===type,'HF_REGISTERED_ASSET_REQUIRED');
  const response=await project.getProjectAsset(binding.assetId);need(response.status==='ok','HF_ASSET_NOT_FOUND');const asset=response.asset;need(asset.size>0&&asset.size<=budget,'HF_INPUT_BYTES_LIMIT');
  need(binding.checksum===asset.checksum,'ASSET_HASH_MISMATCH');const inspection=await inspectMedia({project,root,assetId:asset.assetId});need(inspection.status==='succeeded',inspection.diagnostics?.[0]?.code??'HF_MEDIA_INVALID');
  need(asset.contentType===`${type}/${inspection.facts.container}`&&inspection.facts.mediaKind===type&&['video/mp4','image/png','image/jpeg','image/webp','image/gif'].includes(asset.contentType),'HF_MEDIA_TYPE_UNSUPPORTED');
  const bytes=await readBytes(root,asset.path);need(hashBytes(bytes)===asset.checksum,'ASSET_HASH_MISMATCH');return {asset,bytes,inspection};
 }
 async function prepare(model,resolved,context){
  need(!disposed,'HF_SESSION_CLOSED');fields(resolved.parameters,['video_url'],['image_urls','prompt','resolution','preset_id'],'HF_INPUT_INVALID');
  need(Object.hasOwn(higgsfieldRoutes,model),'HIGGSFIELD_MODEL_UNSUPPORTED');
  const source=await read(context.project,context.root,resolved.bindings.video_url,'video'),images=[];
  need(resolved.bindings.image_urls===undefined||Array.isArray(resolved.bindings.image_urls),'HF_IMAGE_CARDINALITY_INVALID');
  need((resolved.bindings.image_urls??[]).length>=higgsfieldRoutes[model].minimum&&(resolved.bindings.image_urls??[]).length<=higgsfieldRoutes[model].maximum,'HIGGSFIELD_REFERENCES_INVALID');
  for(const b of resolved.bindings.image_urls??[])images.push(await read(context.project,context.root,b,'image'));
  need(resolved.parameters.image_urls===undefined||resolved.bindings.image_urls!==undefined,'HF_REGISTERED_ASSET_REQUIRED');
  need(source.bytes.length+images.reduce((n,i)=>n+i.bytes.length,0)<=67108864,'HF_INPUT_BYTES_LIMIT');
  const videos=source.inspection.facts.streams.filter(s=>s.type==='video');need(videos.length===1,'HF_VIDEO_REQUIRED');const video=videos[0];
  const facts={durationSeconds:video.durationSeconds,width:video.displayDimensions?.width,height:video.displayDimensions?.height};
  const input={...resolved.parameters,video_url:'https://project-asset.invalid/source',image_urls:images.map((_,i)=>`https://project-asset.invalid/image-${i}`)};
  const request=buildHiggsfieldRequest(model,input,facts);return {source,images,facts,request};
 }
 function evidence(value){safeData(value,'HF_EVIDENCE_INVALID');const text=JSON.stringify(value);need(text.length<=65536&&![env.HF_API_KEY_SECRET,env.HF_API_KEY_ID].filter(v=>typeof v==='string'&&v.length>0).some(v=>text.includes(v)),'HF_EVIDENCE_INVALID');return value;}
 async function upload(item,onKnown){
  const response=await transfer(endpoint,{method:'POST',limit:65536,headers:{Authorization:higgsfieldAuthorization(env),'Content-Type':'application/json'},body:Buffer.from(JSON.stringify({content_type:item.asset.contentType}))});
  need(/^application\/json(?:;|$)/i.test(response.contentType),'HF_UPLOAD_RESPONSE_INVALID');let info;try{info=JSON.parse(response.bytes);}catch{need(false,'HF_UPLOAD_RESPONSE_INVALID');}
  mediaURL(info.public_url);mediaURL(info.upload_url);need(info.content_type===item.asset.contentType,'HF_UPLOAD_TYPE_INVALID');
  const identity={...ref(item.asset),providerReference:fingerprint(info.public_url)};
  onKnown(identity,info.public_url);
  await transfer(info.upload_url,{method:'PUT',headers:uploadHeaders(info.upload_headers,item.asset.contentType),body:item.bytes,limit:65536});return {url:info.public_url,identity};
 }
 async function finish(state,result,context){
  state.nativeResult=result;need(!disposed,'HF_SESSION_CLOSED');
  const common={...result,diagnostics:result.status==='cancelled'?[{code:'HIGGSFIELD_PROVIDER_CANCELLED'}]:result.diagnostics,model:state.model,capability:higgsfieldRoutes[state.model].capability,continuationId:state.handle,continuationRequired:['processing','blocked'].includes(result.status)&&Boolean(result.requestId&&result.continuationId),transformation:{capability:higgsfieldRoutes[state.model].capability,path:'direct_native_higgsfield',guidance:{acceptedModes:['raw'],preparedGuidanceSupported:false}},parameters:state.controls,source:state.source,references:state.references,inputHandoff:state.handoff,cost:evidence(result.cost??null),usage:evidence(result.usage??null)};
  if(result.status!=='succeeded')return common;
  if(state.output)return {...common,output:state.output};
  need(!state.publicationAttempted,'HF_PUBLICATION_UNCERTAIN');
  const url=result.outputs?.[0]?.value;mediaURL(url);const downloaded=await transfer(url,{method:'GET'});need(/^video\/mp4(?:;|$)/i.test(downloaded.contentType)&&Buffer.isBuffer(downloaded.bytes)&&downloaded.bytes.length>0&&downloaded.bytes.length<=67108864,'HF_OUTPUT_TYPE_INVALID');
  const inspection=await inspectMediaBuffer(downloaded.bytes,'video');const videos=inspection.facts.streams.filter(s=>s.type==='video');need(inspection.facts.container==='mp4'&&inspection.facts.durationSeconds>0&&videos.length===1&&videos[0].durationSeconds>0&&videos[0].displayDimensions?.width>0&&videos[0].displayDimensions?.height>0,'HF_OUTPUT_VERIFICATION_FAILED');
  let directory;try{
   directory=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-higgsfield-'));const file=path.join(directory,'output.mp4');await fs.writeFile(file,downloaded.bytes,{flag:'wx',mode:0o600});
   state.publicationAttempted=true;const imported=await context.project.importAsset({sourcePath:file,contentType:'video/mp4',role:'derived-higgsfield-video',source:state.source,metadata:{higgsfield:{schemaVersion:1,provider:'higgsfield',model:state.model,requestId:result.requestId,capability:common.capability,source:state.source,references:state.references,inputs:state.handoff,resultReference:fingerprint(url),submittedAt:result.submittedAt??state.submittedAt,controls:state.controls,cost:common.cost,usage:common.usage}}});
   need(imported.status==='imported','HF_OUTPUT_PUBLICATION_FAILED');need(imported.asset.checksum===hashBytes(downloaded.bytes),'HF_OUTPUT_CHECKSUM_INVALID');state.output={...ref(imported.asset),path:imported.asset.path,contentType:'video/mp4',inspection};return {...common,output:state.output};
  }finally{if(directory)await fs.rm(directory,{recursive:true,force:true});}
 }
 const safeEvidence=value=>{try{return evidence(value??null);}catch{return null;}};
 const blocked=(e,state)=>structuredClone({schemaVersion:1,status:'blocked',provider:'higgsfield',model:state?.model??null,capability:higgsfieldRoutes[state?.model]?.capability??null,cost:safeEvidence(state?.nativeResult?.cost),usage:safeEvidence(state?.nativeResult?.usage),source:state?.source??null,references:state?.references??[],inputHandoff:state?.handoff??[],requestId:state?.nativeResult?.requestId??null,continuationId:state?.handle??null,continuationRequired:Boolean(state?.nativeResult?.continuationId)&&!state.publicationAttempted,executionUncertain:!state?.nativeResult?.continuationId||Boolean(state?.publicationAttempted),diagnostics:[{code:e.runCode??e.higgsfieldCode??'HF_OPERATION_FAILED'}]});
 return {readiness:native.readiness,
  async plan(model,resolved,context){const p=await prepare(model,resolved,context),ready=native.readiness();return {status:'planned',capability:p.request.capability,source:ref(p.source.asset),references:p.images.map(i=>ref(i.asset)),parameters:controls(p.request),runtime:'host.higgsfield',execution:{executable:ready.adapterReady,blockingCode:ready.code},remoteTransport:false};},
  async start(model,resolved,context){
   need(context.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');let state;try{need(native.readiness().adapterReady,native.readiness().code);const p=await prepare(model,resolved,context);need(sessions.size<128,'HF_SESSION_LIMIT');state={handle:randomUUID(),model,project:context.project,root:context.root,source:ref(p.source.asset),controls:controls(p.request),references:p.images.map(i=>ref(i.asset)),handoff:[],privateHandoff:[]};sessions.set(state.handle,state);
    const source=await upload(p.source,(identity,publicUrl)=>{state.handoff.push({...identity,role:'source'});state.privateHandoff.push({...identity,publicUrl});});const images=[];for(const item of p.images){const image=await upload(item,(identity,publicUrl)=>{state.handoff.push({...identity,role:'reference',index:images.length});state.privateHandoff.push({...identity,publicUrl});});images.push(image.url);}
    const result=await native.submit({model,input:{...p.request.payload,video_url:source.url,image_urls:images},facts:p.facts,allowExecution:true});state.submittedAt=result.submittedAt;return structuredClone(await finish(state,result,context));
   }catch(e){return blocked(e,state);}
  },
  async poll(result,context){need(context.allowExecution===true,'EXECUTION_NOT_AUTHORIZED');const state=sessions.get(result.continuationId);need(!disposed&&state&&state.project===context.project&&state.root===context.root&&state.nativeResult?.requestId===result.requestId,'HIGGSFIELD_CONTINUATION_LOST');
   need(!state.busy,'HF_CONTINUATION_BUSY');state.busy=true;try{for(const r of [state.source,...state.references]){const a=await context.project.getProjectAsset(r.assetId);need(a.status==='ok'&&a.asset.checksum===r.checksum,'ASSET_HASH_MISMATCH');const b=await readBytes(context.root,a.asset.path);need(hashBytes(b)===r.checksum,'ASSET_HASH_MISMATCH');}
    const next=state.nativeResult.status==='succeeded'?state.nativeResult:await native.poll({continuationId:state.nativeResult.continuationId,allowExecution:true});return structuredClone(await finish(state,next,context));
   }catch(e){return blocked(e,state);}finally{state.busy=false;}
  },dispose(){disposed=true;sessions.clear();native.dispose();},
 };
}

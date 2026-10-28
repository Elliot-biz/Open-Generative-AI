import test from 'node:test';
import assert from 'node:assert/strict';
import {createHiggsfieldNative,buildHiggsfieldRequest,higgsfieldNativeReadiness,higgsfieldRoutes} from '../lib/whihm-execution/higgsfield-native.mjs';
const env={HF_API_KEY_ID:'fixture-key',HF_API_KEY_SECRET:'fixture-secret'},id='d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff',url=`https://api.higgsfield.ai/requests/${id}/status`,facts={durationSeconds:5,width:1280,height:720};
const input={video_url:'https://example.com/source.mp4',image_urls:['https://example.com/reference.png']};
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
for(const model of Object.keys(higgsfieldRoutes)){
 const request={model,input:{...input,...(model.includes('/restyle/')?{preset_id:'preset-1'}:{})},facts,allowExecution:true};
 test(`${model} native request identity, polling, result and terminal reuse`,async()=>{
  const seen=[],states=['queued','in_progress','completed'];const adapter=createHiggsfieldNative({env,fetchImpl:async(u,o)=>{seen.push([u,o]);return response({request_id:id,status:states.shift(),status_url:url,video:{url:'https://example.com/output.mp4'},cost:0,usage:{frames:120}});}});
  const submitted=await adapter.submit(request);assert.equal(submitted.requestId,id);assert.equal(submitted.status,'processing');assert.equal(seen[0][0],`https://api.higgsfield.ai/${model}`);assert.equal(seen[0][1].headers.Authorization,'Key fixture-key:fixture-secret');assert.deepEqual(JSON.parse(seen[0][1].body),buildHiggsfieldRequest(model,request.input,facts).payload);
  const running=await adapter.poll({...submitted,allowExecution:true});assert.equal(running.providerStatus,'in_progress');const result=await adapter.poll({...running,allowExecution:true});assert.equal(result.status,'succeeded');assert.equal(result.cost,0);assert.deepEqual(result.usage,{frames:120});assert.equal(result.outputs[0].value,'https://example.com/output.mp4');assert.equal(JSON.stringify(result).includes(env.HF_API_KEY_SECRET),false);assert.deepEqual(await adapter.poll({...result,allowExecution:true}),result);assert.equal(seen.length,3);
 });
 for(const status of ['failed','nsfw','canceled','unknown','toString'])test(`${model} normalizes ${status} safely`,async()=>{
  const adapter=createHiggsfieldNative({env,fetchImpl:async()=>response({request_id:id,status,status_url:url})}),r=await adapter.submit(request);assert.equal(r.status,status==='canceled'?'cancelled':['failed','nsfw'].includes(status)?'failed':'blocked');
 });
 test(`${model} rejects unsupported inputs before network`,()=>{
  for(const change of [{video_url:'file:///tmp/source'},{image_urls:Array(9).fill(input.image_urls[0])},{resolution:'4k'},{seed:0}])assert.throws(()=>buildHiggsfieldRequest(model,{...request.input,...change},facts));assert.throws(()=>buildHiggsfieldRequest(model,request.input,{...facts,durationSeconds:31}));
 });
}
test('readiness is configuration-only and rejects incomplete credentials',()=>{
 assert.equal(higgsfieldNativeReadiness({}).code,'HIGGSFIELD_CREDENTIALS_MISSING');assert.equal(higgsfieldNativeReadiness({HF_API_KEY_ID:'key'}).code,'HIGGSFIELD_CONFIGURATION_INVALID');assert.equal(higgsfieldNativeReadiness({...env,HF_API_KEY_SECRET:'bad\nsecret'}).adapterReady,false);assert.equal(higgsfieldNativeReadiness(env).adapterReady,true);assert.equal(higgsfieldNativeReadiness(env).providerTransport,false);
});
test('uncertain submit makes one POST and has no fabricated provider ID',async()=>{
 let calls=0;const a=createHiggsfieldNative({env,fetchImpl:async()=>{calls++;throw Error(env.HF_API_KEY_SECRET);}});const r=await a.submit({model:Object.keys(higgsfieldRoutes)[0],input,facts,allowExecution:true});assert.equal(r.status,'blocked');assert.equal(r.executionUncertain,true);assert.equal(r.requestId,null);assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes(env.HF_API_KEY_SECRET));
});
test('poll interruption resumes the same known job without a second submission',async()=>{
 const methods=[];let count=0;const a=createHiggsfieldNative({env,fetchImpl:async(_u,o)=>{methods.push(o.method);if(++count===2)throw Error('interrupted');return response({request_id:id,status:count===1?'queued':'completed',status_url:url,video:{url:'https://example.com/out.mp4'}});}});const first=await a.submit({model:Object.keys(higgsfieldRoutes)[0],input,facts,allowExecution:true});const interrupted=await a.poll({...first,allowExecution:true});assert.equal(interrupted.requestId,id);assert.equal(interrupted.executionUncertain,true);const done=await a.poll({...interrupted,allowExecution:true});assert.equal(done.status,'succeeded');assert.equal(done.cost,null);assert.deepEqual(methods,['POST','GET','GET']);a.dispose();await assert.rejects(()=>a.poll({...done,allowExecution:true}));
});
test('permission, lost continuation, malformed response and foreign status URL fail closed',async()=>{
 const model=Object.keys(higgsfieldRoutes)[0];const a=createHiggsfieldNative({env,fetchImpl:async()=>response({request_id:id,status:'queued',status_url:'https://evil.example/status'})});await assert.rejects(()=>a.submit({model,input,facts}));await assert.rejects(()=>a.poll({continuationId:'untrusted',allowExecution:true}));const r=await a.submit({model,input,facts,allowExecution:true});assert.equal(r.status,'blocked');assert.equal(r.requestId,id);assert.equal(r.diagnostics[0].code,'HIGGSFIELD_STATUS_URL_INVALID');
});
test('output is required for completion and object-swap source pixels are validated',async()=>{
 const model=Object.keys(higgsfieldRoutes)[0],a=createHiggsfieldNative({env,fetchImpl:async()=>response({request_id:id,status:'completed',status_url:url})});assert.equal((await a.submit({model,input,facts,allowExecution:true})).status,'blocked');assert.throws(()=>buildHiggsfieldRequest('higgsfield/genjutsu/object-swap/v1.0',input,{...facts,width:32,height:32}));
});

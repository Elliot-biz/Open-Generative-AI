// Bounded HTTPS handoff for Higgsfield media only. No redirects, retries or shell.
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
const need=(v,c)=>{if(!v)throw Object.assign(new Error(c),{runCode:c});};
export function publicIPv4(ip){
 if(isIP(ip)!==4)return false;const [a,b,c]=ip.split('.').map(Number);
 return !([0,10,127].includes(a)||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0&&[0,2].includes(c)||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&([18,19].includes(b)||b===51&&c===100)||a===203&&b===0&&c===113);
}
export function mediaURL(value){
 let u;try{u=new URL(value);}catch{need(false,'HF_MEDIA_URL_INVALID');}
 need(typeof value==='string'&&/^[a-z0-9.-]+$/i.test(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.port===''&&value.length<=8192&&!u.hostname.endsWith('.')&&u.hostname!=='localhost','HF_MEDIA_URL_INVALID');
 if(isIP(u.hostname))need(publicIPv4(u.hostname),'HF_MEDIA_ADDRESS_BLOCKED');return u;
}
export async function higgsfieldMediaRequest(value,{method='GET',headers={},body,limit=67108864,timeoutMs=30000}={}, {resolve=lookup,request=https.request}={}){
 const url=mediaURL(value);let dnsTimer,addresses;try{addresses=await Promise.race([resolve(url.hostname,{family:4,all:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Object.assign(new Error('DNS timeout'),{runCode:'HF_MEDIA_TIMEOUT'})),timeoutMs);})]);}finally{clearTimeout(dnsTimer);}need(addresses.length&&addresses.every(a=>publicIPv4(a.address)),'HF_MEDIA_ADDRESS_BLOCKED');
 return new Promise((resolveResult,reject)=>{
  let settled=false,bytes=0;const chunks=[];let req,timer;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){req?.destroy();reject(Object.assign(new Error('Higgsfield media transfer failed'),{runCode:error.runCode??'HF_MEDIA_TRANSFER_FAILED'}));}else resolveResult(result);};
  timer=setTimeout(()=>finish({runCode:'HF_MEDIA_TIMEOUT'}),timeoutMs);
  try{req=request(url,{method,headers:{...headers,...(body?{'Content-Length':body.length}:{})},lookup:(_host,options,callback)=>options?.all?callback(null,[{address:addresses[0].address,family:4}]):callback(null,addresses[0].address,4)},res=>{
   if(res.statusCode<200||res.statusCode>=300){res.destroy();finish({runCode:`HF_MEDIA_HTTP_${res.statusCode}`});return;}
   const length=Number(res.headers['content-length']);if(Number.isFinite(length)&&length>limit){res.destroy();finish({runCode:'HF_MEDIA_LIMIT'});return;}
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit){res.destroy();finish({runCode:'HF_MEDIA_LIMIT'});}else chunks.push(chunk);});
   res.on('aborted',()=>finish({runCode:'HF_MEDIA_TRANSFER_FAILED'}));res.on('error',()=>finish({runCode:'HF_MEDIA_TRANSFER_FAILED'}));res.on('end',()=>finish(null,{bytes:Buffer.concat(chunks),contentType:res.headers['content-type']??''}));
  });req.on('error',()=>finish({runCode:'HF_MEDIA_TRANSFER_FAILED'}));req.end(body);}catch{finish({runCode:'HF_MEDIA_TRANSFER_FAILED'});}
 });
}
export function uploadHeaders(value,contentType){
 need(value&&typeof value==='object'&&!Array.isArray(value),'HF_UPLOAD_HEADERS_INVALID');
 const result={};for(const [key,v]of Object.entries(value)){need(/^(?:content-type|x-amz-[a-z0-9-]+)$/i.test(key)&&typeof v==='string'&&!/[\r\n]/.test(v),'HF_UPLOAD_HEADERS_INVALID');need(!Object.keys(result).some(k=>k.toLowerCase()===key.toLowerCase()),'HF_UPLOAD_HEADERS_INVALID');result[key]=v;}
 const type=Object.entries(result).find(([k])=>k.toLowerCase()==='content-type')?.[1];need(type===contentType,'HF_UPLOAD_HEADERS_INVALID');return result;
}

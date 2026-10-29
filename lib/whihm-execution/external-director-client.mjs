// Model-agnostic client for the local External Director stdio protocol.
import {spawn as defaultSpawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {timelineHash} from './timeline-contract.mjs';

const classes=new Set(['READ','PLAN','ACT']);
const idPattern=/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;
const requestIdPattern=/^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$/;
const clone=value=>structuredClone(value);

export class ExternalDirectorClientError extends Error {
  constructor(code,message='External Director client operation failed',details={}){super(message);this.name='ExternalDirectorClientError';this.code=code;Object.assign(this,details);}
}

function need(value,code,message=code){if(!value)throw new ExternalDirectorClientError(code,message);}
function validateSchema(schema,value,pathName='arguments'){
  need(schema&&typeof schema==='object','CLIENT_MANIFEST_SCHEMA_INVALID');
  if(schema.type==='object')need(value!==null&&typeof value==='object'&&!Array.isArray(value),'CLIENT_INVALID_ARGUMENTS',`${pathName} must be an object`);
  if(schema.type==='string')need(typeof value==='string'&&value.length<=512&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'CLIENT_INVALID_ARGUMENTS',`${pathName} must match the manifest schema`);
  if(schema.type==='boolean')need(typeof value==='boolean','CLIENT_INVALID_ARGUMENTS',`${pathName} must be boolean`);
  if(schema.type==='array'){need(Array.isArray(value)&&value.length<=64,'CLIENT_INVALID_ARGUMENTS',`${pathName} must be a bounded array`);for(let i=0;i<value.length;i++)validateSchema(schema.items,value[i],`${pathName}[${i}]`);}
  if(schema.enum)need(schema.enum.includes(value),'CLIENT_INVALID_ARGUMENTS',`${pathName} is outside the manifest enum`);
  if(Object.hasOwn(schema,'const'))need(value===schema.const,'CLIENT_INVALID_ARGUMENTS',`${pathName} has the wrong constant`);
  if(schema.properties){const required=new Set(schema.required??[]);for(const key of required)need(Object.hasOwn(value,key),'CLIENT_INVALID_ARGUMENTS',`${pathName}.${key} is required`);if(schema.additionalProperties===false)for(const key of Object.keys(value))need(Object.hasOwn(schema.properties,key),'CLIENT_INVALID_ARGUMENTS',`${pathName}.${key} is not declared by the manifest`);for(const [key,item]of Object.entries(value))if(schema.properties[key])validateSchema(schema.properties[key],item,`${pathName}.${key}`);}
}
function validateManifest(manifest){
  need(manifest&&manifest.schemaVersion===1&&manifest.transport==='json-lines-stdio','CLIENT_MANIFEST_UNSUPPORTED');
  need(Array.isArray(manifest.tools)&&manifest.tools.length>0&&manifest.tools.length<=128,'CLIENT_MANIFEST_INVALID');
  const names=new Set();
  for(const entry of manifest.tools){need(entry&&idPattern.test(entry.name)&&!names.has(entry.name),'CLIENT_MANIFEST_INVALID');names.add(entry.name);need(classes.has(entry.class),'CLIENT_MANIFEST_INVALID');need(entry.inputSchema?.type==='object'&&entry.outputSchema?.type==='object','CLIENT_MANIFEST_SCHEMA_INVALID');need(typeof entry.providerSideEffects==='boolean'&&typeof entry.approvalMayBeRequired==='boolean','CLIENT_MANIFEST_METADATA_INVALID');}
  return clone(manifest);
}

export class ExternalDirectorClient {
  constructor({projectRoot,bridgeScript=new URL('../../scripts/external-director.mjs',import.meta.url),nodePath=process.execPath,spawnImpl=defaultSpawn,env=process.env,startupTimeoutMs=10000,requestTimeoutMs=120000}={}){
    need(typeof projectRoot==='string'&&path.isAbsolute(projectRoot),'CLIENT_PROJECT_REQUIRED');
    this.projectRoot=projectRoot;this.bridgeScript=bridgeScript instanceof URL?bridgeScript.pathname:bridgeScript;this.nodePath=nodePath;this.spawnImpl=spawnImpl;this.env={...env};this.startupTimeoutMs=startupTimeoutMs;this.requestTimeoutMs=requestTimeoutMs;
    this.child=null;this.manifest=null;this.sessionId=null;this.started=false;this.closed=false;this.pending=new Map();this.actions=new Map();this.stdoutBuffer='';this.stderrBuffer='';this.audit=[];this.state={manifestVersion:null,sessionId:null,projectId:null,workflowId:null,workflowHash:null,agentExecutionId:null,agentRunId:null,creativeRevisionId:null,qcId:null,assets:{}};this._fatal=null;
  }
  async start(){
    need(!this.child&&!this.closed,'CLIENT_ALREADY_STARTED');
    this.child=this.spawnImpl(this.nodePath,[this.bridgeScript,'--project',this.projectRoot],{env:this.env,stdio:['pipe','pipe','pipe']});
    this.child.stdout?.setEncoding?.('utf8');this.child.stderr?.setEncoding?.('utf8');
    this.child.stdout?.on('data',chunk=>this._stdout(String(chunk)));this.child.stderr?.on('data',chunk=>{this.stderrBuffer=(this.stderrBuffer+String(chunk)).slice(-65536);});
    this.exitPromise=new Promise(resolve=>this.child.once('close',(code,signal)=>{this.exit={code,signal};resolve({code,signal});this._onExit();}));
    const ready=await this._waitForReady();this.manifest=validateManifest(ready.manifest);this.sessionId=ready.sessionId;this.state.manifestVersion=this.manifest.schemaVersion;this.state.sessionId=this.sessionId;this.started=true;return clone(this.manifest);
  }
  _stdout(chunk){this.stdoutBuffer+=chunk;while(true){const index=this.stdoutBuffer.indexOf('\n');if(index<0)break;const line=this.stdoutBuffer.slice(0,index);this.stdoutBuffer=this.stdoutBuffer.slice(index+1);if(!line.trim())continue;let message;try{message=JSON.parse(line);}catch{this._protocolError('CLIENT_MALFORMED_RESPONSE');return;}if(!this.started){if(message.status!=='ready'){this._protocolError('CLIENT_STARTUP_INVALID');return;}this._startupReady=message;this._startupResolve?.(message);continue;}this._response(message);}}
  _waitForReady(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this._startupResolve=null;reject(new ExternalDirectorClientError('CLIENT_STARTUP_TIMEOUT'));},this.startupTimeoutMs);this._startupResolve=message=>{clearTimeout(timer);this._startupResolve=null;resolve(message);};this._startupReject=error=>{clearTimeout(timer);this._startupResolve=null;reject(error);};if(this.exit)this._startupReject(new ExternalDirectorClientError('CLIENT_PROCESS_EXITED'));});}
  _response(message){
    if(!message||message.schemaVersion!==1||typeof message.sessionId!=='string'||!['ok','error'].includes(message.status)||typeof message.requestId!=='string'){this._protocolError('CLIENT_RESPONSE_INVALID');return;}
    if(message.sessionId!==this.sessionId){this._protocolError('CLIENT_SESSION_MISMATCH');return;}
    const pending=this.pending.get(message.requestId);if(!pending){this._protocolError('CLIENT_UNKNOWN_RESPONSE_ID');return;}
    this.pending.delete(message.requestId);clearTimeout(pending.timer);if(message.status==='error'&&!message.error?.code)this._protocolError('CLIENT_ERROR_ENVELOPE_INVALID');else if(message.status==='ok'&&!Object.hasOwn(message,'data'))this._protocolError('CLIENT_SUCCESS_ENVELOPE_INVALID');else{pending.resolve(clone(message));if(pending.actionId)this._rememberActionResult(pending.actionId,message);}
  }
  _protocolError(code){const error=new ExternalDirectorClientError(code);this._fatal=error;this._startupReject?.(error);for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();}
  _onExit(){if(!this.started)this._startupReject?.(new ExternalDirectorClientError('CLIENT_PROCESS_EXITED'));this._fatal??=new ExternalDirectorClientError('CLIENT_PROCESS_EXITED');for(const pending of this.pending.values()){clearTimeout(pending.timer);const error=pending.actionId?new ExternalDirectorClientError('CLIENT_ACT_AMBIGUOUS','ACT response was lost; reconcile canonical state before retry',{actionId:pending.actionId,requestId:pending.requestId}):new ExternalDirectorClientError('CLIENT_PROCESS_EXITED');pending.reject(error);}this.pending.clear();}
  _tool(name){const entry=this.manifest?.tools.find(tool=>tool.name===name);need(entry,'CLIENT_UNKNOWN_TOOL');return entry;}
  _rememberActionResult(actionId,result){const action=this.actions.get(actionId);if(action){action.result=clone(result);action.pending=null;}}
  async call(tool,argumentsValue={},options={}){
    need(this.started&&!this.closed&&!this._fatal,'CLIENT_NOT_STARTED');const entry=this._tool(tool);let args=clone(argumentsValue);let actionId=options.actionId;
    if(entry.class==='ACT'){actionId=actionId??args.commandId??`action_${randomUUID()}`;need(idPattern.test(actionId),'CLIENT_ACTION_ID_INVALID');args={...args,commandId:actionId};}
    validateSchema(entry.inputSchema,args);
    const fingerprint=timelineHash({tool,arguments:args});
    if(actionId){const prior=this.actions.get(actionId);if(prior){need(prior.fingerprint===fingerprint,'CLIENT_ACTION_CONFLICT');if(prior.result)return clone(prior.result);if(prior.ambiguous)throw new ExternalDirectorClientError('CLIENT_ACT_AMBIGUOUS','ACT result is ambiguous; refresh canonical state before retry',{actionId});return prior.promise;}}
    const requestId=options.requestId??`request_${randomUUID()}`;need(requestIdPattern.test(requestId),'CLIENT_REQUEST_ID_INVALID');need(!this.pending.has(requestId),'CLIENT_REQUEST_ID_DUPLICATE');
    const payload={requestId,tool,arguments:args};const timeout=options.timeoutMs??this.requestTimeoutMs;
    let resolvePromise,rejectPromise;const promise=new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
    const pending={requestId,actionId,resolve:resolvePromise,reject:rejectPromise,timer:null};pending.timer=setTimeout(()=>{this.pending.delete(requestId);const error=actionId?new ExternalDirectorClientError('CLIENT_ACT_AMBIGUOUS','ACT timed out; reconcile canonical state before retry',{actionId,requestId}):new ExternalDirectorClientError('CLIENT_REQUEST_TIMEOUT','Request timed out',{requestId});if(actionId){const record=this.actions.get(actionId);if(record)record.ambiguous=true;}rejectPromise(error);},timeout);
    this.pending.set(requestId,pending);if(actionId)this.actions.set(actionId,{fingerprint,promise,ambiguous:false,result:null});
    try{if(!this.child.stdin.write(JSON.stringify(payload)+'\n'))await new Promise(resolve=>this.child.stdin.once('drain',resolve));}catch(error){this.pending.delete(requestId);clearTimeout(pending.timer);if(actionId)this.actions.get(actionId).ambiguous=true;rejectPromise(new ExternalDirectorClientError(actionId?'CLIENT_ACT_AMBIGUOUS':'CLIENT_TRANSPORT_FAILED',error.message,{actionId,requestId}));}
    const response=await promise;this._observe(tool,response);return response;
  }
  _observe(tool,response){if(response.status!=='ok')return;const data=response.data??{};if(tool==='get_project_context'){this.state.projectId=data.projectId??this.state.projectId;const main=data.mainWorkflowId??data.workflows?.[0]?.workflowId;this.state.workflowId=main??this.state.workflowId;const workflow=data.workflows?.find(item=>item.workflowId===this.state.workflowId);this.state.workflowHash=workflow?.hash??this.state.workflowHash;for(const asset of data.assets??[])this.state.assets[asset.assetId]={assetId:asset.assetId,checksum:asset.checksum};}if(tool==='get_workflow'){this.state.workflowId=data.workflow?.workflowId??this.state.workflowId;this.state.workflowHash=data.hash??this.state.workflowHash;}if(tool==='plan_agent_execution'||tool==='apply_agent_plan'||tool==='run_agent_execution'||tool==='continue_agent_execution'){this.state.agentExecutionId=data.executionId??this.state.agentExecutionId;this.state.agentRunId=data.runId??this.state.agentRunId;}if(tool==='plan_creative_revision'||tool==='run_creative_revision'||tool==='continue_creative_revision'||tool==='get_creative_revision'){this.state.creativeRevisionId=data.revisionId??data.revision?.revisionId??this.state.creativeRevisionId;}if(tool==='evaluate_creative_qc'||tool==='evaluate_semantic_creative_qc'||tool==='get_creative_qc')this.state.qcId=data.record?.assetId??this.state.qcId;this.audit.push({tool,status:response.status,requestId:response.requestId??null});}
  async refreshContext(){const response=await this.call('get_project_context');need(response.status==='ok',response.error?.nativeCode??'CLIENT_CONTEXT_REFRESH_FAILED');return clone(response.data);}
  getManifest(){need(this.manifest,'CLIENT_NOT_STARTED');return clone(this.manifest);}
  getSessionState(){return clone(this.state);}
  getStderr(){return this.stderrBuffer;}
  async stop(){if(!this.child)return;this.closed=true;try{this.child.stdin.end();await Promise.race([this.exitPromise,new Promise(resolve=>setTimeout(resolve,3000))]);if(!this.exit)this.child.kill?.('SIGTERM');await Promise.race([this.exitPromise,new Promise(resolve=>setTimeout(resolve,1000))]);}finally{this.child=null;this.started=false;}}
}

export function createExternalDirectorClient(options){return new ExternalDirectorClient(options);}

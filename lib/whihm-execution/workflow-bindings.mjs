// Typed value/reference adaptation. Never fetch media or coerce provider identities into assets.
import { validateWorkflow, assessWorkflowReadiness, DATA_TYPES, compatibleTypes } from 'whihm-workflow-core';
import { workflowDependencyMap } from '../../packages/whihm-workflow-core/src/dependencies.js';
import { fields, safeData } from '../../packages/whihm-workflow-core/src/project/io.js';
import { unsafeRemoteUrl } from '../../packages/whihm-workflow-core/src/validate.js';
import { maskSequenceMime } from './guidance-artifact-types.mjs';
import { workflowExecutionLimits } from './workflow-execution-contract.mjs';
export const compare=(a,b)=>a<b?-1:a>b?1:0;
export const fail=(code,details={})=>{throw Object.assign(new Error(code),{runCode:code,...details});};
export const need=(value,code,details)=>{if(!value)fail(code,details);};
export const accepted=(value,status='ok')=>{if(value?.status!==status)fail(value?.diagnostics?.[0]?.code??'RUN_PROJECT_REJECTED');return value;};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const media=['image','video','audio','file','asset'];
export function portable(value) {safeData(value,'RUN_VALUE_UNSAFE');need(Buffer.byteLength(JSON.stringify(value))<=workflowExecutionLimits.bytes,'RUN_VALUE_LIMIT');return value;}
export function validateGraph(workflow,inputs={}) {
  const report=validateWorkflow(workflow);need(report.valid,'WORKFLOW_INVALID',{validation:report.errors.map(({code,path})=>({code,path}))});
  need(workflow.nodes.length<=workflowExecutionLimits.nodes&&workflow.edges.length<=workflowExecutionLimits.edges,'RUN_GRAPH_LIMIT');portable(workflow);portable(inputs);
  fields(inputs,[],workflow.inputs.map(i=>i.id),'RUN_INPUTS_INVALID');
  for(const item of [...workflow.nodes,...workflow.inputs,...workflow.outputs,...workflow.nodes.flatMap(n=>[...n.inputs,...n.outputs])])need(!['__proto__','constructor','prototype'].includes(item.id),'RUN_ID_UNSAFE');
  const dependencies=workflowDependencyMap(workflow,report), remaining=new Set(dependencies.keys()),order=[];
  while(remaining.size){const ready=[...remaining].filter(id=>[...dependencies.get(id)].every(d=>!remaining.has(d))).sort(compare);need(ready.length,'RUN_CYCLE_UNSUPPORTED');for(const id of ready){order.push(id);remaining.delete(id);}}
  const inputReport=assessWorkflowReadiness(workflow,{evaluatedAt:'1970-01-01T00:00:00.000Z',inputs});
  need(!Object.values(inputReport.nodes).some(n=>n.reasons.some(r=>r.code==='WORKFLOW_INPUT_MISSING')),'WORKFLOW_INPUT_MISSING');
  for(const input of workflow.inputs)need(!input.required||Object.hasOwn(inputs,input.id)||Object.hasOwn(input,'default'),'WORKFLOW_INPUT_MISSING');
  for(const node of workflow.nodes){
    for(const port of [...node.inputs,...node.outputs])need(DATA_TYPES.includes(port.type),'RUN_PORT_TYPE_UNSUPPORTED');
    for(const port of node.inputs)if(port.required)need(Object.hasOwn(node.parameters,port.id)||workflow.edges.some(e=>e.target.nodeId===node.id&&e.target.portId===port.id)||workflow.inputs.some(i=>i.targets.some(t=>t.nodeId===node.id&&t.portId===port.id)&&(Object.hasOwn(inputs,i.id)||Object.hasOwn(i,'default'))),'REQUIRED_INPUT_MISSING');
  }
  return {dependencies,order};
}
export async function inventory(project,workflow) {
  const records=accepted(await project.listProjectAssets()).assets;
  for(const asset of workflow.assets)if(asset.localPath){const record=records.find(r=>r.assetId===asset.id);need(record&&record.path===asset.localPath&&(!['image','video','audio'].includes(asset.type)||record.contentType.startsWith(`${asset.type}/`))&&(!asset.checksum||record.checksum===asset.checksum.value.toLowerCase()),'ASSET_IDENTITY_MISMATCH');}
  return records;
}
export async function projectValue(project,assetId,declaredType) {
  const record=accepted(await project.getProjectAsset(assetId)).asset,kind=record.contentType===maskSequenceMime?'file':record.contentType.split('/')[0];
  need(['image','video','audio','file'].includes(kind),'MEDIA_TYPE_UNSUPPORTED');
  need(!declaredType||['asset','file','any',kind].includes(declaredType),'RUN_ASSET_TYPE_MISMATCH');
  return {kind:'project_asset',type:kind,assetId:record.assetId,path:record.path,checksum:record.checksum};
}
function checkType(binding,port) {
  need(binding.kind!=='provider_identity'||port.metadata?.providerIdentifier===true,'RUN_PROVIDER_ID_NOT_ASSET');
  need(binding.kind!=='project_asset'||['asset','file','any',binding.type].includes(port.type),'RUN_ASSET_TYPE_MISMATCH');
  if(binding.kind!=='project_asset')need(compatibleTypes(binding.type,port.type),'RUN_PORT_VALUE_MISMATCH');
  return structuredClone(binding);
}
export async function resolveNodeBindings(workflow,node,inputs,states,project) {
  const bindings={},parameters={},hasRef=v=>v&&typeof v==='object'&&(Object.hasOwn(v,'$asset')||Object.hasOwn(v,'$nodeOutput'));
  async function value(raw,port) {
    if(object(raw)&&Object.hasOwn(raw,'$asset')){fields(raw,['$asset'],[],'RUN_REFERENCE_INVALID');need(workflow.assets.some(a=>a.id===raw.$asset),'ASSET_NOT_FOUND');return checkType(await projectValue(project,raw.$asset),port);}
    let reference;
    if(object(raw)&&Object.hasOwn(raw,'$nodeOutput')){fields(raw,['$nodeOutput'],[],'RUN_REFERENCE_INVALID');reference=raw.$nodeOutput;}
    if(typeof raw==='string'&&raw.includes('{{')){const match=raw.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_.:-]*)\.outputs\[(\d+)\]\.value\s*\}\}$/);need(match,'RUN_INTERPOLATION_UNSUPPORTED');reference={nodeId:match[1],portId:workflow.nodes.find(n=>n.id===match[1])?.outputs[Number(match[2])]?.id};}
    if(reference){const state=states[reference.nodeId];need(state?.status==='completed','RUN_DEPENDENCY_PENDING');const output=Object.hasOwn(state.outputs,reference.portId)?state.outputs[reference.portId]:undefined;need(output!==undefined,'RUN_OUTPUT_MISSING');return Array.isArray(output)?output.map(v=>checkType(v,port)):checkType(output,port);}
    if(port.type==='asset') {need(typeof raw==='string'&&workflow.assets.some(a=>a.id===raw),'ASSET_NOT_FOUND');return checkType(await projectValue(project,raw),port);}
    if(media.includes(port.type)) {need(typeof raw==='string'&&!unsafeRemoteUrl(raw),'RUN_MEDIA_REFERENCE_INVALID');return {kind:'remote_media',type:port.type,value:raw};}
    if(port.metadata?.providerIdentifier===true){need(typeof raw==='string'&&raw.trim(),'RUN_PROVIDER_ID_INVALID');return {kind:'provider_identity',type:port.type,value:raw};}
    need(raw!==undefined&&raw!==null&&(port.type==='any'||['json','result'].includes(port.type)||port.type==='object'&&object(raw)||['text','selection'].includes(port.type)&&typeof raw==='string'||port.type==='boolean'&&typeof raw==='boolean'||port.type==='number'&&typeof raw==='number'&&Number.isFinite(raw)),'RUN_PORT_VALUE_MISMATCH');
    portable(raw);return {kind:'value',type:port.type,value:structuredClone(raw)};
  }
  async function bind(raw,port) {
    const list=port.cardinality==='many';
    if(list){const values=Array.isArray(raw)?raw:[raw],items=[];for(const item of values){const result=await value(item,port);items.push(...(Array.isArray(result)?result:[result]));}need(!port.required||items.length,'REQUIRED_INPUT_MISSING');return items;}
    const result=await value(raw,port);need(!Array.isArray(result),'RUN_CARDINALITY_MISMATCH');return result;
  }
  for(const port of node.inputs){
    const sources=[];
    for(const input of workflow.inputs.filter(i=>i.targets.some(t=>t.nodeId===node.id&&t.portId===port.id)).sort((a,b)=>compare(a.id,b.id))){const raw=Object.hasOwn(inputs,input.id)?inputs[input.id]:input.default;if(raw!==undefined)sources.push(await bind(raw,port));}
    for(const edge of workflow.edges.filter(e=>e.target.nodeId===node.id&&e.target.portId===port.id).sort((a,b)=>compare(a.id,b.id)))sources.push(await bind({$nodeOutput:edge.source},port));
    if(Object.hasOwn(node.parameters,port.id)){need(!sources.length,'RUN_INPUT_CONFLICT');sources.push(await bind(node.parameters[port.id],port));}
    if(sources.length){need(port.cardinality==='many'||sources.length===1,'RUN_INPUT_CONFLICT');bindings[port.id]=port.cardinality==='many'?sources.flat():sources[0];}
    else need(!port.required,'REQUIRED_INPUT_MISSING');
  }
  const unwrap=b=>Array.isArray(b)?b.map(unwrap):b.kind==='project_asset'?{$asset:b.assetId}:b.value;
  for(const [key,raw]of Object.entries(node.parameters))if(!Object.hasOwn(bindings,key)){
    const serialized=JSON.stringify(raw);need(!hasRef(raw)&&!serialized.includes('"$nodeOutput"')&&!serialized.includes('"$asset"')&&!serialized.includes('{{'),'RUN_REFERENCE_PORT_REQUIRED');parameters[key]=structuredClone(raw);
  }
  for(const [key,binding]of Object.entries(bindings))parameters[key]=unwrap(binding);
  return {bindings,parameters};
}
export async function bridgeRequest(workflow,node,resolved,project) {
  const view=structuredClone(workflow),target=view.nodes.find(n=>n.id===node.id),inputs={},assetBindings={};target.parameters={};
  for(const [key,value]of Object.entries(resolved.parameters))if(!Object.hasOwn(resolved.bindings,key))target.parameters[key]=value;
  for(const [field,binding]of Object.entries(resolved.bindings)){
    const list=Array.isArray(binding),items=list?binding:[binding],assets=items.filter(v=>v.kind==='project_asset');
    if(assets.length){need(assets.length===items.length,'RUN_MIXED_MEDIA_BINDING_UNSUPPORTED');
      for(const asset of assets){const current=await projectValue(project,asset.assetId);need(current.checksum===asset.checksum,'ASSET_HASH_MISMATCH');const declaration=view.assets.find(a=>a.id===asset.assetId);if(!declaration)view.assets.push({id:asset.assetId,type:asset.type,localPath:asset.path,checksum:{algorithm:'sha256',value:asset.checksum}});target.assetRefs??=[];if(!target.assetRefs.includes(asset.assetId))target.assetRefs.push(asset.assetId);}
      assetBindings[field]=list?assets.map(a=>a.assetId):assets[0].assetId;
    }else inputs[field]=list?items.map(v=>v.value):items[0].value;
  }
  return {workflow:view,nodeId:node.id,inputs,assetBindings,project};
}
export async function normalizeRunOutputs(node,result,resolved,project,mode) {
  const outputs={};
  for(const port of node.outputs){let values;
    if(node.executor.type==='utility') {
      if(['json','object','result'].includes(port.type))values=[{kind:'value',type:port.type,value:result}];
      else if(node.executor.tool==='media-inspection')values=[resolved.bindings.assetId];
      else values=[await projectValue(project,result.output?.assetId)];
    } else if(node.executor.type==='control')values=[{kind:'value',type:port.type,value:port.type==='boolean'?true:result}];
    else if(mode==='voice_clone_guided') {need(port.metadata?.providerIdentifier===true&&port.type==='selection','RUN_PROVIDER_ID_NOT_ASSET');need(result.operationState?.voiceId,'RUN_OUTPUT_MISSING');values=[{kind:'provider_identity',type:'selection',value:result.operationState.voiceId}];}
    else {
      const native=result.outputs??[],index=port.metadata?.normalizedOutputIndex;
      need(node.outputs.length===1||Number.isSafeInteger(index)&&index>=0,'RUN_OUTPUT_MAPPING_REQUIRED');
      const selected=index!==undefined?[native[index]]:native;
      values=selected.map(item=>{need(item&&compatibleTypes(item.mediaType,port.type),'RUN_OUTPUT_TYPE_MISMATCH');
        if(media.includes(item.mediaType)){need(typeof item.value==='string'&&!unsafeRemoteUrl(item.value),'RUN_OUTPUT_NOT_PORTABLE');return {kind:'remote_media',type:item.mediaType,value:item.value};}
        return {kind:'value',type:item.mediaType,value:item.value};});
    }
    need(values.length&&values.every(Boolean),'RUN_OUTPUT_MISSING');
    values=values.map(v=>checkType(v,port));
    for(const v of values)portable(v);
    need(port.cardinality==='many'||values.length===1,'RUN_OUTPUT_CARDINALITY_MISMATCH');outputs[port.id]=port.cardinality==='many'?values:values[0];
  }
  return outputs;
}

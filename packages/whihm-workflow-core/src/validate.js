import { readFileSync } from 'node:fs';

const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
export const workflowSchema = deepFreeze(JSON.parse(readFileSync(new URL('../schema.json', import.meta.url), 'utf8')));
export const DATA_TYPES = Object.freeze(['text', 'image', 'video', 'audio', 'json', 'object', 'file', 'asset', 'boolean', 'number', 'selection', 'result', 'any']);
const pointer = (path, key) => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const compatibleTypes = (source, target) => source === target || source === 'any' || target === 'any'
  || (['image', 'video', 'audio'].includes(source) && target === 'file')
  || (source === 'object' && target === 'json');

// The small interpreter implements precisely the keywords used in schema.json,
// not an unrestricted JSON Schema engine. Semantic graph checks follow it.
function shape(value, schema, path, error) {
  if (schema.$ref) return shape(value, workflowSchema.$defs[schema.$ref.split('/').at(-1)], path, error);
  if ('const' in schema && value !== schema.const) error(path === '/schemaVersion' ? 'UNSUPPORTED_VERSION' : 'SCHEMA_CONST', path, 'Unsupported constant value.');
  if (schema.enum && !schema.enum.includes(value)) error('SCHEMA_ENUM', path, 'Value is not in the allowed enumeration.');
  const matches = !schema.type || ({object:isObject(value), array:Array.isArray(value), string:typeof value === 'string', number:typeof value === 'number' && Number.isFinite(value), boolean:typeof value === 'boolean'})[schema.type];
  if (!matches) { error('SCHEMA_TYPE', path, `Expected ${schema.type}.`); return; }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) error('SCHEMA_PATTERN', path, 'Invalid identifier or value format.');
  if (schema.format === 'date-time' && typeof value === 'string' && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) error('INVALID_TIMESTAMP', path, 'Expected an ISO timestamp with timezone.');
  if (schema.type === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) error('SCHEMA_REQUIRED', pointer(path,key), 'Required field is missing.');
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties && Object.hasOwn(schema.properties,key)) shape(item,schema.properties[key],pointer(path,key),error);
      else if (schema.additionalProperties === false) error('UNKNOWN_FIELD', pointer(path,key), 'Unknown canonical field; use metadata for extensions.');
    }
  }
  if (schema.type === 'array') value.forEach((item,i) => shape(item,schema.items,pointer(path,i),error));
}

const secretKey = /^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|authorization|password|passwd|secret|client[-_]?secret|private[-_]?key|credentials)$/i;
const secretValue = /(?:\b(?:sk|rk|pk)[-_](?:live|test)[-_][A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9_-]{16,}|\bBearer\s+\S+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/;
export function unsafeRemoteUrl(value) {
  try {
    const url = new URL(value);
    return !['https:', 'http:'].includes(url.protocol) || Boolean(url.username || url.password)
      || [...url.searchParams.keys()].some(k => /token|secret|signature|credential|api.?key|^key$|^sig$|^x-amz-|^x-goog-/i.test(k))
      || Boolean(url.hash);
  } catch { return true; }
}
export function portablePath(value) {
  return typeof value === 'string' && value.length > 0 && !/^(?:\/|[A-Za-z]:|~)/.test(value)
    && !value.includes('\\') && !value.includes(':') && !/[\x00-\x1f]/.test(value)
    && !value.split('/').some(x => !x || ['..','.','node_modules'].includes(x))
    && !/%(?:2e|2f|5c)/i.test(value);
}
function jsonSafety(value, path, error, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (secretValue.test(value)) error('SECRET_MATERIAL', path, 'Secret-like content is forbidden in portable documents.');
    if (/^https?:\/\//i.test(value) && unsafeRemoteUrl(value)) error('UNSAFE_URL', path, 'URLs must not contain credentials, signatures or fragments.');
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) { error('NON_JSON_VALUE',path,'Only plain JSON values are supported.'); return; }
  if (ancestors.has(value)) { error('NON_JSON_VALUE',path,'Cyclic data cannot be serialized.'); return; }
  ancestors.add(value);
  if (Reflect.ownKeys(value).some(key => typeof key === 'symbol')) error('NON_JSON_VALUE',path,'Symbol properties cannot be serialized.');
  for (const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue;
    const p=pointer(path,key);
    if (!descriptor.enumerable || descriptor.get || descriptor.set) { error('NON_JSON_VALUE',p,'Accessors and hidden properties cannot be serialized.'); continue; }
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) error('NON_JSON_VALUE',p,'Arrays may contain indexed elements only.');
    if (['__proto__','prototype','constructor'].includes(key)) error('UNSAFE_KEY',p,'Reserved object key.');
    if (secretKey.test(key) && descriptor.value !== null && descriptor.value !== '') error('SECRET_FIELD',p,'Credential fields are forbidden.');
    if (/^(?:path|localPath|filePath|directory)$/i.test(key) && typeof descriptor.value === 'string' && !portablePath(descriptor.value)) error('NON_PORTABLE_PATH',p,'Use a portable project-relative path.');
    jsonSafety(descriptor.value,p,error,ancestors);
  }
  if (Array.isArray(value)) for(let i=0;i<value.length;i++) if(!Object.hasOwn(value,i)) error('NON_JSON_VALUE',pointer(path,i),'Sparse arrays are forbidden.');
  ancestors.delete(value);
}

export function validateWorkflow(doc) {
  const errors=[], warnings=[], dependencies=[];
  const error=(code,path,message) => errors.push({code,path,message});
  jsonSafety(doc,'',error);
  if (errors.some(e=>['NON_JSON_VALUE','UNSAFE_KEY'].includes(e.code))) return {valid:false,errors,warnings,dependencies};
  shape(doc,workflowSchema,'',error);
  if (errors.some(e=>e.code.startsWith('SCHEMA_') || e.code === 'UNSUPPORTED_VERSION' || e.code === 'UNKNOWN_FIELD')) return {valid:false,errors,warnings,dependencies};
  const unique=(items,path,code) => {
    const map=new Map();
    items.forEach((item,i)=>{if(map.has(item.id))error(code,`${path}/${i}/id`,'Duplicate logical ID.'); else map.set(item.id,item);});
    return map;
  };
  const nodes=unique(doc.nodes,'/nodes','DUPLICATE_NODE_ID');
  unique(doc.edges,'/edges','DUPLICATE_EDGE_ID');
  const assets=unique(doc.assets,'/assets','DUPLICATE_ASSET_ID');
  unique(doc.inputs,'/inputs','DUPLICATE_INPUT_ID'); unique(doc.outputs,'/outputs','DUPLICATE_OUTPUT_ID');
  for(const [i,node] of doc.nodes.entries()) {
    unique(node.inputs,`/nodes/${i}/inputs`,'DUPLICATE_PORT_ID'); unique(node.outputs,`/nodes/${i}/outputs`,'DUPLICATE_PORT_ID');
    if(node.executor.type === 'remote-model' && (!node.executor.provider || !node.executor.model))error('EXECUTOR_IDENTITY',`/nodes/${i}/executor`,'Remote models require provider and model identifiers.');
    if(['utility','control'].includes(node.executor.type) && !node.executor.tool)error('EXECUTOR_IDENTITY',`/nodes/${i}/executor/tool`,'Utility and control nodes require a tool identifier.');
    for(const [j,id] of (node.assetRefs||[]).entries()) if(!assets.has(id))error('MISSING_ASSET',`/nodes/${i}/assetRefs/${j}`,'Referenced asset does not exist.');
  }
  doc.assets.forEach((asset,i)=>{
    if(!asset.localPath && !asset.remoteUrl)error('ASSET_LOCATION',`/assets/${i}`,'Asset requires a relative local path or remote URL.');
    if(asset.remoteUrl && unsafeRemoteUrl(asset.remoteUrl))error('UNSAFE_URL',`/assets/${i}/remoteUrl`,'Invalid or credential-bearing remote source.');
  });
  const endpoint=(ep,direction,path) => {
    const node=nodes.get(ep.nodeId);
    if(!node){error('MISSING_NODE',`${path}/nodeId`,'Referenced node does not exist.');return;}
    const port=node[direction].find(p=>p.id===ep.portId);
    if(!port)error('MISSING_PORT',`${path}/portId`,'Referenced port does not exist.');
    return port;
  };
  const bindingCounts=new Map();
  const bind=(target,port,path)=>{
    const key=JSON.stringify([target.nodeId,target.portId]);
    bindingCounts.set(key,(bindingCounts.get(key)||0)+1);
    if(port && (port.cardinality||'one')==='one' && bindingCounts.get(key)>1)error('MULTIPLE_BINDINGS',path,'Single input port has multiple bindings.');
  };
  const typeCheck=(a,b,path)=>{if(a && b && (!compatibleTypes(a.type,b.type) || ((a.cardinality||'one')==='many' && (b.cardinality||'one')==='one'))) error('INCOMPATIBLE_PORTS',path,'Incompatible type or cardinality.');};
  doc.edges.forEach((edge,i)=>{
    const p=`/edges/${i}`; const a=endpoint(edge.source,'outputs',`${p}/source`),b=endpoint(edge.target,'inputs',`${p}/target`);
    typeCheck(a,b,p); bind(edge.target,b,p);
    dependencies.push({sourceNodeId:edge.source.nodeId,targetNodeId:edge.target.nodeId,kind:'edge',path:p});
  });
  doc.inputs.forEach((input,i)=>{
    if(!input.targets.length)error('INPUT_TARGET_REQUIRED',`/inputs/${i}/targets`,'Workflow input must bind at least one input port.');
    input.targets.forEach((target,j)=>{const p=`/inputs/${i}/targets/${j}`,port=endpoint(target,'inputs',p);typeCheck(input,port,p);bind(target,port,p);});
    if(Object.hasOwn(input,'default')) {
      const ok=(v)=>input.type==='any' || (['text','image','video','audio','file','asset','selection','result'].includes(input.type) ? typeof v==='string' : input.type==='number'?typeof v==='number':input.type==='boolean'?typeof v==='boolean':input.type==='object'?isObject(v):true);
      if((input.cardinality||'one')==='many' ? !Array.isArray(input.default)||!input.default.every(ok) : !ok(input.default))error('INPUT_DEFAULT_TYPE',`/inputs/${i}/default`,'Default does not match input type.');
    }
  });
  doc.outputs.forEach((output,i)=>typeCheck(endpoint(output.source,'outputs',`/outputs/${i}/source`),output,`/outputs/${i}`));
  const dependency=(id,target,path,port,index)=>{
    const node=nodes.get(id);
    if(!node)error('MISSING_NODE',path,'Embedded dependency references a missing node.');
    else if(port!==undefined && !node.outputs.some(p=>p.id===port))error('MISSING_PORT',path,'Embedded reference names a missing output port.');
    else if(index!==undefined && !node.outputs[index])error('MISSING_PORT',path,'Embedded output index does not exist.');
    dependencies.push({sourceNodeId:id,targetNodeId:target,kind:'parameter',path});
  };
  const walk=(value,path,target)=>{
    if(typeof value==='string') {
      const expressions=[...value.matchAll(/\{\{([\s\S]*?)\}\}/g)];
      if(/[{}]{2}/.test(value.replace(/\{\{[\s\S]*?\}\}/g,'')))error('MALFORMED_REFERENCE',path,'Unclosed parameter reference.');
      for(const [,expression] of expressions){
        const match=expression.trim().match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\.outputs\[(\d+)\]\.value$/);
        if(!match)error('MALFORMED_REFERENCE',path,'Use a structured $nodeOutput reference or node.outputs[index].value.');
        else dependency(match[1],target,path,undefined,Number(match[2]));
      }
    } else if(value && typeof value==='object') {
      if(Object.hasOwn(value,'$asset') && (typeof value.$asset!=='string'||!assets.has(value.$asset)))error('MISSING_ASSET',path,'Structured asset reference does not exist.');
      if(Object.hasOwn(value,'$nodeOutput')) {
        const ep=value.$nodeOutput;
        if(!isObject(ep)||typeof ep.nodeId!=='string'||typeof ep.portId!=='string')error('MALFORMED_REFERENCE',path,'Expected $nodeOutput: {nodeId, portId}.');
        else dependency(ep.nodeId,target,path,ep.portId);
      }
      for(const [key,child]of Object.entries(value))walk(child,pointer(path,key),target);
    }
  };
  doc.inputs.forEach((input,i)=>walk(input.default,`/inputs/${i}/default`,null));
  doc.nodes.forEach((node,i)=>{
    walk(node.parameters,`/nodes/${i}/parameters`,node.id);
    (node.dependencies||[]).forEach((id,j)=>dependency(id,node.id,`/nodes/${i}/dependencies/${j}`));
    // Fallback references use the same explicit endpoint/reference vocabulary.
    walk(node.fallbackPolicy,`/nodes/${i}/fallbackPolicy`,node.id);
  });
  for(const type of new Set(doc.nodes.flatMap(n=>[...n.inputs,...n.outputs].map(p=>p.type)))) if(!DATA_TYPES.includes(type))warnings.push({code:'EXTENSION_TYPE',path:'/nodes',message:`Custom port type ${type} requires executor capability validation.`});
  return {valid:errors.length===0,errors,warnings,dependencies};
}

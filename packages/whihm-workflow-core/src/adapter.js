import { validateWorkflow, unsafeRemoteUrl } from './validate.js';

// Intentionally read-only. Never posts back, uploads media or contacts MuAPI.
// Invalid upstream data produces diagnostics; it is never silently repaired.
export function importUpstreamWorkflow(payload, {workflowId} = {}) {
  const diagnostics=[];
  const note=(code,path,message)=>diagnostics.push({code,path,message});
  if(!payload || !Array.isArray(payload.data?.nodes))return {workflow:null,valid:false,diagnostics:[{code:'UPSTREAM_SHAPE',path:'/data/nodes',message:'Expected upstream data.nodes array.'}],validation:null};
  const preflight=validateWorkflow({schemaVersion:1,workflowId:'preflight',name:'Preflight',nodes:[],edges:[],inputs:[],outputs:[],assets:[],metadata:{upstream:payload}});
  if(preflight.errors.some(e=>['NON_JSON_VALUE','UNSAFE_KEY'].includes(e.code)))return {workflow:null,valid:false,diagnostics:[{code:'UPSTREAM_JSON',path:'',message:'Upstream must contain plain acyclic JSON.'}],validation:preflight};
  if(payload.data.nodes.some(n=>!n || typeof n!=='object' || Array.isArray(n)) || (payload.edges!==undefined && (!Array.isArray(payload.edges) || payload.edges.some(e=>!e || typeof e!=='object' || Array.isArray(e)))))return {workflow:null,valid:false,diagnostics:[{code:'UPSTREAM_SHAPE',path:'',message:'Upstream nodes and edges must be object records.'}],validation:null};
  const secretKey=/^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|authorization|password|secret|client[-_]?secret|private[-_]?key|credentials)$/i;
  const clean=(value,path)=>{
    if(Array.isArray(value))return value.map((x,i)=>clean(x,`${path}/${i}`));
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>{
      if(secretKey.test(k)||['__proto__','constructor','prototype'].includes(k)){note('REDACTED_FIELD',path,'Credential/reserved field omitted.');return false;}return true;
    }).map(([k,v])=>[k,clean(v,`${path}/${k}`)]));
    if(typeof value==='string' && ((/^https?:\/\//i.test(value)&&unsafeRemoteUrl(value)) || /\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{16,}|-----BEGIN .*PRIVATE KEY-----/.test(value))){note('REDACTED_VALUE',path,'Credential-like value omitted.');return null;}
    return value;
  };
  const source=clean(payload,'');
  const rawEdges=Array.isArray(source.edges)?source.edges:[];
  const records=source.data.nodes;
  const defaultType=n=>({text:'text',image:'image',video:'video',audio:'audio'})[n.category] || 'any';
  const edges=rawEdges.map((edge,i)=>({id:edge.id||`upstream_edge_${i+1}`,source:{nodeId:edge.source,portId:edge.sourceHandle||'output_0'},target:{nodeId:edge.target,portId:edge.targetHandle||'input'},metadata:{upstream:edge}}));
  const nodes=records.map((n,i)=>{
    const outgoing=[...new Set(edges.filter(e=>e.source.nodeId===n.id).map(e=>e.source.portId))];
    const incoming=[...new Set(edges.filter(e=>e.target.nodeId===n.id).map(e=>e.target.portId))];
    const knownOutputs=n.output_params?.outputs||[];
    const count=Math.max(1,knownOutputs.length,outgoing.length);
    const outputs=Array.from({length:count},(_,j)=>({id:outgoing[j]||`output_${j}`,type:({image_url:'image',video_url:'video',audio_url:'audio',text:'text'})[knownOutputs[j]?.type]||defaultType(n)}));
    note('INFERRED_PORTS',`/nodes/${i}`,'Ports inferred from handles and output data; type/index mapping needs review against provider schemas.');
    note('DEFAULT_TITLE',`/nodes/${i}/title`,'Upstream lacks canonical title; using node ID.');
    return {id:n.id,title:n.id,kind:n.category==='utility'?'utility':'generation',
      executor:n.category==='utility'
        ?{type:'utility',id:'upstream.utility',tool:n.model||'unknown',mayCostMoney:true,requiresConfirmation:true}
        :{type:'remote-model',id:'provider.model',provider:'muapi',model:n.model||'unknown',mayCostMoney:true,requiresConfirmation:true},
      ...(n.position?{position:n.position}:{}),inputs:incoming.map(id=>({id,type:'any',cardinality:'many'})),outputs,
      parameters:n.params||n.input_params||{},dependencies:n.inputs||[],assetRefs:[],enabled:true,
      metadata:{upstream:{...n},requiresCapabilityReview:true}};
  });
  const id=workflowId||source.workflow_id;
  if(!id)note('WORKFLOW_ID_REQUIRED','/workflowId','Supply a stable workflowId when upstream has none.');
  note('EXPLICIT_IO_UNAVAILABLE','/inputs','Canonical workflow inputs and outputs are not recoverable; declarations left empty.');
  note('ASSET_MANIFEST_UNAVAILABLE','/assets','Remote references remain parameters/metadata; no portable asset files were recovered.');
  note('UPSTREAM_PRESERVED','/metadata/upstream','Sanitized source retained; canonical parameter edits do not update this archival copy.');
  const workflow={schemaVersion:1,workflowId:String(id||'imported_workflow'),name:source.name||'Imported workflow',nodes,edges,inputs:[],outputs:[],assets:[],metadata:{upstream:source,importedFrom:'open-generative-ai',requiresReview:true}};
  const validation=validateWorkflow(workflow);
  // Never return a document containing secret-like content, even when invalid.
  if(validation.errors.some(e=>['SECRET_MATERIAL','SECRET_FIELD','UNSAFE_URL','NON_JSON_VALUE','UNSAFE_KEY'].includes(e.code)))return {workflow:null,valid:false,diagnostics,validation};
  return {workflow,valid:validation.valid && Boolean(id),diagnostics,validation};
}

import { validateWorkflow } from './validate.js';
export { validateWorkflow, workflowSchema, DATA_TYPES, compatibleTypes } from './validate.js';
export { importUpstreamWorkflow } from './adapter.js';
export const SCHEMA_VERSION = 1;

export class WorkflowError extends Error {
  constructor(errors) {
    super('Workflow operation rejected. Inspect errors for details.');
    this.name = 'WorkflowError';
    this.errors = errors;
  }
}
export function assertWorkflow(doc) {
  const result=validateWorkflow(doc);
  if(!result.valid)throw new WorkflowError(result.errors);
  return doc;
}
const clone=value=>structuredClone(value);
export function createWorkflow({ workflowId, name, ...options }) {
  return clone(assertWorkflow({schemaVersion:1,workflowId,name,nodes:[],edges:[],inputs:[],outputs:[],assets:[],...options}));
}
// No clock, random ID, network or filesystem side effects. IDs and timestamps
// belong to the caller. Each edit validates a detached candidate before return.
function edit(doc,operation){assertWorkflow(doc);const next=clone(doc);operation(next);return assertWorkflow(next);}
const fail=(code,path,message)=>{throw new WorkflowError([{code,path,message}]);};
function add(doc,collection,item){return edit(doc,d=>{if(d[collection].some(x=>x.id===item.id))fail('ID_EXISTS',`/${collection}`,'ID already exists.');d[collection].push(clone(item));});}
function remove(doc,collection,id){return edit(doc,d=>{const i=d[collection].findIndex(x=>x.id===id);if(i<0)fail('NOT_FOUND',`/${collection}`,'ID does not exist.');d[collection].splice(i,1);});}
export const addNode=(doc,node)=>add(doc,'nodes',node);
export const addEdge=(doc,edge)=>add(doc,'edges',edge);
export const removeEdge=(doc,id)=>remove(doc,'edges',id);
export const addWorkflowInput=(doc,input)=>add(doc,'inputs',input);
export const removeWorkflowInput=(doc,id)=>remove(doc,'inputs',id);
export const addWorkflowOutput=(doc,output)=>add(doc,'outputs',output);
export const removeWorkflowOutput=(doc,id)=>remove(doc,'outputs',id);
export const addAsset=(doc,asset)=>add(doc,'assets',asset);
export const removeAsset=(doc,id)=>remove(doc,'assets',id);
export const removeNode=(doc,id)=>remove(doc,'nodes',id);
export function updateNode(doc,id,patch){
  if(!patch || typeof patch!=='object' || Array.isArray(patch))fail('INVALID_PATCH','/nodes','Expected a node field patch.');
  if(Object.hasOwn(patch,'id') && patch.id!==id)fail('IMMUTABLE_ID','/nodes/id','A title update must not rename a logical node ID.');
  return edit(doc,d=>{const i=d.nodes.findIndex(n=>n.id===id);if(i<0)fail('NOT_FOUND','/nodes','Node does not exist.');d.nodes[i]={...d.nodes[i],...clone(patch)};});
}
// Atomic batch construction/editing for interdependent changes. The final state
// is validated once; caller callbacks receive a clone, never the original.
export function editWorkflow(doc,operation){return edit(doc,operation);}
function ordered(value){
  if(Array.isArray(value))return value.map(ordered);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])]));
  // JSON cannot distinguish -0 from 0. Reject it rather than silently losing state.
  return value;
}
export function exportWorkflow(doc){assertWorkflow(doc);return JSON.stringify(ordered(doc),null,2)+'\n';}
export function importWorkflow(json){
  let doc;
  try{doc=JSON.parse(json);}catch{fail('INVALID_JSON','','Input is not valid JSON.');}
  return clone(assertWorkflow(doc));
}

// Register future pure functions at their SOURCE version, e.g. [1, v1ToV2].
// Keep this private until a new schema and its migration tests are introduced.
const migrations=new Map();
export function migrateWorkflow(doc,targetVersion=SCHEMA_VERSION){
  if(!doc || !Number.isInteger(doc.schemaVersion) || doc.schemaVersion<1 || targetVersion!==SCHEMA_VERSION || doc.schemaVersion>targetVersion)fail('UNSUPPORTED_VERSION','/schemaVersion','No migration path exists.');
  let next=clone(doc);
  while(next.schemaVersion<targetVersion){const fn=migrations.get(next.schemaVersion);if(!fn)fail('MIGRATION_MISSING','/schemaVersion','No migration registered.');next=fn(next);}
  return assertWorkflow(next);
}

// Declarative contract only: no executor lookup, scheduling or invocation.
export function getExecutionContract(doc,nodeId){
  assertWorkflow(doc);
  const node=doc.nodes.find(n=>n.id===nodeId);
  if(!node)fail('NOT_FOUND','/nodes','Node does not exist.');
  const validation=validateWorkflow(doc);
  return clone({workflowId:doc.workflowId,nodeId:node.id,title:node.title,kind:node.kind,enabled:node.enabled!==false,
    executor:node.executor,consumes:node.inputs,produces:node.outputs,parameters:node.parameters,assetRefs:node.assetRefs||[],
    dependencies:validation.dependencies.filter(d=>d.targetNodeId===nodeId),
    executionPolicy:node.executionPolicy||{},retryPolicy:node.retryPolicy||{maxAttempts:1},
    fallbackPolicy:node.fallbackPolicy||{allowed:false},costPolicy:node.costPolicy||{},
    metadata:node.metadata||{}});
}

export { hashWorkflow, diffWorkflows } from './diff.js';
export { applyEditBatch } from './edit.js';
export { validateCommandBatch, commandSchema } from './commands/contract.js';

export { createHistoryStore, HISTORY_VERSION } from './history/store.js';

export { createProject, openProject, verifyProjectIntegrity, exportProjectData, importProjectData, PROJECT_VERSION } from './project/store.js';

export { assessWorkflowReadiness } from './readiness.js';

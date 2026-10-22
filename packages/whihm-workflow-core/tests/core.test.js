import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../src/index.js';
const fixture=name=>JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`,import.meta.url),'utf8'));
const valid=doc=>assert.deepEqual(core.validateWorkflow(doc).errors,[]);
const rejects=(change,code)=>{const d=fixture('heterogeneous-media');change(d);const r=core.validateWorkflow(d);assert.equal(r.valid,false);assert.ok(r.errors.some(e=>e.code===code),JSON.stringify(r.errors));};

test('minimal and heterogeneous fixtures validate',()=>{valid(fixture('minimal'));valid(fixture('heterogeneous-media'));});
test('deterministic lossless JSON preserves positions, explicit IO, policies and metadata',()=>{
 const d=fixture('heterogeneous-media');const text=core.exportWorkflow(d);
 assert.deepEqual(core.importWorkflow(text),d);assert.equal(core.exportWorkflow(core.importWorkflow(text)),text);
 const reordered=Object.fromEntries(Object.entries(d).reverse());assert.equal(core.exportWorkflow(reordered),text);
 assert.deepEqual(core.importWorkflow(text).nodes.map(n=>n.position),d.nodes.map(n=>n.position));
 assert.deepEqual(core.importWorkflow(text).inputs,d.inputs);assert.deepEqual(core.importWorkflow(text).outputs,d.outputs);
});
test('title is independent; update immutable and unrelated fields unchanged',()=>{
 const d=fixture('heterogeneous-media'),before=structuredClone(d);const next=core.updateNode(d,'video',{title:'Snow Motion'});
 assert.deepEqual(d,before);assert.equal(next.nodes[2].title,'Snow Motion');
 const expected=structuredClone(before);expected.nodes[2].title='Snow Motion';assert.deepEqual(next,expected);
 assert.throws(()=>core.updateNode(d,'video',{id:'other'}),core.WorkflowError);
});
test('executor contracts represent remote, local AI, utilities and control without running anything',()=>{
 const d=fixture('heterogeneous-media');for(const [id,type]of [['image','remote-model'],['segment','local-ai'],['trim','utility'],['qc','control']])assert.equal(core.getExecutionContract(d,id).executor.type,type);
 assert.equal(core.getExecutionContract(d,'image').executor.mayCostMoney,true);
 assert.equal(core.getExecutionContract(d,'trim').executor.mayCostMoney,false);
 const c=core.getExecutionContract(d,'combine');assert.equal(c.parameters.clips.length,2);assert.equal(c.consumes[0].cardinality,'many');assert.equal(c.parameters.fps,30);assert.equal(c.parameters.codec,'h264');assert.ok(c.dependencies.some(d=>d.kind==='parameter'));
 c.parameters.fps=60;assert.equal(d.nodes.find(n=>n.id==='combine').parameters.fps,30);
});
for(const [name,change,code]of [
 ['duplicate node',d=>d.nodes.push(d.nodes[0]),'DUPLICATE_NODE_ID'],
 ['duplicate edge',d=>d.edges.push(d.edges[0]),'DUPLICATE_EDGE_ID'],
 ['duplicate asset',d=>d.assets.push(d.assets[0]),'DUPLICATE_ASSET_ID'],
 ['dangling source',d=>d.edges[0].source.nodeId='absent','MISSING_NODE'],
 ['dangling target',d=>d.edges[0].target.nodeId='absent','MISSING_NODE'],
 ['missing port',d=>d.edges[0].target.portId='absent','MISSING_PORT'],
 ['incompatible port',d=>d.nodes[1].inputs[0].type='boolean','INCOMPATIBLE_PORTS'],
 ['position',d=>d.nodes[0].position.x='bad','SCHEMA_TYPE'],
 ['missing asset',d=>d.assets=[],'MISSING_ASSET'],
 ['broken embedded node',d=>d.nodes[1].parameters.prompt='{{ missing.outputs[0].value }}','MISSING_NODE'],
 ['broken embedded index',d=>d.nodes[1].parameters.prompt='{{ planner.outputs[8].value }}','MISSING_PORT'],
 ['broken structured output',d=>d.nodes[1].parameters.x={$nodeOutput:{nodeId:'planner',portId:'missing'}},'MISSING_PORT'],
 ['broken structured asset',d=>d.nodes[1].parameters.x={$asset:'missing'},'MISSING_ASSET'],
 ['unclosed expression',d=>d.nodes[1].parameters.prompt='{{ planner.outputs[0].value','MALFORMED_REFERENCE'],
 ['unsupported version',d=>d.schemaVersion=2,'UNSUPPORTED_VERSION'],
 ['malformed input',d=>d.inputs[0].targets='bad','SCHEMA_TYPE'],
 ['unbound input',d=>d.inputs[0].targets=[],'INPUT_TARGET_REQUIRED'],
 ['malformed output',d=>delete d.outputs[0].source,'SCHEMA_REQUIRED'],
 ['missing output node',d=>d.outputs[0].source.nodeId='missing','MISSING_NODE'],
 ['duplicate output',d=>d.outputs.push(d.outputs[0]),'DUPLICATE_OUTPUT_ID'],
 ['multiple single bindings',d=>d.edges.push({...d.edges[0],id:'extra'}),'MULTIPLE_BINDINGS'],
 ['list to scalar',d=>d.nodes[0].outputs[0].cardinality='many','INCOMPATIBLE_PORTS'],
 ['secret field',d=>d.metadata.apiKey='placeholder-for-test','SECRET_FIELD'],
 ['secret value',d=>d.description='Bearer synthetic-test-only','SECRET_MATERIAL'],
 ['signed URL',d=>d.assets[0].remoteUrl='https://example.test/logo?X-Amz-Signature=synthetic','UNSAFE_URL'],
 ['absolute Windows path',d=>d.assets[0].localPath='C:\\images\\logo.png','NON_PORTABLE_PATH'],
 ['absolute Linux path',d=>d.assets[0].localPath='/tmp/logo.png','NON_PORTABLE_PATH'],
 ['path traversal',d=>d.assets[0].localPath='../logo.png','NON_PORTABLE_PATH'],
 ['node_modules path',d=>d.assets[0].localPath='node_modules/logo.png','NON_PORTABLE_PATH'],
 ['unknown canonical field',d=>d.extra='would be lost','UNKNOWN_FIELD'],
 ['nonfinite number',d=>d.metadata.number=NaN,'NON_JSON_VALUE'],
 ['negative zero',d=>d.metadata.number=-0,'NON_JSON_VALUE'],
 ['undefined',d=>d.metadata.value=undefined,'NON_JSON_VALUE'],
 ['cycle',d=>d.metadata.cycle=d,'NON_JSON_VALUE'],
 ['sparse array',d=>d.metadata.items=Array(2),'NON_JSON_VALUE'],
 ['remote without provider',d=>delete d.nodes[0].executor.provider,'EXECUTOR_IDENTITY'],
 ['invalid timestamp',d=>d.createdAt='yesterday','INVALID_TIMESTAMP']
])test(`reject ${name}`,()=>rejects(change,code));

test('malformed root data returns structured errors, never throws',()=>{for(const value of [null,undefined,[],5,'x',{}, {schemaVersion:1}])assert.equal(core.validateWorkflow(value).valid,false);});
test('unsupported/unparseable import and invalid export fail closed',()=>{assert.throws(()=>core.importWorkflow('{'),core.WorkflowError);const d=fixture('minimal');d.schemaVersion=5;assert.throws(()=>core.exportWorkflow(d),core.WorkflowError);});
test('extension types work conservatively and report capability-review warning',()=>{const d=fixture('heterogeneous-media');d.nodes[0].outputs[0].type='whihm:plan';d.nodes[1].inputs[0].type='whihm:plan';const r=core.validateWorkflow(d);assert.equal(r.valid,true);assert.ok(r.warnings.some(w=>w.code==='EXTENSION_TYPE'));});
test('construct and modify complete valid workflow using helpers',()=>{
 const n=structuredClone(fixture('heterogeneous-media').nodes[0]);
 let d=core.createWorkflow({workflowId:'agent_plan',name:'Agent authored'});
 d=core.addNode(d,n);d=core.addNode(d,{...n,id:'second',title:'Second'});
 d=core.addWorkflowInput(d,{id:'brief',type:'text',targets:[{nodeId:'planner',portId:'brief'}]});
 d=core.addEdge(d,{id:'chain',source:{nodeId:'planner',portId:'plan'},target:{nodeId:'second',portId:'brief'}});
 d=core.addWorkflowOutput(d,{id:'result',type:'text',source:{nodeId:'second',portId:'plan'}});
 d=core.addAsset(d,{id:'reference',type:'image',localPath:'assets/reference.png'});
 d=core.updateNode(d,'second',{title:'Custom result',assetRefs:['reference']});valid(d);
 assert.throws(()=>core.removeAsset(d,'reference'),core.WorkflowError);
 assert.throws(()=>core.removeNode(d,'planner'),core.WorkflowError);
 d=core.updateNode(d,'second',{assetRefs:[]});d=core.removeAsset(d,'reference');
 d=core.removeWorkflowOutput(d,'result');d=core.removeEdge(d,'chain');d=core.removeWorkflowInput(d,'brief');d=core.removeNode(d,'planner');d=core.removeNode(d,'second');valid(d);assert.equal(d.nodes.length,0);
});
test('atomic edits support dependent changes and failures leave original untouched',()=>{
 const d=fixture('heterogeneous-media'),before=core.exportWorkflow(d);
 assert.throws(()=>core.editWorkflow(d,x=>{x.nodes=[];}),core.WorkflowError);assert.equal(core.exportWorkflow(d),before);
 const n=core.editWorkflow(d,x=>{x.name='Adapted recipe';x.nodes[0].title='New planner';});valid(n);assert.equal(n.name,'Adapted recipe');
});
test('migration v1 is identity with detached copy; unsupported versions rejected',()=>{const d=fixture('minimal');assert.deepEqual(core.migrateWorkflow(d),d);assert.notEqual(core.migrateWorkflow(d),d);assert.throws(()=>core.migrateWorkflow({...d,schemaVersion:2}),core.WorkflowError);});
test('upstream read-only adapter preserves recoverable fields and embedded dependencies',()=>{
 const source=fixture('upstream'),before=structuredClone(source);const r=core.importUpstreamWorkflow(source);
 assert.equal(r.valid,true,JSON.stringify(r.validation));valid(r.workflow);assert.deepEqual(source,before);
 assert.deepEqual(r.workflow.metadata.upstream,source);assert.equal(r.workflow.nodes[1].parameters.prompt,'{{ text1.outputs[0].value }}');
 assert.deepEqual(r.workflow.nodes[0].position,{x:10,y:20});assert.equal(r.workflow.nodes[0].executor.model,'illustrative-llm');
 assert.ok(r.validation.dependencies.some(d=>d.kind==='parameter'&&d.sourceNodeId==='text1'));
 assert.ok(r.diagnostics.some(d=>d.code==='EXPLICIT_IO_UNAVAILABLE'));assert.deepEqual(r.workflow.inputs,[]);assert.deepEqual(r.workflow.outputs,[]);
 assert.deepEqual(core.importWorkflow(core.exportWorkflow(r.workflow)),r.workflow);
});
test('adapter removes credential fields and returns diagnostics without exposing values',()=>{
 const source=fixture('upstream');source.apiKey='synthetic-not-a-real-key';const r=core.importUpstreamWorkflow(source);
 assert.ok(!JSON.stringify(r).includes('synthetic-not-a-real-key'));assert.ok(r.diagnostics.some(d=>d.code==='REDACTED_FIELD'));valid(r.workflow);
});
test('adapter reports malformed payload and invalid graph',()=>{assert.equal(core.importUpstreamWorkflow({}).valid,false);const source=fixture('upstream');source.edges[0].source='missing';assert.equal(core.importUpstreamWorkflow(source).valid,false);});

test('schema cannot be mutated by consumers',()=>{assert.throws(()=>{core.workflowSchema.properties.schemaVersion.const=2;},TypeError);});
test('adapter handles malformed records and cyclic payload without crashing',()=>{
 for(const source of [{data:{nodes:[null]}},{data:{nodes:[]},edges:[null]}])assert.equal(core.importUpstreamWorkflow(source).valid,false);
 const source=fixture('upstream');source.cycle=source;assert.equal(core.importUpstreamWorkflow(source).valid,false);
});
test('serialization rejects hidden properties, accessors and custom objects without reading getters',()=>{
 for(const value of [new Date(),()=>1,Symbol('x')]){const d=fixture('minimal');d.metadata={value};assert.equal(core.validateWorkflow(d).valid,false);}
 const d=fixture('minimal');Object.defineProperty(d.metadata,'hidden',{value:1});assert.equal(core.validateWorkflow(d).valid,false);
 const accessor=fixture('minimal');Object.defineProperty(accessor.metadata,'getter',{enumerable:true,get(){throw new Error('must not execute');}});assert.equal(core.validateWorkflow(accessor).valid,false);
});
test('all remove helpers reject absent IDs',()=>{const d=fixture('minimal');for(const fn of [core.removeNode,core.removeEdge,core.removeAsset,core.removeWorkflowInput,core.removeWorkflowOutput])assert.throws(()=>fn(d,'absent'),core.WorkflowError);});
test('creation rejects duplicate IDs and malformed supplied node records',()=>{const d=fixture('heterogeneous-media');assert.throws(()=>core.addNode(d,d.nodes[0]),core.WorkflowError);assert.throws(()=>core.addEdge(d,d.edges[0]),core.WorkflowError);});
test('remote sources, checksums, extension metadata and disabled nodes round trip',()=>{
 const d=fixture('heterogeneous-media');d.assets[0].remoteUrl='https://example.test/logo.png';d.assets[0].checksum={algorithm:'sha256',value:'a'.repeat(64)};d.nodes[0].enabled=false;d.metadata.extension={owner:'whihm',items:[null,true,42]};
 assert.deepEqual(core.importWorkflow(core.exportWorkflow(d)),d);assert.equal(core.getExecutionContract(d,'planner').enabled,false);
});
test('adapter does not silently bless missing ID or unsupported embedded expression',()=>{
 const source=fixture('upstream');delete source.workflow_id;assert.equal(core.importUpstreamWorkflow(source).valid,false);assert.equal(core.importUpstreamWorkflow(source,{workflowId:'caller_id'}).valid,true);
 source.data.nodes[0].params={prompt:'{{ unsupported.syntax }}'};assert.equal(core.importUpstreamWorkflow(source,{workflowId:'caller_id'}).valid,false);
});

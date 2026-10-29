import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createProject,createWorkflow,hashWorkflow} from 'whihm-workflow-core';
import {movieBytes} from './helpers/mediaInspectionFixtures.mjs';
import {evaluateCreativeQc,getCreativeQc} from '../lib/whihm-execution/creative-qc.mjs';
import {planSemanticCreativeQc,evaluateSemanticCreativeQc} from '../lib/whihm-execution/semantic-creative-qc.mjs';
import {translateCreativeIntent} from '../lib/whihm-execution/creative-intent.mjs';

async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'whihm-semantic-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=path.join(dir,'project'),{project,projectId}=await createProject(root,{title:'Product-first short'}),workflow=createWorkflow({workflowId:'production',name:'Product-first'});await project.addWorkflowToProject(workflow);
 const file=path.join(dir,'movie.mp4');await fs.writeFile(file,movieBytes());const {asset}=await project.importAsset({assetId:'final',sourcePath:file,contentType:'video/mp4',metadata:{timelineComposition:{timeline:{durationFrames:300,tracks:[{items:[{id:'reveal',startFrame:24,durationFrames:30}]}]}}}});
 const request={schemaVersion:1,requestId:'objective',objective:'Product first 12s high-energy ad',artifacts:[{id:'final',assetId:asset.assetId,checksum:asset.checksum,role:'final'}],requirements:[{id:'product_first',category:'OBJECTIVE_INTENT',required:true,severity:'ERROR',humanReview:'never',artifactId:'final',rule:{type:'objective_measurement',family:'timeline',metric:'startFrame',itemId:'reveal',operator:'lte',value:24,tolerance:0,unit:'frames'}}],evidence:[],reviewRefs:[],policy:{allowRecordedDeterministic:true,allowExternalAssessments:false},humanReview:{required:false},association:{workflowId:'production',workflowHash:hashWorkflow(workflow),runId:'run'}};
 const qc=await evaluateCreativeQc({project,root,request,allowExecution:true});assert.equal(qc.result.state,'PASS');
 const ctx={project,root,getRun:async()=>({runId:'run',workflowHash:hashWorkflow(workflow),status:'completed',nodes:{produce:{result:{output:{assetId:asset.assetId,checksum:asset.checksum}}}}})};
 const review={schemaVersion:1,requestId:'creative_review',projectId,workflowId:'production',workflowHash:hashWorkflow(workflow),runId:'run',sourceQc:{assetId:qc.record.assetId,checksum:qc.record.checksum},productionIntent:'Product-first high-energy 12s social ad',dimensions:['opening_hook','product_prominence','pacing_energy','cta_clarity'],policy:{minimumActionableConfidence:'MODERATE',humanOnlyDimensions:[],allowSuggestions:true,maxFindings:16}};
 const planned=await planSemanticCreativeQc({...ctx,request:review});assert.equal(planned.status,'planned',JSON.stringify(planned));
 const finding={id:'opening_emphasis',interpretation:'SUBJECTIVE',dimension:'opening_hook',target:{artifactId:'final',startFrame:0,endFrame:75},statement:'The reveal at frame 24 needs stronger emphasis for this product-first brief.',evidenceRefs:['product_first','production_intent'],confidence:'MODERATE',importance:'ERROR',actionability:'ACTIONABLE',rationale:'The authored reveal starts at frame 24; earlier emphasis is the creative recommendation, not a replacement measurement.',claims:[{evidenceId:'product_first',value:24}],suggestedDirection:'Emphasize the reveal earlier using a separate structured revision intent.'};
 const submission={schemaVersion:1,snapshotHash:planned.snapshot.snapshotHash,evaluator:{id:'fixture_director',class:'external',version:'1',model:'mock',harnessSessionId:'session'},submittedAt:'2026-10-29T12:00:00.000Z',findings:[finding]};
 return {...ctx,projectId,workflow,qc,review,submission,finding,planned};
}
test('external judgments append immutable canonical QC, preserve objective facts and require structured revision',async t=>{
 const f=await fixture(t),r=await evaluateSemanticCreativeQc({...f,request:f.review,allowExecution:true});assert.equal(r.status,'succeeded',JSON.stringify(r));assert.equal(r.result.state,'REVISION_NEEDED');assert.deepEqual(r.result.findings[0],f.qc.result.findings[0]);assert.equal(r.result.findings.at(-1).assessment.confidence,'MODERATE');assert.equal(r.result.findings.at(-1).assessment.deterministic,false);assert.equal((await getCreativeQc({...f,record:r.record})).currentness.state,'CURRENT');assert.equal((await getCreativeQc({...f,record:f.qc.record})).result.state,'PASS');assert.equal(hashWorkflow((await f.project.getProjectWorkflow('production')).workflow),hashWorkflow(f.workflow));
 const intent={schemaVersion:1,sourceFindingIds:['opening_emphasis'],revisionGoal:'Move the reveal explicitly',requestedChanges:[{findingId:'opening_emphasis',target:{type:'timeline_item',nodeId:'compose',id:'reveal'},operation:'move_start',value:18}],preserve:[],requires:['COMPOSE_TIMELINE'],acceptableSideEffects:['rerender_timeline'],expectedOutcomes:[]};assert.equal(translateCreativeIntent(intent,{findingIds:['opening_emphasis']},{nodes:[{executor:{tool:'timeline-composition'}}]})[0].changes.startFrame,18);
 await f.project.updateWorkflowInProject({workflow:{...f.workflow,name:'Changed'},expectedHash:hashWorkflow(f.workflow)});assert.equal((await getCreativeQc({...f,record:r.record})).currentness.state,'STALE');assert.equal((await evaluateSemanticCreativeQc({...f,request:f.review,allowExecution:true})).diagnostics[0].code,'QC_SEMANTIC_STALE_WORKFLOW');
});
for(const [name,mutate,code]of [
 ['contradiction',f=>f.submission.findings[0].claims[0].value=80,'QC_SEMANTIC_OBJECTIVE_CONTRADICTION'],
 ['ungrounded',f=>f.submission.findings[0].evidenceRefs=[],'QC_SEMANTIC_UNGROUNDED'],
 ['low confidence action',f=>f.submission.findings[0].confidence='LOW','QC_SEMANTIC_ACTIONABILITY_INVALID'],
 ['missing brand context',f=>{f.review.dimensions.push('brand_fit');f.submission.findings[0].dimension='brand_fit';},'QC_SEMANTIC_BRAND_CONTEXT_REQUIRED'],
 ['unknown dimension',f=>f.review.dimensions=['unknown'],'QC_SEMANTIC_DIMENSION_INVALID'],
 ['cross project',f=>f.review.projectId='00000000-0000-4000-8000-000000000000','QC_SEMANTIC_PROJECT_MISMATCH'],
 ['stale QC',f=>f.review.sourceQc.checksum='a'.repeat(64),'QC_SEMANTIC_STALE_ARTIFACT'],
 ['unknown target',f=>f.submission.findings[0].target.nodeId='missing','QC_SEMANTIC_TARGET_INVALID'],
 ['oversized rationale',f=>f.submission.findings[0].rationale='x'.repeat(2001),'QC_SEMANTIC_FINDING_INVALID'],
 ['extra command',f=>f.submission.command='run','QC_SEMANTIC_SUBMISSION_INVALID'],
 ['missing run',f=>delete f.review.runId,'QC_SEMANTIC_REQUEST_INVALID']
])test(`reject ${name}`,async t=>{const f=await fixture(t);mutate(f);if(name==='missing brand context')f.submission.snapshotHash=(await planSemanticCreativeQc({...f,request:f.review})).snapshot.snapshotHash;const r=await evaluateSemanticCreativeQc({...f,request:f.review,allowExecution:true});assert.equal(r.status,'rejected');assert.equal(r.diagnostics[0].code,code,JSON.stringify(r));});
for(const [name,modify,state]of [
 ['none',s=>s.findings=[],'PASS'],
 ['advisory',s=>s.findings[0].actionability='ADVISORY','PASS'],
 ['low observation',s=>{s.findings[0].confidence='LOW';s.findings[0].actionability='OBSERVATIONAL';s.findings[0].interpretation='SEMANTIC';},'PASS'],
 ['human',s=>s.findings[0].actionability='HUMAN_ONLY','HUMAN_REVIEW_REQUIRED'],
 ['prominence',s=>s.findings[0].dimension='product_prominence','REVISION_NEEDED'],
 ['pacing',s=>s.findings[0].dimension='pacing_energy','REVISION_NEEDED']
])test(`${name} derives ${state}`,async t=>{const f=await fixture(t);modify(f.submission);const r=await evaluateSemanticCreativeQc({...f,request:f.review,allowExecution:true});assert.equal(r.result?.state,state,JSON.stringify(r));});

test('stable snapshots, mandatory human policy, response limits and stale submissions fail closed',async t=>{
 const f=await fixture(t);assert.equal((await planSemanticCreativeQc({...f,request:f.review})).snapshot.snapshotHash,f.planned.snapshot.snapshotHash);
 const bad=structuredClone(f.submission);bad.snapshotHash='f'.repeat(64);assert.equal((await evaluateSemanticCreativeQc({...f,request:f.review,submission:bad,allowExecution:true})).diagnostics[0].code,'QC_SEMANTIC_STALE_SNAPSHOT');
 bad.snapshotHash=f.submission.snapshotHash;bad.findings=Array.from({length:17},()=>f.finding);assert.equal((await evaluateSemanticCreativeQc({...f,request:f.review,submission:bad,allowExecution:true})).diagnostics[0].code,'QC_SEMANTIC_LIMIT');
 f.review.policy.humanOnlyDimensions=['cta_clarity'];f.submission.findings=[];f.submission.snapshotHash=(await planSemanticCreativeQc({...f,request:f.review})).snapshot.snapshotHash;assert.equal((await evaluateSemanticCreativeQc({...f,request:f.review,allowExecution:true})).result.state,'HUMAN_REVIEW_REQUIRED');
});

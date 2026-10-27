// Workflow-run discovery contract; canonical workflow v1 remains the only graph format.
export const workflowExecutionLimits = Object.freeze({ nodes:128, edges:512, runs:32, bytes:1048576 });
export const workflowExecutionLimitations = [
  'Executes an explicitly authored canonical v1 DAG serially; no graph creation, model selection, fallback, generic retry, agents or arbitrary code.',
  'Runs and continuation guards are session-only. Lost sessions cannot be restored from returned JSON; never restart an uncertain provider job automatically.',
  'Generic approvals are explicit human declarations using existing production-evidence rules. They are not identity authentication, spend-budget freshness or provider voice liveness.',
  'Remote media outputs remain safe URL references, not automatically downloaded project assets. Local tools require registered project media. No implicit artifact import or type conversion.',
  'Local inference stays constrained unless a trusted host supplies operational readiness. Media finishing retains its own fresh runtime gate. Runtime-unverified provider quality is not a failed contract.',
  'Definition changes require explicit run invalidation or a new run. Stale nodes require an explicit rerun list; ordinary resume never retries failed attempts, and uncertain or active provider operations cannot be rerun through invalidation.',
];
export function getWorkflowExecutionDescription() {
  return structuredClone({capability:'RUN_WORKFLOW',entry:{
    key:'local:run_workflow:whihm:workflow-execution',id:'workflow-execution',label:'Workflow Execution',mode:'run_workflow',provider:'whihm',operation:'run',
    runtime:{class:'local',method:'runWorkflow',backend:'canonical-dag-v1',requirements:['Trusted Node.js/Electron project host','Readiness of each selected executor'],
      orchestration:{dagOnly:true,serial:true,pauseResume:true,humanApproval:true,downstreamInvalidation:true,persistence:'same_host_session',automaticFallback:false,automaticRetry:false,autonomousApproval:false}},
    binding:{available:true,source:'host.runWorkflow',code:'WORKFLOW_EXECUTION_BOUND',planOperation:'planWorkflowExecution',executeOperation:'runWorkflow',requiresAllowExecution:true,readOnly:false},
    available:true,availability:'available',assurance:'reviewed',route:'local',runtimeVerification:'unverified',partial:true,
    inputs:[{field:'workflowId',type:'text',role:'registered-canonical-workflow-id',required:true,isArray:false,projectAsset:false}],
    requiredFields:['workflowId'],controls:{inputs:{type:'object',required:false,projectAsset:false},allowExecution:{type:'boolean',required:true,default:false,projectAsset:false}},
    constraints:[{kind:'canonical_workflow',schemaVersion:1},{kind:'dag_only'},{kind:'explicit_human_approval'},{kind:'same_session_continuation'},{kind:'limits',...workflowExecutionLimits}],
    projectAssets:[{field:'inputs',type:'media',acceptedTypes:['image','video','audio'],role:'declared-typed-project-bindings',array:false}],providerIdentifiers:[],result:{kind:'workflow-run-state',schemaVersion:1},
    limitations:workflowExecutionLimitations,evidence:{contractStatus:'REVIEWED',authorization:'not_granted',inputValidation:'not_evaluated'},
  }});
}

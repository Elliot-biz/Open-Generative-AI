// Record/evaluation contract only. No executor admission, transport or quality policy.
export const preservationAxes = Object.freeze(['identity','facial_performance','body_motion','choreography','timing','camera','environment','composition','audio','object_geometry','temporal_consistency','occlusion_reappearance']);
export const preservationPolicies = Object.freeze(['preserve','allow_change','not_applicable']);
export const acceptanceStates = Object.freeze(['ACCEPT','USABLE_WITH_ISSUES','REJECT']);
export const metricScale = Object.freeze({type:'integer',minimum:0,maximum:5,nullable:true});
export const benchmarkLimits = Object.freeze({cases:32,candidates:32,attempts:128,metrics:32,assetsPerRoleGroup:16,evaluationsPerAttempt:16,recordBytes:2097152});
export const benchmarkOperations = Object.freeze({
  createPerformanceBenchmark:{readOnly:false,requiresAllowExecution:true,required:['definition']},
  getPerformanceBenchmark:{readOnly:true,required:['caseId']},
  recordBenchmarkCandidate:{readOnly:false,requiresAllowExecution:true,required:['caseId','expectedRevision','candidateId'],evidenceSources:['runRef','attempt'],exactlyOneEvidenceSource:true},
  recordBenchmarkEvaluation:{readOnly:false,requiresAllowExecution:true,humanRequired:true,required:['caseId','expectedRevision','candidateId','attemptNumber','evaluation']},
  comparePerformanceBenchmark:{readOnly:true,required:['caseId']},
});
export const benchmarkLimitations = [
  'Records benchmark definitions, observed attempts and explicit human judgments only; never executes, uploads, judges output automatically, selects executors, retries or ranks models.',
  'Definitions are immutable and hashed independently of candidate/evaluation records. Human metric sets are case-defined; there is no mandatory universal metric set or weighted model score.',
  'Native cost is retained exactly when reported. Only the explicit amount/currency cost shape with a finite nonnegative amount can be aggregated; missing evidence, opaque credits and mixed currencies never become zero or a guessed price.',
  'Live workflow evidence is copied from final node observations in the owning session, without importing trusted continuation state. Benchmark JSON cannot resume or rehydrate a workflow or provider operation.',
  'Host records are project/session-scoped. Returned versioned JSON can be saved as evaluation data by its caller; no durable store/import or cross-restart workflow recovery is added.',
  'Human origin is an explicit declaration, not identity authentication. Acceptance is not execution approval, provider consent/liveness or a guarantee of output quality or executor availability.',
];
export function getPerformanceBenchmarkDescription() {
  return structuredClone({capability:'BENCHMARK_PERFORMANCE',entry:{
    key:'local:performance_benchmark:whihm:performance-benchmark',id:'performance-benchmark',label:'Character / Performance Benchmark',mode:'performance_benchmark',provider:'whihm',operation:'record_evaluate_compare',
    runtime:{class:'local',method:'createPerformanceBenchmark',backend:'benchmark-records-v1',requirements:['Trusted WHIHM project host'],benchmark:{recordOnly:true,humanEvaluation:true,automaticEvaluation:false,globalRanking:false,persistence:'same_host_session',workflowContinuation:false,operations:benchmarkOperations}},
    binding:{available:true,source:'host.createPerformanceBenchmark',code:'PERFORMANCE_BENCHMARK_BOUND',requiresAllowExecution:true,readOnly:false,
      operations:['createPerformanceBenchmark','getPerformanceBenchmark','recordBenchmarkCandidate','recordBenchmarkEvaluation','comparePerformanceBenchmark']},
    available:true,availability:'available',assurance:'reviewed',route:'local',runtimeVerification:'unverified',partial:true,
    inputs:[{field:'definition',type:'json',role:'benchmark-definition',required:true,isArray:false,projectAsset:false}],requiredFields:['definition'],
    controls:{preservation:{type:'object',properties:Object.fromEntries(preservationAxes.map(key=>[key,{type:'object',properties:{policy:{type:'string',enum:preservationPolicies},basis:{type:'object',properties:{group:{type:'string',enum:['source','reference']},role:{type:'string'}},required:['group','role'],additionalProperties:false},notes:{type:'string',maxLength:4000}},required:['policy'],additionalProperties:false}]))},
      metrics:{type:'array',minItems:1,maxItems:benchmarkLimits.metrics},metricScore:metricScale,acceptance:{type:'string',enum:acceptanceStates},allowExecution:{type:'boolean',default:false}},
    constraints:[{kind:'record_only'},{kind:'case_defined_metrics'},{kind:'explicit_human_evaluation'},{kind:'native_cost_only'},{kind:'limits',...benchmarkLimits}],
    projectAssets:[{field:'definition.sources',type:'media',acceptedTypes:['image','video','audio'],role:'benchmark-source',array:true},{field:'definition.references',type:'media',acceptedTypes:['image','video','audio'],role:'benchmark-reference',array:true}],
    providerIdentifiers:[],result:{kind:'performance-benchmark-record-or-comparison',schemaVersion:1,executionAuthority:false},limitations:benchmarkLimitations,
    evidence:{contractStatus:'REVIEWED',authorization:'not_granted',inputValidation:'not_evaluated'},
  }});
}

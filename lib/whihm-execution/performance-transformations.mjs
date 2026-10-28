// Deferred surfaces describe reviewed inputs, never imply a usable provider binding.
const higgsfield = [
  ['motion-transfer','PERFORMANCE_TRANSFER',1,8],
  ['object-swap','OBJECT_REPLACE_VIDEO',1,8],
  ['restyle','VIDEO_RESTYLE',0,5],
];
export function getDeferredTransformationDescriptions() {
  return higgsfield.map(([operation,capability,minimum,maximum])=>({capability,entry:{
    key:`remote:higgsfield:higgsfield/genjutsu/${operation}/v1.0`,id:`higgsfield/genjutsu/${operation}/v1.0`,label:`Genjutsu ${operation}`,mode:'performance_transformation',provider:'higgsfield',
    runtime:{class:'remote',method:null,requirements:['Reviewed native Higgsfield authentication, submission and continuation adapter']},
    available:false,availability:'deferred',assurance:'unreviewed',route:'specialized',partial:true,runtimeVerification:'unverified',
    binding:{available:false,source:'deferred_native_provider_adapter',code:'HIGGSFIELD_LIFECYCLE_BINDING_UNREVIEWED'},reason:{code:'HIGGSFIELD_LIFECYCLE_BINDING_UNREVIEWED'},
    inputs:[{field:'video_url',type:'video',role:'source-performance',required:true,isArray:false,projectAsset:false},{field:'image_urls',type:'image',role:'appearance-references',required:minimum>0,isArray:true,minimum,maximum,projectAsset:false}],
    controls:{prompt:{type:'string',maxLength:10000,default:'',required:false},resolution:{type:'string',enum:['480p','720p','1080p'],default:'720p',required:false},...(operation==='restyle'?{preset_id:{type:'string',required:true,providerIdentifier:'style-preset',projectAsset:false}}:{})},
    requiredFields:['video_url',...(minimum?['image_urls']:[]),...(operation==='restyle'?['preset_id']:[])],
    constraints:[{kind:'source_duration',minimumSeconds:4,providerTrimsAfterSeconds:30},...(operation==='object-swap'?[{kind:'source_pixels',minimum:409600}]:[]),{kind:'guidance_input_unsupported',modes:['face_mesh','depth_mask','depth_mask_face_mesh']}],
    projectAssets:[],providerIdentifiers:operation==='restyle'?[{field:'preset_id',kind:'style-preset',projectAsset:false}]:[],result:{kind:'video',providerField:'video'},
    limitations:['Input documentation reviewed; no executable binding, authentication, upload, polling or continuation is claimed.','Provider motion/preservation statements are not fidelity verification.','Native usage/cost remains unknown until reported; no price estimation.'],
    evidence:{contractStatus:'INPUT_DOCUMENTATION_ONLY',authorization:'not_granted'},
  }}));
}
// Distinct projection views reuse exact executor identity and route. The selected
// intent remains an explicit existing request parameter; no execution duplication.
export function transformationViews(descriptions) {
  return descriptions.flatMap(description=>{
    const {entry}=description, support=entry.constraints.find(c=>c.kind==='transformation_support');
    if(!support)return [description];
    return Object.entries(support.selectors).map(([capability,parameters],index)=>({capability,entry:{...structuredClone(entry),
      key:index===0?entry.key:`${entry.key}:intent:${capability}`,
      controls:{...structuredClone(entry.controls),...Object.fromEntries(Object.entries(parameters).map(([field,value])=>[field,{...entry.controls[field],type:'string',enum:[value],required:true}]))},
      constraints:[...structuredClone(entry.constraints).map(c=>c.kind==='transformation_support'?{...c,capability}:c),{kind:'exact_intent_parameters',capability,parameters}],
    }}));
  });
}

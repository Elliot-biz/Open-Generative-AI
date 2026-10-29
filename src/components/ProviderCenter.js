import {muapiPresence,providerStatus,safeProviderLink} from '../lib/providerCenterUi.mjs';

export function ProviderCenter({host=window.whihmHost,projectHandle=null}={}) {
  const page=document.createElement('section');page.className='provider-center';
  const node=(tag,text,parent=page)=>{const n=document.createElement(tag);if(text)n.textContent=text;parent.appendChild(n);return n;};
  node('h1','Provider Center');node('p','Provider setup, local runtimes and account readiness. Tests never generate media.');
  const notice=node('p','',page);notice.setAttribute('role','status');
  const actions=node('div','',page);actions.className='provider-actions';
  const button=(text,parent,fn)=>{const b=node('button',text,parent);b.type='button';b.onclick=fn;return b;};
  const grid=node('div','',page);grid.className='provider-grid';
  function manageMuapi(parent){const a=node('a','Manage MuAPI ↗',parent);a.href='https://muapi.ai/access-keys';a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Manage MuAPI — opens external browser');}
  function card(p){
    const c=node('article','',grid);c.className='provider-card';
    node('h3',p.displayName,c);const status=node('p',providerStatus(p),c);status.className='provider-status';
    node('p',p.local?'Local runtime / tool':'Remote provider — may use paid account credits',c);
    if(p.paidSideEffect==='REMOTE_UNKNOWN_COST')node('p','Backend spend unknown',c);
    else if(p.local)node('p','No provider spend',c);
    node('p',`Credential: ${p.id==='muapi'?(p.uiPresence===null?'unknown':p.uiPresence?'present':'missing'):p.credential.presence}`,c);
    if(p.id!=='muapi'&&p.credential?.source)node('p',`Credential source: ${p.credential.source}`,c);
    const blocker=node('p',p.readiness.code??'',c);blocker.className='provider-code';
    const ownerControlled=(p.id==='higgsfield'||p.id==='meta')&&host?.setProviderCredential&&host?.removeProviderCredential;
    if(ownerControlled){
      const form=node('form','',c);form.className='provider-credential-form';
      const values=p.id==='higgsfield'?[['key_id','Key ID','text'],['key_secret','Secret','password']]:[['api_key','API key','password']];
      const inputs=Object.fromEntries(values.map(([field,label,type])=>{const id=`provider-${p.id}-${field}`;const l=node('label',label,form);l.htmlFor=id;const input=node('input','',form);input.id=id;input.name=field;input.type=type;input.autocomplete='new-password';input.required=true;input.maxLength=4096;return [field,input];}));
      const formActions=node('div','',form);formActions.className='provider-actions';
      const save=button(p.credential.presence==='present'?'Replace credential':'Save credential',formActions,async()=>{});save.type='submit';
      let remove=null;
      if(p.credential.source==='host_store')remove=button('Remove stored credential',formActions,async()=>{
        let warning='Remove the stored host credential? Environment fallback, if configured, will remain available.';
        if(projectHandle&&host.getProviderDependencies){try{const d=await host.getProviderDependencies({projectHandle,providerId:p.id});if(d.dependencies?.length)warning+=` ${d.dependencies.length} workflow node${d.dependencies.length===1?'':'s'} currently depend on this provider.`;}catch{/* dependency warning is advisory */}}
        if(typeof window.confirm==='function'&&!window.confirm(warning))return;
        remove.disabled=true;
        try{const result=await host.removeProviderCredential({providerId:p.id});if(result?.status!=='removed')throw Error();await refresh();}
        catch{credentialMessage.textContent='Credential removal failed. No secret details were returned.';}
        finally{remove.disabled=false;}
      });
      if(remove)remove.type='button';
      const credentialMessage=node('p','',form);credentialMessage.setAttribute('role','status');
      form.onsubmit=async event=>{event.preventDefault();save.disabled=true;if(remove)remove.disabled=true;credentialMessage.textContent='';
        try{
          const credentials=Object.fromEntries(values.map(([field])=>[field,inputs[field].value]));
          const result=await host.setProviderCredential({providerId:p.id,credentials});
          if(result?.status!=='saved')throw Error();
          credentialMessage.textContent='Credential saved. Account access remains unverified until a supported non-billable check exists.';
          await refresh();
        }catch{credentialMessage.textContent='Credential was not saved. Check the fields; no secret details were returned.';}
        finally{for(const input of Object.values(inputs))input.value='';save.disabled=false;if(remove)remove.disabled=false;}
      };
    }else if(p.id==='higgsfield'||p.id==='meta')node('p',`Manage-only: configure ${p.credential.requirements?.join(' + ')||'host environment credentials'} in the trusted Electron environment.`,c);
    node('p','Account access and provider connection remain unverified. Workflow approvals still apply.',c);
    const controls=node('div','',c);controls.className='provider-actions';
    if(p.id==='muapi'){
      manageMuapi(controls);
      button('Configure MuAPI',controls,()=>window.dispatchEvent(new CustomEvent('navigate',{detail:{page:'settings'}})));
    }
    for(const link of p.links??[])if(p.id!=='muapi'&&safeProviderLink(link.url)){const a=node('a','Manage keys ↗',controls);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';}
    if(host?.testProviderReadiness){
      const test=button(p.local?'Recheck readiness':'Check configuration',controls,async()=>{
        test.disabled=true;
        try{const r=await host.testProviderReadiness({providerId:p.id});if(!r.provider)throw Error();
          status.textContent=providerStatus({...r.provider,...(p.id==='muapi'?{uiPresence:muapiPresence()}: {})});
          blocker.textContent=r.provider.readiness.code??'';
          checked.textContent=`Last checked: ${new Date().toLocaleTimeString()} · ${r.connectionTest}. No generation performed.`;
        }catch{checked.textContent='FAILED — readiness check unavailable. No credential details returned.';}finally{test.disabled=false;}
      });
    }
    const checked=node('p','',c);checked.setAttribute('role','status');
    const details=node('details','',c);node('summary','Capabilities, models and evidence',details);
    node('p',p.capabilities.join(' · '),details);
    node('p',`Usage evidence: ${p.nativeEvidence.usage}. Actual cost: ${p.nativeEvidence.actualCost??'unknown'}.`,details);
    const list=node('ul','',details);for(const m of p.modelsModes)node('li',`${m.executorId} · ${m.mode}`,list);
    if(host?.getProviderDependencies){
      const deps=node('p',projectHandle?'Dependencies not checked':'Open from a project context to inspect workflow dependencies.',details);
      if(projectHandle)button('Show workflow dependencies',details,async()=>{try{const r=await host.getProviderDependencies({projectHandle,providerId:p.id});if(!Array.isArray(r.dependencies))throw Error();deps.textContent=r.dependencies.length?r.dependencies.map(d=>`${d.workflowId} / ${d.nodeId}`).join(' · '):'No dependent workflow nodes';}catch{deps.textContent='Dependency information unavailable';}});
    }
  }
  async function refresh(){
    refreshButton.disabled=true;grid.replaceChildren();
    try{
      if(!host?.getProviderCenter){notice.textContent='Browser mode: host provider status and credential mutation are unavailable. MuAPI keeps its existing settings flow.';
        const c=node('article','',grid);c.className='provider-card';node('h2','MuAPI',c);node('p',muapiPresence()===null?'Credential presence unknown':muapiPresence()?'Present / Unverified':'Missing',c);manageMuapi(c);button('Configure MuAPI',c,()=>window.dispatchEvent(new CustomEvent('navigate',{detail:{page:'settings'}})));return;}
      const s=await host.getProviderCenter();if(!Array.isArray(s.providers))throw Error();notice.textContent='Configuration does not prove provider connection or authorize paid execution.';
      for(const [title,predicate] of [['Remote Providers',p=>!p.local],['Local Runtimes',p=>p.type==='local_runtime'],['Local Models / Utilities',p=>p.local&&p.type!=='local_runtime']]){
        node('h2',title,grid).className='provider-group';for(const p of s.providers.filter(predicate))card({...p,...(p.id==='muapi'?{uiPresence:muapiPresence()}: {})});
      }
    }catch{notice.textContent='FAILED — Provider Center unavailable. Retry after the host is ready.';}finally{refreshButton.disabled=false;}
  }
  if(host?.openProject){
    const label=node('label','Project folder for workflow dependencies',actions);label.htmlFor='provider-project-root';
    const input=node('input','',actions);input.id='provider-project-root';input.type='text';input.placeholder='Registered project folder';
    button('Open project',actions,async()=>{try{const result=await host.openProject({projectRoot:input.value});if(!result.projectHandle)throw Error();projectHandle=result.projectHandle;input.value='';await refresh();}catch{notice.textContent='Project could not be opened. Check the registered project folder.';}});
  }
  const refreshButton=button('Refresh status',actions,refresh);
  const update=()=>{if(page.isConnected)refresh();};window.addEventListener('desktop:auth-changed',update);
  // Page is kept mounted by the app router; no credential value is retained here.
  refresh();return page;
}

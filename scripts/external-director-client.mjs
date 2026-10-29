import {createExternalDirectorClient} from '../lib/whihm-execution/external-director-client.mjs';

const args=process.argv.slice(2),projectIndex=args.indexOf('--project'),scenarioIndex=args.indexOf('--scenario');
if(projectIndex<0||!args[projectIndex+1]||scenarioIndex>=0&&args[scenarioIndex+1]!=='read'){
  process.stderr.write('Usage: node scripts/external-director-client.mjs --project /absolute/project [--scenario read]\n');process.exit(1);
}
const client=createExternalDirectorClient({projectRoot:args[projectIndex+1]});
try{
  const manifest=await client.start();
  const context=(await client.refreshContext()).workflows??[];
  const workflowId=context[0]?.workflowId;
  const calls=[await client.call('get_capabilities'),await client.call('get_provider_center'),await client.call('get_project_assets')];
  const workflow=workflowId?await client.call('get_workflow',{workflowId}):null;
  process.stdout.write(JSON.stringify({status:'ok',sessionId:client.getSessionState().sessionId,manifestVersion:manifest.schemaVersion,toolCount:manifest.tools.length,workflowId,readCalls:calls.length,workflowStatus:workflow?.status??null})+'\n');
}catch(error){process.stderr.write(`${error.code??'CLIENT_FAILED'}\n`);process.exitCode=1;}finally{await client.stop();}

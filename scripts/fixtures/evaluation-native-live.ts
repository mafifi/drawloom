// Opt-in supported integration, not canonical CI. Uses the signed-in Codex account.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createDesktopAssessment, evaluationCodexCommand} from '../../apps/desktop/host/evaluation-assessment.js';
import {createInstalledEvaluation} from '../../apps/desktop/host/evaluation-host.js';
import {createLocalTemporalManager} from '@drawloom/temporal-orchestration';
import {createStdioTransport} from '@drawloom/node-host';

const model=process.env.DRAWLOOM_EVALUATION_MODEL;
if(process.env.DRAWLOOM_LIVE_EVALUATION!=='1'||!model)throw Error('Explicit live consent and DRAWLOOM_EVALUATION_MODEL are required.');
const root=await mkdtemp(join(tmpdir(),'drawloom-supported-judge-'));
const directory=join(root,'project');await mkdir(directory);
const scope={installationId:'supported-public-judge',projectId:'synthetic-passages'};
const calls:Array<{method:string;ok:boolean}>=[];
const assessment=await createDesktopAssessment({dataDirectory:root,scope,workingDirectory:directory,model,
  connect:async()=>{
    const command=evaluationCodexCommand(model);
    const transport=createStdioTransport({...command,args:[...command.args,'-c','model_reasoning_effort="low"'],cwd:directory});
    return {...transport,async request(method,params){
      try{const value=await transport.request(method,params);calls.push({method,ok:true});return value;}
      catch(error){calls.push({method,ok:false});throw error;}
    }};
  },
});
const manager=createLocalTemporalManager({dataDirectory:root});
let evaluation:Awaited<ReturnType<typeof createInstalledEvaluation>>|undefined;
let verified=false;
const startedAt=Date.now();
try{
  const registration=await manager.prepare({...scope,packageDirectory:resolve('packages/evaluation/evaluation-orchestration'),entrypoint:'dist/workflows.js'});
  evaluation=await createInstalledEvaluation({dataDirectory:root,scope,assessment,workflow:{capabilities:{orchestration:registration.orchestrator,orchestrationReadiness:async()=>registration.readiness()},attach:registration.attach,close:registration.close}});
  const composed=evaluation.evaluation.compose({scorers:[]});await registration.attach(composed.taskHandlers);
  const start=await composed.service.assess({requestId:'bounded-live-judge-1',definition:{
    schemaVersion:1,id:'public-passage-judge',revision:'1',name:'Two saved synthetic passages',mode:'assess_existing',
    scorers:[{id:'drawloom.agent-rubric',revision:'1',configuration:{rubric:'Score whether the output keeps both facts from the input, uses plain language, and invents no guarantee. A faithful concise revision should score 1; a contradictory guaranteed result should score 0. Return a brief explanation.'}}],
    cases:[{id:'faithful',revision:'1',input:'The test takes ten minutes. Results may vary.',suppliedOutput:'The test takes ten minutes. Results can differ.',references:[]},
      {id:'poor',revision:'1',input:'The test takes ten minutes. Results may vary.',suppliedOutput:'Instant results are guaranteed for everyone.',references:[]}],
  }});
  assert.equal(start.kind,'started');if(start.kind!=='started')throw Error('Expected a fresh bounded start');
  await registration.orchestrator.result(start.orchestrationRunId);
  const results=await composed.service.listResults({runId:start.evaluationRunId});
  const details=await Promise.all(results.items.map(r=>composed.service.getResult(r.id)));
  console.log(JSON.stringify({date:new Date().toISOString(),elapsedMs:Date.now()-startedAt,modelRequested:model,effortConfigured:'low',calls,details}));
  assert.equal(calls.filter(c=>c.method==='turn/start'&&c.ok).length,2);
  assert.equal(calls.filter(c=>c.method==='thread/archive'&&c.ok).length,2);
  assert.equal(details.length,2);
  assert.ok(details.every(d=>d?.scorers.every(s=>s.outcome==='succeeded')));
  // Quality is reported rather than made a transport test's expected response.
  verified=true;
}finally{
  await manager.close();await evaluation?.close();
  if(verified)await rm(root,{recursive:true,force:true});
  else console.error(`Preserved unresolved integration state: ${root}. Inspect before any repeat; no automatic resubmission.`);
}

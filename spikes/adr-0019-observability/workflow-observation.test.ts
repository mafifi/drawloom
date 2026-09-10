import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('stalled correlation persistence does not delay results, errors or retries and is bounded', () => {
  const result = spawnSync(process.execPath, ['--eval', `
    import assert from 'node:assert/strict';
    import {mkdtemp,rm} from 'node:fs/promises';
    import {tmpdir} from 'node:os';
    import {join} from 'node:path';
    import {createWorkflowObservation} from './spikes/adr-0019-observability/workflow-observation.ts';
    import {initializeObservability} from './packages/observability/otel-host/src/index.ts';
    const dir=await mkdtemp(join(tmpdir(),'drawloom-observation-'));
    const sdk=initializeObservability({mode:'recording',serviceName:'workflow-test'});
    let release;
    const stalled=new Promise(resolve=>{release=resolve;});
    const snapshots=[];
    try {
      const observation=await createWorkflowObservation(join(dir,'links.json'),{flushTimeoutMillis:20,writeSnapshot:async snapshot=>{snapshots.push(snapshot);await stalled;}});
      let executions=0;
      const task={runId:'synthetic',stepId:'one',attempt:1};
      const result=await Promise.race([observation.activity(task,async()=>{executions++;return 'finished';}),new Promise(resolve=>setTimeout(()=>resolve('blocked'),100))]);
      assert.equal(result,'finished','diagnostic sink must not delay task completion');
      const failure=new Error('synthetic task failure');
      await assert.rejects(observation.activity({...task,attempt:2},async()=>{executions++;throw failure;}),error=>error===failure);
      assert.equal(executions,2,'observation must not introduce retries');
      for(let i=0;i<1100;i++) await observation.mark('synthetic-'+i,'workflow.wait');
      assert.equal(snapshots.length,1,'only one stalled disk write is retained');
      assert.equal(await observation.flush(),false,'stalled sink must report an incomplete bounded flush');
      release();
      assert.equal(await observation.flush(),true);
      assert.equal(snapshots.length,2,'updates coalesce into one latest snapshot');
      assert.equal(JSON.parse(snapshots.at(-1)).length,1024,'retained correlation is bounded');
      const broken=await createWorkflowObservation(join(dir,'broken.json'),{flushTimeoutMillis:20,writeSnapshot:async()=>{throw new Error('disk unavailable');}});
      assert.equal(await broken.activity(task,async()=>7),7);
      assert.equal(await broken.flush(),false,'a failed disk write must not claim persistence');
    } finally {release();await sdk.shutdown();await rm(dir,{recursive:true,force:true});}
  `], { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8', timeout: 10000 });
  expect(result.status,`${result.stdout}\n${result.stderr}`).toBe(0);
});

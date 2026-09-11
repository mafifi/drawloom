import { expect, test } from 'bun:test';
import { createLocalToolGateway } from '@drawloom/local-tools';
import type { JsonValue } from '@drawloom/host';
import { createWorkflowAuthority } from './workflow-authority.js';
import { createWorkflowToolScope,workflowEvidenceKey } from './workflow-tools.js';
import { createNodeJsonStore } from '@drawloom/node-host';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real provider-length identities retain evidence on local disk',async()=>{
 const root=await mkdtemp(join(tmpdir(),'workflow-evidence-'));
 try{
  const authority=createWorkflowAuthority(),runId='a'.repeat(64)+'/'+crypto.randomUUID();
  const ownerScope=createWorkflowToolScope({authority,projectId:'project',installationId:'owner',workbenchIds:['test'],grants:new Map([['test',new Set(['edit'])]]),refreshGrants:async()=>{},store:createNodeJsonStore(root)});
  const handler=authority.wrap({projectId:'project',installationId:'owner'},[{id:'task',version:'1',run:async()=>ownerScope.record({kind:'started',operationId:runId,invocationId:'invoke',tool:'edit'})}],async()=>{});
  await expect(handler[0]!.run({}, {runId,stepId:runId+'/D1-D2',attemptId:runId+'/D1-D2/attempt/1',attempt:1,taskVersion:'1',signal:new AbortController().signal})).resolves.toBeUndefined();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('detached tasks require all declaring grants, refresh each call and retain scoped evidence without a conversation', async () => {
  const authority = createWorkflowAuthority();
  const data = new Map<string, JsonValue>();
  const grants = new Map([['a', new Set(['edit'])], ['b', new Set<string>()]]);
  let refreshes = 0, calls = 0;
  const scope = createWorkflowToolScope({ authority, projectId: 'project', installationId: 'installation', workbenchIds: ['a', 'b'], grants,
    refreshGrants: async () => { refreshes++; }, store: { get: async key => data.get(key), set: async (key, value) => { data.set(key, value); } } });
  const gateway = scope.wrap(createLocalToolGateway({ tools: [{ name: 'edit', description: 'Edit', inputSchema: {}, outputSchema: {},
    parseInput: () => ({}), parseOutput: () => ({}), render: () => '', execute: async () => { calls++; return {}; } }],
    policy: scope.allowed, evidence: { record: scope.record }, nextInvocationId: () => crypto.randomUUID() }));
  const invoke = () => gateway.invoke(gateway.bind('run'), 'edit', {}, new AbortController().signal);
  const handlers = authority.wrap({ projectId: 'project', installationId: 'installation' }, [{ id: 'task', version: '1', run: invoke }], scope.refresh);
  const context = { runId: 'run', stepId: 'step', attemptId: 'attempt', attempt: 1, taskVersion: '1', signal: new AbortController().signal };
  expect((await handlers[0]!.run({}, context) as { outcome: { status: string } }).outcome.status).toBe('failed');
  expect(calls).toBe(0);
  grants.set('b', new Set(['edit']));
  expect((await handlers[0]!.run({}, context) as { outcome: { status: string } }).outcome.status).toBe('ok');
  expect(calls).toBe(1); expect(refreshes).toBe(4);
  expect([...data.keys()]).toEqual(['tool-evidence:'+workflowEvidenceKey('installation','run','step','attempt')]);
  expect(JSON.stringify([...data.values()])).toContain('"operationId":"run"');
  await invoke(); expect(calls).toBe(1);
  const other = authority.wrap({ projectId: 'other', installationId: 'installation' }, [{ id: 'task', version: '1', run: invoke }], async () => {});
  await other[0]!.run({}, context); expect(calls).toBe(1);
  const revoked = authority.wrap({ projectId: 'project', installationId: 'installation' }, [{ id: 'task', version: '1', async run() {
    grants.set('b', new Set()); return invoke();
  } }], scope.refresh);
  await revoked[0]!.run({}, context); expect(calls).toBe(1);
  grants.set('b', new Set(['edit']));
  const abort = new AbortController();
  const cancelled = authority.wrap({ projectId: 'project', installationId: 'installation' }, [{ id: 'task', version: '1', async run() {
    abort.abort(); return invoke();
  } }], scope.refresh);
  expect(await cancelled[0]!.run({}, { ...context, signal: abort.signal })).toMatchObject({ outcome: { status: 'failed', code: 'denied' } });
  expect(calls).toBe(1);
});

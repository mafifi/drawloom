import { expect, test } from 'bun:test';
import type { ToolResult } from '@drawloom/tools';
import { createResourceRecovery } from './resource-recovery.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDesktopApplication as createDesktopApplication } from './test-project.fixture.js';
import { createDesktopEvidence } from './evidence.js';
import { createNodeJsonStore } from '@drawloom/node-host';

test('failed display capture retries retained evidence, not execution, and restart keeps the same identity', async () => {
  const result: ToolResult = {invocationId:'one',evidence:'recorded',outcome:{status:'ok',value:{},text:'Done',content:[{type:'resource_link',uri:'doc://one',name:'One'}]}};
  let attempts = 0, fail = true;
  const saved = new Set<string>();
  const capture = async (record: ToolResult) => {
    if (saved.has(record.invocationId)) return;
    attempts++;
    if (fail) throw Error('Disk unavailable');
    saved.add(record.invocationId);
  };
  const recovery = createResourceRecovery([],capture);
  await expect(recovery.record(result)).rejects.toThrow('Disk unavailable');
  await expect(recovery.recover()).rejects.toThrow('Disk unavailable');
  expect(saved.size).toBe(0);
  fail = false;
  await recovery.recover();
  expect(saved.size).toBe(1);
  await recovery.recover();
  expect(attempts).toBe(3);
  await createResourceRecovery([result],capture).recover();
  expect(attempts).toBe(3);
});

test('cached history recovers missed gateway resources from durable evidence without a provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-evidence-recovery-'));
  let app = await createDesktopApplication(root);
  const id = (await app.snapshot()).selectedId;
  await app.close();
  const evidence = await createDesktopEvidence(createNodeJsonStore(join(root,'state')),id);
  await evidence.record({kind:'finished',result:{invocationId:'retained',evidence:'recorded',outcome:{status:'ok',value:{},text:'Returned',content:[{type:'resource',resource:{uri:'doc://retained',text:'Durable reference',mimeType:'text/plain'}}]}}});
  app = await createDesktopApplication(root);
  const put = app.assets.put;
  let captures = 0;
  app.assets.put = async () => { captures++; throw Error('Temporary storage failure'); };
  expect((await app.historyPage(id)).status.sync).toBe('error');
  expect((await app.historyPage(id)).entries).toEqual([]);
  expect((await app.snapshot()).activity).toHaveLength(1);
  app.assets.put = async (...args) => { captures++; return put(...args); };
  const recovered = await app.historyPage(id);
  expect(recovered.entries[0]?.id).toBe('tool-resource:retained');
  expect(recovered.entries[0]?.resources?.[0]?.status).toBe('ready');
  const count = captures;
  await app.historyPage(id);
  expect(captures).toBe(count);
  await app.close();
  app = await createDesktopApplication(root);
  app.assets.put = async () => { throw Error('Must use cached capture'); };
  try {
    const restarted = await app.historyPage(id);
    expect(restarted.entries).toEqual(recovered.entries);
    expect(restarted.status.sync).not.toBe('error');
    expect((await app.snapshot()).activity).toHaveLength(1);
  } finally { await app.close(); }
});

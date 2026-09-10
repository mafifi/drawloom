import { expect, test } from 'bun:test';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createPackageResources } from './package-resources.js';
test('nonblocking package discovery exposes loading then caches success without repeated reads',async()=>{
  let release=()=>{};let calls=0;
  const client={setNotificationHandler(){},async listResources(){calls++;await new Promise<void>(r=>{release=r;});return {resources:[{uri:'doc://one',name:'One'}]};}} as unknown as Client;
  const resources=createPackageResources(new Map([['source',client]]));
  const first=await Promise.race([resources.discover(false,false),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Package discovery blocked presentation')),100))]);
  expect(first).toEqual({entries:[],categories:[{kind:'resource',status:'loading'}]});
  await resources.discover(true,false);expect(calls).toBe(1);
  release();await resources.discover();
  expect((await resources.discover(false,false)).entries[0]?.name).toBe('One');expect(calls).toBe(1);
});

test('resource-list invalidation rejects old receipts and an in-flight stale listing', async () => {
  let notify = () => {}; let calls = 0; let release: (() => void) | undefined;
  const client = {
    setNotificationHandler(_schema: unknown, handler: () => void) { notify = handler; },
    async listResources() { calls++; if (calls === 2) await new Promise<void>(resolve => { release = resolve; }); return { resources: [{ uri: 'doc://one', name: 'One' }] }; },
    async readResource() { return { contents: [] }; },
  } as unknown as Client;
  const resources = createPackageResources(new Map([['source', client]]));
  const entry = (await resources.discover()).entries[0]!;
  notify();
  await expect(resources.read(entry)).rejects.toThrow('Resource unavailable');
  const loading = resources.discover(); notify(); release!();
  expect((await loading).entries).toHaveLength(0);
  expect((await resources.discover()).entries).toHaveLength(1);
  expect(calls).toBe(3);
});

test('a package resource receipt returns only the selected URI', async () => {
  const client = {
    setNotificationHandler() {},
    async listResources() { return { resources: [{ uri: 'doc://one', name: 'One' }] }; },
    async readResource() { return { contents: [{ uri: 'doc://one', text: 'Selected' }, { uri: 'doc://other', text: 'Not selected' }] }; },
  } as unknown as Client;
  const resources = createPackageResources(new Map([['source', client]]));
  const entry = (await resources.discover()).entries[0]!;
  expect(await resources.read(entry)).toEqual({ contents: [{ uri: 'doc://one', text: 'Selected' }] });
});

for (const invalidate of ['notification', 'disconnect', 'replacement', 'refresh'] as const) {
  test(`a pending resource read rejects after ${invalidate}`, async () => {
    let notify = () => {}, release = () => {};
    const client = {
      setNotificationHandler(_schema: unknown, handler: () => void) { notify = handler; },
      async listResources() { return { resources: [{ uri: 'doc://one', name: 'One' }] }; },
      async readResource() { await new Promise<void>(resolve => { release = resolve; }); return { contents: [{ uri: 'doc://one', text: 'Stale' }] }; },
    } as unknown as Client;
    const clients = new Map([['source', client]]), resources = createPackageResources(clients);
    const entry = (await resources.discover()).entries[0]!;
    const reading = resources.read(entry);
    if (invalidate === 'notification') notify();
    else if (invalidate === 'disconnect') clients.delete('source');
    else if (invalidate === 'replacement') clients.set('source', { ...client } as Client);
    else await resources.discover(true);
    release();
    await expect(reading).rejects.toThrow('Resource unavailable');
  });
}

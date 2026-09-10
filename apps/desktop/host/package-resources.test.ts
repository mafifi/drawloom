import { expect, test } from 'bun:test';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createPackageResources } from './package-resources.js';

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

import { test, expect } from 'bun:test';
import { createCodexDriver } from './src/index.js';
import type { RpcMessage } from '@drawloom/host';
test('native images retain exact operation correlation and precede terminal completion', async () => {
  let receive: (message: RpcMessage) => void = () => {};
  const requests: { method: string; params: unknown }[] = [];
  let captures = 0;
  const values = new Map();
  const driver = createCodexDriver({
    store: { get: async key => values.get(key), set: async (key, value) => { values.set(key, value); } },
    imageInput: async asset => '/confined/' + asset.key,
    captureImage: async result => { captures++; if (result === 'bad') throw Error('capture failed'); return { key: 'captured', mediaType: 'image/png', size: 8 }; },
    connect: async () => ({ request: async (method, params) => {
      requests.push({ method, params });
      if (method === 'initialize') return { userAgent: 'fixture' };
      if (method === 'thread/start') return { thread: { id: 'private-thread' } };
      if (method === 'turn/start') return { turn: { id: 'private-turn' } };
      return {};
    }, notify() {}, respond() {}, subscribe(fn) { receive = fn; return () => {}; }, async close() {} }),
  });
  const opened = await driver.openSession({ sessionId: 's', context: { text: '' }, tools: { id: 'none', tools: [] } });
  if (opened.status !== 'ok') throw Error('Open failed');
  const events: unknown[] = [];
  const drain = (async () => { for await (const event of opened.value.signals()) events.push(event); })();
  expect(await opened.value.history?.read({ checkpoint: async () => undefined, get: async () => undefined }, { direction: 'latest', limit: 50 })).toEqual({ entries: [], checkpoints: [], hasOlder: false });
  await opened.value.execute({ operationId: 'operation-a', text: 'inspect', attachments: [{ key: 'imported', mediaType: 'image/png', size: 8 }] });
  expect(requests.find(r => r.method === 'turn/start')?.params).toMatchObject({ input: [{ type: 'text' }, { type: 'localImage', path: '/confined/imported' }] });
  const item = { type: 'imageGeneration', id: 'private-item', status: 'completed', result: 'bytes', savedPath: '/untrusted/path' };
  receive({ method: 'item/completed', params: { threadId: 'private-thread', turnId: 'old-turn', item } });
  expect(captures).toBe(0);
  receive({ method: 'item/completed', params: { threadId: 'private-thread', turnId: 'private-turn', item } });
  receive({ method: 'item/completed', params: { threadId: 'private-thread', turnId: 'private-turn', item } });
  receive({ method: 'item/completed', params: { threadId: 'private-thread', turnId: 'private-turn', item: { ...item, id: 'failed-image', result: 'bad' } } });
  receive({ method: 'turn/completed', params: { threadId: 'private-thread', turn: { id: 'private-turn', status: 'completed' } } });
  await new Promise(r => setTimeout(r, 5));
  await opened.value.close(); await drain;
  expect(captures).toBe(2);
  expect(events).toEqual([{ kind: 'operation.started', operationId: 'operation-a' }, { kind: 'artifact.available', operationId: 'operation-a', messageId: 'message-4e1e40d0fefb599d1ef4baaa91f9d734251b84f63e65010d650de9096b4616c2', asset: { key: 'captured', mediaType: 'image/png', size: 8 } }, { kind: 'operation.completed', operationId: 'operation-a' }]);
  expect(JSON.stringify(events)).not.toContain('private');
});

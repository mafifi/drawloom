import { test, expect } from 'bun:test';
import { createCodexDriver } from './src/index.js';
import type { RpcMessage, RpcTransport } from '@drawloom/host';
import { createCodexHistoryReader } from './src/history.js';
import type { HistoryEntry } from '@drawloom/conversation-history';
import { createCodexDiscovery } from './src/discovery.js';

test('returned-only native resource receipts survive restart and cannot authorise other sources', async () => {
  const saved = new Map<string, import('@drawloom/host').JsonValue>();
  const calls: unknown[] = [];
  const store = { async get(key: string) { return saved.get(key); }, async set(key: string, value: import('@drawloom/host').JsonValue) { saved.set(key, value); } };
  const rpc: RpcTransport = { async request(method, params) {
    calls.push({method,params});
    return { contents: [{uri:'document://unlisted/one',text:'Reference',mimeType:'text/plain'}] };
  }, notify(){},respond(){},subscribe(){return()=>{};},async close(){} };
  const first = createCodexDiscovery(rpc, 'thread', () => false, false, store);
  const receipts = await first.rememberReturnedResources('source-one', [{type:'resource_link',uri:'document://unlisted/one',name:'Reference'}]);
  const receipt = receipts['document://unlisted/one']!;
  expect(receipt).toBeDefined();
  expect(JSON.stringify(receipt)).not.toContain('document://');
  const reopened = createCodexDiscovery(rpc, 'thread', () => false, false, store);
  expect(await reopened.discovery.readResource!(receipt)).toMatchObject({status:'ok',value:[{type:'resource',resource:{text:'Reference'}}]});
  expect(calls).toEqual([{method:'mcpServer/resource/read',params:{threadId:'thread',server:'source-one',uri:'document://unlisted/one'}}]);
  expect((await reopened.discovery.readResource!({...receipt,revision:'forged'})).status).toBe('rejected');
  const otherThread = createCodexDiscovery(rpc, 'other-thread', () => false, false, store);
  expect((await otherThread.discovery.readResource!(receipt)).status).toBe('rejected');
  expect(calls).toHaveLength(1);
});

test('concurrent completions returning the same native link receive the same durable receipt', async () => {
  const saved = new Map<string, import('@drawloom/host').JsonValue>();
  const store = { async get(key: string) { const value = saved.get(key); await Bun.sleep(1); return value; }, async set(key: string, value: import('@drawloom/host').JsonValue) { saved.set(key,value); } };
  const rpc: RpcTransport = { async request() { return {contents:[{uri:'doc://same',text:'Same'}]}; },notify(){},respond(){},subscribe(){return()=>{};},async close(){} };
  const catalog = createCodexDiscovery(rpc,'thread',()=>false,false,store);
  const content = [{type:'resource_link' as const,uri:'doc://same',name:'Same'}];
  const [first,second] = await Promise.all([catalog.rememberReturnedResources('source',content),catalog.rememberReturnedResources('source',content)]);
  expect(first).toEqual(second);
  expect((await catalog.discovery.readResource!(first['doc://same']!)).status).toBe('ok');
});

test('failed native content capture leaves coverage recoverable; settled content is not captured again', async () => {
  let captures = 0, items = 0;
  const entries = new Map<string, HistoryEntry>(), checkpoints = new Map<string, unknown>();
  const request = async (method: string) => method === 'thread/turns/list'
    ? { data: [{ id: 'turn', status: 'completed' }], nextCursor: null }
    : (items++, { data: [{ turnId: 'turn', item: { id: 'call', type: 'mcpToolCall', status: 'completed', server: 'docs', result: { content: [{ type: 'resource', resource: { uri: 'doc://a', text: 'A', mimeType: 'text/plain' } }] } } }], nextCursor: null });
  const reader = createCodexHistoryReader(request, 'thread', { turn: 'op' }, undefined, async input => {
    expect(input.deferHistoryCommit).toBe(true);
    if (++captures === 1) throw Error('Disk unavailable');
    return { id: input.id, role: 'assistant', text: 'A', assets: [], state: 'complete', resources: [{ id: 'r', source: 'docs', title: 'A', status: 'ready', asset: { key: 'cached', mediaType: 'text/plain', size: 1 } }] };
  });
  const context = { get: async (id: string) => entries.get(id), checkpoint: async (key: string) => checkpoints.get(key) };
  await expect(reader.read(context, { direction: 'latest', limit: 50 })).rejects.toThrow();
  const batch = await reader.read(context, { direction: 'latest', limit: 50 });
  expect(batch.entries[0]?.resources?.[0]?.asset?.key).toBe('cached');
  batch.entries.forEach(e => entries.set(e.id, e)); batch.checkpoints.forEach(c => checkpoints.set(c.key, c.value));
  await reader.read(context, { direction: 'latest', limit: 50 });
  expect(captures).toBe(2); expect(items).toBe(2);
});

test('native MCP results reach capture once without raw provider metadata or changing execution outcome', async () => {
  let receive = (_message: RpcMessage) => {};
  const captured: unknown[] = [];
  const transport: RpcTransport = { async request(method) {
    if (method === 'initialize') return { userAgent: 'codex/0.153.4' };
    if (method === 'thread/start') return { thread: { id: 't' }, approvalsReviewer: 'user' };
    if (method === 'turn/start') return { turn: { id: 'turn' } };
    return {};
  }, notify() {}, respond() {}, subscribe(fn) { receive = fn; return () => {}; }, async close() {} };
  const driver = createCodexDriver({ connect: async () => transport, store: { async get() { return undefined; }, async set() {} },
    onToolContent: async value => { captured.push(value); } });
  const opened = await driver.openSession({ sessionId: 'public', context: { text: '' }, tools: { id: 'none', tools: [] } });
  if (opened.status !== 'ok') throw Error();
  const session = opened.value;
  try {
    session.signals();
    expect((await session.execute({ operationId: 'op', text: 'Inspect' })).status).toBe('ok');
    const event = { method: 'item/completed', params: { threadId: 't', turnId: 'turn', item: { id: 'call', type: 'mcpToolCall', server: 'example', tool: 'inspect', status: 'completed',
      result: { content: [{ type: 'resource_link', uri: 'document://a', name: 'A' }], _meta: { secret: 'never visible' } } } } };
    receive(event); receive(event);
    for (let i = 0; i < 20 && !captured.length; i++) await Bun.sleep(2);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ operationId: 'op', source: 'example', content: [{ type: 'resource_link', uri: 'document://a', name: 'A' }] });
    expect(JSON.stringify(captured)).not.toContain('secret');
  } finally { await session.close(); }
});

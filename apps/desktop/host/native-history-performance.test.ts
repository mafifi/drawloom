import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStdioTransport, createNodeJsonStore } from '@drawloom/node-host';
import { createCodexDriver } from '@drawloom/codex-agent';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import type { AgentSession } from '@drawloom/agent';
import { createHistoryCoordinator } from './history-coordinator.js';

test('10,000 native fixture items cross real stdio once and survive a warm restart without payload rereads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-native-history-measurement-'));
  const mapping = createNodeJsonStore(join(root, 'state'));
  await mapping.set('codex:session', { threadId: 'fixture-thread', materialized: true });
  let store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  let writer = createHistoryCoordinator(store, 'session');
  let session: AgentSession | undefined;
  let payloadCalls = 0, metadataCalls = 0, responseBytes = 0;
  let peakRss = process.memoryUsage().rss;
  const script = `let buffer=''; const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
    process.stdin.on('data',d=>{buffer+=d;let n;while((n=buffer.indexOf('\\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);if(!m.id)continue;
    let result={};if(m.method==='initialize')result={userAgent:'public fixture'};
    if(m.method==='thread/resume'){if(m.params.excludeTurns!==true)throw Error('metadata-only resume required');result={thread:{id:'fixture-thread'}};}
    if(m.method==='thread/turns/list'){if(m.params.itemsView!=='notLoaded')throw Error('metadata-only turns required');result={data:[{id:'large-turn',status:'completed'}],nextCursor:null};}
    if(m.method==='thread/items/list'){if(m.params.limit!==1)throw Error('one item required');const i=Number(m.params.cursor??0);result={data:[{turnId:'large-turn',item:{id:'item-'+i,type:'agentMessage',text:String(i)+' '+'Public synthetic source. '.repeat(175)}}],nextCursor:i<9999?String(i+1):null};}
    send({id:m.id,result});}});`;
  const driver = createCodexDriver({ store: mapping, connect: async () => {
    const transport = createStdioTransport({ command: process.execPath, args: ['-e', script] });
    return { ...transport, request: async (method, params) => {
      if (method === 'thread/items/list') payloadCalls++;
      if (method === 'thread/turns/list') metadataCalls++;
      const result = await transport.request(method, params);
      if (method.startsWith('thread/')) responseBytes += Buffer.byteLength(JSON.stringify(result));
      return result;
    } };
  } });
  async function open() {
    const result = await driver.openSession({ sessionId: 'session', context: { text: '' }, tools: { id: 'none', tools: [] } });
    if (result.status !== 'ok') throw Error('Fixture session did not open');
    return result.value;
  }
  try {
    session = await open();
    const start = performance.now();
    await writer.synchronize(session.history);
    const initialMs = performance.now() - start;
    const newest = await store.page('session');
    expect(newest.entries).toHaveLength(50); expect(payloadCalls).toBe(50);
    const initialBytes = responseBytes;
    await session.close(); await writer.close(); await store.close();
    store = createSqliteConversationHistory(join(root, 'history.sqlite'));
    writer = createHistoryCoordinator(store, 'session'); session = await open();
    const warmBefore = payloadCalls;
    await writer.synchronize(session.history);
    expect(payloadCalls - warmBefore).toBe(0);
    let batches = 0;
    while ((await store.status('session')).hasOlder) {
      expect(++batches).toBeLessThanOrEqual(201);
      await writer.synchronize(session.history, 'older');
      expect(writer.error).toBe('');
      expect((await store.status('session')).sync).toBe('idle');
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }
    expect(payloadCalls).toBe(10000);
    const cachedBefore = payloadCalls + metadataCalls, cachedStart = performance.now();
    const older = await store.page('session', { before: newest.olderCursor });
    const cachedPageMs = performance.now() - cachedStart;
    expect(older.entries).toHaveLength(50);
    expect(payloadCalls + metadataCalls - cachedBefore).toBe(0);
    let counted = 0, cursor: string | undefined, ordered = true;
    do {
      const page = await store.page('session', { limit: 200, ...(cursor ? { before: cursor } : {}) });
      for (const entry of page.entries.toReversed()) { ordered &&= entry.text.startsWith(`${counted} `); counted++; }
      cursor = page.olderCursor;
    } while (cursor);
    expect(counted).toBe(10000); expect(ordered).toBe(true);
    await writer.synchronize(session.history);
    expect(payloadCalls).toBe(10000);
    expect(responseBytes).toBeGreaterThan(40_000_000);
    console.log('NATIVE_HISTORY_MEASUREMENT ' + JSON.stringify({ entries: 10000, payloadCalls, metadataCalls, nativeResponseJsonBytes: responseBytes, initialPayloadCalls: 50, initialResponseJsonBytes: initialBytes, initialMs, warmRestartPayloadCalls: 0, cachedPageProviderCalls: 0, cachedPageMs, sampledParentPeakRssBytes: peakRss, scenario: 'public synthetic child process, real stdio, Codex adapter and SQLite; not live Codex performance' }));
  } finally {
    await session?.close(); await writer.close(); await store.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

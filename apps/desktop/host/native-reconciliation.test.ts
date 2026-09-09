import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createCodexDriver } from '@drawloom/codex-agent';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import type { AgentSession } from '@drawloom/agent';
import { createHistoryCoordinator } from './history-coordinator.js';

test('one host reconnect settles old unfinished work and retains the new uncached gap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-native-reconciliation-'));
  const mapping = createNodeJsonStore(join(root, 'state'));
  await mapping.set('codex:session', { threadId: 'thread', materialized: true });
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  const writer = createHistoryCoordinator(store, 'session');
  let later = false, metadataCalls = 0;
  const driver = createCodexDriver({ store: mapping, connect: async () => ({
    notify() {}, respond() {}, subscribe() { return () => {}; }, async close() {},
    async request(method, raw) {
      if (method === 'initialize') return { userAgent: 'public fixture' };
      if (method === 'thread/resume') return { thread: { id: 'thread' } };
      const params = raw as { cursor?: string; turnId?: string };
      if (method === 'thread/turns/list') {
        if (++metadataCalls > 30) throw Error('Unbounded metadata reconciliation');
        const turns = [...(later ? Array.from({ length: 250 }, (_, i) => ({ id: `new-${i}`, status: 'completed' })) : []), { id: 'old', status: later ? 'completed' : 'inProgress' }];
        const offset = Number(params.cursor ?? 0);
        return { data: turns.slice(offset, offset + 50), nextCursor: offset + 50 < turns.length ? String(offset + 50) : null };
      }
      if (method === 'thread/items/list') return { data: [{ turnId: params.turnId, item: { id: params.turnId, type: 'agentMessage', text: params.turnId } }], nextCursor: null };
      return {};
    },
  }) });
  let session: AgentSession | undefined;
  const open = async () => {
    const result = await driver.openSession({ sessionId: 'session', context: { text: '' }, tools: { id: 'none', tools: [] } });
    if (result.status !== 'ok') throw Error('Fixture session did not open');
    return result.value;
  };
  try {
    session = await open(); await writer.synchronize(session.history);
    const old = (await store.page('session')).entries[0]!;
    expect(old.state).toBe('partial');
    await session.close(); later = true; session = await open();
    await writer.synchronize(session.history);
    expect(writer.error).toBe('');
    expect((await store.get('session', old.id))?.state).toBe('complete');
    expect((await store.get('session', old.id))?.position).toEqual(old.position);
    expect((await store.status('session')).hasOlder).toBe(true);
    let batches = 0;
    while ((await store.status('session')).hasOlder) {
      expect(++batches).toBeLessThan(10);
      await writer.synchronize(session.history, 'older');
      expect((await store.status('session')).sync).toBe('idle');
    }
    let count = 0, cursor: string | undefined, newEntriesFollowOld = true;
    do {
      const page = await store.page('session', { limit: 200, ...(cursor ? { before: cursor } : {}) });
      for (const entry of page.entries) if (entry.id !== old.id) newEntriesFollowOld &&= entry.position[0] > old.position[0] || (entry.position[0] === old.position[0] && entry.position[1] > old.position[1]);
      count += page.entries.length; cursor = page.olderCursor;
    } while (cursor);
    expect(count).toBe(251);
    expect(newEntriesFollowOld).toBe(true);
  } finally { await session?.close(); await writer.close(); await store.close(); await rm(root, { recursive: true, force: true }); }
});

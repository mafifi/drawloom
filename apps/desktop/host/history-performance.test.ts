import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { HistoryPageSchema, HistoryChangesSchema } from '@drawloom/conversation-history';
import { createTestDesktopApplication as createDesktopApplication } from './test-project.fixture.js';
import { serveDesktop } from './server.js';

test('10,000-entry public history uses bounded pages, no-body unchanged polls and single-record updates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-history-performance-'));
  const app = await createDesktopApplication(root);
  const id = (await app.snapshot()).selectedId;
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  let server: ReturnType<typeof serveDesktop> | undefined;
  let sourceBytes = 0, peakRss = process.memoryUsage().rss;
  const sample = () => { peakRss = Math.max(peakRss, process.memoryUsage().rss); };
  try {
    for (let start = 0; start < 10000; start += 200) {
      const entries = Array.from({ length: 200 }, (_, offset) => {
        const i = start + offset, text = `${i} ` + 'Public synthetic history. '.repeat(170);
        sourceBytes += Buffer.byteLength(text);
        return { id: `public-${i}`, position: [0, i] as const, role: 'assistant' as const, text, assets: [], state: 'complete' as const };
      });
      await store.commit(id, { expectedRevision: (await store.status(id)).revision, entries }); sample();
    }
    server = serveDesktop(app, resolve('apps/desktop/build'));
    const boot = await fetch(server.url, { redirect: 'manual' });
    const cookie = boot.headers.get('set-cookie')!.split(';')[0]!;
    const get = (path: string, extra: Record<string, string> = {}) => fetch(server!.origin + path, { headers: { cookie, ...extra } });
    const state = await get('/api/state');
    const first = await state.json() as { token: string; sections: object };
    expect(first.sections).not.toHaveProperty('messages');
    const unchanged = await get('/api/state?since=' + encodeURIComponent(first.token));
    expect(unchanged.status).toBe(204); expect((await unchanged.arrayBuffer()).byteLength).toBe(0);
    const start = performance.now();
    const initial = await get('/api/history?conversationId=' + id);
    const initialBody = await initial.text(), page = HistoryPageSchema.parse(JSON.parse(initialBody));
    const initialMs = performance.now() - start; sample();
    expect(page.entries.length).toBe(50); expect(page.entries[0]?.id).toBe('public-9950');
    const noChanges = await get('/api/history/changes?' + new URLSearchParams({ conversationId: id, after: page.changeCursor }), { 'If-None-Match': initial.headers.get('etag')! });
    expect(noChanges.status).toBe(204); expect((await noChanges.arrayBuffer()).byteLength).toBe(0);
    const olderStart = performance.now();
    const olderResponse = await get('/api/history?' + new URLSearchParams({ conversationId: id, before: page.olderCursor! }));
    const olderBody = await olderResponse.text(), older = HistoryPageSchema.parse(JSON.parse(olderBody));
    const olderMs = performance.now() - olderStart;
    expect(older.entries.length).toBe(50); expect(older.entries[0]?.id).toBe('public-9900');
    const previous = page.entries.at(-1)!;
    await store.commit(id, { expectedRevision: (await store.status(id)).revision, entries: [{ ...previous, text: 'One revised message' }] });
    const changedResponse = await get('/api/history/changes?' + new URLSearchParams({ conversationId: id, after: page.changeCursor }));
    const changedBody = await changedResponse.text(), changed = HistoryChangesSchema.parse(JSON.parse(changedBody));
    expect(changed.entries).toHaveLength(1); expect(changed.entries[0]?.id).toBe(previous.id);
    expect(Buffer.byteLength(initialBody)).toBeLessThan(sourceBytes / 100);
    sample();
    console.log('HISTORY_MEASUREMENT ' + JSON.stringify({ entries: 10000, sourceBytes, initialEntries: page.entries.length, initialBytes: Buffer.byteLength(initialBody), initialMs, olderEntries: older.entries.length, olderBytes: Buffer.byteLength(olderBody), olderMs, unchangedApplicationBytes: 0, unchangedHistoryBytes: 0, oneChangeBytes: Buffer.byteLength(changedBody), sampledPeakRssBytes: peakRss, providerCalls: 0, scenario: 'synthetic SQLite and authenticated loopback HTTP, not a live model' }));
  } finally {
    await store.close(); if (server) await server.close(); else await app.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

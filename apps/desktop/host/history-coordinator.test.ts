import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { createHistoryCoordinator } from './history-coordinator.js';
import { HistoryReadError } from '@drawloom/conversation-history';

test('reader failures never copy arbitrary provider text into public status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    const writer = createHistoryCoordinator(store, 'conversation');
    await writer.synchronize({ namespace: 'test', read: async () => { throw new HistoryReadError('unavailable', 'SECRET native payload'); } });
    expect((await store.status('conversation')).sync).toBe('unavailable');
    expect(JSON.stringify(await store.page('conversation'))).not.toContain('SECRET');
    expect(JSON.stringify(await store.changes('conversation'))).not.toContain('SECRET');
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('one synchronization drains checkpointed latest reconciliation without importing older history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    let calls = 0;
    const writer = createHistoryCoordinator(store, 'conversation');
    await writer.synchronize({ namespace: 'test', read: async (context, options) => {
      expect(options.direction).toBe('latest'); calls++;
      const previous = await context.checkpoint('scan');
      return { entries: [], checkpoints: [{ key: 'scan', value: calls }], hasOlder: true, hasMore: previous === undefined };
    } });
    expect(calls).toBe(2);
    expect(await store.checkpoint('conversation', 'test', 'scan')).toBe(2);
    expect((await store.status('conversation')).hasOlder).toBe(true);
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('a non-progressing latest continuation stops with a safe error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    let calls = 0;
    const writer = createHistoryCoordinator(store, 'conversation');
    await writer.synchronize({ namespace: 'test', read: async () => { calls++; return { entries: [], checkpoints: [], hasOlder: false, hasMore: true }; } });
    expect(calls).toBe(1); expect((await store.status('conversation')).sync).toBe('error');
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('coalesced partial messages flush at completion and retain stable positions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    const writer = createHistoryCoordinator(store, 'conversation');
    await writer.write({ id: 'one', role: 'assistant', text: 'a', assets: [], state: 'partial' });
    await writer.write({ id: 'one', role: 'assistant', text: 'ab', assets: [], state: 'partial' });
    await writer.write({ id: 'one', role: 'assistant', text: 'abc', assets: [], state: 'complete' });
    expect((await store.page('conversation')).entries.map(e => e.text)).toEqual(['abc']);
    expect((await store.status('conversation')).revision).toBe(1);
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('storage failure stays a history error, never invokes execution or advances checkpoints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    let commits = 0;
    const writer = createHistoryCoordinator({ ...store, commit: async () => { commits++; throw Error('disk full'); } }, 'conversation');
    await writer.write({ id: 'one', role: 'assistant', text: 'provider success', assets: [], state: 'complete' });
    expect(writer.error).toContain('not synchronized');
    expect(commits).toBe(1);
    expect((await store.status('conversation')).revision).toBe(0);
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('an unrelated successful write does not hide an earlier unsaved message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    let reject = true;
    const writer = createHistoryCoordinator({ ...store, commit: async (...args) => { if (reject) throw Error('storage unavailable'); return store.commit(...args); } }, 'conversation');
    await writer.write({ id: 'lost', role: 'assistant', text: 'unsaved', assets: [], state: 'complete' });
    reject = false;
    await writer.write({ id: 'later', role: 'assistant', text: 'saved', assets: [], state: 'complete' });
    expect(writer.error).toContain('not synchronized');
    expect((await store.page('conversation')).entries.map(entry => entry.id)).toEqual(['later']);
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

test('text and artifact delivery merge in either order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-coordinator-'));
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  try {
    const writer = createHistoryCoordinator(store, 'conversation');
    const asset = { key: 'image', size: 10, mediaType: 'image/png' };
    const text = (id: string) => writer.write({ id, role: 'assistant', text: 'Useful caption', assets: [], state: 'complete' });
    await writer.writeAsset('one', 'operation', asset); await text('one');
    await text('two'); await writer.writeAsset('two', 'operation', asset);
    for (const id of ['one', 'two']) expect(await store.get('conversation', id)).toMatchObject({ text: 'Useful caption', assets: [asset] });
    await writer.close();
  } finally { await store.close(); await rm(root, { recursive: true, force: true }); }
});

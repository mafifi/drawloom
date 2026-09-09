import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopApplication } from './application.js';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { ProjectSchema } from '../src/lib/protocol.js';

test('failed history writes do not turn successful synthetic work into failed execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-history-failure-'));
  const app = await createDesktopApplication(root);
  const db = new Database(join(root, 'history.sqlite'));
  try {
    db.exec("CREATE TRIGGER reject_history BEFORE INSERT ON history_entries BEGIN SELECT RAISE(ABORT, 'fixture disk failure'); END;");
    const id = (await app.snapshot()).selectedId;
    await app.command({ kind: 'send', conversationId: id, text: 'Provider success survives storage failure', attachmentKeys: [], contextArtifactIds: [] });
    for (let n = 0; n < 30 && !(await app.snapshot()).signals.some(signal => signal.kind === 'operation.completed'); n++) await Bun.sleep(5);
    const state = await app.snapshot();
    expect(state.signals.some(signal => signal.kind === 'operation.completed')).toBe(true);
    expect(state.signals.some(signal => signal.kind === 'operation.failed')).toBe(false);
    expect(state.operator.candidates).toHaveLength(1);
    expect((await app.historyPage(id)).status.sync).toBe('error');
    expect((await app.historyPage(id)).entries).toEqual([]);
  } finally { db.close(); await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('cached Codex history opens without connecting, preserving project assets and native mappings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-history-offline-'));
  let app = await createDesktopApplication(root);
  const id = (await app.snapshot()).selectedId;
  const asset = await app.importAsset(new TextEncoder().encode('Public attachment'), 'text/plain', 'Reference');
  await app.close();
  const json = createNodeJsonStore(join(root, 'state'));
  const project = ProjectSchema.parse(await json.get('project'));
  project.conversations[0]!.provider = 'codex';
  await json.set('project', project);
  await json.set('codex:' + id, { threadId: 'private-native-fixture', materialized: true });
  const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
  await store.commit(id, { expectedRevision: 0, entries: [{ id: 'public-record', position: [0, 0], role: 'assistant', text: 'Readable while Codex is unavailable', assets: [asset], state: 'complete' }], sync: { sync: 'unavailable', message: 'Provider unavailable. Saved history is still readable.' } });
  await store.close();
  app = await createDesktopApplication(root);
  try {
    expect((await app.historyPage(id)).entries[0]?.id).toBe('public-record');
    expect((await app.historyPage(id)).status.sync).toBe('unavailable');
    expect(await app.authorizedAsset(asset.key)).toEqual(asset);
    expect(await json.get('codex:' + id)).toEqual({ threadId: 'private-native-fixture', materialized: true });
    expect(JSON.stringify(await app.snapshot())).not.toContain('private-native-fixture');
    expect((await app.snapshot()).operator.candidates).toHaveLength(1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

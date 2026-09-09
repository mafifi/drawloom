import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDesktopApplication } from '../apps/desktop/host/application.js';
import { serveDesktop } from '../apps/desktop/host/server.js';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';

// Isolated public UI verification fixture. It never opens the user's installation.
const root = await mkdtemp(join(tmpdir(), 'drawloom-history-browser-'));
const app = await createDesktopApplication(root);
const first = (await app.snapshot()).selectedId;
const store = createSqliteConversationHistory(join(root, 'history.sqlite'));
for (let start = 0; start < 10000; start += 200) {
  await store.commit(first, { expectedRevision: (await store.status(first)).revision, entries: Array.from({ length: 200 }, (_, offset) => {
    const i = start + offset;
    return { id: `public-${i}`, position: [0, i] as const, role: i % 2 ? 'assistant' as const : 'user' as const, text: `Public synthetic message ${String(i).padStart(5, '0')}\nConversation history stays readable without a model connection.`, assets: [], state: 'complete' as const };
  }) });
}
await store.close();
await app.command({ kind: 'create_conversation', workbenchId: 'text', provider: 'synthetic' });
await app.command({ kind: 'select_conversation', conversationId: first });
const server = serveDesktop(app, resolve('apps/desktop/build'));
console.log(JSON.stringify({ url: server.url, origin: server.origin, fixture: '10000 public entries, two synthetic conversations' }));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  void server.close().then(() => rm(root, { recursive: true, force: true })).finally(() => process.exit(0));
});

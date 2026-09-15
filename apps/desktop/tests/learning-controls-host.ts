// Disposable UI fixture: real desktop/server/history, synthetic KnowledgeService.
// Does not establish capture, retrieval quality, or provider acceptance.
import { mkdtemp, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from '@drawloom/local-knowledge-runtime';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { createDesktopApplication } from '../host/application.js';
import { serveDesktop } from '../host/server.js';
import type { KnowledgeService } from '../host/knowledge-host.js';
import { createKnowledgeActivityFixture, syntheticNightloomMethods } from './knowledge-activity-fixture.js';

const root = await realpath(await mkdtemp(join(tmpdir(), 'drawloom-learning-ui-')));
const work = join(root, 'project'); await mkdir(work);
const data = join(root, 'data');
let configuration = { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION };
const ref = { type: 'claim' as const, origin: 'public-example', id: 'delivery-guidance', revision: '2' };
const service: KnowledgeService = {
  ...syntheticNightloomMethods,
  async status() { return { availability: 'ready', message: 'Text search is ready', configuration,
    models: [{ id: 'qwen3-embedding-0.6b-gguf', title: 'Qwen3 Embedding', licence: 'Apache-2.0', source: 'https://example.invalid/public-fixture', modelDirectory: join(root, 'model'), runtimeDirectory: join(root, 'runtime'), prerequisites: 'Apple Silicon with Metal', runtime: { package: 'llama.cpp', version: 'fixture', licence: 'MIT' }, weightsBytes: 640000000, runtimeBytes: 1000000, runtimeDownloadAvailable: false, state: 'missing' }],
    indexing: 'unavailable', maintenance: { state: 'paused', pendingUpdates: 0, message: 'Maintenance is paused', automaticStartsToday: 0, automaticMillisecondsToday: 0 } }; },
  async configure(next) { configuration = next; return this.status(); },
  async evidence(request) { return request.root.id === ref.id
    ? { kind: 'ok', records: [{ ref, body: 'Confirm the delivery address before dispatch.', status: 'active', confidence: {}, provenance: { producer: { type: 'fixture', id: 'public-example' }, inputs: [] }, freshness: 'current' }], links: [], bytes: 200 }
    : { kind: 'denied' }; },
  async search() { return { kind: 'failure', code: 'unavailable' }; },
  async export() { return { kind: 'failure', code: 'unavailable' }; },
  async ingest() { return { kind: 'denied' }; },
  async download() { throw Error('This UI fixture must not download'); },
  async cancelDownload() { return this.status(); },
  async close() {},
};
const fixture = createKnowledgeActivityFixture();
let app = await createDesktopApplication(data, { knowledge: { service }, orchestration: { manager: async () => fixture.manager } });
await app.command({ kind: 'add_project', directory: work, name: 'Learning controls' });
const state = await app.command({ kind: 'create_conversation', workbenchId: 'text', provider: 'synthetic' });
await app.close();
const history = createSqliteConversationHistory(join(data, 'history.sqlite'));
await history.commit(state.selectedId, { expectedRevision: 0, entries: [{
  id: 'learning-disclosure-fixture', position: [0, 0], role: 'user', state: 'complete',
  text: 'Help me prepare the delivery.', assets: [], preparation: { kind: 'ready',
    receipt: { executionId: 'fixture-execution', submissionId: 'fixture-submission' },
    references: [{ ref, status: 'active', inclusion: 'reference_only' }],
  },
}] });
await history.close();
app = await createDesktopApplication(data, { knowledge: { service }, orchestration: { manager: async () => fixture.manager } });
await app.restore();
const host = serveDesktop(app, resolve('apps/desktop/build'));
console.log(JSON.stringify({ root, url: host.url, origin: host.origin, pid: process.pid }));
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, async () => {
  if (stopping) return; stopping = true; await host.close(); process.exit(0);
});

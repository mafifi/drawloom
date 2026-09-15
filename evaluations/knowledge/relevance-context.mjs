/** Opt-in local GGUF + actual preparer/adapter, with no answering-model calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteKnowledge } from '@drawloom/sqlite-knowledge';
import { createKnowledgeContextPreparer } from '@drawloom/knowledge-context';
import { createCodexDriver } from '@drawloom/codex-agent';
import { KnownModelManifests, KnownLlamaRuntime, LlamaEmbeddingWorker, createKnowledgeEmbeddings, createModelSetup, embeddingConfiguration } from '@drawloom/local-embeddings';
import { createSemanticRetrieval } from '../../packages/knowledge/local-knowledge-runtime/src/semantic.ts';

if (process.env.DRAWLOOM_GGUF_EVALUATION !== '1' || !process.env.DRAWLOOM_MODELS_ROOT || !process.argv[2]) throw Error('Requires explicit local GGUF opt-in, existing model root and output path; never downloads');
const fixtureSource = readFileSync(new URL('relevance-challenge.json', import.meta.url), 'utf8');
const challenge = JSON.parse(fixtureSource);
const model = 'qwen3-embedding-0.6b-gguf', configuration = embeddingConfiguration(model);
const modelRoot = process.env.DRAWLOOM_MODELS_ROOT;
if (!await createModelSetup({ root: modelRoot, manifest: KnownModelManifests[model] }).ready()) throw Error('Existing model is not ready');
const directory = await mkdtemp(join(tmpdir(), 'drawloom-relevance-context-'));
const subject = { type: 'evaluation', id: 'synthetic-owner', properties: {} };
const authorizer = { authorize: async () => ({ decision: true }) };
const provider = createSqliteKnowledge({ databasePath: join(directory, 'knowledge.sqlite'), authorizer, resolveResource: () => ({ type: 'fixture', id: 'public', properties: {} }) });
const worker = new LlamaEmbeddingWorker({ root: modelRoot, model });
const semantic = createSemanticRetrieval({ subject, configuration, embeddings: createKnowledgeEmbeddings({ model, worker, authorizer }),
  retrieval: provider.retrieval, work: provider.indexWork, index: provider.embeddingIndex, authorizeSearch: async () => true,
  revision: async () => { const result = await provider.maintenance.status(subject); if (result.kind !== 'ok') throw Error('status unavailable'); return result.checkpoint; },
});
const guidance = ['References may be related but may not answer the request.', 'Acknowledge missing information; do not infer unsupported facts.'];

async function actualWire(prepared, query) {
  const delivered = [], values = new Map();
  const rpc = { async request(method, params) {
    if (method === 'initialize') return { userAgent: 'codex/0.153.4' };
    if (method === 'thread/start') return { thread: { id: 'synthetic-native' }, approvalsReviewer: 'user' };
    if (method === 'turn/start' || method === 'turn/steer') {
      assert.equal(params.additionalContext, undefined);
      const text = params.input.filter(item => item.type === 'text').map(item => item.text).join('\n');
      delivered.push({ method, text }); return { turn: { id: 'synthetic-turn' } };
    }
    return {};
  }, notify() {}, respond() {}, subscribe() { return () => {}; }, async close() {} };
  const driver = createCodexDriver({ connect: async () => rpc, store: { async get(key) { return values.get(key); }, async set(key, value) { values.set(key, value); } } });
  const opened = await driver.openSession({ sessionId: 'synthetic-local', context: { text: '' }, tools: { id: 'none', tools: [] } });
  assert.equal(opened.status, 'ok');
  const consume = (async () => { for await (const _ of opened.value.signals()) { /* attach normal session owner */ } })();
  try {
    const operation = { operationId: 'synthetic-operation', text: query, references: prepared };
    const executed = await opened.value.execute(operation);
    assert.equal(executed.status, 'ok', JSON.stringify(executed));
    assert.equal((await opened.value.steer(operation)).status, 'ok');
    assert.deepEqual(delivered.map(item => item.method), ['turn/start', 'turn/steer']);
    for (const item of delivered) for (const sentence of guidance) assert(item.text.includes(sentence));
    return delivered;
  } finally { await opened.value.close(); await consume; }
}

const cases = [];
let report;
try {
  for (const record of challenge.records) assert.equal((await provider.intake.ingest(subject, { operation: 'upsert', expectedRevision: null, links: [], record: {
    ref: { type: 'source', origin: 'independent-challenge', id: record.id, revision: 'r1' }, body: record.body, status: 'active', confidence: {}, provenance: { producer: { type: 'fixture', id: challenge.version }, inputs: [] },
  } })).kind, 'accepted');
  for (let i = 0; i < challenge.records.length + 1 && semantic.state !== 'ready'; i++) await semantic.indexNext();
  assert.equal(semantic.state, 'ready');
  for (const mode of ['lexical', 'hybrid']) {
    for (const example of challenge.cases) {
      const preparer = createKnowledgeContextPreparer({ subject, destination: { type: 'test-answerer', id: 'synthetic', properties: {} }, authorizer,
        resolveDisclosureResource: async ({ ref }) => ({ type: 'record', id: ref.id, properties: {} }),
        retrieval: { ...provider.retrieval, search: (_subject, request) => semantic.search({ ...request, mode: mode === 'lexical' ? 'lexical' : 'best_available' }) },
      });
      const prepared = await preparer.prepare({ request: example.query, binding: { executionId: 'challenge', conversationId: 'synthetic' }, signal: new AbortController().signal, budget: { maxRecords: 8, maxBytes: 12 * 1024 } });
      const ids = prepared.references.map(item => item.ref.id);
      const required = example.requiredMode && example.requiredMode !== mode ? [] : example.require ?? [];
      const missing = required.filter(id => !ids.includes(id));
      const unexpected = example.forbid.filter(id => ids.includes(id));
      const missingAny = !!example.requireAny && !example.requireAny.some(id => ids.includes(id));
      cases.push({ id: example.id, category: example.kind, mode, query: example.query, preparation: prepared, selected: ids, missing, unexpected, missingAny,
        passed: !missing.length && !unexpected.length && !missingAny && ['ready', 'empty'].includes(prepared.kind),
        wire: prepared.kind === 'ready' ? await actualWire(prepared, example.query) : [] });
    }
  }
  const denied = await createKnowledgeContextPreparer({ subject, destination: { type: 'test', id: 'synthetic', properties: {} },
    authorizer: { authorize: async () => ({ decision: false }) }, resolveDisclosureResource: async ({ ref }) => ({ type: 'record', id: ref.id, properties: {} }),
    retrieval: { ...provider.retrieval, search: (_subject, request) => semantic.search(request) },
  }).prepare({ request: 'Cedar Press ink', binding: { executionId: 'denied', conversationId: 'synthetic' }, signal: new AbortController().signal, budget: { maxRecords: 8, maxBytes: 12 * 1024 } });
  assert.deepEqual(denied, { kind: 'empty', references: [], bytes: 0 });
  report = { challengeSha256: createHash('sha256').update(fixtureSource).digest('hex'), policy: challenge.policy, model: KnownModelManifests[model], runtime: KnownLlamaRuntime, configuration,
    answeringModelCalls: 0, transport: 'actual Codex adapter with controlled RPC; no native process', cases, disclosureDenied: denied,
    passed: cases.every(item => item.passed), limitation: 'Selection and actual start/steer input proof only; no claim that an answering model follows guidance.' };
} finally {
  semantic.close(); provider.close(); await worker.close(); await rm(directory, { recursive: true, force: true });
}
writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, cases: cases.map(({ id, mode, selected, missing, unexpected, passed }) => ({ id, mode, selected, missing, unexpected, passed })), cleanup: 'closed and removed own temporary store' }, null, 2));
if (!report.passed) process.exitCode = 1;

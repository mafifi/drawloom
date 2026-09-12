import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { KnowledgeEmbeddingIndex, KnowledgeEmbeddings, KnowledgeIndexWork, KnowledgeRecord, KnowledgeRetrieval, RecordRef, TrustedKnowledgeSubject } from '@drawloom/knowledge';
import { createSqliteKnowledge } from '@drawloom/sqlite-knowledge';
import { createSemanticRetrieval } from './src/semantic.ts';

// Deterministic vectors test integration, not semantic quality.
const subject = { type: 'user', id: 'owner', properties: {} } as TrustedKnowledgeSubject;
const configuration = { id: 'test-only', fingerprint: 'test-512-v1', dimensions: 2 };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'drawloom-semantic-test-'));
  const db = createSqliteKnowledge({ databasePath: join(directory, 'knowledge.sqlite'), authorizer: { authorize: async () => ({ decision: true }) }, resolveResource: () => ({ type: 'knowledge', id: 'test', properties: {} }) });
  const calls: { role: string; count: number }[] = [];
  const embeddings: KnowledgeEmbeddings = { embed: async (_, batch) => {
    calls.push({ role: batch.role, count: batch.items.length });
    return { kind: 'ok', configuration, items: batch.items.map(item => ({ id: item.id, ...(item.revision ? { revision: item.revision } : {}), vector: [1, 0] })) };
  } };
  const make = (authorizeSearch: (ref?: RecordRef) => Promise<boolean> = async () => true) => createSemanticRetrieval({ subject, configuration, embeddings, retrieval: db.retrieval, work: db.indexWork, index: db.embeddingIndex, authorizeSearch, revision: async () => {
    const status = await db.maintenance.status(subject); if (status.kind !== 'ok') throw Error('unavailable'); return status.checkpoint;
  } });
  const insert = (id: string, body = 'needle evidence') => db.intake.ingest(subject, { operation: 'upsert', expectedRevision: null, links: [], record: {
    ref: { type: 'source', origin: 'public-test', id, revision: 'r1' }, body, status: 'active', confidence: {}, provenance: { producer: { type: 'test', id: 'fixture' }, inputs: [] },
  } });
  return { db, calls, make, insert, cleanup: async () => { db.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('explicit lexical requests respect page limits and never invoke inference', async () => {
  const f = await fixture(); const service = f.make();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await f.insert(`s${i}`)).kind, 'accepted');
    const page = await service.search({ query: 'needle', mode: 'lexical', limit: 1, maxBytes: 8192 });
    assert.equal(page.kind, 'ok'); if (page.kind === 'ok') assert.equal(page.items.length, 1);
    assert.equal(f.calls.length, 0);
  } finally { service.close(); await f.cleanup(); }
});

test('index work is durable; hybrid reads are bounded and invalidated by corpus changes', async () => {
  const f = await fixture(); let service = f.make();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await f.insert(`s${i}`, 'needle ' + 'x'.repeat(700))).kind, 'accepted');
    for (let i = 0; i < 3; i++) await service.indexNext();
    assert.equal(service.state, 'ready');
    assert.equal(f.calls.filter(call => call.role === 'document').length, 6);
    const page = await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 8192 });
    assert.equal(page.kind, 'ok'); if (page.kind !== 'ok') return;
    assert.equal(page.mode, 'hybrid'); assert.equal(page.items.length, 1); assert.ok(page.cursor);
    await f.insert('new');
    assert.equal((await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 8192, cursor: page.cursor })).kind, 'invalidated');
    await service.indexNext(); const before = f.calls.length;
    service.close(); service = f.make(); await service.indexNext();
    assert.equal(service.state, 'ready'); assert.equal(f.calls.length, before, 'acknowledged records are not embedded after reopening');
  } finally { service.close(); await f.cleanup(); }
});

test('hybrid search filters record and provenance denials before ranks and cursor disclosure', async () => {
  const f = await fixture();
  const denied = new Set(['a-denied-prefix', 'c-denied-tail', 'd-provenance']);
  const service = f.make(async (ref) => ref === undefined || !denied.has(ref.id));
  try {
    assert.equal((await f.insert('a-denied-prefix')).kind, 'accepted');
    assert.equal((await f.insert('b-allowed')).kind, 'accepted');
    assert.equal((await f.insert('c-denied-tail')).kind, 'accepted');
    assert.equal((await f.insert('d-provenance', 'support only')).kind, 'accepted');
    const derived = await f.db.intake.ingest(subject, { operation: 'upsert', expectedRevision: null, links: [{
      from: { type: 'claim', origin: 'public-test', id: 'e-derived', revision: 'r1' },
      to: { type: 'source', origin: 'public-test', id: 'd-provenance', revision: 'r1' }, relation: 'support',
    }], record: {
      ref: { type: 'claim', origin: 'public-test', id: 'e-derived', revision: 'r1' }, body: 'needle derived', status: 'active', freshness: 'current', confidence: {},
      provenance: { producer: { type: 'test', id: 'fixture' }, inputs: [{ type: 'source', origin: 'public-test', id: 'd-provenance', revision: 'r1' }] },
    } });
    assert.equal(derived.kind, 'accepted');
    for (let i = 0; i < 5; i++) await service.indexNext();
    assert.equal(service.state, 'ready');
    const page = await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 8192 });
    assert.equal(page.kind, 'ok');
    if (page.kind === 'ok') {
      assert.deepEqual(page.items.map((item) => item.record.ref.id), ['b-allowed']);
      assert.equal(page.items[0]?.relevance, 1 / 60);
      assert.equal(page.cursor, undefined);
    }
  } finally { service.close(); await f.cleanup(); }
});

test('hybrid continuation rechecks global search authorization before disclosing its tail', async () => {
  const f = await fixture();
  let searchAllowed = true;
  const service = f.make(async (ref) => ref !== undefined || searchAllowed);
  try {
    assert.equal((await f.insert('continuation-a')).kind, 'accepted');
    assert.equal((await f.insert('continuation-b')).kind, 'accepted');
    await service.indexNext(); await service.indexNext();
    const first = await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 8192 });
    assert.equal(first.kind, 'ok'); if (first.kind !== 'ok' || !first.cursor) return;
    searchAllowed = false;
    assert.deepEqual(await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 8192, cursor: first.cursor }), { kind: 'denied' });
  } finally { service.close(); await f.cleanup(); }
});

test('an oversized internal lexical candidate window falls back to the caller limits', async () => {
  const largeRecords: KnowledgeRecord[] = Array.from({ length: 5 }, (_, index) => ({
    ref: { type: 'source', origin: 'public-test', id: `large-${index}`, revision: 'r1' }, body: 'needle ' + 'x'.repeat(240_000), status: 'active', confidence: {},
    provenance: { producer: { type: 'test', id: 'fixture' }, inputs: [] },
  }));
  const retrieval = {
    async search(_subject, request) {
      if (request.limit === 100 && Buffer.byteLength(JSON.stringify(largeRecords)) > request.maxBytes) return { kind: 'failure' as const, code: 'too_large' as const };
      const items = [{ record: largeRecords[0]!, relevance: 1 }];
      return { kind: 'ok' as const, mode: 'lexical' as const, semantic: { status: 'unavailable' as const }, items, bytes: Buffer.byteLength(JSON.stringify(items)) };
    },
    async get() { return { kind: 'ok' as const }; },
    async expand() { throw new Error('unused'); }, async evidence() { throw new Error('unused'); }, async export() { throw new Error('unused'); },
  } satisfies KnowledgeRetrieval;
  const work = { async pending() { return { kind: 'ok' as const, batch: { id: 'empty', checkpoint: 'empty' }, updates: [], remaining: false, bytes: 0 }; }, async acknowledge() { throw new Error('unused'); } } satisfies KnowledgeIndexWork;
  const index = {
    async query() { return { kind: 'ok' as const, activeGeneration: 1, items: [] }; },
    async prepare() { throw new Error('unused'); }, async stage() { throw new Error('unused'); }, async activate() { throw new Error('unused'); },
  } satisfies KnowledgeEmbeddingIndex;
  const embeddings: KnowledgeEmbeddings = { async embed() { throw new Error('internal candidate failure should fall back before inference'); } };
  const service = createSemanticRetrieval({ subject, configuration, retrieval, work, index, embeddings, authorizeSearch: async () => true, revision: async () => 'epoch-1' });
  try {
    await service.indexNext();
    const result = await service.search({ query: 'needle', mode: 'best_available', limit: 1, maxBytes: 256 * 1024 });
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') assert.deepEqual(result.items.map((item) => item.record.ref.id), ['large-0']);
  } finally { service.close(); }
});

test('a denied semantic insertion cannot change the fused order of allowed records', async () => {
  const record = (id: string): KnowledgeRecord => ({
    ref: { type: 'source', origin: 'public-test', id, revision: 'r1' }, body: `needle ${id}`, status: 'active', confidence: {},
    provenance: { producer: { type: 'test', id: 'fixture' }, inputs: [] },
  });
  const records = new Map(['allowed-a', 'allowed-b', 'denied-x'].map((id) => [id, record(id)]));
  const run = async (semanticIds: string[]) => {
    const retrieval = {
      async search() {
        const items = ['allowed-a', 'allowed-b'].map((id, index) => ({ record: records.get(id)!, relevance: 1 - index / 10 }));
        return { kind: 'ok' as const, mode: 'lexical' as const, semantic: { status: 'unavailable' as const }, items, bytes: Buffer.byteLength(JSON.stringify(items)) };
      },
      async get(_subject, ref) { const found = records.get(ref.id); return found ? { kind: 'ok' as const, record: found } : { kind: 'ok' as const }; },
      async expand() { throw new Error('unused'); }, async evidence() { throw new Error('unused'); }, async export() { throw new Error('unused'); },
    } satisfies KnowledgeRetrieval;
    const work = { async pending() { return { kind: 'ok' as const, batch: { id: 'empty', checkpoint: 'empty' }, updates: [], remaining: false, bytes: 0 }; }, async acknowledge() { throw new Error('unused'); } } satisfies KnowledgeIndexWork;
    const index = {
      async query(input) { return { kind: 'ok' as const, activeGeneration: 1, items: input.limit === 1 ? [] : semanticIds.map((id, index) => ({ ref: records.get(id)!.ref, relevance: 1 - index / 10 })) }; },
      async prepare() { throw new Error('unused'); }, async stage() { throw new Error('unused'); }, async activate() { throw new Error('unused'); },
    } satisfies KnowledgeEmbeddingIndex;
    const embeddings: KnowledgeEmbeddings = { async embed(_, batch) { return { kind: 'ok', configuration, items: batch.items.map((item) => ({ id: item.id, vector: [1, 0] })) }; } };
    const service = createSemanticRetrieval({ subject, configuration, retrieval, work, index, embeddings, authorizeSearch: async (ref) => ref?.id !== 'denied-x', revision: async () => 'epoch-1' });
    try {
      await service.indexNext();
      const result = await service.search({ query: 'needle', mode: 'best_available', limit: 2, maxBytes: 8192 });
      assert.equal(result.kind, 'ok');
      return result.kind === 'ok' ? result.items.map((item) => item.record.ref.id) : [];
    } finally { service.close(); }
  };
  assert.deepEqual(await run(['allowed-b', 'denied-x', 'allowed-a']), await run(['allowed-b', 'allowed-a']));
});

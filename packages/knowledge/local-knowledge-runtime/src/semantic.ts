import { createHash, randomUUID } from 'node:crypto';
import { SearchRequestSchema, embeddingResultSchemaFor, type EmbeddingConfiguration, type KnowledgeEmbeddings, type KnowledgeEmbeddingIndex, type KnowledgeIndexWork, type KnowledgeRetrieval, type TrustedKnowledgeSubject, type SearchRequest, type SearchResult, type RecordRef } from '@drawloom/knowledge';

const key = (ref: RecordRef) => JSON.stringify([ref.type, ref.origin, ref.id, ref.revision]);
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** Host composition, not an agent capability. Bounded candidates and passage batches. */
export function createSemanticRetrieval(options: {
  subject: TrustedKnowledgeSubject; retrieval: KnowledgeRetrieval; work: KnowledgeIndexWork; index: KnowledgeEmbeddingIndex;
  embeddings: KnowledgeEmbeddings; configuration: EmbeddingConfiguration;
  authorizeSearch(ref?: RecordRef): Promise<boolean>;
  revision(): Promise<string>;
}) {
  let busy = false, closed = false, generationKnown = false, generation: number | null = null;
  let state: 'pending' | 'indexing' | 'ready' | 'failed' = 'pending';
  const cursors = new Map<string, { query: string; refs: RecordRef[]; offset: number; rank: number; created: number; revision: string }>();
  async function active() {
    const probe = Array.from({ length: options.configuration.dimensions }, (_, i) => i === 0 ? 1 : 0);
    const result = await options.index.query({ configuration: options.configuration, vector: probe, limit: 1 });
    generation = result.kind === 'ok' ? result.activeGeneration : null;
    generationKnown = true;
  }
  async function indexNext() {
    if (busy || closed) return;
    busy = true; state = 'indexing';
    try {
      const pending = await options.work.pending(options.subject, { configuration: options.configuration, limit: 1, maxBytes: 512 * 1024 });
      if (pending.kind !== 'ok') throw Error('Index work unavailable');
      if (!generationKnown) await active();
      if (!pending.updates.length) { state = generation === null ? 'pending' : 'ready'; return; }
      const expected = generation;
      const prepared = await options.index.prepare({ configuration: options.configuration, generation: (expected ?? 0) + 1, expectedActiveGeneration: expected });
      if (prepared.kind !== 'ready') throw Error('Index preparation unavailable');
      for (const update of pending.updates) {
        if (closed) return;
        if (update.operation === 'remove') {
          if ((await options.index.stage({ stageId: prepared.stageId, entries: [], removals: [update.ref] })).kind !== 'staged') throw Error('Index removal failed');
          continue;
        }
        // Split by Unicode code points, never split surrogate pairs. Keep input
        // below the worker's token budget even for non-Latin text. Exact model
        // formatting/pooling remains inside the embedding provider.
        const text = Array.from(update.record.body);
        for (let offset = 0; offset < text.length; offset += 512) {
          if (closed) return;
          const request = { configuration: options.configuration, role: 'document' as const, items: [{ id: digest(key(update.record.ref) + ':' + offset), revision: update.record.ref.revision, text: text.slice(offset, offset + 512).join('') }] };
          const result = embeddingResultSchemaFor(request).parse(await options.embeddings.embed(options.subject, request));
          if (result.kind !== 'ok') throw Error('Embedding inference unavailable');
          if ((await options.index.stage({ stageId: prepared.stageId, entries: result.items.map(item => ({ id: item.id, ref: update.record.ref, vector: item.vector })), removals: [] })).kind !== 'staged') throw Error('Index stage failed');
        }
      }
      if (closed) return;
      const committed = await options.index.activate({ stageId: prepared.stageId, expectedActiveGeneration: expected });
      if (committed.kind !== 'activated') throw Error('Index changed during update');
      if ((await options.work.acknowledge(options.subject, { batch: pending.batch })).kind !== 'acknowledged') throw Error('Index checkpoint changed');
      generation = committed.generation; state = pending.remaining ? 'pending' : 'ready';
    } catch { state = 'failed'; generationKnown = false; }
    finally { busy = false; }
  }
  type ActiveRecord = Extract<SearchResult, { kind: 'ok' }>['items'][number]['record'];
  async function authorizedRecord(ref: RecordRef): Promise<
    { kind: 'record'; record: ActiveRecord } | { kind: 'skip' } | { kind: 'stop'; result: SearchResult }
  > {
    const value = await options.retrieval.get(options.subject, ref);
    if (value.kind === 'denied') return { kind: 'skip' };
    if (value.kind === 'invalidated') return { kind: 'stop', result: value };
    if (value.kind !== 'ok') return { kind: 'stop', result: { kind: 'failure', code: 'unavailable' } };
    const record = value.record;
    if (!record || record.status !== 'active') return { kind: 'skip' };
    for (const protectedRef of [record.ref, ...record.provenance.inputs]) {
      try { if (!await options.authorizeSearch(protectedRef)) return { kind: 'skip' }; }
      catch { return { kind: 'skip' }; }
    }
    return { kind: 'record', record };
  }
  async function page(query: string, refs: RecordRef[], offset: number, rank: number, request: SearchRequest, revision: string): Promise<SearchResult> {
    if (await options.revision() !== revision) return { kind: 'invalidated' };
    const items: Extract<SearchResult, { kind: 'ok' }>['items'] = [];
    let consumed = offset;
    let exposedRank = rank;
    let successorOffset: number | undefined;
    for (; consumed < refs.length; consumed++) {
      const candidate = await authorizedRecord(refs[consumed]!);
      if (candidate.kind === 'stop') return candidate.result;
      if (candidate.kind === 'skip') continue;
      if (items.length >= request.limit) { successorOffset = consumed; break; }
      items.push({ record: candidate.record, relevance: 1 / (60 + exposedRank) });
      exposedRank++;
      if (bytes(items) > request.maxBytes) return { kind: 'failure', code: 'too_large' };
    }
    let cursor: string | undefined;
    if (successorOffset !== undefined) {
      cursor = randomUUID(); cursors.set(cursor, { query, refs, offset: successorOffset, rank: exposedRank, created: Date.now(), revision });
      while (cursors.size > 64) cursors.delete(cursors.keys().next().value!);
    }
    if (await options.revision() !== revision) return { kind: 'invalidated' };
    return { kind: 'ok', mode: 'hybrid', semantic: { status: 'ready', configurationId: options.configuration.id }, items, bytes: bytes(items), ...(cursor ? { cursor: cursor as never } : {}) };
  }
  return {
    get state() { return state; }, indexNext, close() { closed = true; cursors.clear(); },
    async search(input: SearchRequest): Promise<SearchResult> {
      const request = SearchRequestSchema.parse(input);
      if (closed) return { kind: 'failure', code: 'unavailable' };
      try { if (!await options.authorizeSearch()) return { kind: 'denied' }; }
      catch { return { kind: 'denied' }; }
      if (request.cursor && cursors.has(request.cursor)) {
        const stored = cursors.get(request.cursor)!;
        if (stored.query !== request.query || Date.now() - stored.created > 300000) return { kind: 'invalidated' };
        return page(stored.query, stored.refs, stored.offset, stored.rank, request, stored.revision);
      }
      const fallback = () => options.retrieval.search(options.subject, { ...request, mode: 'lexical' });
      if (request.cursor || request.mode === 'lexical' || busy || state !== 'ready') return fallback();
      const revision = await options.revision();
      const lexical = await options.retrieval.search(options.subject, { ...request, mode: 'lexical', limit: 100, maxBytes: 1024 * 1024 });
      if (lexical.kind !== 'ok') return lexical.kind === 'failure' && lexical.code === 'too_large' ? fallback() : lexical;
      const batch = { configuration: options.configuration, role: 'query' as const, items: [{ id: 'query', text: request.query }] };
      let encoded;
      try { encoded = embeddingResultSchemaFor(batch).parse(await options.embeddings.embed(options.subject, batch)); }
      catch { return fallback(); }
      if (encoded.kind !== 'ok') return fallback();
      const semantic = await options.index.query({ configuration: options.configuration, vector: encoded.items[0]!.vector, limit: 100 });
      if (semantic.kind !== 'ok') return options.retrieval.search(options.subject, { ...request, mode: 'lexical' });
      const candidates = new Map<string, { ref: RecordRef; rank: number }>();
      for (const list of [lexical.items.map(item => item.record.ref), semantic.items.map(item => item.ref)]) {
        let authorizedRank = 0;
        for (const ref of list) {
          const candidate = await authorizedRecord(ref);
          if (candidate.kind === 'stop') return candidate.result;
          if (candidate.kind === 'skip') continue;
          const prior = candidates.get(key(ref));
          candidates.set(key(ref), { ref, rank: (prior?.rank ?? 0) + 1 / (60 + authorizedRank + 1) });
          authorizedRank++;
        }
      }
      const refs = [...candidates.values()].sort((a, b) => b.rank - a.rank || key(a.ref).localeCompare(key(b.ref))).map(item => item.ref);
      return page(request.query, refs, 0, 0, request, revision);
    },
  };
}

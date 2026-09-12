import { SearchResultSchema, EvidenceResultSchema, KnowledgeExportResultSchema, type RecordRef, type SearchResult, type KnowledgeRecord, type KnowledgeLink } from '@drawloom/knowledge';
import { KnowledgeCommandSchema, KnowledgeStatusSchema, KnowledgeConfigurationSchema, type KnowledgeCommand, type KnowledgeStatus } from './knowledge-protocol.js';
import { knowledgeCopy, type KnowledgePresentation, type KnowledgeActions } from './knowledge-presentation.js';
import { telemetryFetch } from './telemetry.js';
import { serializeKnowledgeExport } from './knowledge-export.js';

async function send(command: KnowledgeCommand, signal?: AbortSignal): Promise<unknown> {
  const response = await telemetryFetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(KnowledgeCommandSchema.parse(command)), ...(signal ? { signal } : {}) });
  if (!response.ok) throw Error('Knowledge is unavailable. Refresh status for setup details.');
  return response.json();
}
function outcomeMessage(value: { kind: string; code?: string }): string {
  if (value.kind === 'denied') return 'You do not have permission to read or change this knowledge.';
  if (value.kind === 'invalid_cursor' || value.kind === 'invalidated') return 'Knowledge changed. Start from the first page again.';
  if (value.code === 'too_large') return 'This evidence exceeds the page limit. Inspect a smaller part of the chain.';
  return 'Knowledge is unavailable. Your existing records have not been replaced.';
}
export function createKnowledgeViewModel(options: { send?: typeof send; download?: (text: string) => void } = {}) {
  const request = options.send ?? send;
  let query = $state(''), results = $state<Extract<SearchResult, { kind: 'ok' }>['items']>([]);
  let evidence = $state<{ records: KnowledgeRecord[]; links: KnowledgeLink[] }>();
  let selected = $state<RecordRef>(), status = $state<KnowledgeStatus>();
  let error = $state(''), searchStatus = $state(''), searched = $state(false);
  let searchPending = $state(false), evidencePending = $state(false), statusPending = $state(false), pendingAction = $state<string>();
  let resultCursor: string | undefined, evidenceCursor: string | undefined;
  let hasMoreResults = $state(false), hasMoreEvidence = $state(false);
  let epoch = 0, statusVersion = 0, searchVersion = 0, evidenceVersion = 0, searchRead = new AbortController(), evidenceRead = new AbortController();
  const fail = (cause: unknown) => { error = cause instanceof Error ? cause.message : 'Knowledge is unavailable.'; };
  async function refresh() {
    if (statusPending) return;
    const version = epoch, readVersion = statusVersion; statusPending = true;
    try { const next = KnowledgeStatusSchema.parse(await request({ action: 'status' })); if (version === epoch && readVersion === statusVersion) status = next; }
    catch (cause) { if (version === epoch && readVersion === statusVersion) fail(cause); }
    finally { if (version === epoch) statusPending = false; }
  }
  async function command(value: KnowledgeCommand, key: string = value.action) {
    // Cancel remains available during an ongoing download request.
    if (pendingAction && value.action !== 'cancel_download') return;
    const version = epoch, actionKey = key; statusVersion++; pendingAction = actionKey; error = '';
    try { const next = KnowledgeStatusSchema.parse(await request(value)); if (version === epoch && pendingAction === actionKey) { statusVersion++; status = next; } }
    catch (cause) { if (version === epoch && pendingAction === actionKey) fail(cause); }
    finally { if (version === epoch && pendingAction === actionKey) pendingAction = undefined; }
  }
  const actions: KnowledgeActions = {
    setQuery(value) { query = value; },
    async search(more = false) {
      if (!query.trim() || (more && !resultCursor)) return;
      searchRead.abort(); searchRead = new AbortController();
      const version = ++searchVersion, life = epoch; searchPending = true; error = '';
      try {
        const result = SearchResultSchema.parse(await request({ action: 'search', request: { query: query.trim(), mode: 'best_available', limit: 20, maxBytes: 128 * 1024, ...(more && resultCursor ? { cursor: resultCursor as never } : {}) } }, searchRead.signal));
        if (version !== searchVersion || life !== epoch) return;
        if (result.kind !== 'ok') { results = []; resultCursor = undefined; hasMoreResults = false; throw Error(outcomeMessage(result)); }
        results = result.items; resultCursor = result.cursor; hasMoreResults = Boolean(result.cursor); searched = true;
        searchStatus = result.mode === 'hybrid' ? 'Text and local semantic search' : 'Text search · semantic index is unavailable or rebuilding';
      } catch (cause) { if (version === searchVersion && life === epoch) fail(cause); }
      finally { if (version === searchVersion && life === epoch) searchPending = false; }
    },
    async inspect(ref, more = false) {
      if (more && !evidenceCursor) return;
      evidenceRead.abort(); evidenceRead = new AbortController();
      const version = ++evidenceVersion, life = epoch;
      if (!more) { evidence = undefined; evidenceCursor = undefined; hasMoreEvidence = false; }
      selected = ref; evidencePending = true; error = '';
      try {
        const result = EvidenceResultSchema.parse(await request({ action: 'evidence', request: { root: ref, direction: 'forward', maxDepth: 32, maxRecords: 20, maxLinks: 40, maxBytes: 256 * 1024, ...(more && evidenceCursor ? { cursor: evidenceCursor as never } : {}) } }, evidenceRead.signal));
        if (version !== evidenceVersion || life !== epoch) return;
        if (result.kind !== 'ok') { evidence = undefined; evidenceCursor = undefined; hasMoreEvidence = false; throw Error(outcomeMessage(result)); }
        evidence = { records: result.records, links: result.links }; evidenceCursor = result.cursor; hasMoreEvidence = Boolean(result.cursor);
      } catch (cause) { if (version === evidenceVersion && life === epoch) fail(cause); }
      finally { if (version === evidenceVersion && life === epoch) evidencePending = false; }
    },
    refresh,
    async configure(value) { try { await command({ action: 'configure', configuration: KnowledgeConfigurationSchema.parse(value) }); } catch (cause) { fail(cause); } },
    run: overrideBudget => command({ action: 'run', overrideBudget }),
    source: enabled => command({ action: 'source', enabled }, enabled ? 'source:start' : 'source:stop'),
    pause: paused => command({ action: 'pause', paused }),
    download: model => command({ action: 'download', model, consent: true }, 'download:' + model),
    cancelDownload: model => command({ action: 'cancel_download', model }, 'cancel_download:' + model),
    async export() {
      if (!evidence?.records.length || pendingAction) return;
      const life = epoch; pendingAction = 'export'; error = '';
      try {
        const value = KnowledgeExportResultSchema.parse(await request({ action: 'export', request: { format: 'okf', refs: evidence.records.map(record => record.ref), maxBytes: 1024 * 1024 } }));
        if (life !== epoch) return;
        if (value.kind !== 'ok') throw Error(outcomeMessage(value));
        const content = await serializeKnowledgeExport(value);
        if (life !== epoch) return;
        if (options.download) options.download(content);
        else { const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'drawloom-knowledge.okf.md'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      } catch (cause) { if (life === epoch) fail(cause); }
      finally { if (life === epoch) pendingAction = undefined; }
    },
  };
  const presentation: KnowledgePresentation = {
    copy: knowledgeCopy,
    get query() { return query; }, get results() { return results; }, get evidence() { return evidence; }, get selected() { return selected; },
    get searched() { return searched; }, get searchPending() { return searchPending; }, get evidencePending() { return evidencePending; },
    get statusPending() { return statusPending; }, get pendingAction() { return pendingAction; }, get status() { return status; },
    get hasMoreResults() { return hasMoreResults; }, get hasMoreEvidence() { return hasMoreEvidence; },
    get error() { return error; }, get searchStatus() { return searchStatus; }, get configuration() { return status?.configuration; },
  };
  return { presentation, actions, open: refresh, close() { epoch++; searchVersion++; evidenceVersion++; searchRead.abort(); evidenceRead.abort(); results = []; evidence = undefined; selected = undefined; statusPending = false; searchPending = false; evidencePending = false; pendingAction = undefined; } };
}

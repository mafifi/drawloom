import { HistoryPageSchema, HistoryChangesSchema, type HistoryEntry, type ConversationHistoryStatus } from '@drawloom/conversation-history';

export type HistoryPresentation = {
  entries: HistoryEntry[]; loading: boolean; loadingEarlier?: boolean; error: string; hasOlder: boolean;
  atLatest: boolean; status?: ConversationHistoryStatus | undefined;
};
const compare = (a: HistoryEntry, b: HistoryEntry) => a.position[0] - b.position[0] || a.position[1] - b.position[1] || a.id.localeCompare(b.id);

/** Navigation epochs isolate reads; at most 200 rows are retained for rendering. */
export function createHistoryPager(request: (url: string, init?: RequestInit) => Promise<Response>, changed: (value: HistoryPresentation) => void = () => {}) {
  let value: HistoryPresentation = { entries: [], loading: false, error: '', hasOlder: false, atLatest: true };
  let conversationId = '', epoch = 0, olderCursor: string | undefined, changeCursor: string | undefined;
  let pollingEpoch: number | undefined;
  let reads = new AbortController();
  let etag: string | undefined;
  const publish = (patch: Partial<HistoryPresentation>) => { value = { ...value, ...patch }; changed(value); };
  const url = (path: string, values: Record<string, string>) => path + '?' + new URLSearchParams({ conversationId, ...values });
  async function load(older: boolean) {
    if (!conversationId || (value.loading && older)) return;
    const captured = epoch;
    publish({ loading: true, loadingEarlier: older, error: '' });
    try {
      const response = await request(url('/api/history', { limit: '50', ...(older && olderCursor ? { before: olderCursor } : {}) }), { signal: reads.signal });
      if (!response.ok) throw Error('Stored history could not be loaded. Your previous messages are retained.');
      const page = HistoryPageSchema.parse(await response.json());
      if (captured !== epoch) return;
      const combined = older ? [...page.entries, ...value.entries] : page.entries;
      const entries = [...new Map(combined.map(entry => [entry.id, entry])).values()].sort(compare);
      if (!older || page.entries.length || !page.hasOlder) olderCursor = page.olderCursor;
      if (!older) { changeCursor = page.changeCursor; etag = response.headers.get('etag') ?? undefined; }
      publish({ entries: entries.slice(0, 200), hasOlder: page.hasOlder, status: page.status, atLatest: !older });
    } catch (error) { if (captured === epoch) publish({ error: error instanceof Error ? error.message : 'History unavailable' }); }
    finally { if (captured === epoch) publish({ loading: false }); }
  }
  return {
    get value() { return value; },
    async open(id: string) {
      reads.abort(); reads = new AbortController();
      epoch++; conversationId = id; olderCursor = undefined; changeCursor = undefined; etag = undefined;
      publish({ entries: [], loading: false, error: '', hasOlder: false, atLatest: true, status: undefined });
      await load(false);
    },
    earlier: () => load(true),
    async latest() { reads.abort(); reads = new AbortController(); epoch++; await load(false); },
    async poll() {
      if (pollingEpoch === epoch || value.loading || !conversationId) return;
      if (!changeCursor) { await load(false); return; }
      const captured = epoch;
      pollingEpoch = captured;
      try {
        const response = await request(url('/api/history/changes', { after: changeCursor, limit: '200' }), { signal: reads.signal, headers: etag ? { 'If-None-Match': etag } : {} });
        if (response.status === 204) return;
        if (response.status === 409) { if (captured === epoch) await load(false); return; }
        if (!response.ok) throw Error('History updates are unavailable. Cached messages are still readable.');
        const changes = HistoryChangesSchema.parse(await response.json());
        if (captured !== epoch) return;
        // A cached empty view can precede background native bootstrap. Obtain the
        // bounded latest page and its older boundary once records become available.
        if (value.atLatest && ((!value.entries.length && changes.entries.length) || (!olderCursor && changes.status.hasOlder))) { await load(false); return; }
        const records = new Map(value.entries.map(entry => [entry.id, entry]));
        const first = value.entries[0];
        for (const entry of changes.entries) if (records.has(entry.id) || (value.atLatest && (!first || compare(entry, first) >= 0))) records.set(entry.id, entry);
        const entries = [...records.values()].sort(compare);
        if (value.atLatest && entries.length > 200) { await load(false); return; }
        publish({ entries: value.atLatest ? entries.slice(-200) : entries, status: changes.status, error: '', hasOlder: value.hasOlder || changes.status.hasOlder || entries.length > 200 });
        changeCursor = changes.cursor;
        etag = response.headers.get('etag') ?? undefined;
        // One bounded response per poll even when catching up a large backlog.
      } catch (error) { if (captured === epoch) publish({ error: error instanceof Error ? error.message : 'History unavailable' }); }
      finally { if (pollingEpoch === captured) pollingEpoch = undefined; }
    },
    invalidate() { reads.abort(); reads = new AbortController(); epoch++; publish({ loading: false }); },
  };
}

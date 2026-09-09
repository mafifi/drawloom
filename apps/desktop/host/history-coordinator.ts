import {
  HistoryEntrySchema, HistoryReadBatchSchema, HistoryReadError,
  type ConversationHistoryReader, type ConversationHistoryStore, type HistoryEntry,
} from '@drawloom/conversation-history';
import type { Asset } from '@drawloom/host';

export function createHistoryCoordinator(store: ConversationHistoryStore, conversationId: string) {
  let queue: Promise<unknown> = Promise.resolve();
  let error = '';
  let syncing = false;
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, Omit<HistoryEntry, 'position'> & { assetOnly?: boolean }>();
  const mergeAssets = (left: Asset[], right: Asset[]) => [...new Map([...left, ...right].map(asset => [asset.key, asset])).values()];
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work); queue = next.catch(() => {}); return next;
  };
  function failed() { error = 'History is not synchronized. The last saved messages are retained; execution is not retried.'; }
  async function flush() {
    clearTimeout(timer); timer = undefined;
    const updates = [...pending.values()]; pending.clear();
    if (!updates.length) return;
    await serial(async () => {
      try {
        const status = await store.status(conversationId);
        const newest = (await store.page(conversationId, { limit: 1 })).entries[0];
        let rank = newest?.position[0] ?? 0;
        const entries: HistoryEntry[] = [];
        for (const update of updates) {
          const previous = await store.get(conversationId, update.id);
          const { assetOnly, ...content } = update;
          entries.push(HistoryEntrySchema.parse({ ...content,
            ...(previous?.operationId && !content.operationId ? { operationId: previous.operationId } : {}),
            text: assetOnly && previous ? previous.text : content.text,
            assets: mergeAssets(previous?.assets ?? [], content.assets),
            state: assetOnly && previous ? previous.state : content.state,
            position: previous?.position ?? [++rank, 0],
          }));
        }
        await store.commit(conversationId, { expectedRevision: status.revision, entries });
        // Only reconciliation can clear a failed-write warning: a later unrelated
        // successful write does not prove the missing message was recovered.
      } catch { failed(); }
    });
  }
  return {
    get error() { return error; },
    get syncing() { return syncing; },
    reportStorageFailure: failed,
    async write(entry: Omit<HistoryEntry, 'position'>) {
      pending.set(entry.id, { ...entry, assets: mergeAssets(pending.get(entry.id)?.assets ?? [], entry.assets) });
      if (entry.state !== 'partial') await flush();
      else timer ??= setTimeout(() => { void flush(); }, 100);
    },
    async writeAsset(id: string, operationId: string, asset: Asset) {
      const previous = pending.get(id);
      pending.set(id, previous ? { ...previous, assets: mergeAssets(previous.assets, [asset]) } : {
        id, operationId, role: 'assistant', text: 'Image result', assets: [asset], state: 'complete', assetOnly: true,
      });
      await flush();
    },
    flush,
    async synchronize(reader: ConversationHistoryReader | undefined, direction: 'latest' | 'older' = 'latest') {
      await flush();
      let more = false;
      do {
      if (closing) break;
      more = false;
      await serial(async () => {
        syncing = true;
        try {
          const status = await store.status(conversationId);
          if (!reader) {
            await store.commit(conversationId, { expectedRevision: status.revision, sync: { sync: 'unsupported', message: 'This provider does not expose conversation history.' } });
            return;
          }
          const batch = HistoryReadBatchSchema.parse(await reader.read({
            checkpoint: key => store.checkpoint(conversationId, reader.namespace, key),
            get: id => store.get(conversationId, id),
          }, { direction, limit: 50 }));
          const committed = await store.commit(conversationId, {
            expectedRevision: status.revision, entries: batch.entries,
            checkpoints: batch.checkpoints.map(checkpoint => ({ ...checkpoint, namespace: reader.namespace })),
            sync: { sync: 'idle', hasOlder: batch.hasOlder },
          });
          if (direction === 'latest' && batch.hasMore) {
            if (committed.revision === status.revision) throw new HistoryReadError('error', 'History reconciliation made no progress.');
            more = true;
          }
          error = '';
        } catch (cause) {
          failed();
          if (cause instanceof HistoryReadError) {
            try {
              const status = await store.status(conversationId);
              const message = {
                unsupported: 'This provider does not expose conversation history.',
                unavailable: 'Provider history is unavailable. Saved messages remain readable.',
                error: 'History synchronization failed. Saved messages are retained; execution is not retried.',
              }[cause.status];
              await store.commit(conversationId, { expectedRevision: status.revision, sync: { sync: cause.status, message } });
              error = '';
            } catch { failed(); }
          }
        } finally { syncing = false; }
      });
      // Release the queue between batches so live terminal writes and cached page
      // requests are not held behind a long metadata reconciliation.
      if (more) await new Promise<void>(resolve => setTimeout(resolve, 0));
      } while (more);
    },
    async unavailable() {
      await serial(async () => {
        try {
          const status = await store.status(conversationId);
          await store.commit(conversationId, { expectedRevision: status.revision, sync: { sync: 'unavailable', message: 'Provider unavailable. Saved history is still readable.' } });
        } catch { failed(); }
      });
    },
    async close() { closing = true; await flush(); await queue; },
  };
}

import { z } from "zod";
import { HistoryReadBatchSchema, HistoryReadError, type ConversationHistoryReader, type HistoryEntry, type HistoryReadContext } from "@drawloom/conversation-history";
import type { Asset } from "@drawloom/host";

const turnsPage = z.object({ data: z.array(z.record(z.string(), z.unknown())).max(50), nextCursor: z.string().nullable() });
const itemsPage = z.object({ data: z.array(z.record(z.string(), z.unknown())).max(1), nextCursor: z.string().nullable() });
const timestamp = z.union([z.string().max(128), z.number().finite()]);
const savedTurn = z.object({
  id: z.string().min(1), status: z.string().optional(), completedAt: timestamp.optional(),
  startedAt: timestamp.optional(), durationMs: z.number().finite().nonnegative().optional(),
}).strip();
const backfillSchema = z.object({
  nextTurnCursor: z.string().nullable(), pending: z.array(savedTurn).max(50), activeItemCursor: z.string().nullable(),
  activeItemIds: z.array(z.string()).max(8).default([]), activeCursors: z.array(z.string()).max(8).default([]),
  mode: z.enum(["latest", "older"]).default("older"), anchor: z.tuple([z.number().int().safe(), z.number().int().safe()]).nullable().default(null),
  recoveryEpoch: z.number().int().nonnegative().default(0),
  traversalId: z.string().default("legacy"),
});
const boundsSchema = z.object({ min: z.number().int().safe(), max: z.number().int().safe() });
const turnSignatures = z.array(savedTurn).max(50);
class InvalidNativeCursor extends Error {}

/** Stable, opaque public identity for one native display item. */
export async function nativeMessageId(nativeId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nativeId));
  return `message-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

type NativeDisplay = {
  nativeId: string;
  id: string;
  role: "user" | "assistant";
  text: string;
  assets: Asset[];
  operationId?: string;
  state: "partial" | "complete" | "interrupted";
};

export function createCodexHistoryReader(
  request: (method: string, params: unknown) => Promise<unknown>,
  threadId: string,
  operations: Record<string, string>,
  captureImage?: (result: string) => Promise<Asset>,
): ConversationHistoryReader {
  const captured = new Map<string, Promise<Asset>>();
  const publicHistoryId = async (turnId: string, itemId: string) => operations[turnId]
    ? `${operations[turnId]}:${await nativeMessageId(itemId)}`
    : `history-${(await nativeMessageId(`${threadId}\0${turnId}\0${itemId}`)).slice(8)}`;
  const coverageKey = async (turnId: string) => `turn:${(await nativeMessageId(turnId)).slice(8)}`;
  const cursorKey = async (kind: "item" | "turn", cursor: string, scope = "") => `${kind}-cursor:${(await nativeMessageId(`${scope}\0${cursor}`)).slice(8)}`;
  const itemKey = async (turnId: string, signature: string, epoch: number, itemId: string) => `item-seen:${(await nativeMessageId(`${turnId}\0${signature}\0${epoch}\0${itemId}`)).slice(8)}`;
  const nativePage = async (method: string, params: unknown, schema: typeof turnsPage | typeof itemsPage) => {
    let value: unknown;
    try {
      value = await request(method, params);
    } catch (cause) {
      const code = typeof cause === "object" && cause !== null && "code" in cause ? (cause as { code?: unknown }).code : undefined;
      if (code === -32601) throw new HistoryReadError("unsupported", "Native conversation history is unsupported by this provider.");
      if (code === -32602) throw new InvalidNativeCursor();
      throw new HistoryReadError("unavailable", "Native conversation history is unavailable.");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new HistoryReadError("error", "Native conversation history returned invalid data.");
    return parsed.data;
  };

  async function displayItem(turnId: string, status: string | undefined, raw: Record<string, unknown>, context: HistoryReadContext): Promise<NativeDisplay | undefined> {
    if (raw.turnId !== turnId) throw new HistoryReadError("error", "Invalid history correlation.");
    let item: Record<string, unknown>;
    let nativeId: string;
    try {
      item = z.record(z.string(), z.unknown()).parse(raw.item);
      nativeId = z.string().min(1).parse(item.id);
    } catch {
      throw new HistoryReadError("error", "Native conversation history returned invalid item data.");
    }
    const id = await publicHistoryId(turnId, nativeId);
    const operationId = operations[turnId];
    const terminal = status === "completed" || status === "interrupted" || status === "failed";
    const common = {
      nativeId, id,
      ...(operationId ? { operationId } : {}),
      state: status === "completed" ? "complete" as const : terminal ? "interrupted" as const : "partial" as const,
    };
    if (item.type === "agentMessage") {
      const text = z.string().safeParse(item.text);
      if (!text.success) throw new HistoryReadError("error", "Native conversation history returned invalid item data.");
      return { ...common, role: "assistant", text: text.data, assets: [] };
    }
    if (item.type === "userMessage") {
      const content = z.array(z.record(z.string(), z.unknown())).safeParse(item.content);
      if (!content.success) throw new HistoryReadError("error", "Native conversation history returned invalid item data.");
      const texts = content.data.filter(value => value.type === "text").map(value => z.string().safeParse(value.text));
      if (texts.some(value => !value.success)) throw new HistoryReadError("error", "Native conversation history returned invalid item data.");
      const existing = await context.get(id);
      return { ...common, role: "user", text: texts.map(value => value.data).join("\n"), assets: existing?.assets ?? [] };
    }
    if (item.type === "imageGeneration" && item.status === "completed" && captureImage) {
      const existing = await context.get(id);
      if (existing?.assets.some(asset => asset.mediaType.startsWith("image/"))) return { ...common, role: "assistant", text: existing.text, assets: existing.assets };
      let asset = captured.get(id);
      if (!asset) {
        const result = z.string().safeParse(item.result);
        if (!result.success) throw new HistoryReadError("error", "Native conversation history returned invalid item data.");
        asset = captureImage(result.data);
        captured.set(id, asset);
      }
      try {
        return { ...common, role: "assistant", text: existing?.text ?? "Image result", assets: [await asset] };
      } catch {
        captured.delete(id);
        throw new HistoryReadError("error", "Historical image capture failed.");
      }
    }
    return undefined;
  }

  async function positionItems(itemsDescending: NativeDisplay[], context: HistoryReadContext, direction: "latest" | "older", bounds: { min: number; max: number }, newerPosition?: readonly [number, number]) {
    const chronological = [...itemsDescending].reverse();
    const stored = await Promise.all(chronological.map(item => context.get(item.id)));
    const anchorIndex = stored.findIndex(Boolean);
    const output: HistoryEntry[] = [];
    let created = 0;
    const entry = (item: NativeDisplay, position: readonly [number, number]): HistoryEntry => {
      const { nativeId: _, ...visible } = item;
      return { ...visible, position };
    };
    if (anchorIndex >= 0) {
      const anchor = stored[anchorIndex]!;
      for (let index = 0; index < chronological.length; index++) {
        const item = chronological[index]!;
        const existing = stored[index];
        if (existing) {
          bounds.min = Math.min(bounds.min, existing.position[0]);
          bounds.max = Math.max(bounds.max, existing.position[0]);
          const updated = entry(existing.state === "complete" && item.state === "partial" ? { ...item, state: "complete" } : item, existing.position);
          if (updated.role !== existing.role || updated.text !== existing.text || updated.state !== existing.state || updated.operationId !== existing.operationId || JSON.stringify(updated.assets) !== JSON.stringify(existing.assets)) output.push(updated);
          continue;
        }
        created++;
        output.push(entry(item, [anchor.position[0], anchor.position[1] + index - anchorIndex]));
      }
      return { entries: output, minPosition: output[0]?.position ?? anchor.position, created };
    }
    if (direction === "older") {
      const ceiling = newerPosition?.[0] ?? bounds.min;
      let rank = ceiling - chronological.length;
      for (const item of chronological) output.push(entry(item, [rank++, 0]));
      created += chronological.length;
      if (chronological.length) bounds.min = Math.min(bounds.min, ceiling - chronological.length);
    } else {
      const primary = newerPosition?.[0] ?? bounds.max + 1;
      let secondary = newerPosition ? newerPosition[1] - chronological.length : 0;
      for (const item of chronological) output.push(entry(item, [primary, secondary++]));
      created += chronological.length;
      if (chronological.length) bounds.max = Math.max(bounds.max, primary);
    }
    return { entries: output, minPosition: output[0]?.position, created };
  }

  const read = async (context: HistoryReadContext, options: { direction: "latest" | "older"; limit: number }) => {
      const limit = z.number().int().min(1).max(200).parse(options.limit);
      const savedBounds = boundsSchema.safeParse(await context.checkpoint("bounds"));
      const bounds = savedBounds.success ? { ...savedBounds.data } : { min: 0, max: -1 };
      const savedBackfill = backfillSchema.safeParse(await context.checkpoint("backfill"));
      const savedLatestContinuation = backfillSchema.safeParse(await context.checkpoint("latest-continuation"));
      const savedHead = turnSignatures.safeParse(await context.checkpoint("latest-covered"));
      const savedUnfinished = turnSignatures.safeParse(await context.checkpoint("unfinished"));
      const savedUnfinishedScan = z.string().nullable().safeParse(await context.checkpoint("unfinished-scan"));
      const entries: HistoryEntry[] = [];
      const checkpoints: { key: string; value: unknown }[] = [];
      const useLatestContinuation = options.direction === "older" && savedLatestContinuation.success;
      const state = useLatestContinuation ? savedLatestContinuation.data : savedBackfill.success ? savedBackfill.data : undefined;
      const unfinished = new Map((savedUnfinished.success ? savedUnfinished.data : []).map(turn => [turn.id, turn]));
      const coveredHead = new Map((savedHead.success ? savedHead.data : []).map(turn => [turn.id, JSON.stringify(turn)]));
      const nextHeadCoverage: z.infer<typeof savedTurn>[] = [];
      let pending: z.infer<typeof savedTurn>[];
      let nextTurnCursor: string | null;
      let itemCursor: string | null;
      let activeItemIds: string[];
      let activeCursors: string[];
      let traversalMode: "latest" | "older";
      let recoveryEpoch: number;
      let traversalId: string;
      const discoveredUnfinished: z.infer<typeof savedTurn>[] = [];
      let nextUnfinishedScan: string | null = null;
      if (options.direction === "older" && state) {
        pending = [...state.pending]; nextTurnCursor = state.nextTurnCursor; itemCursor = state.activeItemCursor;
        activeItemIds = [...state.activeItemIds]; activeCursors = [...state.activeCursors];
        traversalMode = state.mode;
        recoveryEpoch = state.recoveryEpoch;
        traversalId = state.traversalId;
      } else {
        const head = await nativePage("thread/turns/list", { threadId, limit: 50, sortDirection: "desc", itemsView: "notLoaded" }, turnsPage);
        pending = head.data.map(value => savedTurn.parse(value)); nextTurnCursor = head.nextCursor; itemCursor = null; activeItemIds = []; activeCursors = [];
        traversalMode = "latest";
        recoveryEpoch = 0;
        traversalId = (await nativeMessageId(JSON.stringify(pending))).slice(8);
        const present = new Set(pending.map(turn => turn.id));
        let scanCursor = savedUnfinishedScan.success && savedUnfinishedScan.data ? savedUnfinishedScan.data : head.nextCursor;
        const scanSeen = new Set<string>();
        for (let scans = 0; scans < 3 && scanCursor && [...unfinished.keys()].some(id => !present.has(id)); scans++) {
          if (scanSeen.has(scanCursor)) throw new HistoryReadError("error", "Invalid history cursor.");
          scanSeen.add(scanCursor);
          const requested = scanCursor;
          let scanned;
          try { scanned = await nativePage("thread/turns/list", { threadId, limit: 50, sortDirection: "desc", itemsView: "notLoaded", cursor: scanCursor }, turnsPage); }
          catch (cause) {
            if (!(cause instanceof InvalidNativeCursor)) throw cause;
            scanCursor = head.nextCursor;
            break;
          }
          for (const value of scanned.data) {
            const turn = savedTurn.parse(value);
            if (unfinished.has(turn.id) && !present.has(turn.id)) { discoveredUnfinished.push(turn); present.add(turn.id); }
          }
          const unfinishedScope = `unfinished\0${JSON.stringify([...unfinished.values()])}`;
          if (scanned.nextCursor === scanCursor || (scanned.nextCursor && await context.checkpoint(await cursorKey("turn", scanned.nextCursor, unfinishedScope)) === true)) throw new HistoryReadError("error", "Invalid history cursor.");
          checkpoints.push({ key: await cursorKey("turn", requested, unfinishedScope), value: true });
          scanCursor = scanned.nextCursor;
        }
        nextUnfinishedScan = scanCursor;
      }
      let newerPosition: readonly [number, number] | undefined = options.direction === "older" ? state?.anchor ?? undefined : undefined;
      let turnsVisited = 0;
      let itemRequests = 0;
      let createdEntries = 0;
      const seenCursors = new Set<string>();
      while (turnsVisited < 200 && itemRequests < 200) {
        if (!pending.length) {
          if (discoveredUnfinished.length) { pending = discoveredUnfinished.splice(0, 50); itemCursor = null; continue; }
          if (!nextTurnCursor || options.direction === "latest") break;
          const requestedTurnCursor = nextTurnCursor;
          let turnReconciling = false;
          let pageValue;
          try {
            pageValue = await nativePage("thread/turns/list", { threadId, limit: 50, sortDirection: "desc", itemsView: "notLoaded", cursor: nextTurnCursor }, turnsPage);
          } catch (cause) {
            if (!(cause instanceof InvalidNativeCursor)) throw cause;
            turnReconciling = true;
            recoveryEpoch++;
            traversalId = (await nativeMessageId(`${traversalId}\0recovery\0${recoveryEpoch}`)).slice(8);
            pageValue = await nativePage("thread/turns/list", { threadId, limit: 50, sortDirection: "desc", itemsView: "notLoaded" }, turnsPage);
          }
          if (!pageValue.data.length && !pageValue.nextCursor) { nextTurnCursor = null; break; }
          const turnScope = `${traversalId}\0${recoveryEpoch}`;
          if (!turnReconciling && (pageValue.nextCursor === requestedTurnCursor || await context.checkpoint(await cursorKey("turn", pageValue.nextCursor ?? "", turnScope)) === true)) throw new HistoryReadError("error", "Invalid history cursor.");
          checkpoints.push({ key: await cursorKey("turn", requestedTurnCursor, turnScope), value: true });
          pending = pageValue.data.map(value => savedTurn.parse(value)); nextTurnCursor = pageValue.nextCursor; itemCursor = null;
        }
        const turn = pending[0]!;
        const terminal = turn.status === "completed" || turn.status === "interrupted" || turn.status === "failed";
        const key = await coverageKey(turn.id);
        const savedCoverage = savedTurn.safeParse(await context.checkpoint(key));
        const signature = JSON.stringify(turn);
        const sameCoverage = savedCoverage.success && JSON.stringify(savedCoverage.data) === signature;
        const sameHead = options.direction === "latest" && terminal && coveredHead.get(turn.id) === signature;
        if (terminal && (sameCoverage || sameHead)) {
          nextHeadCoverage.push(turn);
          unfinished.delete(turn.id);
          pending.shift(); itemCursor = null; activeItemIds = []; activeCursors = []; turnsVisited++; continue;
        }
        if (!terminal) unfinished.set(turn.id, turn);
        else unfinished.delete(turn.id);
        let items;
        let reconciling = false;
        try {
          items = await nativePage("thread/items/list", { threadId, turnId: turn.id, limit: 1, sortDirection: "desc", ...(itemCursor ? { cursor: itemCursor } : {}) }, itemsPage);
        } catch (cause) {
          if (!(cause instanceof InvalidNativeCursor) || !itemCursor) throw cause;
          itemCursor = null; activeItemIds = []; activeCursors = [];
          recoveryEpoch++;
          reconciling = true;
          items = await nativePage("thread/items/list", { threadId, turnId: turn.id, limit: 1, sortDirection: "desc" }, itemsPage);
        }
        itemRequests++;
        const nativeItems: NativeDisplay[] = [];
        for (const raw of items.data) {
          let itemId: string;
          try { itemId = z.string().min(1).parse(z.record(z.string(), z.unknown()).parse(raw.item).id); }
          catch { throw new HistoryReadError("error", "Native conversation history returned invalid item data."); }
          const seenItemKey = await itemKey(turn.id, signature, recoveryEpoch, itemId);
          if (await context.checkpoint(seenItemKey) === true) {
            if (itemCursor && options.direction === "older" && !reconciling) throw new HistoryReadError("error", "Invalid history cursor.");
            if (reconciling) continue;
          }
          if (activeItemIds.includes(itemId)) throw new HistoryReadError("error", "Invalid history cursor.");
          activeItemIds = [...activeItemIds.slice(-7), itemId];
          checkpoints.push({ key: seenItemKey, value: true });
          const item = await displayItem(turn.id, turn.status, raw, context); if (item) nativeItems.push(item);
        }
        const positioned = await positionItems(nativeItems, context, traversalMode, bounds, newerPosition);
        if (entries.length + positioned.entries.length > limit) break;
        entries.push(...positioned.entries);
        createdEntries += positioned.created;
        if (positioned.minPosition !== undefined) newerPosition = positioned.minPosition;
        if (items.nextCursor) {
          const itemScope = `${turn.id}\0${signature}\0${recoveryEpoch}`;
          if (!reconciling && (items.nextCursor === itemCursor || activeCursors.includes(items.nextCursor) || await context.checkpoint(await cursorKey("item", items.nextCursor, itemScope)) === true)) throw new HistoryReadError("error", "Invalid history cursor.");
          if (itemCursor) checkpoints.push({ key: await cursorKey("item", itemCursor, itemScope), value: true });
          const scopedCursor = `${itemScope}\0${items.nextCursor}`;
          if (seenCursors.has(scopedCursor)) throw new HistoryReadError("error", "Invalid history cursor.");
          seenCursors.add(scopedCursor); activeCursors = [...activeCursors.slice(-7), items.nextCursor]; itemCursor = items.nextCursor;
          if (options.direction === "latest" && terminal) nextHeadCoverage.push(turn);
          if (entries.length >= limit) break;
        } else {
          if (terminal) { checkpoints.push({ key, value: turn }); nextHeadCoverage.push(turn); }
          pending.shift(); itemCursor = null; activeItemIds = []; activeCursors = []; turnsVisited++;
          if (entries.length >= limit) break;
        }
      }
      if (!pending.length && itemCursor === null && nextTurnCursor === null && options.direction === "latest") traversalMode = "older";
      const newBackfill = { nextTurnCursor, pending: pending.slice(0, 50), activeItemCursor: itemCursor, activeItemIds, activeCursors, mode: traversalMode, anchor: newerPosition ?? null, recoveryEpoch, traversalId };
      const latestNeedsContinuation = options.direction === "latest" && (itemCursor !== null || pending.length > 0 || createdEntries > 0 && nextTurnCursor !== null);
      if (options.direction === "latest" && latestNeedsContinuation && savedBackfill.success) checkpoints.push({ key: "latest-continuation", value: newBackfill });
      else if (options.direction === "latest" && latestNeedsContinuation) checkpoints.push({ key: "backfill", value: newBackfill });
      else if (options.direction === "older" && useLatestContinuation) checkpoints.push({ key: "latest-continuation", value: newBackfill.pending.length || newBackfill.nextTurnCursor ? newBackfill : null });
      else if (options.direction === "older") checkpoints.push({ key: "backfill", value: newBackfill });
      else if (!savedBackfill.success) checkpoints.push({ key: "backfill", value: newBackfill });
      const latestStillOlder = options.direction === "latest" ? latestNeedsContinuation || savedLatestContinuation.success : useLatestContinuation && (newBackfill.pending.length > 0 || newBackfill.nextTurnCursor !== null);
      const baseStillOlder = options.direction === "latest" && savedBackfill.success
        ? savedBackfill.data.pending.length > 0 || savedBackfill.data.nextTurnCursor !== null
        : useLatestContinuation ? savedBackfill.success && (savedBackfill.data.pending.length > 0 || savedBackfill.data.nextTurnCursor !== null) : newBackfill.pending.length > 0 || newBackfill.nextTurnCursor !== null;
      const hasOlder = latestStillOlder || baseStillOlder;
      if (options.direction === "latest") checkpoints.push({ key: "latest-covered", value: nextHeadCoverage.slice(0, 50) });
      if (unfinished.size > 50) throw new HistoryReadError("error", "Native conversation history has too much unfinished work for one bounded sync.");
      checkpoints.push({ key: "unfinished", value: [...unfinished.values()].slice(0, 50) });
      if (options.direction === "latest") checkpoints.push({ key: "unfinished-scan", value: unfinished.size ? nextUnfinishedScan : null });
      checkpoints.push({ key: "bounds", value: bounds });
      const hasMore = options.direction === "latest" && unfinished.size > 0 && nextUnfinishedScan !== null;
      return HistoryReadBatchSchema.parse({ entries, checkpoints, hasOlder, hasMore });
  };
  return {
    namespace: "codex-history-v1",
    async read(context, options) {
      try { return await read(context, options); }
      catch (cause) {
        if (cause instanceof HistoryReadError) throw cause;
        if (cause instanceof InvalidNativeCursor) throw new HistoryReadError("error", "Invalid history cursor.");
        throw new HistoryReadError("error", "Native conversation history returned invalid data.");
      }
    },
  };
}

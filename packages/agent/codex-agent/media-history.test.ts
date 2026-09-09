import { expect, test } from "bun:test";
import type { HistoryEntry, HistoryReadContext } from "@drawloom/conversation-history";
import { createCodexHistoryReader, nativeMessageId } from "./src/history.js";

function memoryContext() {
  const checkpoints = new Map<string, unknown>();
  const entries = new Map<string, HistoryEntry>();
  const context: HistoryReadContext = { checkpoint: async key => checkpoints.get(key), get: async id => entries.get(id) };
  return {
    context, entries,
    commit(batch: Awaited<ReturnType<ReturnType<typeof createCodexHistoryReader>["read"]>>) {
      for (const checkpoint of batch.checkpoints) checkpoints.set(checkpoint.key, checkpoint.value);
      for (const entry of batch.entries) entries.set(entry.id, entry);
    },
  };
}

test("native display identity is the Web Crypto SHA-256 digest", async () => {
  expect(await nativeMessageId("native-user")).toBe("message-68e26fb5bcec8902c508c9ee278907db6b7547ad22dbd85ae36f8ab97fe8c24f");
});

test("native chronology inserts an unseen user before its already-stored live assistant", async () => {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const request = async (method: string, raw: unknown) => {
    const params = raw as Record<string, unknown>; calls.push({ method, params });
    if (method === "thread/turns/list") return { data: [{ id: "turn-a", status: "completed" }], nextCursor: null };
    const items = [
      { turnId: "turn-a", item: { id: "user-native", type: "userMessage", content: [{ type: "text", text: "question" }] } },
      { turnId: "turn-a", item: { id: "assistant-native", type: "agentMessage", text: "answer" } },
    ].reverse();
    const offset = Number(params.cursor ?? 0);
    return { data: items.slice(offset, offset + 1), nextCursor: offset + 1 < items.length ? String(offset + 1) : null };
  };
  const state = memoryContext();
  const assistantId = `operation-a:${await nativeMessageId("assistant-native")}`;
  state.entries.set(assistantId, { id: assistantId, position: [41, 0], role: "assistant", text: "answer", assets: [], operationId: "operation-a", state: "complete" });
  const reader = createCodexHistoryReader(request, "thread", { "turn-a": "operation-a" });
  const batch = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(batch.entries[0]).toMatchObject({ id: `operation-a:${await nativeMessageId("user-native")}`, role: "user", text: "question", assets: [], operationId: "operation-a", state: "complete" });
  expect(batch.entries[0]!.position < state.entries.get(assistantId)!.position).toBe(true);
  expect(calls.filter(call => call.method === "thread/items/list").every(call => call.params.limit === 1)).toBe(true);
});

test("settled turn coverage makes a warm latest read issue zero item payload requests", async () => {
  let itemRequests = 0;
  const request = async (method: string) => {
    if (method === "thread/turns/list") return { data: [{ id: "turn-a", status: "completed" }], nextCursor: null };
    itemRequests++;
    return { data: [{ turnId: "turn-a", item: { id: "a", type: "agentMessage", text: "done" } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  const first = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(first);
  const warm = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(first.entries).toHaveLength(1); expect(warm.entries).toEqual([]); expect(itemRequests).toBe(1);
});

test("a warm read stops at the committed newest turn instead of scanning cached metadata", async () => {
  let turnRequests = 0;
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; limit?: number; turnId?: string };
    if (method === "thread/items/list") return { data: [{ turnId: params.turnId, item: { id: `item-${params.turnId}`, type: "agentMessage", text: String(params.turnId) } }], nextCursor: null };
    turnRequests++;
    const offset = Number(params.cursor ?? 0);
    const turns = Array.from({ length: 2_100 }, (_, index) => ({ id: `turn-${2_099 - index}`, status: "completed" }));
    return { data: turns.slice(offset, offset + 50), nextCursor: offset + 50 < turns.length ? String(offset + 50) : null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  const first = await reader.read(state.context, { direction: "latest", limit: 50 });
  state.commit(first);
  const beforeWarm = turnRequests;
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(turnRequests - beforeWarm).toBe(1);
});

test("failed commit replay returns identical entries from the last committed checkpoint", async () => {
  const request = async (method: string) => method === "thread/turns/list" ? { data: [{ id: "turn-a", status: "completed" }], nextCursor: null } : { data: [{ turnId: "turn-a", item: { id: "a", type: "agentMessage", text: "done" } }], nextCursor: null };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  const first = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(await reader.read(state.context, { direction: "latest", limit: 50 })).toEqual(first);
});

test("captured historical images are reused after their batch commits", async () => {
  let captures = 0;
  const request = async (method: string) => method === "thread/turns/list" ? { data: [{ id: "turn-a", status: "completed" }], nextCursor: null } : { data: [{ turnId: "turn-a", item: { id: "image", type: "imageGeneration", status: "completed", result: "bytes" } }], nextCursor: null };
  const state = memoryContext();
  const reader = createCodexHistoryReader(request, "thread", { "turn-a": "operation-a" }, async () => { captures++; return { key: "asset", mediaType: "image/png", size: 5 }; });
  const first = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(first);
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(captures).toBe(1); expect(first.entries[0]?.assets).toEqual([{ key: "asset", mediaType: "image/png", size: 5 }]);
});

test("cursor loops and cross-turn item correlation are rejected", async () => {
  const loop = createCodexHistoryReader(async method => method === "thread/turns/list" ? { data: [{ id: "turn" }], nextCursor: null } : { data: [], nextCursor: "same" }, "thread", {});
  await expect(loop.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toThrow("Invalid history cursor");
  const crossed = createCodexHistoryReader(async method => method === "thread/turns/list" ? { data: [{ id: "turn" }], nextCursor: null } : { data: [{ turnId: "other", item: { id: "a", type: "agentMessage", text: "x" } }], nextCursor: null }, "thread", {});
  await expect(crossed.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toThrow("Invalid history correlation");
});

test("one huge turn backfills beyond two thousand entries without a ceiling", async () => {
  const total = 2_101;
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "huge", status: "completed" }], nextCursor: null };
    const offset = Number((raw as { cursor?: string }).cursor ?? 0);
    const chronological = total - 1 - offset;
    return {
      data: [{ turnId: "huge", item: { id: `item-${chronological}`, type: "agentMessage", text: `message-${chronological}` } }],
      nextCursor: offset + 1 < total ? String(offset + 1) : null,
    };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  let batch = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(batch);
  while (batch.hasOlder) { batch = await reader.read(state.context, { direction: "older", limit: 200 }); state.commit(batch); }
  const ordered = [...state.entries.values()].sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]);
  expect(ordered).toHaveLength(total);
  expect(ordered[0]?.text).toBe("message-0");
  expect(ordered.at(-1)?.text).toBe("message-2100");
});

test("unfinished coverage restarts independently and appends newly arrived native content", async () => {
  let itemCount = 1;
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "active", status: "inProgress" }], nextCursor: null };
    const offset = Number((raw as { cursor?: string }).cursor ?? 0);
    const items = Array.from({ length: itemCount }, (_, index) => ({ turnId: "active", item: { id: `item-${index}`, type: "agentMessage", text: `message-${index}` } })).reverse();
    return { data: items.slice(offset, offset + 1), nextCursor: offset + 1 < items.length ? String(offset + 1) : null };
  };
  const state = memoryContext();
  let reader = createCodexHistoryReader(request, "thread", {});
  const partial = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(partial);
  itemCount = 2;
  reader = createCodexHistoryReader(request, "thread", {});
  const restarted = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(restarted);
  expect(partial.entries[0]?.state).toBe("partial");
  expect(restarted.entries.map(entry => entry.text)).toEqual(["message-1"]);
  expect(restarted.entries[0]!.position[0] > partial.entries[0]!.position[0] || restarted.entries[0]!.position[1] > partial.entries[0]!.position[1]).toBe(true);
});

test("a completed reread updates a partial record without moving it", async () => {
  let status = "inProgress";
  const request = async (method: string) => method === "thread/turns/list"
    ? { data: [{ id: "turn", status }], nextCursor: null }
    : { data: [{ turnId: "turn", item: { id: "item", type: "agentMessage", text: "answer" } }], nextCursor: null };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  const partial = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(partial);
  status = "completed";
  const complete = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(complete.entries[0]).toMatchObject({ id: partial.entries[0]!.id, position: partial.entries[0]!.position, state: "complete" });
});

test("new live turns remain after older backfill even when adapter bounds lag live storage", async () => {
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "future", status: "completed" }, { id: "old", status: "completed" }], nextCursor: null };
    const turnId = (raw as { turnId: string }).turnId;
    return turnId === "future"
      ? { data: [{ turnId, item: { id: "future-assistant", type: "agentMessage", text: "future" } }], nextCursor: null }
      : { data: [{ turnId, item: { id: "old-assistant", type: "agentMessage", text: "old" } }], nextCursor: null };
  };
  const state = memoryContext();
  const futureId = `operation-future:${await nativeMessageId("future-assistant")}`;
  state.entries.set(futureId, { id: futureId, position: [900, 0], role: "assistant", text: "future", assets: [], operationId: "operation-future", state: "complete" });
  const reader = createCodexHistoryReader(request, "thread", { future: "operation-future" });
  const batch = await reader.read(state.context, { direction: "latest", limit: 50 });
  const oldPosition = batch.entries.find(entry => entry.text === "old")?.position;
  expect(oldPosition && (oldPosition[0] < 900 || oldPosition[0] === 900 && oldPosition[1] < 0)).toBe(true);
});

test("an expired backfill cursor reconciles from a bounded safe page", async () => {
  const state = memoryContext();
  state.commit({ entries: [], checkpoints: [{ key: "backfill", value: { nextTurnCursor: "expired", pending: [], activeItemCursor: null } }], hasOlder: true });
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string };
    if (method === "thread/turns/list" && params.cursor) throw { code: -32602 };
    if (method === "thread/turns/list") return { data: [{ id: "turn", status: "completed" }], nextCursor: null };
    return { data: [{ turnId: "turn", item: { id: "a", type: "agentMessage", text: "safe" } }], nextCursor: null };
  };
  const batch = await createCodexHistoryReader(request, "thread", {}).read(state.context, { direction: "older", limit: 50 });
  expect(batch.entries.map(entry => entry.text)).toEqual(["safe"]);
  expect(batch.hasOlder).toBe(false);
});

test("a new head turn cannot shift an active huge-turn backfill cursor", async () => {
  let newHead = false;
  const itemCalls: { turnId: string; cursor?: string }[] = [];
  const request = async (method: string, raw: unknown) => {
    const params = raw as { turnId: string; cursor?: string };
    if (method === "thread/turns/list") return { data: [...(newHead ? [{ id: "new", status: "completed" }] : []), { id: "huge", status: "completed" }], nextCursor: null };
    itemCalls.push(params);
    const offset = Number(params.cursor ?? 0);
    return { data: [{ turnId: params.turnId, item: { id: `${params.turnId}-${offset}`, type: "agentMessage", text: `${params.turnId}-${offset}` } }], nextCursor: params.turnId === "huge" && offset < 2 ? String(offset + 1) : null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 1 }));
  newHead = true;
  const older = await reader.read(state.context, { direction: "older", limit: 1 });
  expect(itemCalls.at(-1)).toMatchObject({ turnId: "huge", cursor: "1" });
  expect(older.entries[0]?.text).toBe("huge-1");
});

test("an exhausted limit boundary advances to the next turn and skips settled coverage", async () => {
  const calls = new Map<string, number>();
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "new", status: "completed" }, { id: "old", status: "completed" }], nextCursor: null };
    const turnId = (raw as { turnId: string }).turnId; calls.set(turnId, (calls.get(turnId) ?? 0) + 1);
    return { data: [{ turnId, item: { id: turnId, type: "agentMessage", text: turnId } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 1 }));
  const older = await reader.read(state.context, { direction: "older", limit: 1 });
  expect(older.entries.map(entry => entry.text)).toEqual(["old"]);
  expect(calls.get("new")).toBe(1);
});

test("a newer settled turn does not hide an older unfinished turn becoming complete", async () => {
  let oldStatus = "inProgress";
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "new", status: "completed" }, { id: "old", status: oldStatus }], nextCursor: null };
    const turnId = (raw as { turnId: string }).turnId;
    return { data: [{ turnId, item: { id: turnId, type: "agentMessage", text: turnId } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  oldStatus = "completed";
  const warm = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(warm.entries).toHaveLength(1);
  expect(warm.entries[0]).toMatchObject({ text: "old", state: "complete" });
});

test("oversized native metadata and item pages are rejected", async () => {
  const tooManyTurns = createCodexHistoryReader(async () => ({ data: Array.from({ length: 51 }, (_, id) => ({ id: String(id) })), nextCursor: null }), "thread", {});
  await expect(tooManyTurns.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toThrow("invalid data");
  const tooManyItems = createCodexHistoryReader(async method => method === "thread/turns/list"
    ? { data: [{ id: "turn" }], nextCursor: null }
    : { data: [{ turnId: "turn", item: {} }, { turnId: "turn", item: {} }], nextCursor: null }, "thread", {});
  await expect(tooManyItems.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toThrow("invalid data");
});

test("a partially imported completed huge turn has zero unchanged warm item requests", async () => {
  let itemRequests = 0;
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "huge", status: "completed" }], nextCursor: null };
    itemRequests++;
    const offset = Number((raw as { cursor?: string }).cursor ?? 0);
    return { data: [{ turnId: "huge", item: { id: `item-${offset}`, type: "agentMessage", text: "x" } }], nextCursor: String(offset + 1) };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  const before = itemRequests;
  const warm = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(itemRequests - before).toBe(0);
  expect(warm.hasOlder).toBe(true);
});

test("latest sync preserves an existing older pending continuation", async () => {
  let newestOnly = false;
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") {
      if (params.cursor === "older-page") return { data: [{ id: "old", status: "completed" }], nextCursor: null };
      return newestOnly ? { data: [{ id: "new", status: "completed" }], nextCursor: null } : { data: [{ id: "head", status: "completed" }], nextCursor: "older-page" };
    }
    return { data: [{ turnId: params.turnId, item: { id: params.turnId, type: "agentMessage", text: params.turnId } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  newestOnly = true;
  const latest = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(latest);
  expect(latest.hasOlder).toBe(true);
  expect((await reader.read(state.context, { direction: "older", limit: 50 })).entries.map(entry => entry.text)).toEqual(["old"]);
});

test("terminal metadata signature changes invalidate settled coverage", async () => {
  let status = "completed"; let itemRequests = 0;
  const request = async (method: string) => method === "thread/turns/list"
    ? { data: [{ id: "turn", status }], nextCursor: null }
    : (itemRequests++, { data: [{ turnId: "turn", item: { id: "item", type: "agentMessage", text: "answer" } }], nextCursor: null });
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  status = "failed";
  const changed = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(itemRequests).toBe(2);
  expect(changed.entries[0]?.state).toBe("interrupted");
});

test("latest sync discovers unfinished work beyond the newest fifty turns", async () => {
  let oldStatus = "inProgress";
  const turns = Array.from({ length: 51 }, (_, index) => ({ id: index === 50 ? "old" : `new-${index}`, status: index === 50 ? oldStatus : "completed" }));
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") { const offset = Number(params.cursor ?? 0); return { data: turns.slice(offset, offset + 50), nextCursor: offset + 50 < turns.length ? String(offset + 50) : null }; }
    return { data: [{ turnId: params.turnId, item: { id: params.turnId, type: "agentMessage", text: params.turnId } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  let batch = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(batch);
  batch = await reader.read(state.context, { direction: "older", limit: 50 }); state.commit(batch);
  oldStatus = "completed"; turns[50] = { id: "old", status: oldStatus };
  const warm = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(warm.entries.find(entry => entry.text === "old")?.state).toBe("complete");
});

test("unfinished metadata discovery advances across bounded latest reads", async () => {
  const turns = Array.from({ length: 251 }, (_, index) => ({ id: index === 250 ? "old" : `new-${index}`, status: "completed" }));
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") { const offset = Number(params.cursor ?? 0); return { data: turns.slice(offset, offset + 50), nextCursor: offset + 50 < turns.length ? String(offset + 50) : null }; }
    return { data: [{ turnId: params.turnId, item: { id: params.turnId, type: "agentMessage", text: params.turnId } }], nextCursor: null };
  };
  const state = memoryContext();
  state.commit({ entries: [], checkpoints: [{ key: "unfinished", value: [{ id: "old", status: "inProgress" }] }], hasOlder: true });
  const reader = createCodexHistoryReader(request, "thread", {});
  const first = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(first.hasMore).toBe(true);
  state.commit(first);
  const second = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(second.entries.find(entry => entry.text === "old")?.state).toBe("complete");
});

test("same requested item cursor and repeated item identity reject cross-batch loops", async () => {
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") return { data: [{ id: "turn", status: "completed" }], nextCursor: null };
    const cursor = (raw as { cursor?: string }).cursor;
    return { data: [{ turnId: "turn", item: { id: "same", type: "agentMessage", text: "same" } }], nextCursor: cursor ?? "loop" };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  const first = await reader.read(state.context, { direction: "latest", limit: 1 }); state.commit(first);
  await expect(reader.read(state.context, { direction: "older", limit: 1 })).rejects.toThrow("Invalid history cursor");
});

test("empty terminal turns finish safely and malformed items use HistoryReadError", async () => {
  const empty = createCodexHistoryReader(async method => method === "thread/turns/list" ? { data: [{ id: "turn", status: "completed" }], nextCursor: null } : { data: [], nextCursor: null }, "thread", {});
  expect(await empty.read(memoryContext().context, { direction: "latest", limit: 50 })).toMatchObject({ entries: [], hasOlder: false });
  const malformed = createCodexHistoryReader(async method => method === "thread/turns/list" ? { data: [{ id: "turn" }], nextCursor: null } : { data: [{ turnId: "turn", item: { type: "agentMessage" } }], nextCursor: null }, "thread", {});
  await expect(malformed.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toMatchObject({ name: "HistoryReadError", status: "error" });
});

test("ten-thousand-entry tens-of-megabytes fixture stays bounded and warm payload-free", async () => {
  const total = 10_000;
  const body = "x".repeat(2_100);
  let metadataRequests = 0;
  let payloadRequests = 0;
  const request = async (method: string, raw: unknown) => {
    if (method === "thread/turns/list") { metadataRequests++; return { data: [{ id: "large", status: "completed" }], nextCursor: null }; }
    payloadRequests++;
    const offset = Number((raw as { cursor?: string }).cursor ?? 0);
    return { data: [{ turnId: "large", item: { id: `item-${offset}`, type: "agentMessage", text: body } }], nextCursor: offset + 1 < total ? String(offset + 1) : null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  let batch = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(batch);
  const afterNewest = payloadRequests;
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(payloadRequests).toBe(afterNewest);
  while (batch.hasOlder) { batch = await reader.read(state.context, { direction: "older", limit: 200 }); state.commit(batch); }
  const afterImport = payloadRequests;
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(state.entries.size).toBe(total);
  expect(payloadRequests).toBe(total);
  expect(payloadRequests).toBe(afterImport);
  expect(metadataRequests).toBeGreaterThan(0);
  expect(total * body.length).toBeGreaterThan(20_000_000);
});

test("expired turn cursor fallback with no turns returns an empty bounded batch", async () => {
  const state = memoryContext();
  state.commit({ entries: [], checkpoints: [{ key: "backfill", value: { nextTurnCursor: "expired", pending: [], activeItemCursor: null, activeItemIds: [], activeCursors: [] } }], hasOlder: true });
  const reader = createCodexHistoryReader(async (method, raw) => {
    if (method === "thread/turns/list" && (raw as { cursor?: string }).cursor) throw { code: -32602 };
    return { data: [], nextCursor: null };
  }, "thread", {});
  await expect(reader.read(state.context, { direction: "older", limit: 50 })).resolves.toMatchObject({ entries: [], hasOlder: false });
});

test("all malformed display payload variants return bounded history errors", async () => {
  const malformed = [
    { id: "a", type: "agentMessage", text: 42 },
    { id: "u", type: "userMessage", content: [{ type: "text", text: 42 }] },
    { id: "i", type: "imageGeneration", status: "completed", result: 42 },
  ];
  for (const item of malformed) {
    const reader = createCodexHistoryReader(async method => method === "thread/turns/list"
      ? { data: [{ id: "turn", status: "completed" }], nextCursor: null }
      : { data: [{ turnId: "turn", item }], nextCursor: null }, "thread", {}, async () => ({ key: "asset", mediaType: "image/png", size: 1 }));
    await expect(reader.read(memoryContext().context, { direction: "latest", limit: 50 })).rejects.toMatchObject({ name: "HistoryReadError", status: "error" });
  }
});

test("a new latest partial continuation stacks ahead of retained older traversal", async () => {
  let newHuge = false;
  const payloads = new Map<string, number>();
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") {
      if (params.cursor === "older-page") return { data: [{ id: "old", status: "completed" }], nextCursor: null };
      return { data: [{ id: newHuge ? "new" : "head", status: "completed" }], nextCursor: newHuge ? null : "older-page" };
    }
    const turn = params.turnId!; payloads.set(turn, (payloads.get(turn) ?? 0) + 1);
    const offset = Number(params.cursor ?? 0);
    return { data: [{ turnId: turn, item: { id: `${turn}-${offset}`, type: "agentMessage", text: `${turn}-${offset}` } }], nextCursor: turn === "new" && offset < 1 ? String(offset + 1) : null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  newHuge = true;
  state.commit(await reader.read(state.context, { direction: "latest", limit: 1 }));
  let older = await reader.read(state.context, { direction: "older", limit: 1 }); state.commit(older);
  while (older.hasOlder) { older = await reader.read(state.context, { direction: "older", limit: 50 }); state.commit(older); }
  expect([...state.entries.values()].some(entry => entry.text === "old-0")).toBe(true);
  expect(payloads.get("head")).toBe(1);
});

test("same terminal status with changed completedAt invalidates coverage", async () => {
  let completedAt = 10; let payloads = 0;
  const reader = createCodexHistoryReader(async method => method === "thread/turns/list"
    ? { data: [{ id: "turn", status: "completed", completedAt }], nextCursor: null }
    : (payloads++, { data: [{ turnId: "turn", item: { id: "item", type: "agentMessage", text: "x" } }], nextCursor: null }), "thread", {});
  const state = memoryContext(); state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  completedAt = 11;
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(payloads).toBe(2);
});

test("a cursor cycle longer than eight is rejected across committed batches", async () => {
  const state = memoryContext();
  const reader = createCodexHistoryReader(async (method, raw) => {
    if (method === "thread/turns/list") return { data: [{ id: "turn", status: "completed" }], nextCursor: null };
    const cursor = Number((raw as { cursor?: string }).cursor ?? 0);
    return { data: [{ turnId: "turn", item: { id: `item-${cursor}`, type: "agentMessage", text: "x" } }], nextCursor: String((cursor + 1) % 10) };
  }, "thread", {});
  let batch = await reader.read(state.context, { direction: "latest", limit: 1 }); state.commit(batch);
  for (let index = 0; index < 9; index++) { batch = await reader.read(state.context, { direction: "older", limit: 1 }); state.commit(batch); }
  await expect(reader.read(state.context, { direction: "older", limit: 1 })).rejects.toThrow("Invalid history cursor");
});

test("a text-only stored image identity is captured once then reused", async () => {
  let captures = 0;
  const state = memoryContext();
  const id = `operation:${await nativeMessageId("image")}`;
  state.entries.set(id, { id, position: [7, 0], role: "assistant", text: "kept label", assets: [], operationId: "operation", state: "complete" });
  const reader = createCodexHistoryReader(async method => method === "thread/turns/list"
    ? { data: [{ id: "turn", status: "completed" }], nextCursor: null }
    : { data: [{ turnId: "turn", item: { id: "image", type: "imageGeneration", status: "completed", result: "bytes" } }], nextCursor: null }, "thread", { turn: "operation" }, async () => { captures++; return { key: "image", mediaType: "image/png", size: 5 }; });
  const first = await reader.read(state.context, { direction: "latest", limit: 50 }); state.commit(first);
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(first.entries[0]).toMatchObject({ text: "kept label", assets: [{ key: "image" }], position: [7, 0] });
  expect(captures).toBe(1);
});

test("two newly discovered turns remain after cached history in native order", async () => {
  const state = memoryContext();
  const oldId = `old-op:${await nativeMessageId("old-item")}`;
  state.entries.set(oldId, { id: oldId, position: [0, 0], role: "assistant", text: "old", assets: [], operationId: "old-op", state: "complete" });
  state.commit({ entries: [], checkpoints: [{ key: "bounds", value: { min: 0, max: 0 } }], hasOlder: false });
  const reader = createCodexHistoryReader(async (method, raw) => {
    if (method === "thread/turns/list") return { data: [{ id: "new2", status: "completed" }, { id: "new1", status: "completed" }, { id: "old", status: "completed" }], nextCursor: null };
    const turnId = (raw as { turnId: string }).turnId;
    const itemId = turnId === "old" ? "old-item" : `${turnId}-item`;
    return { data: [{ turnId, item: { id: itemId, type: "agentMessage", text: turnId } }], nextCursor: null };
  }, "thread", { old: "old-op" });
  state.commit(await reader.read(state.context, { direction: "latest", limit: 1 }));
  let batch = await reader.read(state.context, { direction: "older", limit: 1 }); state.commit(batch);
  while (batch.hasOlder) { batch = await reader.read(state.context, { direction: "older", limit: 50 }); state.commit(batch); }
  const ordered = [...state.entries.values()].sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1]);
  expect(ordered.map(entry => entry.text)).toEqual(["old", "new1", "new2"]);
});

test("identical item cursor strings in different turns do not collide", async () => {
  const reader = createCodexHistoryReader(async (method, raw) => {
    if (method === "thread/turns/list") return { data: [{ id: "two", status: "completed" }, { id: "one", status: "completed" }], nextCursor: null };
    const params = raw as { turnId: string; cursor?: string };
    const offset = Number(params.cursor ?? 0);
    return { data: [{ turnId: params.turnId, item: { id: `${params.turnId}-${offset}`, type: "agentMessage", text: `${params.turnId}-${offset}` } }], nextCursor: offset === 0 ? "1" : null };
  }, "thread", {});
  const state = memoryContext(); const batch = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(batch.entries).toHaveLength(4);
});

test("changed completedAt rereads a multi-item turn with reusable native cursors", async () => {
  let completedAt = 1; let payloads = 0;
  const reader = createCodexHistoryReader(async (method, raw) => {
    if (method === "thread/turns/list") return { data: [{ id: "turn", status: "completed", completedAt }], nextCursor: null };
    payloads++;
    const offset = Number((raw as { cursor?: string }).cursor ?? 0);
    return { data: [{ turnId: "turn", item: { id: `item-${offset}`, type: "agentMessage", text: String(offset) } }], nextCursor: offset === 0 ? "1" : null };
  }, "thread", {});
  const state = memoryContext(); state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  completedAt = 2;
  await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(payloads).toBe(4);
});

test("a full new head retains its uncached middle gap without reviving a cached warm head", async () => {
  const state = memoryContext();
  const oldId = `old-op:${await nativeMessageId("old-item")}`;
  state.entries.set(oldId, { id: oldId, position: [0, 0], role: "assistant", text: "old", assets: [], operationId: "old-op", state: "partial" });
  state.commit({ entries: [], checkpoints: [
    { key: "bounds", value: { min: 0, max: 0 } },
    { key: "backfill", value: { nextTurnCursor: null, pending: [], activeItemCursor: null, activeItemIds: [], activeCursors: [], mode: "older", anchor: [0, 0], recoveryEpoch: 0 } },
  ], hasOlder: false });
  const turns = Array.from({ length: 251 }, (_, index) => ({ id: index === 250 ? "old" : `new-${250 - index}`, status: index === 250 ? "completed" : "completed" }));
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") { const offset = Number(params.cursor ?? 0); return { data: turns.slice(offset, offset + 50), nextCursor: offset + 50 < turns.length ? String(offset + 50) : null }; }
    const turnId = params.turnId!; const itemId = turnId === "old" ? "old-item" : `${turnId}-item`;
    return { data: [{ turnId, item: { id: itemId, type: "agentMessage", text: turnId } }], nextCursor: null };
  };
  const reader = createCodexHistoryReader(request, "thread", { old: "old-op" });
  const latest = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(latest.hasOlder).toBe(true);
  state.commit(latest);
  const older = await reader.read(state.context, { direction: "older", limit: 50 });
  expect(older.entries.length).toBeGreaterThan(0);
  expect(older.entries.every(entry => entry.position[0] > 0)).toBe(true);
});

test("independent unfinished scans may reuse native metadata cursor strings", async () => {
  let target = "old-a";
  const request = async (method: string, raw: unknown) => {
    const params = raw as { cursor?: string; turnId?: string };
    if (method === "thread/turns/list") {
      const all = Array.from({ length: 251 }, (_, index) => ({ id: index === 250 ? target : `new-${index}`, status: "completed" }));
      const offset = Number(params.cursor ?? 0);
      return { data: all.slice(offset, offset + 50), nextCursor: offset + 50 < all.length ? String(offset + 50) : null };
    }
    return { data: [{ turnId: params.turnId, item: { id: params.turnId, type: "agentMessage", text: params.turnId } }], nextCursor: null };
  };
  const state = memoryContext(); const reader = createCodexHistoryReader(request, "thread", {});
  state.commit({ entries: [], checkpoints: [{ key: "unfinished", value: [{ id: target, status: "inProgress" }] }], hasOlder: true });
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  target = "old-b";
  state.commit({ entries: [], checkpoints: [{ key: "unfinished", value: [{ id: target, status: "inProgress" }] }, { key: "unfinished-scan", value: null }], hasOlder: true });
  state.commit(await reader.read(state.context, { direction: "latest", limit: 50 }));
  const completed = await reader.read(state.context, { direction: "latest", limit: 50 });
  expect(completed.entries.find(entry => entry.text === "old-b")?.state).toBe("complete");
});

test("expired turn cursor recovery starts a fresh traversal epoch", async () => {
  const state = memoryContext();
  const traversalId = "old-traversal";
  const separator = String.fromCharCode(0);
  const oldScope = `${traversalId}${separator}0`;
  const consumed100 = `turn-cursor:${(await nativeMessageId(`${oldScope}${separator}100`)).slice(8)}`;
  state.commit({ entries: [], checkpoints: [
    { key: "backfill", value: { nextTurnCursor: "expired", pending: [], activeItemCursor: null, activeItemIds: [], activeCursors: [], mode: "older", anchor: null, recoveryEpoch: 0, traversalId } },
    { key: consumed100, value: true },
  ], hasOlder: true });
  const request = async (method: string, raw: unknown) => {
    const cursor = (raw as { cursor?: string }).cursor;
    if (method === "thread/turns/list") {
      if (cursor === "expired") throw { code: -32602 };
      const offset = Number(cursor ?? 0);
      return { data: Array.from({ length: 50 }, (_, index) => ({ id: `turn-${offset + index}`, status: "completed" })), nextCursor: offset < 100 ? String(offset + 50) : null };
    }
    return { data: [], nextCursor: null };
  };
  const reader = createCodexHistoryReader(request, "thread", {});
  await expect(reader.read(state.context, { direction: "older", limit: 200 })).resolves.toMatchObject({ entries: [] });
});

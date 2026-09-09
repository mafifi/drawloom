import { test, expect } from "bun:test";
import { projectHistory } from "./src/history.js";

test("over-cap native history restores the recent chronological tail and flags omitted history", async () => {
  const result = await projectHistory(async (method, params) => {
    const p = params as { cursor?: string; limit: number; sortDirection: string; turnId: string };
    if (method === "thread/read") return { thread: { id: "thread" } };
    if (method === "thread/turns/list") {
      const all = Array.from({ length: 2105 }, (_, n) => ({ id: String(n) }));
      if (p.sortDirection === 'desc') all.reverse();
      const offset = Number(p.cursor ?? 0), end = offset + p.limit;
      return { data: all.slice(offset, end), nextCursor: end < all.length ? String(end) : null };
    }
    return { data: [{ turnId: p.turnId, item: { type: "agentMessage", text: `message-${p.turnId}` } }], nextCursor: null };
  }, 'thread', {});
  expect(result.truncated).toBe(true);
  expect(result.entries.length).toBe(2000);
  expect(result.entries[0]?.text).toBe('message-105');
  expect(result.entries.at(-1)?.text).toBe('message-2104');
});

test("a large single turn retains its latest items without reversing display chronology", async () => {
  const result = await projectHistory(async (method, params) => {
    if (method === "thread/read") return { thread: { id: "thread" } };
    if (method === "thread/turns/list") return { data: [{ id: 'turn' }], nextCursor: null };
    const p = params as { cursor?: string; limit: number; sortDirection: string };
    const all = Array.from({ length: 2001 }, (_, n) => ({ turnId: 'turn', item: { type: 'agentMessage', text: `item-${n}` } }));
    if (p.sortDirection === 'desc') all.reverse();
    const offset = Number(p.cursor ?? 0), end = offset + p.limit;
    return { data: all.slice(offset, end), nextCursor: end < all.length ? String(end) : null };
  }, 'thread', {});
  expect(result.truncated).toBe(true);
  expect(result.entries[0]?.text).toBe('item-1');
  expect(result.entries.at(-1)?.text).toBe('item-2000');
});
test("native history pages are projected without provider identities", async () => {
  const calls: string[] = [];
  const result = await projectHistory(async (method) => {
    calls.push(method);
    if (method === "thread/read") return { thread: { id: "secret-thread" } };
    if (method === "thread/turns/list") return { data: [{ id: "secret-turn" }], nextCursor: null };
    return { data: [{ turnId: "secret-turn", item: { type: "agentMessage", id: "secret-item", text: "hello" } }], nextCursor: null };
  }, "secret-thread", { "secret-turn": "operation-1" });
  expect(result.entries[0]).toMatchObject({ text: "hello", operationId: "operation-1", role: "assistant" });
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(calls).toEqual(["thread/read", "thread/turns/list", "thread/items/list"]);
});

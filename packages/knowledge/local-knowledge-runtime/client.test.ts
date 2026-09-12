import { expect, test } from "bun:test";
import type { RpcTransport } from "@drawloom/host";
import { createLocalKnowledgeClient } from "./src/client.js";

test("the bounded client never accepts a caller-supplied knowledge subject", async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const rpc: RpcTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "knowledge.search") return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items: [], bytes: 0 };
      if (method === "knowledge.get") return { kind: "ok" };
      return { kind: "failure", code: "unavailable" };
    },
    notify() {}, respond() {}, subscribe() { return () => {}; }, async close() {},
  };
  const client = createLocalKnowledgeClient(rpc);
  expect(await client.search({ query: "local", mode: "best_available", limit: 5, maxBytes: 4096 })).toMatchObject({ kind: "ok", mode: "lexical" });
  expect(calls).toEqual([{ method: "knowledge.search", params: { query: "local", mode: "best_available", limit: 5, maxBytes: 4096 } }]);
  const ref = { type: "source" as const, origin: "public", id: "guide", revision: "r1" };
  expect(await client.get(ref)).toEqual({ kind: "ok" });
  expect(calls[1]).toEqual({ method: "knowledge.get", params: ref });
});

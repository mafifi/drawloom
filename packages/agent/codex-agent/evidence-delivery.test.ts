import { test, expect } from "bun:test";
import { createCodexDriver } from "./src/index.js";
import type { RpcMessage, RpcTransport } from "@drawloom/host";

test("native completed MCP results are correlated to the active execution and compaction invalidates retention", async () => {
  let receive: (value: RpcMessage) => void = () => {};
  const deliveries: unknown[] = []; const invalidated: string[] = [];
  const rpc: RpcTransport = { async request(method) {
    if (method === "initialize") return { userAgent: "codex/0.153.4" };
    if (method === "thread/start") return { thread: { id: "native" }, approvalsReviewer: "user" };
    if (method === "turn/start") return { turn: { id: "turn" } };
    return {};
  }, notify() {}, respond() {}, subscribe(next) { receive = next; return () => {}; }, async close() {} };
  const driver = createCodexDriver({ connect: async () => rpc, store: { async get() { return undefined; }, async set() {} },
    onToolResultDelivered: value => { deliveries.push(value); }, onContextInvalidated: operationId => { invalidated.push(operationId); },
  });
  const opened = await driver.openSession({ sessionId: "local", context: { text: "" }, tools: { id: "none", tools: [] } });
  if (opened.status !== "ok") throw Error("open failed");
  const session = opened.value;
  void (async () => { for await (const _signal of session.signals()) { /* Drain the real session. */ } })();
  expect(await session.execute({ operationId: "execution", text: "read" })).toMatchObject({ status: "ok" });
  const result = { content: [{ type: "text", text: "evidence" }], _meta: { invocationId: "read-1", operationId: "execution" } };
  receive({ method: "item/completed", params: { threadId: "wrong", turnId: "turn", item: { id: "one", type: "mcpToolCall", server: "drawloom", tool: "knowledge.evidence", status: "completed", result } } });
  receive({ method: "item/completed", params: { threadId: "native", turnId: "turn", item: { id: "two", type: "mcpToolCall", server: "drawloom", tool: "knowledge.evidence", status: "completed", result } } });
  receive({ method: "item/started", params: { threadId: "native", turnId: "turn", item: { id: "compact", type: "contextCompaction" } } });
  receive({ method: "thread/compacted", params: { threadId: "native" } });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(deliveries).toEqual([{ operationId: "execution", server: "drawloom", tool: "knowledge.evidence", result }]);
  expect(invalidated).toEqual(["execution", "execution"]);
  await session.close();
  expect(invalidated.at(-1)).toBe("execution");
  expect(invalidated).toHaveLength(3);
});

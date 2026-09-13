import { expect, test } from "bun:test";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import { observeCodexJudgeTransport } from "./codex-live-observer.ts";

test("live observer attributes strict last-turn usage and model rerouting without exposing it through the supported agent contract", async () => {
  let receive: (message: RpcMessage) => void = () => {};
  const inner: RpcTransport = {
    async request(_method, _params) { return {}; }, notify() {}, respond() {},
    subscribe(next) { receive = next; return () => {}; }, async close() {},
  };
  const forwarded: RpcMessage[] = [];
  const observed = observeCodexJudgeTransport(inner, "gpt-5.6-terra");
  observed.transport.subscribe(message => forwarded.push(message), () => {});
  receive({ method: "thread/tokenUsage/updated", params: {
    threadId: "thread", turnId: "turn",
    tokenUsage: {
      total: { totalTokens: 21, inputTokens: 12, cachedInputTokens: 3, cacheWriteInputTokens: 0, outputTokens: 9, reasoningOutputTokens: 2 },
      last: { totalTokens: 13, inputTokens: 8, cachedInputTokens: 3, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 2 },
      modelContextWindow: 100_000,
    },
  } });
  receive({ method: "model/rerouted", params: { threadId: "thread", turnId: "turn", fromModel: "gpt-5.6-terra", toModel: "gpt-5.6-sol", reason: "high_risk_cyber_activity" } });
  receive({ method: "item/started", params: { threadId: "thread", turnId: "turn", item: { id: "tool-one", type: "commandExecution", command: "hidden" } } });
  receive({ method: "item/completed", params: { threadId: "thread", turnId: "turn", item: { id: "tool-one", type: "commandExecution", command: "hidden" } } });
  receive({ method: "thread/tokenUsage/updated", params: { threadId: "thread", turnId: "bad", tokenUsage: { last: { totalTokens: -1 } } } });

  expect(forwarded).toHaveLength(5);
  expect(observed.take("turn")).toEqual({
    usage: { totalTokens: 13, inputTokens: 8, cachedInputTokens: 3, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 2 },
    requestedModel: "gpt-5.6-terra",
    actualModel: "gpt-5.6-sol",
    toolActivity: { commandExecution: 1 },
  });
  expect(observed.take("bad")).toEqual({ requestedModel: "gpt-5.6-terra", actualModel: "gpt-5.6-terra" });
  expect(observed.protocolErrors).toEqual(["Invalid token usage notification"]);
});

import { test, expect } from "bun:test";
import { agentConformance } from "../agent/src/conformance.js";
import { createCodexDriver, createCodexToolBridge } from "./src/index.js";
import type { RpcTransport, RpcMessage, JsonValue } from "@drawloom/host";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "../../tools/local-tools/src/index.js";
import { z } from "zod";
import { codexAgentFixture } from "../../../scripts/agent-conformance-fixtures.mjs";
test("native Other input accepts custom text and presents option descriptions", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "other",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const s = opened.value;
  const iterator = s.signals()[Symbol.asyncIterator]();
  await s.execute({ operationId: "a", text: "work" });
  await iterator.next();
  f.emit({
    id: 90,
    method: "item/tool/requestUserInput",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      questions: [
        {
          id: "choice",
          question: "Choose route",
          isOther: true,
          options: [
            { label: "A", description: "First route" },
            { label: "B", description: "Second route" },
          ],
        },
      ],
    },
  });
  const event = (await iterator.next()).value;
  expect(event).toMatchObject({ kind: "input.requested" });
  if (event?.kind !== "input.requested") throw Error();
  expect(event.request.prompt).toContain("First route");
  expect(
    await s.respondToInput({
      requestId: event.request.requestId,
      action: "submit",
      value: { choice: { answers: ["My custom path"] } },
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies.at(-1)).toEqual({
    id: 90,
    result: { answers: { choice: { answers: ["My custom path"] } } },
  });
  await s.close();
});
test("steering targets the active turn and concurrent interrupt waits for provider outcome", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "controls",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const session = opened.value;
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const event of session.signals()) events.push(event);
  })();
  await session.execute({ operationId: "active", text: "work" });
  expect(
    await session.steer?.({ operationId: "stale", text: "wrong" }),
  ).toMatchObject({ status: "rejected" });
  expect(
    await session.steer?.({
      operationId: "active",
      text: "update",
      additionalContext: { text: "fresh" },
    }),
  ).toMatchObject({ status: "ok" });
  expect(
    f.requests.find((r) => r.method === "turn/steer")?.params,
  ).toMatchObject({
    expectedTurnId: "private-turn",
    additionalContext: { drawloom: { kind: "application", value: "fresh" } },
  });
  const first = session.interrupt?.("active");
  const second = session.interrupt?.("active");
  expect(first).toBe(second);
  await first;
  expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(
    1,
  );
  expect(events).toHaveLength(1);
  f.emit({
    method: "turn/completed",
    params: {
      threadId: "private-thread",
      turn: { id: "private-turn", status: "interrupted" },
    },
  });
  await session.interrupt?.("active");
  expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(
    1,
  );
  await session.close();
  await drain;
  expect(events.at(-1)).toEqual({
    kind: "operation.interrupted",
    operationId: "active",
  });
});
test("provider message ordering and terminal cleanup reject stale interactions", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "messages",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const s = opened.value;
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const e of s.signals()) events.push(e);
  })();
  await s.execute({ operationId: "a", text: "work" });
  const params = { threadId: "private-thread", turnId: "private-turn" };
  f.emit({
    method: "item/agentMessage/delta",
    params: { ...params, itemId: "private-item", delta: "hi" },
  });
  f.emit({
    method: "item/completed",
    params: {
      ...params,
      item: {
        id: "private-item",
        type: "agentMessage",
        text: "hi",
        phase: "final_answer",
      },
    },
  });
  f.emit({
    method: "item/agentMessage/delta",
    params: { ...params, itemId: "private-item", delta: "late" },
  });
  f.emit({
    id: 1,
    method: "item/commandExecution/requestApproval",
    params: { ...params, availableDecisions: ["decline"] },
  });
  f.emit({
    id: 2,
    method: "mcpServer/elicitation/request",
    params: {
      ...params,
      message: "Input",
      requestedSchema: { type: "string" },
    },
  });
  await f.complete();
  expect(
    await s.resolveApproval({ approvalId: "approval-2", optionId: "option-0" }),
  ).toMatchObject({ status: "rejected" });
  expect(
    await s.respondToInput({ requestId: "input-3", action: "cancel" }),
  ).toMatchObject({ status: "rejected" });
  await s.close();
  await drain;
  expect(JSON.stringify(events)).not.toContain("private-item");
  expect(JSON.stringify(events)).not.toContain("late");
  expect(events[1]).toMatchObject({ kind: "message.delta", delta: "hi" });
  expect(events[2]).toMatchObject({
    kind: "message.completed",
    text: "hi",
    phase: "final",
  });
});
test("native user completion uses the stable history identity", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({ sessionId: "user-history", context: { text: "" }, tools: { id: "none", tools: [] } });
  if (opened.status !== "ok") throw Error();
  const iterator = opened.value.signals()[Symbol.asyncIterator]();
  await opened.value.execute({ operationId: "operation-a", text: "question", attachments: [{ key: "imported", mediaType: "image/png", size: 7 }] });
  await iterator.next();
  f.emit({ method: "item/completed", params: { threadId: "private-thread", turnId: "private-turn", item: { id: "native-user", type: "userMessage", content: [{ type: "text", text: "question" }] } } });
  expect((await iterator.next()).value).toEqual({ kind: "message.completed", operationId: "operation-a", messageId: "message-68e26fb5bcec8902c508c9ee278907db6b7547ad22dbd85ae36f8ab97fe8c24f", role: "user", text: "question", assets: [{ key: "imported", mediaType: "image/png", size: 7 }] });
  await opened.value.close();
});
test("Codex rejects malformed negotiation before starting a thread", async () => {
  const f = recorded();
  let started = false;
  const original = f.transport.request;
  f.transport.request = async (method, params) => {
    if (method === "initialize") return {};
    started = true;
    return original(method, params);
  };
  const driver = createCodexDriver({
    connect: async () => f.transport,
    store: {
      async get() {
        return undefined;
      },
      async set() {},
    },
  });
  expect(
    await driver.openSession({
      sessionId: "bad",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    }),
  ).toMatchObject({ status: "rejected" });
  expect(started).toBe(false);
});
test("MCP failure projection retains unknown execution", async () => {
  const gateway = createLocalToolGateway({
    tools: [
      defineTool({
        name: "effect",
        description: "Effect",
        input: z.strictObject({}),
        output: z.string(),
        execute() {
          throw Error("private error");
        },
      }),
    ],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => "id",
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("thread", "turn", gateway.bind("operation"));
  expect(
    await bridge.call(
      {
        callId: "call",
        "x-codex-turn-metadata": { thread_id: "thread", turn_id: "turn" },
      },
      "effect",
      {},
      new AbortController().signal,
    ),
  ).toMatchObject({ isError: true, _meta: { execution: "unknown" } });
});
export function recorded() {
  let receive: (m: RpcMessage) => void = () => {};
  let failure: () => void = () => {};
  const requests: { method: string; params: unknown }[] = [];
  const replies: unknown[] = [];
  const transport: RpcTransport = {
    async request(method, params) {
      requests.push({ method, params });
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "thread/start" || method === "thread/resume")
        return { thread: { id: "private-thread" }, approvalsReviewer: 'user' };
      if (method === "turn/start") return { turn: { id: "private-turn" } };
      return {};
    },
    notify() {},
    respond(id, result) {
      replies.push({ id, result });
    },
    subscribe(next, fail) {
      receive = next;
      failure = fail;
      return () => {
        receive = () => {};
      };
    },
    async close() {},
  };
  const values = new Map<string, JsonValue>();
  const driver = createCodexDriver({
    connect: async () => transport,
    imageInput: async asset => `/confined/${asset.key}`,
    store: {
      async get(k) {
        return values.get(k);
      },
      async set(k, v) {
        values.set(k, v);
      },
    },
  });
  return {
    driver,
    transport,
    requests,
    replies,
    emit: (m: RpcMessage) => receive(m),
    fail: () => failure(),
    complete: async () => {
      receive({
        method: "turn/completed",
        params: {
          threadId: "private-thread",
          turn: { id: "private-turn", status: "completed" },
        },
      });
    },
  };
}
test("recorded Codex transport shared agent conformance", () =>
  agentConformance(codexAgentFixture));
test("Codex preserves private continuity, fresh context, approval choices and input validation", async () => {
  const f = recorded();
  const o = await f.driver.openSession({
    sessionId: "s",
    context: { text: "system context" },
    tools: { id: "none", tools: [] },
  });
  if (o.status !== "ok") throw Error("open");
  const s = o.value;
  const events: unknown[] = [];
  let receivedInput!: () => void;
  const inputReady = new Promise<void>(resolve => { receivedInput = resolve; });
  const drain = (async () => {
    for await (const e of s.signals()) { events.push(e); if (e.kind === 'input.requested') receivedInput(); }
  })();
  await s.execute({
    operationId: "a",
    text: "hello",
    additionalContext: { text: "fresh context" },
  });
  f.emit({
    id: 10,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      reason: "Run the requested check",
      availableDecisions: [
        "decline",
        {
          acceptWithExecpolicyAmendment: { execpolicy_amendment: ["example"] },
        },
      ],
    },
  });
  f.emit({
    id: 11,
    method: "mcpServer/elicitation/request",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      message: "Pick text",
      requestedSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  });
  await inputReady;
  const parsedEvents = events as import('@drawloom/agent').AgentSessionSignal[];
  const approval = parsedEvents.find(event => event.kind === 'approval.requested');
  const elicitation = parsedEvents.find(event => event.kind === 'input.requested');
  if (approval?.kind !== 'approval.requested' || elicitation?.kind !== 'input.requested') throw Error('Missing interactions');
  expect(
    await s.resolveApproval({ approvalId: approval.request.approvalId, optionId: "option-1" }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies[0]).toEqual({
    id: 10,
    result: {
      decision: {
        acceptWithExecpolicyAmendment: { execpolicy_amendment: ["example"] },
      },
    },
  });
  expect(
    await s.respondToInput({
      requestId: elicitation.request.requestId,
      action: "submit",
      value: { text: 3 },
    }),
  ).toMatchObject({ status: "rejected" });
  expect(
    await s.respondToInput({
      requestId: elicitation.request.requestId,
      action: "submit",
      value: { text: "yes" },
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies[1]).toEqual({
    id: 11,
    result: { action: "accept", content: { text: "yes" } },
  });
  await f.complete();
  await s.close();
  await drain;
  expect(JSON.stringify(events)).not.toContain("private-thread");
  expect(JSON.stringify(events)).not.toContain("execpolicy_amendment");
  await f.driver.openSession({
    sessionId: "s",
    context: { text: "new" },
    tools: { id: "none", tools: [] },
  });
  expect(f.requests.some((x) => x.method === "thread/resume")).toBe(true);
  expect(f.requests.find((x) => x.method === "thread/resume")?.params).toMatchObject({ excludeTurns: true });
  expect(
    f.requests.find((x) => x.method === "turn/start")?.params,
  ).toMatchObject({
    additionalContext: {
      drawloom: { kind: "application", value: "fresh context" },
    },
  });
});
test("unrecoverable disconnect terminal is bounded and no late event leaks", async () => {
  const f = recorded();
  const o = await f.driver.openSession({
    sessionId: "s",
    context: { text: "" },
    tools: { id: "n", tools: [] },
  });
  if (o.status !== "ok") throw Error();
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const e of o.value.signals()) events.push(e);
  })();
  await o.value.execute({ operationId: "a", text: "x" });
  f.fail();
  await f.complete();
  await drain;
  expect(events).toEqual([
    { kind: "operation.started", operationId: "a" },
    {
      kind: "operation.failed",
      operationId: "a",
      failure: {
        code: "provider_unavailable",
        summary: "Provider connection unavailable",
      },
    },
  ]);
});
test("Codex origin bridge cannot borrow a later operation binding", async () => {
  let count = 0;
  let id = 0;
  const tool = defineTool({
    name: "count",
    description: "count",
    input: z.string(),
    output: z.number(),
    execute: () => ++count,
  });
  const gateway = createLocalToolGateway({
    tools: [tool],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => String(++id),
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("t", "a", gateway.bind("a"));
  bridge.retire("t", "a");
  bridge.publish("t", "b", gateway.bind("b"));
  const meta = (turn: string) => ({
    callId: "call",
    "x-codex-turn-metadata": { thread_id: "t", turn_id: turn },
  });
  expect(
    await bridge.call(meta("a"), "count", "x", new AbortController().signal),
  ).toMatchObject({ isError: true });
  expect(count).toBe(0);
  expect(
    await bridge.call(meta("b"), "count", "x", new AbortController().signal),
  ).toMatchObject({ isError: false, _meta: { operationId: "b" } });
  expect(count).toBe(1);
});

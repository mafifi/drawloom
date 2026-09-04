import { describe, expect, test } from "bun:test";

import { CodexSpikeDriver } from "./adapter.ts";
import type {
  CodexNotification,
  CodexServerRequest,
  CodexTransport,
  JsonRpcId,
} from "./app-server-client.ts";

type RequestRecord = {
  method: string;
  params: unknown;
};

class FakeTransport implements CodexTransport {
  public readonly requests: RequestRecord[] = [];
  public readonly responses: { id: JsonRpcId; result: unknown }[] = [];
  public closed = false;

  private notificationHandler:
    | ((notification: CodexNotification) => void)
    | undefined;
  private requestHandler: ((request: CodexServerRequest) => void) | undefined;
  private failureHandler: ((error: Error) => void) | undefined;
  private turnNumber = 0;
  private readonly deferredRequests = new Map<
    string,
    {
      readonly promise: Promise<void>;
      readonly resolve: () => void;
      readonly reject: (error: Error) => void;
    }
  >();

  public async request(method: string, params: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    const deferred = this.deferredRequests.get(method);
    if (deferred) {
      try {
        await deferred.promise;
      } finally {
        if (this.deferredRequests.get(method) === deferred) {
          this.deferredRequests.delete(method);
        }
      }
    }
    if (method === "thread/start") return { thread: { id: "provider-thread" } };
    if (method === "thread/resume") return { thread: { id: "provider-thread" } };
    if (method === "turn/start") {
      this.turnNumber += 1;
      return { turn: { id: `provider-turn-${this.turnNumber}` } };
    }
    return {};
  }

  public respond(id: JsonRpcId, result: unknown): void {
    this.responses.push({ id, result });
  }

  public onNotification(
    handler: (notification: CodexNotification) => void,
  ): () => void {
    this.notificationHandler = handler;
    return () => {
      if (this.notificationHandler === handler) this.notificationHandler = undefined;
    };
  }

  public onRequest(handler: (request: CodexServerRequest) => void): () => void {
    this.requestHandler = handler;
    return () => {
      if (this.requestHandler === handler) this.requestHandler = undefined;
    };
  }

  public onFailure(handler: (error: Error) => void): () => void {
    this.failureHandler = handler;
    return () => {
      if (this.failureHandler === handler) this.failureHandler = undefined;
    };
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public emitNotification(method: string, params: unknown): void {
    this.notificationHandler?.({ method, params });
  }

  public emitRequest(id: JsonRpcId, method: string, params: unknown): void {
    this.requestHandler?.({ id, method, params });
  }

  public emitFailure(message: string): void {
    for (const deferred of this.deferredRequests.values()) {
      deferred.reject(new Error(message));
    }
    this.deferredRequests.clear();
    this.failureHandler?.(new Error(message));
  }

  public deferNextRequest(method: string): () => void {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    this.deferredRequests.set(method, { promise, resolve, reject });
    return resolve;
  }

  public rejectNextRequest(method: string): (message: string) => void {
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    this.deferredRequests.set(method, {
      promise,
      resolve: () => undefined,
      reject,
    });
    return (message) => reject(new Error(message));
  }
}

const compiledContext = (label: string) => ({
  [`drawloom.${label}`]: {
    kind: "application" as const,
    value: `${label}-context`,
  },
});

const openSession = async () => {
  const transport = new FakeTransport();
  const driver = new CodexSpikeDriver({ transport });
  const opened = await driver.openSession({
    sessionId: "session-1",
    context: compiledContext("session"),
    tools: { mcpServers: {} },
  });
  if (opened.status !== "ok") throw new Error("Expected session to open");
  return { driver, session: opened.value, transport };
};

const nextSignal = async (
  iterator: AsyncIterator<unknown>,
): Promise<unknown> => (await iterator.next()).value;

describe("CodexSpikeDriver", () => {
  test("requires a signal consumer and allows one active operation", async () => {
    const { session, transport } = await openSession();

    await expect(
      session.execute({ operationId: "operation-1", text: "start" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_state" },
    });

    const iterator = session.signals()[Symbol.asyncIterator]();
    const accepted = await session.execute({
      operationId: "operation-1",
      text: "start",
      additionalContext: compiledContext("operation"),
    });
    expect(accepted).toEqual({
      status: "ok",
      value: { operationId: "operation-1" },
    });
    await expect(
      session.execute({ operationId: "operation-2", text: "overlap" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_state" },
    });

    transport.emitNotification("item/agentMessage/delta", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      itemId: "provider-message",
      delta: "hello",
      phase: "final_answer",
    });
    transport.emitNotification("item/completed", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      item: {
        id: "provider-message",
        type: "agentMessage",
        text: "hello",
        phase: "final_answer",
      },
    });
    transport.emitNotification("turn/completed", {
      threadId: "provider-thread",
      turn: { id: "provider-turn-1", status: "completed" },
    });

    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.started",
      operationId: "operation-1",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "message.delta",
      operationId: "operation-1",
      messageId: "message-1",
      phase: "final",
      delta: "hello",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "message.completed",
      operationId: "operation-1",
      messageId: "message-1",
      phase: "final",
      text: "hello",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.completed",
      operationId: "operation-1",
    });

    expect(transport.requests).toContainEqual({
      method: "turn/start",
      params: expect.objectContaining({
        additionalContext: compiledContext("operation"),
        threadId: "provider-thread",
      }),
    });
  });

  test("reserves an operation while turn start is pending", async () => {
    const { session, transport } = await openSession();
    session.signals()[Symbol.asyncIterator]();
    const release = transport.deferNextRequest("turn/start");

    const first = session.execute({ operationId: "operation-1", text: "start" });
    await Promise.resolve();
    await expect(
      session.execute({ operationId: "operation-2", text: "overlap" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_state" },
    });

    release();
    await expect(first).resolves.toEqual({
      status: "ok",
      value: { operationId: "operation-1" },
    });
  });

  test("orders notifications received before turn start responds", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    const release = transport.deferNextRequest("turn/start");

    const executing = session.execute({
      operationId: "operation-1",
      text: "start",
    });
    await Promise.resolve();
    transport.emitNotification("item/agentMessage/delta", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      itemId: "provider-message",
      delta: "early",
      phase: "final_answer",
    });
    release();
    await executing;

    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.started",
      operationId: "operation-1",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "message.delta",
      operationId: "operation-1",
      messageId: "message-1",
      phase: "final",
      delta: "early",
    });
  });

  test("allows only one iterator over the session signal stream", async () => {
    const { session } = await openSession();
    const signals = session.signals();
    signals[Symbol.asyncIterator]();

    expect(() => signals[Symbol.asyncIterator]()).toThrow(
      "The session signal stream has one consumer.",
    );
  });

  test("preserves approval choices and keeps requested input distinct", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "interact" });
    await nextSignal(iterator);

    transport.emitRequest(41, "item/commandExecution/requestApproval", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      itemId: "command-1",
      reason: "Run the probe command",
      availableDecisions: ["accept", "acceptForSession", "decline", "cancel"],
    });
    transport.emitRequest(42, "item/tool/requestUserInput", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      itemId: "question-1",
      isBlocking: true,
      questions: [
        {
          id: "colour",
          header: "Colour",
          question: "Choose a colour",
          options: [{ label: "Blue", description: "Use blue" }],
        },
      ],
    });

    const approval = await nextSignal(iterator);
    const input = await nextSignal(iterator);
    expect(approval).toEqual({
      kind: "approval.requested",
      request: {
        approvalId: "approval-1",
        operationId: "operation-1",
        summary: "Run the probe command",
        options: [
          { optionId: "accept", label: "accept" },
          { optionId: "acceptForSession", label: "acceptForSession" },
          { optionId: "decline", label: "decline" },
          { optionId: "cancel", label: "cancel" },
        ],
      },
    });
    expect(input).toMatchObject({
      kind: "input.requested",
      request: {
        requestId: "input-1",
        operationId: "operation-1",
        prompt: "Choose a colour",
      },
    });

    await expect(
      session.resolveApproval({ approvalId: "approval-1", optionId: "decline" }),
    ).resolves.toEqual({ status: "ok", value: undefined });
    await expect(
      session.respondToInput({
        requestId: "input-1",
        action: "submit",
        value: { colour: { answers: ["Blue"] } },
      }),
    ).resolves.toEqual({ status: "ok", value: undefined });

    expect(transport.responses).toEqual([
      { id: 41, result: { decision: "decline" } },
      {
        id: 42,
        result: { answers: { colour: { answers: ["Blue"] } } },
      },
    ]);
    expect(await nextSignal(iterator)).toEqual({
      kind: "approval.resolved",
      approvalId: "approval-1",
      optionId: "decline",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "input.resolved",
      requestId: "input-1",
    });
  });

  test("normalizes legacy Codex command approvals without exposing provider ids", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "legacy approval" });
    await nextSignal(iterator);

    transport.emitRequest("legacy-rpc", "execCommandApproval", {
      conversationId: "provider-thread",
      callId: "provider-call",
      command: ["touch", "/tmp/never-created"],
      cwd: "/tmp",
      parsedCmd: [],
    });

    await expect(
      session.resolveApproval({ approvalId: "approval-1", optionId: "denied" }),
    ).resolves.toEqual({ status: "ok", value: undefined });
    expect(await nextSignal(iterator)).toEqual({
      kind: "approval.requested",
      request: {
        approvalId: "approval-1",
        operationId: "operation-1",
        summary: "Codex requested execution approval.",
        options: [
          { optionId: "approved", label: "approved" },
          { optionId: "approved_for_session", label: "approved_for_session" },
          { optionId: "denied", label: "denied" },
          { optionId: "abort", label: "abort" },
        ],
      },
    });
    expect(transport.responses).toEqual([
      {
        id: "legacy-rpc",
        result: { decision: { denied: { rejection: "Denied by Drawloom." } } },
      },
    ]);
  });

  test("invalidates every pending interaction on terminal outcome", async () => {
    const { session, transport } = await openSession();
    session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "interact" });
    transport.emitRequest("approval-rpc", "item/fileChange/requestApproval", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      itemId: "file-1",
      reason: "Change one file",
    });
    transport.emitRequest("input-rpc", "mcpServer/elicitation/request", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      serverName: "probe",
      mode: "form",
      message: "Supply a value",
      requestedSchema: { type: "object" },
    });
    transport.emitNotification("turn/completed", {
      threadId: "provider-thread",
      turn: { id: "provider-turn-1", status: "completed" },
    });

    await expect(
      session.resolveApproval({ approvalId: "approval-1", optionId: "decline" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_interaction" },
    });
    await expect(
      session.respondToInput({ requestId: "input-1", action: "cancel" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_interaction" },
    });
  });

  test("normalizes evidenced provider activity and ignores unevidenced diagnostics", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "observe" });
    await nextSignal(iterator);

    transport.emitNotification("error", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      message: "provider-private diagnostic",
    });
    transport.emitNotification("thread/tokenUsage/updated", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      tokenUsage: { total: { totalTokens: 17 } },
    });
    transport.emitNotification("item/completed", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
      item: {
        id: "child-provider-id",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "completed",
        receiverThreadIds: ["secret-child-thread"],
      },
    });

    expect(await nextSignal(iterator)).toEqual({
      kind: "provider.observation",
      operationId: "operation-1",
      name: "usage",
      summary: "Codex reported updated token usage.",
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "provider.observation",
      operationId: "operation-1",
      name: "delegation",
      summary: "Codex reported provider-native delegated activity.",
    });
  });

  test("waits for provider-confirmed interruption and remains idempotent", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "wait" });
    await nextSignal(iterator);

    await expect(session.interrupt?.("operation-1")).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
    await expect(session.interrupt?.("operation-1")).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
    transport.emitNotification("thread/tokenUsage/updated", {
      threadId: "provider-thread",
      turnId: "provider-turn-1",
    });
    expect(await nextSignal(iterator)).toMatchObject({
      kind: "provider.observation",
      name: "usage",
    });

    transport.emitNotification("turn/completed", {
      threadId: "provider-thread",
      turn: { id: "provider-turn-1", status: "interrupted" },
    });
    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.interrupted",
      operationId: "operation-1",
    });
    await expect(session.interrupt?.("operation-1")).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
    expect(
      transport.requests.filter((request) => request.method === "turn/interrupt"),
    ).toHaveLength(1);
  });

  test("shares a concurrent interrupt rejection and permits a retry", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "wait" });
    await nextSignal(iterator);
    const rejectInterrupt = transport.rejectNextRequest("turn/interrupt");

    const first = session.interrupt!("operation-1");
    const second = session.interrupt!("operation-1");
    rejectInterrupt("provider rejected interruption");

    await expect(first).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "provider_rejected" },
    });
    await expect(second).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "provider_rejected" },
    });
    expect(
      transport.requests.filter((request) => request.method === "turn/interrupt"),
    ).toHaveLength(1);
    await expect(session.interrupt!("operation-1")).resolves.toEqual({
      status: "ok",
      value: undefined,
    });
  });

  test("emits one failed terminal signal when the transport dies", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "wait" });
    await nextSignal(iterator);

    transport.emitFailure("app-server exited");
    transport.emitNotification("turn/completed", {
      threadId: "provider-thread",
      turn: { id: "provider-turn-1", status: "completed" },
    });

    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.failed",
      operationId: "operation-1",
      failure: {
        code: "provider_unavailable",
        summary: "Codex app-server became unavailable.",
      },
    });
    await session.close();
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  test("does not reuse a session after a timed-out operation start", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    transport.deferNextRequest("turn/start");

    const starting = session.execute({ operationId: "operation-1", text: "wait" });
    await Promise.resolve();
    transport.emitFailure("App-server request timed out: turn/start");

    await expect(starting).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "provider_unavailable" },
    });
    await expect(
      session.execute({ operationId: "operation-2", text: "do not start" }),
    ).resolves.toMatchObject({
      status: "rejected",
      failure: { code: "invalid_state" },
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  test("closes idempotently and preserves an interrupted terminal signal", async () => {
    const { session, transport } = await openSession();
    const iterator = session.signals()[Symbol.asyncIterator]();
    await session.execute({ operationId: "operation-1", text: "wait" });
    await nextSignal(iterator);

    await expect(session.close()).resolves.toEqual({ status: "ok", value: undefined });
    await expect(session.close()).resolves.toEqual({ status: "ok", value: undefined });
    expect(await nextSignal(iterator)).toEqual({
      kind: "operation.interrupted",
      operationId: "operation-1",
    });
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
    expect(transport.closed).toBe(true);
  });
});

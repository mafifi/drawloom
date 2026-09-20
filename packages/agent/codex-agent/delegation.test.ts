import { expect, test } from "bun:test";
import { recorded } from "./driver.test.js";
import { agentDelegationConformance } from "@drawloom/agent/delegation-conformance";

async function fixture(active = false, options: Parameters<typeof recorded>[0] = {}) {
  const f = recorded(options);
  const request = f.transport.request.bind(f.transport);
  let parent: string | null = "private-thread";
  f.transport.request = async (method, params) => {
    if (method === "thread/list") return { data: [{ id: "native-child" }], nextCursor: null };
    if (method === "thread/read" && (params as { threadId: string }).threadId === "native-child")
      return {
        thread: {
          id: "native-child",
          parentThreadId: parent,
          agentNickname: "Reviewer",
          canAcceptDirectInput: active ? false : null,
          status: { type: active ? "active" : "notLoaded" },
          turns: active ? [{ id: "child-turn", status: "inProgress", items: [] }] : [],
        },
      };
    return request(method, params);
  };
  const opened = await f.driver.openSession(
    {
      sessionId: "root",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    },
    {
      admitChild: async () => ({
        status: "ok",
        value: { operationId: "child-op" },
      }),
    },
  );
  if (opened.status !== "ok") throw Error("open failed");
  return {
    ...f,
    session: opened.value,
    reparent: () => {
      parent = null;
    },
  };
}

test("native children have opaque identities and unknown controls while unloaded", async () => {
  const f = await fixture();
  try {
    expect(f.session.delegations).toBeDefined();
    const result = await f.session.delegations!.list();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw Error("discovery failed");
    expect(result.value).toHaveLength(1);
    const child = result.value[0]!;
    expect(child.id).not.toBe("native-child");
    expect(child).toMatchObject({
      parentId: null,
      label: "Reviewer",
      status: "unknown",
      controls: { interrupt: "unknown" },
    });
    expect(
      (
        await f.session.delegations!.interrupt({
          id: child.id,
          revision: child.revision,
        })
      ).status,
    ).toBe("rejected");
  } finally {
    await f.session.close();
  }
});

test("reconnect reconciles an already-running child once without resume or configuration", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    const before = f.requests.length;
    const result = await f.session.delegations!.list();
    expect(result.status === "ok" && result.value[0]?.controls.interrupt).toBe("available");
    await f.session.delegations!.list();
    await until(() => signals.some((s) => s.kind === "operation.started"));
    expect(signals.filter((s) => s.kind === "operation.started")).toHaveLength(1);
    expect(
      f.requests
        .slice(before)
        .some((r) => ["thread/resume", "turn/start", "thread/settings/update"].includes(r.method)),
    ).toBe(false);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("nested children retain separate operations while their parent is active", async () => {
  const f = recorded();
  const request = f.transport.request.bind(f.transport);
  f.transport.request = async (method, params) => {
    const threadId = (params as { threadId?: string }).threadId;
    if (method === "thread/read" && (threadId === "child" || threadId === "grandchild"))
      return {
        thread: {
          id: threadId,
          parentThreadId: threadId === "child" ? "private-thread" : "child",
          agentNickname: threadId,
          canAcceptDirectInput: false,
          status: { type: "active" },
          turns: [{ id: `${threadId}-turn`, status: "inProgress", items: [] }],
        },
      };
    return request(method, params);
  };
  const admissions: import("@drawloom/agent").AgentChildAdmission[] = [];
  const opened = await f.driver.openSession(
    { sessionId: "root", context: { text: "" }, tools: { id: "none", tools: [] } },
    {
      admitChild: async (input) => {
        admissions.push(input);
        return { status: "ok", value: { operationId: `child-op-${admissions.length}` } };
      },
    },
  );
  if (opened.status !== "ok") throw Error("open failed");
  const session = opened.value;
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of session.signals()) signals.push(signal);
  })();
  try {
    await session.execute({ operationId: "parent-op", text: "Inspect only" });
    for (const threadId of ["child", "grandchild"])
      f.emit({ method: "turn/started", params: { threadId, turn: { id: `${threadId}-turn` } } });
    await until(() => signals.filter((s) => s.kind === "operation.started").length === 3);
    expect(admissions[0]?.parentId).toBeNull();
    expect(admissions[1]?.parentId).toBe(admissions[0]?.childId);
    expect(new Set(admissions.map((a) => a.executionId)).size).toBe(2);
    f.emit({
      method: "turn/completed",
      params: { threadId: "grandchild", turn: { id: "grandchild-turn", status: "failed" } },
    });
    await until(() =>
      signals.some((s) => s.kind === "operation.failed" && s.operationId === "child-op-2"),
    );
    expect(
      signals.some((s) => s.kind === "operation.failed" && s.operationId !== "child-op-2"),
    ).toBe(false);
    const child = await session.delegations!.read(admissions[0]!.childId);
    expect(child.status === "ok" && child.value.controls.interrupt).toBe("available");
  } finally {
    await session.close();
    await drain;
  }
});

test("a child approval retains its own operation after the parent has completed", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    expect(
      (
        await f.session.execute({
          operationId: "parent-op",
          text: "Inspect only",
        })
      ).status,
    ).toBe("ok");
    await f.complete();
    await until(() =>
      signals.some((s) => s.kind === "operation.completed" && s.operationId === "parent-op"),
    );
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    f.emit({
      id: "child-approval",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "native-child",
        turnId: "child-turn",
        reason: "Inspect documentation",
        availableDecisions: ["accept", "decline"],
      },
    });
    await until(() => signals.some((s) => s.kind === "approval.requested"));
    const approval = signals.find((signal) => signal.kind === "approval.requested");
    expect(approval).toMatchObject({
      kind: "approval.requested",
      request: { operationId: "child-op" },
    });
    if (approval?.kind !== "approval.requested") throw Error("Child approval missing");
    expect(
      (
        await f.session.resolveApproval({
          approvalId: approval.request.approvalId,
          optionId: "option-1",
        })
      ).status,
    ).toBe("ok");
    expect(f.replies).toContainEqual({
      id: "child-approval",
      result: { decision: "decline" },
    });
  } finally {
    await f.session.close();
    await drain;
  }
});

test("native spawn metadata correlates origin without treating the parent call as child success", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    await f.session.execute({ operationId: "parent-op", text: "Inspect only" });
    f.emit({
      method: "item/completed",
      params: {
        threadId: "private-thread",
        turnId: "private-turn",
        item: {
          id: "spawn",
          type: "collabAgentToolCall",
          tool: "spawnAgent",
          status: "completed",
          senderThreadId: "private-thread",
          receiverThreadIds: ["native-child"],
        },
      },
    });
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    await until(() =>
      signals.some((s) => s.kind === "operation.started" && s.operationId === "child-op"),
    );
    const latest = signals.filter((s) => s.kind === "delegation.updated").at(-1);
    expect(latest).toMatchObject({
      child: { originatingOperationId: "parent-op", operationId: "child-op", status: "running" },
    });
  } finally {
    await f.session.close();
    await drain;
  }
});

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw Error("Expected native event was not observed");
}

test("shutdown during child admission releases ownership without publishing tool authority", async () => {
  const accepted: unknown[] = [],
    finished: unknown[] = [];
  const f = recorded({
    onTurnAccepted: (...args) => accepted.push(args),
    onTurnFinished: (...args) => finished.push(args),
  });
  const request = f.transport.request.bind(f.transport);
  f.transport.request = async (method, params) =>
    method === "thread/read" && (params as { threadId: string }).threadId === "child"
      ? {
          thread: {
            id: "child",
            parentThreadId: "private-thread",
            canAcceptDirectInput: false,
            status: { type: "active" },
            turns: [{ id: "turn", status: "inProgress" }],
          },
        }
      : request(method, params);
  let release!: () => void,
    admitting = false;
  const opened = await f.driver.openSession(
    { sessionId: "root", context: { text: "" }, tools: { id: "none", tools: [] } },
    {
      admitChild: async () => {
        admitting = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { status: "ok", value: { operationId: "child-op" } };
      },
    },
  );
  if (opened.status !== "ok") throw Error();
  f.emit({ method: "turn/started", params: { threadId: "child", turn: { id: "turn" } } });
  await until(() => admitting);
  const closing = opened.value.close();
  release();
  await closing;
  await until(() => finished.length > 0);
  expect(accepted).toEqual([]);
  expect(finished).toContainEqual(["child", "turn", "child-op"]);
});

test("failed interruption preparation does not strand a child or dispatch a native mutation", async () => {
  const values = new Map<string, import("@drawloom/host").JsonValue>();
  let rejectReceipt = true;
  const f = await fixture(true, {
    store: {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        if (key.startsWith("codex-child-interruption:") && rejectReceipt) {
          rejectReceipt = false;
          throw Error("Disk unavailable");
        }
        values.set(key, value);
      },
    },
  });
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    await until(() => signals.some((s) => s.kind === "operation.started"));
    const signal = signals.filter((s) => s.kind === "delegation.updated").at(-1)!;
    if (signal.kind !== "delegation.updated") throw Error();
    expect(
      (
        await f.session.delegations!.interrupt({
          id: signal.child.id,
          revision: signal.child.revision,
        })
      ).status,
    ).toBe("rejected");
    expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(0);
    const fresh = await f.session.delegations!.read(signal.child.id);
    expect(fresh.status === "ok" && fresh.value.controls.interrupt).toBe("available");
    if (fresh.status !== "ok") throw Error();
    expect(
      (
        await f.session.delegations!.interrupt({
          id: fresh.value.id,
          revision: fresh.value.revision,
        })
      ).status,
    ).toBe("ok");
    expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(1);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("child native tool deliveries and compaction retain exact child ownership", async () => {
  const captured: unknown[] = [],
    delivered: unknown[] = [],
    invalidated: string[] = [];
  const f = await fixture(true, {
    onToolContent: async (value) => {
      captured.push(value);
    },
    onToolResultDelivered: (value) => {
      delivered.push(value);
    },
    onContextInvalidated: (value) => {
      invalidated.push(value);
    },
  });
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    await until(() => signals.some((s) => s.kind === "operation.started"));
    const params = {
      threadId: "native-child",
      turnId: "child-turn",
      item: {
        id: "child-result",
        type: "mcpToolCall",
        status: "completed",
        server: "fixture",
        tool: "inspect",
        result: { content: [{ type: "text", text: "Read-only result" }] },
      },
    };
    f.emit({ method: "item/completed", params });
    f.emit({ method: "item/completed", params });
    f.emit({
      method: "item/completed",
      params: {
        threadId: "native-child",
        turnId: "child-turn",
        item: { type: "contextCompaction" },
      },
    });
    await until(() => invalidated.length > 0);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      operationId: "child-op",
      origin: { kind: "tool", callId: "child-result" },
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      operationId: "child-op",
      server: "fixture",
      tool: "inspect",
    });
    expect(invalidated).toEqual(["child-op"]);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("unadmitted and stale child interactions cannot borrow an operation or remain unanswered", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    const requests = [
      ["item/commandExecution/requestApproval", { decision: "decline" }],
      ["item/fileChange/requestApproval", { decision: "decline" }],
      ["mcpServer/elicitation/request", { action: "decline" }],
      ["item/tool/requestUserInput", { answers: {} }],
    ] as const;
    for (const admitted of [false, true]) {
      if (admitted) {
        f.emit({
          method: "turn/started",
          params: { threadId: "native-child", turn: { id: "child-turn" } },
        });
        await until(() => signals.some((s) => s.kind === "operation.started"));
      }
      for (const [method, result] of requests) {
        const requestId = `${admitted}:${method}`;
        f.emit({
          id: requestId,
          method,
          params: { threadId: "native-child", turnId: "obsolete-turn" },
        });
        await until(() => f.replies.some((r) => (r as { id: string }).id === requestId));
        expect(f.replies).toContainEqual({ id: requestId, result });
      }
    }
    expect(
      signals.some((s) => s.kind === "approval.requested" || s.kind === "input.requested"),
    ).toBe(false);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("uncorrelated child MCP requests are explicitly declined, not attached to the current turn", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    await until(() => signals.some((s) => s.kind === "operation.started"));
    for (const turnId of [null, "obsolete-turn"]) {
      const requestId = `uncorrelated-${turnId}`;
      f.emit({
        id: requestId,
        method: "mcpServer/elicitation/request",
        params: {
          threadId: "native-child",
          turnId,
          mode: "form",
          message: "Permission?",
          serverName: "drawloom",
          _meta: { codex_approval_kind: "mcp_tool_call" },
          requestedSchema: { type: "object", properties: {} },
        },
      });
      await until(() => f.replies.some((r) => (r as { id: string }).id === requestId));
      expect(f.replies).toContainEqual({
        id: requestId,
        result: { action: "decline" },
      });
    }
    expect(signals.some((s) => s.kind === "approval.requested")).toBe(false);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("a listed native thread with unrelated ancestry is not admitted as a child", async () => {
  const f = await fixture();
  f.reparent();
  try {
    expect(f.session.delegations).toBeDefined();
    expect((await f.session.delegations!.list()).status).toBe("rejected");
    expect(f.requests.some((r) => r.method === "turn/interrupt")).toBe(false);
  } finally {
    await f.session.close();
  }
});

test("a child start naming a turn absent from authoritative native state cannot gain authority", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "unverified-turn" } },
    });
    // The queued parent signal is a deterministic receive-chain barrier.
    f.emit({ method: "thread/goal/cleared", params: { threadId: "private-thread" } });
    await until(() => signals.some((s) => s.kind === "goal.updated"));
    expect(signals.some((s) => s.kind === "operation.started")).toBe(false);
  } finally {
    await f.session.close();
    await drain;
  }
});

test("delegation integration is absent without host child admission", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "unsupported",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open failed");
  expect(opened.value.delegations).toBeUndefined();
  await opened.value.close();
});

test("child interruption is exact, remains pending until a terminal event and is not repeated", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    await until(() => signals.some((s) => s.kind === "operation.started"));
    const listed = await f.session.delegations!.list();
    if (listed.status !== "ok") throw Error("Discovery unavailable");
    const child = listed.value[0]!;
    expect(child.operationId).toBe("child-op");
    expect(
      (await f.session.delegations!.interrupt({ id: child.id, revision: "stale" })).status,
    ).toBe("rejected");
    expect(
      (await f.session.delegations!.interrupt({ id: child.id, revision: child.revision })).status,
    ).toBe("ok");
    const pending = await f.session.delegations!.read(child.id);
    expect(pending.status === "ok" && pending.value.controls.interrupt).toBe("pending");
    expect(pending.status === "ok" && pending.value.revision).not.toBe(child.revision);
    expect(f.requests.filter((r) => r.method === "turn/interrupt")).toEqual([
      { method: "turn/interrupt", params: { threadId: "native-child", turnId: "child-turn" } },
    ]);
    expect(signals.some((s) => s.kind === "operation.interrupted")).toBe(false);
    expect(
      (await f.session.delegations!.interrupt({ id: child.id, revision: child.revision })).status,
    ).toBe("rejected");
    f.emit({
      method: "turn/completed",
      params: { threadId: "native-child", turn: { id: "child-turn", status: "interrupted" } },
    });
    await until(() => signals.some((s) => s.kind === "operation.interrupted"));
    expect(signals.find((s) => s.kind === "operation.interrupted")).toMatchObject({
      operationId: "child-op",
    });
  } finally {
    await f.session.close();
    await drain;
  }
});

test("disconnect retains an unknown child outcome rather than a stale interrupt control", async () => {
  const f = await fixture(true);
  const signals: import("@drawloom/agent").AgentSessionSignal[] = [];
  const drain = (async () => {
    for await (const signal of f.session.signals()) signals.push(signal);
  })();
  f.emit({
    method: "turn/started",
    params: { threadId: "native-child", turn: { id: "child-turn" } },
  });
  await until(() => signals.some((s) => s.kind === "operation.started"));
  await f.session.close();
  await drain;
  expect(signals.filter((s) => s.kind === "delegation.updated").at(-1)).toMatchObject({
    child: { status: "unknown", operationId: "child-op", controls: { interrupt: "unknown" } },
  });
});

test("scripted native discovery satisfies shared delegation conformance", async () => {
  const f = await fixture();
  try {
    await agentDelegationConformance(f.session.delegations);
  } finally {
    await f.session.close();
  }
});

test("a follow-up reference is resolved privately into a parent turn, never direct child input", async () => {
  const f = await fixture();
  f.session.signals();
  try {
    const found = await f.session.delegations!.list();
    if (found.status !== "ok") throw Error("No discovery");
    const child = found.value[0]!;
    const text = `Ask ${child.label} to clarify the result.`;
    const sent = await f.session.execute({
      operationId: "follow-up",
      text,
      delegationReferences: [child.id],
    });
    expect(sent.status).toBe("ok");
    const request = f.requests.find((r) => r.method === "turn/start");
    expect(request).toMatchObject({ params: { threadId: "private-thread" } });
    expect(JSON.stringify(request)).toContain("native-child");
    expect(
      f.requests.some(
        (r) => r.method === "thread/resume" && JSON.stringify(r.params).includes("native-child"),
      ),
    ).toBe(false);
  } finally {
    await f.session.close();
  }
});

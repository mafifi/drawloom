import { expect, test } from "vitest";
import { recorded } from "./driver.test.js";
import type { JsonStore, JsonValue } from "@drawloom/host";
import { agentForkConformance } from "@drawloom/agent/delegation-conformance";

test("scripted Codex fork receipts satisfy shared conformance", async () => {
  const f = await fixture();
  try {
    await agentForkConformance(f.session.forks);
    expect(f.requests.filter((r) => r.method === "thread/fork")).toHaveLength(1);
  } finally {
    await f.session.close();
  }
});

async function fixture(mode: "ok" | "unknown" | "active" = "ok") {
  let connections = 0;
  let forkConnectionsClosed = 0;
  const values = new Map<string, JsonValue>();
  const store: JsonStore = {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
  };
  const f = recorded({
    store,
    connect: async () => {
      connections++;
      if (connections === 1) return f.transport;
      return {
        ...f.transport,
        close: async () => {
          forkConnectionsClosed++;
        },
      };
    },
  });
  const request = f.transport.request.bind(f.transport);
  f.transport.request = async (method, params) => {
    if (method === "thread/read")
      return {
        thread: {
          id: "private-thread",
          turns: [
            {
              id: "last-turn",
              status: mode === "active" ? "inProgress" : "completed",
            },
          ],
        },
      };
    if (method === "thread/fork") {
      f.requests.push({ method, params });
      if (mode === "unknown") throw Error("response lost");
      return { thread: { id: "private-fork" } };
    }
    return request(method, params);
  };
  const opened = await f.driver.openSession({
    sessionId: "source",
    context: { text: "trusted instructions" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open failed");
  return { ...f, store, session: opened.value, forkConnectionsClosed: () => forkConnectionsClosed };
}

test("fork releases its native writer before returning without closing the parent connection", async () => {
  const f = await fixture();
  let parentClosed = false;
  f.transport.close = async () => {
    parentClosed = true;
  };
  try {
    expect(
      (await f.session.forks!.create({ requestId: "writer-release", sessionId: "independent" }))
        .status,
    ).toBe("ok");
    expect(f.forkConnectionsClosed()).toBe(1);
    expect(parentClosed).toBe(false);
  } finally {
    await f.session.close();
  }
});

test("fork binds a completed prefix without submitting a turn or inheriting a goal", async () => {
  const f = await fixture();
  try {
    await f.store.set("codex-operations:source", { "last-turn": "source-operation" });
    expect(f.session.forks).toBeDefined();
    const result = await f.session.forks!.create({
      requestId: "fork-request",
      sessionId: "target",
    });
    expect(result).toEqual({
      status: "ok",
      value: {
        requestId: "fork-request",
        sessionId: "target",
        state: "created",
      },
    });
    expect(f.requests.find((r) => r.method === "thread/fork")?.params).toMatchObject({
      threadId: "private-thread",
      lastTurnId: "last-turn",
      deferGoalContinuation: false,
      developerInstructions: "trusted instructions",
      approvalPolicy: "on-request",
      sandbox: "read-only",
    });
    expect(f.requests.some((r) => r.method === "turn/start")).toBe(false);
    expect(await f.store.get("codex-fork-history:target")).toEqual({
      nativeId: "private-fork",
      turns: { "last-turn": { threadId: "private-thread", operationId: "source-operation" } },
    });
    expect(await f.store.get("codex-operations:target")).toEqual({
      "last-turn": "source-operation",
    });
    await f.session.forks!.create({
      requestId: "fork-request",
      sessionId: "target",
    });
    expect(f.requests.filter((r) => r.method === "thread/fork")).toHaveLength(1);
  } finally {
    await f.session.close();
  }
});

test("ambiguous fork response is retained and never resubmitted", async () => {
  const f = await fixture("unknown");
  try {
    expect(f.session.forks).toBeDefined();
    const input = { requestId: "uncertain", sessionId: "target" };
    const first = await f.session.forks!.create(input);
    expect(first).toMatchObject({ status: "ok", value: { state: "unknown" } });
    expect(await f.session.forks!.create(input)).toEqual(first);
    expect(f.requests.filter((r) => r.method === "thread/fork")).toHaveLength(1);
  } finally {
    await f.session.close();
  }
});

test("fork rejects an active source before creating a native conversation", async () => {
  const f = await fixture("active");
  try {
    expect(f.session.forks).toBeDefined();
    expect(
      (
        await f.session.forks!.create({
          requestId: "blocked",
          sessionId: "target",
        })
      ).status,
    ).toBe("rejected");
    expect(f.requests.some((r) => r.method === "thread/fork")).toBe(false);
  } finally {
    await f.session.close();
  }
});

test("fork recovery retains native identity when local continuity registration fails", async () => {
  const f = await fixture();
  // The actual store boundary fails, not the native provider response.
  const set = f.store.set.bind(f.store);
  let unavailable = true;
  f.store.set = async (key, value) => {
    if (key === "codex:target" && unavailable) throw Error("store unavailable");
    return set(key, value);
  };
  try {
    const input = { requestId: "recover-registration", sessionId: "target" };
    expect((await f.session.forks!.create(input)).status).toBe("rejected");
    unavailable = false;
    expect(await f.session.forks!.read(input.requestId)).toMatchObject({
      status: "ok",
      value: { state: "created", sessionId: "target" },
    });
    expect(f.requests.filter((r) => r.method === "thread/fork")).toHaveLength(1);
  } finally {
    await f.session.close();
  }
});

test("a pending fork receipt recovered without its submission is uncertain, not safe to retry", async () => {
  const f = await fixture();
  try {
    await f.store.set('codex-fork:["source","crashed"]', {
      requestId: "crashed",
      sessionId: "target",
      state: "pending",
      nativeId: null,
      history: {},
    });
    expect(await f.session.forks!.read("crashed")).toMatchObject({
      status: "ok",
      value: { state: "unknown" },
    });
    expect(
      await f.session.forks!.create({
        requestId: "crashed",
        sessionId: "target",
      }),
    ).toMatchObject({
      status: "ok",
      value: { state: "unknown" },
    });
    expect(f.requests.some((r) => r.method === "thread/fork")).toBe(false);
  } finally {
    await f.session.close();
  }
});

test("starting a source turn is rejected while its fork is being submitted", async () => {
  const f = await fixture();
  f.session.signals();
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = f.transport.request.bind(f.transport);
  f.transport.request = async (method, params) => {
    if (method === "thread/fork") {
      started();
      await waiting;
    }
    return request(method, params);
  };
  const fork = f.session.forks!.create({
    requestId: "pending",
    sessionId: "target",
  });
  try {
    await dispatched;
    expect((await f.session.execute({ operationId: "racing", text: "Start" })).status).toBe(
      "rejected",
    );
  } finally {
    release();
    await fork;
    await f.session.close();
  }
});

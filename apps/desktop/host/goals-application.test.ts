import { expect, test } from "vitest";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import { createDesktopApplication } from "./application.js";

test("goal read reconnects after an idle native connection ends without repeating a mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-goal-reconnect-"));
  const working = join(root, "working");
  await mkdir(working);
  let disconnect = () => {};
  let connections = 0;
  const mutations: string[] = [];
  const app = await createDesktopApplication(join(root, "data"), {
    codex: {
      async connect(cwd) {
        connections++;
        return {
          async request(method) {
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start" || method === "thread/resume")
              return { thread: { id: "reconnect-native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/goal/get") return { goal: null };
            if (method === "thread/read")
              return { thread: { id: "reconnect-native", cwd, turns: [] } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "thread/goal/set" || method === "turn/start") mutations.push(method);
            return {};
          },
          notify() {},
          respond() {},
          subscribe(_next, failed) {
            disconnect = failed;
            return () => {};
          },
          async close() {},
        };
      },
    },
  });
  try {
    await app.command({ kind: "add_project", directory: working });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    await app.command({
      kind: "goal",
      conversationId: created.selectedId,
      command: { action: "read" },
    });
    disconnect();
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 1));
    const read = await app.command({
      kind: "goal",
      conversationId: created.selectedId,
      command: { action: "read" },
    });
    expect(read.goal).toMatchObject({ supported: true, snapshot: null });
    expect(connections).toBe(2);
    expect(mutations).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop native continuation has a fresh operation and retains its plan and approval", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-goals-app-"));
  const working = join(root, "working");
  await mkdir(working);
  let receive: (message: RpcMessage) => void = () => {};
  const app = await createDesktopApplication(join(root, "data"), {
    codex: {
      async connect(cwd) {
        const rpc: RpcTransport = {
          async request(method) {
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start")
              return { thread: { id: "native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/goal/get") return { goal: null };
            if (method === "thread/read") return { thread: { id: "native", cwd, turns: [] } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start") return { turn: { id: "first" } };
            return {};
          },
          notify() {},
          respond() {},
          subscribe(next) {
            receive = next;
            return () => {};
          },
          async close() {},
        };
        return rpc;
      },
    },
  });
  /** Drain queued asynchronous work. Node and Bun schedule differently, so a
   * fixed tick count is not a reliable barrier. Callers that depend on a
   * specific outcome pass a predicate and this waits for it. */
  const settle = async (until?: () => unknown) => {
    const deadline = Date.now() + 10_000;
    for (let i = 0; ; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (i >= 15 && (!until || (await until()))) return;
      if (Date.now() > deadline) return;
    }
  };
  try {
    await app.command({ kind: "add_project", directory: working });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    const id = created.selectedId;
    expect(created.goal).toMatchObject({ supported: true });
    const loaded = await app.command({
      kind: "goal",
      conversationId: id,
      command: { action: "read" },
    });
    expect(loaded.goal).toMatchObject({ supported: true, snapshot: null });
    const sent = await app.command({
      kind: "send",
      conversationId: id,
      text: "Synthetic work",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    const previous = sent.activeOperation;
    receive({
      method: "turn/completed",
      params: { threadId: "native", turn: { id: "first", status: "completed" } },
    });
    receive({
      method: "turn/started",
      params: { threadId: "native", turn: { id: "next", status: "inProgress", items: [] } },
    });
    receive({
      method: "turn/plan/updated",
      params: {
        threadId: "native",
        turnId: "next",
        plan: [{ step: "Verify", status: "inProgress" }],
      },
    });
    receive({
      id: 17,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "native",
        turnId: "next",
        itemId: "command",
        command: "echo synthetic",
        cwd: working,
      },
    });
    await settle(async () => (await app.snapshot()).approvals.length === 1);
    const next = await app.snapshot();
    expect(next.activeOperation).toBeDefined();
    if (!next.activeOperation) throw Error("Missing continuation operation");
    expect(next.activeOperation).not.toBe(previous);
    expect(next.approvals).toHaveLength(1);
    expect(next.approvals[0]?.request.operationId).toBe(next.activeOperation);
    const page = await app.historyPage(id);
    expect(page.entries.find((entry) => entry.origin.kind === "plan")?.operationId).toBe(
      next.activeOperation,
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

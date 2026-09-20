import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import type {
  ApprovalPresentationActions,
  ApprovalPresenter,
} from "@drawloom/agent/approval-presentation";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";
import { createInboxApprovalPresenter } from "@drawloom/replacement-examples";
import { createApprovalPresentationHost } from "./approval-presentation.js";

async function fixture(presenter?: ApprovalPresenter) {
  const root = await mkdtemp(join(tmpdir(), "drawloom-approval-app-"));
  const working = join(root, "working");
  await mkdir(working);
  let receive: (message: RpcMessage) => void = () => {};
  const responses: unknown[] = [];
  const calls: string[] = [];
  let turn = 0;
  let completed = false;
  const app = await createDesktopApplication(join(root, "data"), {
    ...(presenter ? { approvalPresenter: presenter } : {}),
    codex: {
      async connect(cwd) {
        const rpc: RpcTransport = {
          async request(method, params) {
            calls.push(method);
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start")
              return { thread: { id: "native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/fork") return { thread: { id: "native-fork", cwd } };
            if (method === "thread/resume")
              return {
                thread: { id: (params as { threadId: string }).threadId, cwd },
                approvalsReviewer: "user",
              };
            if (method === "thread/read") {
              if ((params as { threadId?: string }).threadId === "native-child")
                return {
                  thread: {
                    id: "native-child",
                    parentThreadId: "native",
                    canAcceptDirectInput: false,
                    status: { type: "active" },
                    turns: [{ id: "child-turn", status: "inProgress", items: [] }],
                  },
                };
              return {
                thread: {
                  id: (params as { threadId: string }).threadId,
                  cwd,
                  turns: [
                    { id: "turn", status: completed ? "completed" : "inProgress", items: [] },
                  ],
                },
              };
            }
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start")
              return { turn: { id: ++turn === 1 ? "turn" : `turn-${turn}` } };
            return {};
          },
          notify() {},
          respond(id, result) {
            responses.push({ id, result });
          },
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
  await app.command({ kind: "add_project", directory: working });
  const created = await app.command({
    kind: "create_conversation",
    workbenchId: "text",
    provider: "codex",
  });
  const id = created.selectedId;
  await app.command({
    kind: "send",
    conversationId: id,
    text: "Synthetic review",
    attachmentKeys: [],
    contextArtifactIds: [],
  });
  const settle = async () => {
    for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    app,
    id,
    responses,
    calls,
    emit: (message: RpcMessage) => receive(message),
    settle,
    async request() {
      receive({
        id: 73,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "native",
          turnId: "turn",
          itemId: "command",
          command: "echo synthetic",
          cwd: working,
        },
      });
      await settle();
    },
    async complete() {
      completed = true;
      receive({
        method: "turn/completed",
        params: { threadId: "native", turn: { id: "turn", status: "completed" } },
      });
      await settle();
    },
    async close() {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("desktop routes child approvals independently after parent completion", async () => {
  const f = await fixture();
  try {
    f.emit({
      method: "turn/started",
      params: { threadId: "native-child", turn: { id: "child-turn" } },
    });
    f.emit({
      id: "child-review",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "native-child",
        turnId: "child-turn",
        reason: "Synthetic child review",
        availableDecisions: ["decline"],
      },
    });
    await f.settle();
    const before = (await f.app.snapshot()).approvals;
    expect(before).toHaveLength(1);
    await f.complete();
    const after = await f.app.snapshot();
    expect(after.activeOperation).toBeUndefined();
    expect(after.approvals).toHaveLength(1);
    expect(after.approvals[0]?.request.operationId).toBe(before[0]?.request.operationId);
    const pending = after.approvals[0]!;
    await f.app.command({
      kind: "approval",
      conversationId: f.id,
      resolution: { approvalId: pending.request.approvalId, optionId: "option-0" },
      presentationId: pending.presentationId,
    });
    expect(f.responses).toContainEqual({ id: "child-review", result: { decision: "decline" } });
  } finally {
    await f.close();
  }
});

test("desktop registers and opens an independent fork only after native confirmation", async () => {
  const f = await fixture();
  try {
    await f.complete();
    const source = (await f.app.snapshot()).conversations.find(
      (conversation) => conversation.id === f.id,
    )!;
    const forked = await f.app.command({
      kind: "fork_conversation",
      conversationId: f.id,
      requestId: "fork-once",
    });
    const target = forked.conversations.find(
      (conversation) => conversation.id === forked.selectedId,
    )!;
    expect(target.id).not.toBe(source.id);
    expect(target).toMatchObject({
      projectId: source.projectId,
      forkedFromId: source.id,
      workbenchId: source.workbenchId,
    });
    expect(f.calls.filter((call) => call === "thread/fork")).toHaveLength(1);
    expect(f.calls.filter((call) => call === "turn/start")).toHaveLength(1);
    const repeated = await f.app.command({
      kind: "fork_conversation",
      conversationId: f.id,
      requestId: "fork-once",
    });
    expect(repeated.selectedId).toBe(target.id);
    expect(f.calls.filter((call) => call === "thread/fork")).toHaveLength(1);
  } finally {
    await f.close();
  }
});

test("desktop approval can be dismissed and reopened without resolving native request", async () => {
  const f = await fixture();
  try {
    await f.request();
    const pending = (await f.app.snapshot()).approvals[0]!;
    expect(pending.surface).toBe("pending");
    expect(pending.presentation).toBe("desktop");
    await f.app.command({
      kind: "approval_surface",
      conversationId: f.id,
      presentationId: pending.presentationId,
      approvalId: pending.request.approvalId,
      action: "dismiss",
    });
    expect((await f.app.snapshot()).approvals[0]?.surface).toBe("dismissed");
    expect(f.responses).toHaveLength(0);
    await expect(
      f.app.command({
        kind: "approval",
        conversationId: f.id,
        presentationId: pending.presentationId,
        resolution: {
          approvalId: pending.request.approvalId,
          optionId: pending.request.options[0]!.optionId,
        },
      }),
    ).rejects.toThrow();
    await f.app.command({
      kind: "approval_surface",
      conversationId: f.id,
      presentationId: pending.presentationId,
      approvalId: pending.request.approvalId,
      action: "reopen",
    });
    expect((await f.app.snapshot()).approvals[0]?.request.approvalId).toBe(
      pending.request.approvalId,
    );
    for (const command of [
      {
        kind: "approval",
        resolution: {
          approvalId: pending.request.approvalId,
          optionId: pending.request.options[0]!.optionId,
        },
      },
      ...["dismiss", "reopen", "stop"].map((action) => ({
        kind: "approval_surface",
        approvalId: pending.request.approvalId,
        action,
      })),
    ])
      await expect(
        f.app.command({ ...command, conversationId: f.id, presentationId: pending.presentationId }),
      ).rejects.toThrow();
    expect(f.responses).toHaveLength(0);
    expect(f.calls).not.toContain("turn/interrupt");
    await f.app.command({
      kind: "approval",
      conversationId: f.id,
      presentationId: (await f.app.snapshot()).approvals[0]!.presentationId,
      resolution: {
        approvalId: pending.request.approvalId,
        optionId: pending.request.options[0]!.optionId,
      },
    });
    await f.settle();
    expect(f.responses).toHaveLength(1);
    expect((await f.app.snapshot()).approvals).toEqual([]);
  } finally {
    await f.close();
  }
});

test("old desktop card cannot stop a successor operation", async () => {
  const f = await fixture();
  try {
    await f.request();
    const pending = (await f.app.snapshot()).approvals[0]!;
    await f.complete();
    await f.app.command({
      kind: "send",
      conversationId: f.id,
      text: "Successor",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    await expect(
      f.app.command({
        kind: "approval_surface",
        action: "stop",
        conversationId: f.id,
        approvalId: pending.request.approvalId,
        presentationId: pending.presentationId,
      }),
    ).rejects.toThrow();
    expect(f.calls).not.toContain("turn/interrupt");
    await f.app.command({ kind: "stop", conversationId: f.id });
    expect(f.calls).toContain("turn/interrupt");
  } finally {
    await f.close();
  }
});

test("startup presentation failure retries same request and completion invalidates captured actions", async () => {
  const actions: ApprovalPresentationActions[] = [];
  const f = await fixture({
    present(_input, next) {
      actions.push(next);
      if (actions.length === 1) throw Error("Surface unavailable");
    },
  });
  try {
    await f.request();
    const pending = (await f.app.snapshot()).approvals[0]!;
    expect(pending.surface).toBe("failed");
    expect(pending.presentation).toBe("external");
    expect(f.responses).toHaveLength(0);
    await f.app.command({
      kind: "approval_surface",
      conversationId: f.id,
      presentationId: pending.presentationId,
      approvalId: pending.request.approvalId,
      action: "reopen",
    });
    expect(actions).toHaveLength(2);
    expect((await actions[0]!.choose(pending.request.options[0]!.optionId)).status).toBe(
      "rejected",
    );
    await f.complete();
    expect((await f.app.snapshot()).approvals).toEqual([]);
    expect((await actions[1]!.choose(pending.request.options[0]!.optionId)).status).toBe(
      "rejected",
    );
    expect(f.responses).toHaveLength(0);
    expect((await f.app.snapshot()).archiveBlockedConversationIds).not.toContain(f.id);
  } finally {
    await f.close();
  }
});

test("HTTP queue recovers after native invalidation while provider response stays unsettled", async () => {
  const f = await fixture();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const host = createApprovalPresentationHost({
    presenter: { present() {} },
    owns: () => true,
    resolve: async () => {
      entered();
      await waiting;
      return { status: "ok", value: undefined };
    },
    stop: async () => ({ status: "ok", value: undefined }),
  });
  host.admit({
    conversationId: f.id,
    request: {
      approvalId: "a",
      operationId: "op",
      summary: "Synthetic",
      options: [{ optionId: "allow", label: "Allow" }],
    },
  });
  const presentationId = host.pending(f.id)[0]!.presentationId;
  const server = serveDesktop(
    {
      ...f.app,
      async command(raw) {
        if ((raw as { kind: string }).kind === "approval") {
          await host.choose(f.id, "a", "allow", presentationId);
          return f.app.snapshot();
        }
        return f.app.command(raw);
      },
      async close() {},
    },
    join(import.meta.dir, "../build"),
  );
  let pending: Promise<Response> | undefined;
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const headers = {
      cookie: boot.headers.get("set-cookie")!.split(";")[0]!,
      origin: server.origin,
      "Content-Type": "application/json",
    };
    pending = fetch(server.origin + "/api/command", {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: "approval",
        conversationId: f.id,
        presentationId,
        resolution: { approvalId: "a", optionId: "allow" },
      }),
    });
    await started;
    const stopped = await fetch(server.origin + "/api/command", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(500),
      body: JSON.stringify({ kind: "stop", conversationId: f.id }),
    });
    expect(stopped.status).toBe(200);
    expect(f.calls).toContain("turn/interrupt");
    await f.complete();
    host.invalidate(f.id);
    expect((await pending).status).toBe(200);
    const navigated = await fetch(server.origin + "/api/command", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(500),
      body: JSON.stringify({ kind: "select_conversation", conversationId: f.id }),
    });
    expect(navigated.status).toBe(200);
  } finally {
    release();
    host.close();
    await pending;
    await server.close();
    await f.close();
  }
});

test("public inbox replacement presents actual native requests without changing approval authority", async () => {
  const inbox = createInboxApprovalPresenter();
  const f = await fixture(inbox);
  try {
    await f.request();
    const row = inbox.pending()[0]!;
    expect(row.input.conversationId).toBe(f.id);
    expect(f.responses).toHaveLength(0);
    expect((await row.actions.choose("made-up-option")).status).toBe("rejected");
    expect(f.responses).toHaveLength(0);
    expect((await row.actions.choose(row.input.request.options[0]!.optionId)).status).toBe("ok");
    await f.settle();
    expect(f.responses).toHaveLength(1);
    expect(inbox.pending()).toEqual([]);
  } finally {
    await f.close();
  }
});

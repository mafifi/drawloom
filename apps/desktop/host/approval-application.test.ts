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
  const app = await createDesktopApplication(join(root, "data"), {
    ...(presenter ? { approvalPresenter: presenter } : {}),
    codex: {
      async connect(cwd) {
        const rpc: RpcTransport = {
          async request(method) {
            calls.push(method);
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start")
              return { thread: { id: "native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/read") return { thread: { cwd } };
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

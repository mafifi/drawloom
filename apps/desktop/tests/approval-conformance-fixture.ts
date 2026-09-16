import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcMessage, RpcTransport } from "@drawloom/host";
import type { AgentResult } from "@drawloom/agent";
import type {
  ApprovalConformanceOptions,
  ApprovalPresentationFixture,
} from "@drawloom/agent/approval-conformance";
import type { ApprovalPresenter } from "@drawloom/agent/approval-presentation";
import { createInboxApprovalPresenter } from "@drawloom/replacement-examples";
import { createDesktopApplication } from "../host/application.js";

/** Actual desktop commands/snapshots and Codex adapter with disposable native RPC.
 * Default uses ordinary startup. Fault injection uses a separate startup presenter;
 * it does not add a production browser command or approval authority. */
export async function approvalConformanceFixture(
  mode: "desktop" | "inbox",
  options: ApprovalConformanceOptions & { runtimeEntrypoint?: string } = {},
  override?: ApprovalPresenter,
): Promise<ApprovalPresentationFixture & { trace(): readonly string[] }> {
  const root = await mkdtemp(join(tmpdir(), "drawloom-approval-conformance-"));
  const working = join(root, "working");
  await mkdir(working);
  const inbox = createInboxApprovalPresenter();
  const events: string[] = [],
    resolutions: string[] = [];
  let stops = 0,
    fail = options.failPresentation ?? false;
  let receive: (message: RpcMessage) => void = () => {};
  const presenter =
    override ??
    (mode === "inbox" || options.failPresentation
      ? ({
          present(input, actions, lifetime) {
            if (fail) {
              fail = false;
              throw Error("Synthetic surface failure");
            }
            if (mode === "inbox") inbox.present(input, actions, lifetime);
          },
        } satisfies ApprovalPresenter)
      : undefined);
  const app = await createDesktopApplication(join(root, "data"), {
    ...(options.runtimeEntrypoint
      ? { knowledge: { runtimeEntrypoint: options.runtimeEntrypoint } }
      : {}),
    ...(presenter ? { approvalPresenter: presenter } : {}),
    codex: {
      async connect(cwd) {
        const transport: RpcTransport = {
          async request(method) {
            events.push("rpc:" + method);
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start")
              return { thread: { id: "native", cwd }, approvalsReviewer: "user" };
            if (method === "thread/read") return { thread: { cwd } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start") return { turn: { id: "turn" } };
            if (method === "turn/interrupt") stops++;
            return {};
          },
          notify() {},
          respond(id, result) {
            if (id !== 73) throw Error("Unexpected native response identity");
            const decision = (result as { decision?: unknown }).decision;
            if (decision === "accept") resolutions.push("option-0");
            else if (decision === "decline") resolutions.push("option-1");
            else throw Error("Unexpected native choice");
          },
          subscribe(next) {
            receive = next;
            return () => {};
          },
          async close() {},
        };
        return transport;
      },
    },
  });
  const command = async (raw: { kind: string; [key: string]: unknown }) => {
    events.push("command:" + raw.kind);
    return app.command(raw);
  };
  const snapshot = async () => {
    events.push("snapshot");
    return app.snapshot();
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const emit = async (message: RpcMessage) => {
    events.push("native:" + message.method);
    receive(message);
    await settle();
  };
  const response = async (raw: {
    kind: string;
    [key: string]: unknown;
  }): Promise<AgentResult<void>> => {
    try {
      await command(raw);
      await settle();
      return { status: "ok", value: undefined };
    } catch {
      return {
        status: "rejected",
        failure: { code: "invalid_interaction", message: "Native command rejected" },
      };
    }
  };
  let conversationId = "";
  const current = async () => (await snapshot()).approvals[0];
  return {
    async open() {
      await command({ kind: "add_project", directory: working });
      conversationId = (
        await command({ kind: "create_conversation", workbenchId: "text", provider: "codex" })
      ).selectedId;
      await command({
        kind: "send",
        conversationId,
        text: "Synthetic review",
        attachmentKeys: [],
        contextArtifactIds: [],
      });
      await emit({
        id: 73,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "native",
          turnId: "turn",
          itemId: "command",
          command: "echo synthetic",
          cwd: working,
          availableDecisions: ["accept", "decline"],
        },
      });
      const signal = (await snapshot()).signals.find(
        (signal) => signal.kind === "approval.requested",
      );
      if (!signal || signal.kind !== "approval.requested")
        throw Error("Native approval was not observed");
      return {
        conversationId,
        request: {
          ...signal.request,
          options: [
            { optionId: "option-0", label: "accept" },
            { optionId: "option-1", label: "decline" },
          ],
        },
      };
    },
    async surface() {
      const entry = await current();
      if (!entry) return undefined;
      if (mode === "inbox" && !override) {
        const item = inbox.pending()[0];
        if (!item) return undefined;
        return { input: item.input, actions: item.actions };
      }
      const binding = { conversationId, presentationId: entry.presentationId };
      return {
        input: { conversationId, request: entry.request },
        actions: {
          choose: (optionId: string) =>
            response({
              kind: "approval",
              ...binding,
              resolution: { approvalId: entry.request.approvalId, optionId },
            }),
          dismiss: async () => {
            await command({
              kind: "approval_surface",
              ...binding,
              approvalId: entry.request.approvalId,
              action: "dismiss",
            });
          },
          stop: () =>
            response({
              kind: "approval_surface",
              ...binding,
              approvalId: entry.request.approvalId,
              action: "stop",
            }),
        },
      };
    },
    state: async () => (await current())?.surface,
    async reopen() {
      const entry = (await current())!;
      await command({
        kind: "approval_surface",
        conversationId,
        approvalId: entry.request.approvalId,
        presentationId: entry.presentationId,
        action: "reopen",
      });
    },
    invalidate: () =>
      emit({
        method: "turn/completed",
        params: { threadId: "native", turn: { id: "turn", status: "completed" } },
      }),
    async chooseElsewhere() {
      const entry = (await current())!;
      return response({
        kind: "approval",
        conversationId: "other-conversation",
        presentationId: entry.presentationId,
        resolution: {
          approvalId: entry.request.approvalId,
          optionId: entry.request.options[0]!.optionId,
        },
      });
    },
    resolutions: () => [...resolutions],
    stops: () => stops,
    trace: () => [...events],
    async close() {
      try {
        await app.close();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  };
}

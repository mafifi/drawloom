import type { HistoryEntry, ConversationHistoryReader } from "@drawloom/conversation-history";
import type { Asset } from "@drawloom/host";
import type { OperatorController } from "@drawloom/workbench";
import type { DesktopSession } from "./desktop-sessions.js";
import type { createHistoryCoordinator } from "./history-coordinator.js";
import type { createApprovalPresentationHost } from "./approval-presentation.js";
import type { createOperationTelemetry } from "./telemetry.js";

type Submission = {
  displayId: string;
  text: string;
  assets: Asset[];
  selections: NonNullable<HistoryEntry["selections"]>;
  resources: NonNullable<HistoryEntry["resources"]>;
};

/** Processes one published session's signals; the session registry owns reader recovery and teardown. */
export function createSessionSignalReader({
  conversationId,
  state,
  historyWriter,
  submissions,
  approvals,
  operationTelemetry,
  project,
  persist,
  controller,
  synchronizeHistory,
  notice,
}: {
  conversationId: string;
  state: DesktopSession;
  historyWriter: Pick<
    ReturnType<typeof createHistoryCoordinator>,
    "write" | "writeAsset" | "flush" | "reportStorageFailure" | "unavailable"
  >;
  submissions: Map<string, Submission[]>;
  approvals: Pick<ReturnType<typeof createApprovalPresentationHost>, "admit" | "invalidate">;
  operationTelemetry: Pick<ReturnType<typeof createOperationTelemetry>, "signal">;
  project: { assets: Asset[] };
  persist(): Promise<void>;
  controller(): Pick<OperatorController, "observeArtifact"> | undefined;
  synchronizeHistory(conversationId: string, history: ConversationHistoryReader): Promise<void>;
  notice(message: string): void;
}) {
  const { session, signals } = state;
  const messages = new Map<string, Omit<HistoryEntry, "position">>();
  return {
    async read() {
      for await (const signal of session.signals()) {
        operationTelemetry.signal(signal);
        if (signal.kind === "message.delta" || signal.kind === "message.completed") {
          const key = signal.operationId + ":" + signal.messageId;
          let message = messages.get(key);
          if (!message) {
            message = {
              id: key,
              role:
                signal.kind === "message.completed" ? (signal.role ?? "assistant") : "assistant",
              text: "",
              assets: signal.kind === "message.completed" ? (signal.assets ?? []) : [],
              operationId: signal.operationId,
              state: "partial",
            };
            messages.set(key, message);
          }
          message.text =
            signal.kind === "message.delta" ? message.text + signal.delta : signal.text;
          message.state = signal.kind === "message.completed" ? "complete" : "partial";
          if (signal.kind === "message.completed" && signal.assets) message.assets = signal.assets;
          if (signal.kind === "message.completed" && signal.preparation)
            message.preparation = signal.preparation;
          if (signal.kind === "message.completed" && signal.role === "user") {
            const pending = submissions.get(signal.operationId);
            const index = pending?.findIndex((value) => value.displayId === signal.displayId) ?? -1;
            const submission = index >= 0 ? pending?.splice(index, 1)[0] : undefined;
            if (submission) {
              const { displayId: _, ...visible } = submission;
              Object.assign(message, visible);
            }
          }
          await historyWriter.write({ ...message });
          if (message.state === "complete") messages.delete(key);
        } else if (signal.kind === "artifact.available") {
          try {
            if (!project.assets.some((a) => a.key === signal.asset.key)) {
              project.assets.push(signal.asset);
              await persist();
            }
            await historyWriter.writeAsset(
              signal.messageId ? signal.operationId + ":" + signal.messageId : crypto.randomUUID(),
              signal.operationId,
              signal.asset,
            );
          } catch {
            historyWriter.reportStorageFailure();
          }
          try {
            await controller()?.observeArtifact?.({
              operationId: signal.operationId,
              asset: signal.asset,
            });
          } catch {
            notice(
              "The provider returned an asset, but workbench intake could not be saved. No execution was retried.",
            );
          }
        } else {
          signals.push(signal);
          if (signal.kind === "operation.started" && !state.active)
            state.active = signal.operationId;
          if (signal.kind === "approval.requested")
            approvals.admit({ conversationId, request: signal.request });
          else if (signal.kind === "approval.resolved")
            approvals.invalidate(conversationId, signal.approvalId, true);
          if (
            ["operation.completed", "operation.failed", "operation.interrupted"].includes(
              signal.kind,
            )
          ) {
            if ("operationId" in signal && state.active === signal.operationId) {
              approvals.invalidate(conversationId);
              delete state.active;
            }
            for (const message of messages.values())
              await historyWriter.write({ ...message, state: "interrupted" });
            messages.clear();
            await historyWriter.flush();
            if (session.history) await synchronizeHistory(conversationId, session.history);
          }
        }
      }
    },
    async unavailable() {
      delete state.active;
      notice("Session connection failed. Restart the host to reconnect.");
      await historyWriter.unavailable();
    },
  };
}

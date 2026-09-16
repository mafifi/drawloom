import type { DesktopCommand, DesktopSnapshot } from "./protocol.js";

export type ApprovalCardPresentation = ReturnType<typeof approvalCard>;
export interface ApprovalCardActions {
  choose(optionId: string): Promise<unknown>;
  dismiss(): Promise<unknown>;
  reopen(): Promise<unknown>;
  stop(): Promise<unknown>;
}
export function approvalCard(
  entry: DesktopSnapshot["approvals"][number],
  pending: DesktopCommand | undefined,
  busy: boolean,
  stopping?: DesktopCommand,
) {
  const visible = entry.surface === "pending" && entry.presentation === "desktop";
  const matches = (command: DesktopCommand | undefined) =>
    command?.kind === "approval_surface" &&
    command.action === "stop" &&
    command.conversationId === entry.conversationId &&
    command.approvalId === entry.request.approvalId &&
    command.presentationId === entry.presentationId;
  return {
    title: "Execution approval",
    summary: entry.request.summary,
    details: entry.request.details ?? "",
    detailsLabel: "Proposed action",
    message:
      entry.surface === "failed"
        ? "The approval could not be shown. The agent is still waiting for your decision."
        : entry.surface === "dismissed"
          ? "Approval closed. No decision has been sent."
          : entry.presentation === "external"
            ? "Waiting for your decision in another approval presentation."
            : entry.submitting
              ? "Sending your decision…"
              : "",
    options: visible
      ? entry.request.options.map((option) => ({
          ...option,
          pending:
            pending?.kind === "approval" &&
            pending.conversationId === entry.conversationId &&
            pending.presentationId === entry.presentationId &&
            pending.resolution.approvalId === entry.request.approvalId &&
            pending.resolution.optionId === option.optionId,
        }))
      : [],
    disabled: busy || entry.submitting,
    dismiss: entry.surface === "pending" && !entry.submitting,
    dismissLabel: "Close approval",
    reopen: entry.surface !== "pending",
    reopenLabel: entry.surface === "failed" ? "Show again" : "Reopen approval",
    reopenPending:
      pending?.kind === "approval_surface" &&
      pending.action === "reopen" &&
      pending.conversationId === entry.conversationId &&
      pending.presentationId === entry.presentationId &&
      pending.approvalId === entry.request.approvalId,
    stopLabel: "Stop",
    stopPendingLabel: "Stopping",
    stopping:
      matches(pending) ||
      matches(stopping) ||
      (pending?.kind === "stop" && pending.conversationId === entry.conversationId) ||
      (stopping?.kind === "stop" && stopping.conversationId === entry.conversationId),
  };
}

import type { AgentDelegation } from "@drawloom/agent";

export function delegationPresentation(
  retained: AgentDelegation,
  current: AgentDelegation | undefined,
  connected: boolean,
) {
  const verified = connected ? current : undefined;
  const child = verified ?? retained;
  const settled = ["completed", "failed", "interrupted"].includes(child.status);
  const status = !verified && !settled ? "unknown" : child.status;
  const labels = {
    starting: "Starting",
    running: "Working",
    waiting: "Awaiting input",
    completed: "Completed",
    failed: "Failed",
    interrupted: "Interrupted",
    unknown: "Outcome unverified",
  };
  return {
    id: child.id,
    label: child.label,
    statusLabel:
      verified?.controls.interrupt === "pending" ? "Interruption requested" : labels[status],
    state: (status === "completed"
      ? "output-available"
      : status === "running" || status === "starting" || status === "waiting"
        ? "input-streaming"
        : "output-error") as "output-available" | "input-streaming" | "output-error",
    expanded: status !== "completed",
    result: child.result.state === "available" ? child.result.text : undefined,
    followUp: Boolean(verified),
    inspect: connected,
    interrupt: verified?.controls.interrupt === "available",
    note: verified
      ? "Follow-ups are sent to the parent agent. This is not an independent conversation."
      : "Retained native task snapshot. Inspect after reconnecting to verify its current state.",
  };
}

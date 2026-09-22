import type { ToolResult } from "@drawloom/tools";

export function toolActivityTitle(
  name: string | undefined,
  labels: readonly { toolName: string; title: string }[],
) {
  return (
    labels.find((label) => label.toolName === name)?.title ??
    (name && !name.startsWith("pkg_") ? name.replace(/[_.]/g, " ") : "Recorded tool call")
  );
}

export function groupToolActivity<T extends ToolResult>(
  results: readonly T[],
  entries: readonly {
    id: string;
    operationId?: string;
    origin?: { kind: string; callId?: string };
  }[],
) {
  const retained = new Set(
    entries.filter((entry) => entry.origin?.kind === "tool").map((entry) => entry.origin?.callId),
  );
  // A retained process row is collapsed independently and does not own the
  // fallback activity slot. Uncaptured outcomes must stay visible outside it.
  const anchors = new Map(
    entries
      .filter((e) => e.operationId && e.origin?.kind !== "tool")
      .map((e) => [e.operationId!, e.id]),
  );
  const groups = new Map<string, T[]>();
  for (const result of results) {
    if (retained.has(result.invocationId)) continue;
    const anchor = result.operationId ? (anchors.get(result.operationId) ?? "") : "";
    const group = groups.get(anchor) ?? [];
    group.push(result);
    groups.set(anchor, group);
  }
  return groups;
}

export function groupPendingToolActivity<T extends { invocationId: string; operationId?: string }>(
  starts: readonly T[],
  results: readonly Pick<ToolResult, "invocationId">[],
  entries: readonly { id: string; operationId?: string; origin?: { kind: string } }[],
  activeOperation?: string,
) {
  const finished = new Set(results.map((result) => result.invocationId));
  const anchors = new Map(
    entries
      .filter((entry) => entry.operationId && entry.origin?.kind !== "tool")
      .map((entry) => [entry.operationId!, entry.id]),
  );
  const groups = new Map<string, T[]>();
  for (const start of starts) {
    if (finished.has(start.invocationId) || start.operationId === activeOperation) continue;
    const anchor = start.operationId ? (anchors.get(start.operationId) ?? "") : "";
    const group = groups.get(anchor) ?? [];
    group.push(start);
    groups.set(anchor, group);
  }
  return groups;
}

export type ToolOutcomePresentation = Readonly<{
  label: string;
  state: "completed" | "denied" | "cancelled" | "failed" | "uncertain";
  statusLabel: string;
  description: string;
}>;

export function presentToolOutcome(result: ToolResult): ToolOutcomePresentation {
  if (result.outcome.status === "ok") {
    return {
      label: "Tool activity",
      state: "completed",
      statusLabel: "Completed",
      description:
        "Execution completed and its outcome was recorded. This is not acceptance or publication.",
    };
  }
  if (result.outcome.execution === "unknown" || result.evidence === "outcome_failed") {
    return {
      label: "Tool activity",
      state: "uncertain",
      statusLabel: "Outcome uncertain",
      description:
        "The final execution outcome could not be confirmed. Drawloom will not retry it automatically.",
    };
  }
  if (result.outcome.code === "denied" && result.outcome.execution === "not_started") {
    return {
      label: "Tool activity",
      state: "denied",
      statusLabel: "Denied",
      description: "Execution was denied and did not start.",
    };
  }
  if (result.outcome.code === "cancelled" && result.outcome.execution === "not_started") {
    return {
      label: "Tool activity",
      state: "cancelled",
      statusLabel: "Cancelled",
      description: "Execution was cancelled.",
    };
  }
  return {
    label: "Tool activity",
    state: "failed",
    statusLabel: "Failed",
    description:
      result.outcome.execution === "completed"
        ? "Execution completed, but its result could not be used."
        : "Execution did not complete.",
  };
}

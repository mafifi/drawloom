import type { HistoryEntry } from "@drawloom/conversation-history";

export type ConversationNode =
  | { kind: "proposal"; id: string; entry: HistoryEntry; latest: boolean; implementable: boolean }
  | { kind: "plan"; id: string; entry: HistoryEntry; latest: boolean; expanded: boolean }
  | { kind: "message"; id: string; entry: HistoryEntry }
  | {
      kind: "process";
      id: string;
      entries: HistoryEntry[];
      expanded: boolean;
      needsAttention: boolean;
    };

/** Retained and live records have the same authoritative order and provenance. */
export function projectConversation(
  entries: readonly HistoryEntry[],
  anchorId?: string,
): ConversationNode[] {
  const nodes: ConversationNode[] = [];
  const latestPlan = entries.findLast((entry) => entry.origin.kind === "plan")?.id;
  const latestProposal = entries.findLast((entry) => entry.origin.kind === "proposal")?.id;
  const implemented = new Set(
    entries.flatMap((entry) =>
      entry.origin.kind === "user" && entry.origin.implementsProposalId
        ? [entry.origin.implementsProposalId]
        : [],
    ),
  );
  for (const entry of entries) {
    if (entry.origin.kind === "proposal") {
      const latest = entry.id === latestProposal;
      nodes.push({
        kind: "proposal",
        id: entry.id,
        entry,
        latest,
        implementable:
          latest && !implemented.has(entry.id) && entry.state === "complete" && !!entry.text.trim(),
      });
      continue;
    }
    if (entry.origin.kind === "plan") {
      const latest = latestPlan === entry.id;
      nodes.push({
        kind: "plan",
        id: entry.id,
        entry,
        latest,
        expanded:
          entry.id === anchorId ||
          (latest && entry.origin.plan.steps.some((step) => step.status !== "completed")),
      });
      continue;
    }
    if (entry.origin.kind !== "tool") {
      nodes.push({ kind: "message", id: entry.id, entry });
      continue;
    }
    const previous = nodes.at(-1);
    const needsAttention = entry.origin.outcome !== "completed" || entry.state !== "complete";
    const expanded = needsAttention || entry.id === anchorId;
    if (
      previous?.kind === "process" &&
      previous.entries.at(-1)?.operationId === entry.operationId
    ) {
      previous.entries.push(entry);
      previous.expanded ||= expanded;
      previous.needsAttention ||= needsAttention;
    } else
      nodes.push({ kind: "process", id: entry.id, entries: [entry], expanded, needsAttention });
  }
  return nodes;
}

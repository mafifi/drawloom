import type { HistoryEntry } from "@drawloom/conversation-history";

export type ConversationNode =
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
  for (const entry of entries) {
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

/** Local reading intent; history and message ownership remain with the pager. */
export const conversationScrollGeometry = {
  // Behavioural tolerances, not presentation dimensions. Keep navigation clear
  // of the scroll edge and tolerate subpixel changes when following the tail.
  tailTolerance: 24,
  navigationInset: 24,
  activeTurnThreshold: 48,
} as const;
export class ConversationScroll {
  private conversationId = "";
  private ready = false;
  following = true;

  update(id: string, loading: boolean, hasEntries: boolean, explicitAnchor: boolean) {
    if (id !== this.conversationId) {
      this.conversationId = id;
      this.ready = false;
      this.following = true;
    }
    if (explicitAnchor) this.leaveTail();
    if (!id || loading || !hasEntries) return false;
    this.ready = true;
    return this.following;
  }

  scrolled(top: number, height: number, total: number) {
    if (this.ready)
      this.following = total - height - top <= conversationScrollGeometry.tailTolerance;
  }

  leaveTail() {
    this.following = false;
  }
  latest() {
    this.following = true;
  }
}

export type ConversationTurn = { id: string; prompt: string; response: string };
const preview = (text: string, limit: number) => {
  const normalized = text
    .slice(0, limit * 2)
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
};

export function conversationTurns(
  entries: readonly { id: string; role: string; origin: { kind: string }; text?: string }[],
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const entry of entries) {
    if (entry.role === "user")
      turns.push({
        id: entry.id,
        prompt: preview(entry.text ?? "", 100) || "Message with attachments",
        response: "",
      });
    else if (entry.origin.kind === "assistant" && entry.text && turns.length)
      turns[turns.length - 1]!.response = preview(entry.text, 160);
  }
  return turns;
}

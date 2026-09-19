import type { HistoryEntry } from "@drawloom/conversation-history";
/** Only producer-declared structured results receive a JSON presentation. */
export function structuredMessage(
  message: Pick<HistoryEntry, "origin" | "role" | "text">,
): string | undefined {
  if (message.origin.kind !== "tool" || message.origin.format !== "json") return undefined;
  const text = message.text.trim();
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return undefined;
  }
}

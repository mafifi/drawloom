import { z } from "zod";
import { AgentHistorySchema, type AgentHistory } from "@drawloom/agent";
import type { Asset } from "@drawloom/host";
const page = z.object({ data: z.array(z.record(z.string(), z.unknown())), nextCursor: z.string().nullable() });
export async function projectHistory(
  request: (method: string, params: unknown) => Promise<unknown>, threadId: string,
  operations: Record<string, string>, captureImage?: (result: string) => Promise<Asset>,
): Promise<AgentHistory> {
  await request("thread/read", { threadId, includeTurns: false });
  const entries: AgentHistory["entries"] = [];
  let turnCursor: string | undefined;
  let truncated = false;
  const seen = new Set<string>();
  history: for (let n = 0; n < 100; n++) {
    const turns = page.parse(await request("thread/turns/list", { threadId, limit: 50, sortDirection: "desc", itemsView: "notLoaded", ...(turnCursor ? { cursor: turnCursor } : {}) }));
    for (const turn of turns.data) {
      const turnId = z.string().parse(turn.id);
      let cursor: string | undefined;
      const itemCursors = new Set<string>();
      for (let p = 0; p < 2000; p++) {
        // One item can contain a full native image; do not aggregate image bytes.
        const items = page.parse(await request("thread/items/list", { threadId, turnId, limit: 1, sortDirection: "desc", ...(cursor ? { cursor } : {}) }));
        for (const raw of items.data) {
          if (entries.length >= 2000) { truncated = true; break history; }
          const item = z.record(z.string(), z.unknown()).parse(raw.item);
          if (raw.turnId !== turnId) throw Error("Invalid history correlation");
          const common = { id: `history-${entries.length}`, assets: [] as Asset[], ...(operations[turnId] ? { operationId: operations[turnId] } : {}) };
          if (item.type === "agentMessage") entries.push({ ...common, role: "assistant", text: z.string().parse(item.text) });
          if (item.type === "userMessage") {
            const content = z.array(z.record(z.string(), z.unknown())).parse(item.content);
            entries.push({ ...common, role: "user", text: content.filter(c => c.type === "text").map(c => z.string().parse(c.text)).join("\n") });
          }
          if (item.type === "imageGeneration" && item.status === "completed" && captureImage && operations[turnId]) {
            const asset = await captureImage(z.string().parse(item.result));
            entries.push({ ...common, role: "assistant", text: "Image result", assets: [asset] });
          }
        }
        if (!items.nextCursor) break;
        if (itemCursors.has(items.nextCursor)) throw Error("Invalid history cursor");
        itemCursors.add(items.nextCursor); cursor = items.nextCursor;
        if (p === 1999) { truncated = true; break history; }
      }
    }
    if (!turns.nextCursor) break;
    if (seen.has(turns.nextCursor)) throw Error("Invalid history cursor");
    seen.add(turns.nextCursor); turnCursor = turns.nextCursor;
    if (n === 99) truncated = true;
  }
  return AgentHistorySchema.parse({ entries: entries.reverse(), truncated });
}

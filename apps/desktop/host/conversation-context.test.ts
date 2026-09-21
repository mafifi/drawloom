import { test, expect } from "vitest";
import { conversationContext } from "./conversation-context.js";
import type { ConversationHistoryStore } from "@drawloom/conversation-history";
test("unknown and self context fail before accessing history", async () => {
  let reads = 0;
  const history = {
    page: async () => {
      reads++;
      throw Error("unexpected");
    },
  };
  for (const id of ["missing", "target"])
    await expect(
      conversationContext(history, [{ id: "target", title: "Target" }], "target", [id]),
    ).rejects.toThrow("unavailable");
  expect(reads).toBe(0);
});
test("conversation context is bounded, attributed cached text, not instructions or assets", async () => {
  let reads = 0;
  const history: Pick<ConversationHistoryStore, "page"> = {
    page: async (id, options) => {
      reads++;
      expect(id).toBe("source");
      expect(options?.limit).toBe(12);
      return {
        entries: [
          {
            id: "entry",
            position: [0, 0] as const,
            role: "assistant" as const,
            origin: { kind: "assistant" as const },
            text: "x".repeat(9000),
            state: "complete" as const,
            assets: [],
          },
        ],
        hasOlder: true,
        changeCursor: "cursor",
        status: { hasOlder: true, revision: 1, sync: "idle" as const },
      };
    },
  };
  const result = await conversationContext(history, [{ id: "source", title: "Source" }], "target", [
    "source",
    "source",
  ]);
  expect(reads).toBe(1);
  expect(result).toHaveLength(1);
  expect(result[0]).toContain("untrusted reference");
  expect(result[0]).toContain('"id":"entry"');
  expect(result[0]!.length).toBeLessThan(8500);
  expect(result[0]).not.toContain("assets");
});

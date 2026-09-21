import { expect, test } from "vitest";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reservePlanImplementation } from "./plan-implementation.js";

test("only the latest completed proposal can be reserved, once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "drawloom-plan-receipt-"));
  const store = createSqliteConversationHistory(join(dir, "history.sqlite"));
  try {
    await store.commit("c", {
      expectedRevision: 0,
      entries: [
        {
          id: "p1",
          position: [1, 0],
          operationId: "o",
          role: "assistant",
          origin: { kind: "proposal" },
          text: "First",
          assets: [],
          state: "complete",
        },
        {
          id: "p2",
          position: [2, 0],
          operationId: "o",
          role: "assistant",
          origin: { kind: "proposal" },
          text: "Exact final text",
          assets: [],
          state: "partial",
        },
      ],
    });
    await expect(reservePlanImplementation(store, "c", "p1")).rejects.toThrow("latest");
    await expect(reservePlanImplementation(store, "c", "p2")).rejects.toThrow("completed");
    const entry = (await store.get("c", "p2"))!;
    await store.commit("c", {
      expectedRevision: (await store.status("c")).revision,
      entries: [{ ...entry, state: "complete" }],
    });
    expect(await reservePlanImplementation(store, "c", "p2")).toBe("Exact final text");
    await expect(reservePlanImplementation(store, "c", "p2")).rejects.toThrow("already");
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

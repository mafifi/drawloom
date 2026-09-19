import { expect, test } from "bun:test";
import { HistoryEntrySchema } from "./src/index.js";

test("retained plans require operation ownership and preserve empty snapshots", () => {
  const entry = {
    id: "plan-1",
    position: [1, 0],
    role: "assistant",
    origin: { kind: "plan", plan: { steps: [] } },
    text: "",
    assets: [],
    state: "complete",
    operationId: "operation-1",
  };
  expect(HistoryEntrySchema.safeParse(entry).success).toBe(true);
  expect(HistoryEntrySchema.safeParse({ ...entry, operationId: undefined }).success).toBe(false);
});

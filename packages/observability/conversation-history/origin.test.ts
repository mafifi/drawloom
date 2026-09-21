import { expect, test } from "vitest";
import { HistoryEntrySchema } from "./src/index.js";

const entry = {
  id: "message",
  position: [0, 0],
  role: "assistant",
  text: '{"answer":42}',
  assets: [],
  state: "complete",
};

test("history requires explicit provenance, not classification from text", () => {
  expect(HistoryEntrySchema.safeParse(entry).success).toBe(false);
  expect(HistoryEntrySchema.safeParse({ ...entry, origin: { kind: "assistant" } }).success).toBe(
    true,
  );
  expect(
    HistoryEntrySchema.safeParse({
      ...entry,
      origin: {
        kind: "tool",
        source: "calculator",
        callId: "call",
        title: "Calculate",
        outcome: "completed",
        format: "text",
      },
    }).success,
  ).toBe(true);
});

test("tool provenance requires identity and an explicit execution outcome", () => {
  expect(HistoryEntrySchema.safeParse({ ...entry, origin: { kind: "tool" } }).success).toBe(false);
  expect(
    HistoryEntrySchema.safeParse({ ...entry, role: "user", origin: { kind: "assistant" } }).success,
  ).toBe(false);
});

test("native child snapshots retain lineage separately from tool calls", () => {
  const child = {
    id: "child",
    parentId: null,
    revision: "r1",
    label: "Review",
    status: "unknown",
    result: { state: "unknown" },
    controls: { interrupt: "unknown" },
  };
  expect(
    HistoryEntrySchema.safeParse({ ...entry, origin: { kind: "delegation", child } }).success,
  ).toBe(true);
  expect(
    HistoryEntrySchema.safeParse({
      ...entry,
      origin: { kind: "delegation", child: { ...child, parentId: "child" } },
    }).success,
  ).toBe(false);
});

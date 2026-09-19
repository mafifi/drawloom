import { expect, test } from "bun:test";
import type { HistoryEntry } from "@drawloom/conversation-history";
import { projectConversation } from "./conversation-presentation.js";

const entry = (id: string, origin: HistoryEntry["origin"]): HistoryEntry => ({
  id,
  role: origin.kind === "user" ? "user" : "assistant",
  origin,
  position: [Number(id), 0],
  operationId: "operation",
  text: "content",
  assets: [],
  state: "complete",
});
const tool = (id: string, outcome: "completed" | "failed" = "completed") =>
  entry(id, {
    kind: "tool",
    source: "provider",
    callId: `call-${id}`,
    title: "Read source",
    outcome,
    format: "text",
  });

test("ordered projection groups only adjacent process records, preserving interleaved answers", () => {
  const nodes = projectConversation([
    entry("0", { kind: "user" }),
    tool("1"),
    tool("2"),
    entry("3", { kind: "assistant" }),
    tool("4", "failed"),
    entry("5", { kind: "delivery", source: "provider" }),
  ]);
  expect(nodes.map((node) => [node.kind, node.id])).toEqual([
    ["message", "0"],
    ["process", "1"],
    ["message", "3"],
    ["process", "4"],
    ["message", "5"],
  ]);
  expect(nodes[1]).toMatchObject({ expanded: false, entries: [{ id: "1" }, { id: "2" }] });
  expect(nodes[3]).toMatchObject({ expanded: true });
});

test("inspected references and JSON-looking answers are not classified as process or delivery", () => {
  const answer = { ...entry("1", { kind: "assistant" }), text: '{"result":true}' };
  expect(
    projectConversation([answer, entry("2", { kind: "reference", source: "files" })]).map(
      (node) => node.kind,
    ),
  ).toEqual(["message", "message"]);
});

test("a searched tool result opens its owning process group without claiming a failure", () => {
  expect(projectConversation([tool("1"), tool("2")], "2")[0]).toMatchObject({
    expanded: true,
    needsAttention: false,
  });
});

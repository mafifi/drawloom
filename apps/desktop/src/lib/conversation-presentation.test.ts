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

test("native proposals use the Plan surface and only the latest complete proposal is actionable", () => {
  const nodes = projectConversation([
    entry("1", { kind: "proposal" }),
    entry("2", { kind: "assistant" }),
    { ...entry("3", { kind: "proposal" }), state: "partial" },
  ]);
  expect(nodes[0]).toMatchObject({ kind: "proposal", latest: false, implementable: false });
  expect(nodes[2]).toMatchObject({ kind: "proposal", latest: true, implementable: false });
  expect(projectConversation([entry("1", { kind: "proposal" })])[0]).toMatchObject({
    implementable: true,
  });
});

test("a replacement checklist in a later turn becomes the current task snapshot", () => {
  const plan = {
    kind: "plan" as const,
    plan: { steps: [{ text: "Inspect", status: "pending" as const }] },
  };
  const nodes = projectConversation([
    entry("1", plan),
    { ...entry("2", plan), operationId: "later" },
  ]);
  expect(nodes[0]).toMatchObject({ latest: false, expanded: false });
  expect(nodes[1]).toMatchObject({ latest: true, expanded: true });
});

test("only the latest unfinished plan expands while earlier snapshots remain inspectable", () => {
  const nodes = projectConversation([
    entry("1", { kind: "plan", plan: { steps: [{ text: "Inspect", status: "pending" }] } }),
    entry("2", { kind: "assistant" }),
    entry("3", { kind: "plan", plan: { steps: [] } }),
  ]);
  expect(nodes.map((n) => n.kind)).toEqual(["plan", "message", "plan"]);
  expect(nodes[0]).toMatchObject({ expanded: false, latest: false });
  expect(nodes[2]).toMatchObject({ expanded: false, latest: true });
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

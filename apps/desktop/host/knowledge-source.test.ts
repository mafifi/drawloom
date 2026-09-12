import { expect, test } from "bun:test";
import { defineTool } from "@drawloom/tools";
import { z } from "zod";
import { createInstalledGitKnowledgeFeed } from "./knowledge-source.js";

test("the installed source adapter invokes only the fixed feed and ACK tools without repository arguments", async () => {
  const calls: Array<{ name: string; input: unknown }> = [];
  const changes = defineTool({ name: "opaque-changes", description: "", input: z.strictObject({}), output: z.looseObject({}), async execute(input) {
    calls.push({ name: "changes", input });
    return { content: [{ type: "text" as const, text: "one" }], structuredContent: { token: "token-1", updates: [{ id: "guide.md", revision: "a".repeat(40), previous: null, kind: "source", state: "active", text: "Guide" }] } };
  } });
  const acknowledge = defineTool({ name: "opaque-ack", description: "", input: z.strictObject({ token: z.string() }), output: z.looseObject({}), async execute(input) {
    calls.push({ name: "ack", input }); return { content: [{ type: "text" as const, text: "ok" }] };
  } });
  const presentation = new Map([
    [changes.name, { name: "git.changes", origin: "Git source / configured", ownerId: "drawloom:plugin:package:one", available: true }],
    [acknowledge.name, { name: "git.acknowledge", origin: "Git source / configured", ownerId: "drawloom:plugin:package:one", available: true }],
  ]);
  const feed = createInstalledGitKnowledgeFeed({ projectId: "project-one", tools: [changes, acknowledge], presentation });
  const batch = await feed.changes(); await feed.acknowledge(batch.token);
  expect(calls).toEqual([{ name: "changes", input: {} }, { name: "ack", input: { token: "token-1" } }]);
  expect(feed.sourceId).toMatch(/^git:[a-f0-9]{48}$/);
});

test("ambiguous or cross-installation feed tools fail closed", () => {
  const tool = defineTool({ name: "one", description: "", input: z.strictObject({}), output: z.object({}), execute: () => ({}) });
  const presentation = new Map([["one", { name: "git.changes", origin: "one", ownerId: "owner-one", available: true }]]);
  expect(() => createInstalledGitKnowledgeFeed({ projectId: "project", tools: [tool], presentation })).toThrow("Installed Git knowledge source unavailable");
});

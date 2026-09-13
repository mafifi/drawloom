import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createInspectionServer } from "./inspection-server.ts";
import { buildKnowledgeInspection } from "./knowledge-inspection.ts";
import { inspectionOpenResultSchema, inspectionSaveResultSchema, persistedFeedbackDocumentSchema } from "./inspection-contract.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "drawloom-inspection-server-"));
  const packageRoot = join(root, "package");
  const dataRoot = join(root, "data");
  await Bun.$`mkdir -p ${packageRoot} ${dataRoot}`.quiet();
  await writeFile(join(packageRoot, "inspection.json"), `${JSON.stringify(await buildKnowledgeInspection())}\n`);
  await writeFile(join(packageRoot, "app.html"), "<!doctype html><p>Inspection app</p>");
  const server = await createInspectionServer({ packageRoot, dataRoot });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "inspection-test", version: "1" }, { capabilities: { extensions: { "io.modelcontextprotocol/ui": {} } } });
  await client.connect(clientTransport);
  return { root, packageRoot, dataRoot, server, client };
}

describe("inspection MCP App server", () => {
  test("opens a source-bound document and exposes save only to the app", async () => {
    const f = await fixture();
    try {
      const tools = await f.client.listTools();
      expect(tools.tools.find(tool => tool.name === "inspection.open")?._meta).toMatchObject({ ui: { resourceUri: "ui://knowledge-inspection/view.html" } });
      expect(tools.tools.find(tool => tool.name === "inspection.feedback")?._meta).toMatchObject({ ui: { visibility: ["app"] } });
      const opened = inspectionOpenResultSchema.parse((await f.client.callTool({ name: "inspection.open", arguments: {} })).structuredContent);
      expect(opened.document.execution.targetCalls).toBe(0);
      expect(opened.feedback).toEqual([]);
    } finally { await f.client.close(); await f.server.close(); }
  });

  test("validates exact result identity and serializes durable feedback", async () => {
    const f = await fixture();
    try {
      const input = { resultId: "knowledge-current-retrieval:retrieval:mlx:c1:trial-1", attribution: "QA operator", rating: "correct" as const, correction: "The chain diagnosis was useful." };
      const calls = await Promise.all([
        f.client.callTool({ name: "inspection.feedback", arguments: input }),
        f.client.callTool({ name: "inspection.feedback", arguments: { ...input, rating: "uncertain", correction: "Needs another look." } }),
      ]);
      expect(calls.map(call => inspectionSaveResultSchema.parse(call.structuredContent).feedback.sequence)).toEqual([1, 2]);
      const saved = persistedFeedbackDocumentSchema.parse(JSON.parse(await readFile(join(f.dataRoot, "feedback.json"), "utf8")));
      expect(saved.feedback).toHaveLength(2);
      expect(saved.feedback.map(feedback => feedback.sequence)).toEqual([1, 2]);

      const rejected = await f.client.callTool({ name: "inspection.feedback", arguments: { ...input, resultId: "another-result" } });
      expect(rejected.isError).toBe(true);
      expect(persistedFeedbackDocumentSchema.parse(JSON.parse(await readFile(join(f.dataRoot, "feedback.json"), "utf8"))).feedback).toHaveLength(2);
    } finally { await f.client.close(); await f.server.close(); }
  });

  test("reloads persisted advisory feedback after restart", async () => {
    const f = await fixture();
    const input = { resultId: "knowledge-current-retrieval:retrieval:mlx:c1:trial-1", attribution: "QA operator", rating: "incorrect" as const };
    await f.client.callTool({ name: "inspection.feedback", arguments: input });
    await f.client.close(); await f.server.close();

    const reopened = await createInspectionServer({ packageRoot: f.packageRoot, dataRoot: f.dataRoot });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await reopened.connect(serverTransport);
    const client = new Client({ name: "inspection-test", version: "1" }); await client.connect(clientTransport);
    try {
      const opened = inspectionOpenResultSchema.parse((await client.callTool({ name: "inspection.open", arguments: {} })).structuredContent);
      expect(opened.feedback).toHaveLength(1);
      expect(opened.feedback[0]).toMatchObject({ ...input, sequence: 1 });
      expect(opened.feedback[0]?.savedAt).toBeString();
    } finally { await client.close(); await reopened.close(); }
  });

  test("rejects a save that would cross the feedback read bound and preserves the readable file", async () => {
    const f = await fixture();
    try {
      const resultId = "knowledge-current-retrieval:retrieval:mlx:c1:trial-1";
      const feedback = Array.from({ length: 469 }, (_, index) => ({ resultId, attribution: "QA", rating: "uncertain" as const, correction: "C".repeat(2_000), sequence: index + 1, savedAt: "2026-09-13T00:00:00.000Z" }));
      const before = `${JSON.stringify({ schemaVersion: 1, feedback })}\n`;
      expect(Buffer.byteLength(before)).toBeLessThanOrEqual(1024 * 1024);
      await writeFile(join(f.dataRoot, "feedback.json"), before);

      const rejected = await f.client.callTool({ name: "inspection.feedback", arguments: { resultId, attribution: "A".repeat(120), rating: "uncertain", correction: "C".repeat(2_000) } });
      expect(rejected.isError).toBe(true);
      expect(await readFile(join(f.dataRoot, "feedback.json"), "utf8")).toBe(before);
      const opened = inspectionOpenResultSchema.parse((await f.client.callTool({ name: "inspection.open", arguments: {} })).structuredContent);
      expect(opened.feedback).toHaveLength(469);
    } finally { await f.client.close(); await f.server.close(); }
  });
});

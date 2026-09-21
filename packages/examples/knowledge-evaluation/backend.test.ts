import { afterEach, describe, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getToolUiResourceUri,
  isToolVisibilityAppOnly,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import {
  EvaluationDefinitionSchema,
  type EvaluationDefinition,
  type EvaluationFeedback,
  type EvaluationService,
} from "@drawloom/evaluation";
import type { EvaluationCompositionBindings, EvaluationComposer } from "@drawloom/evaluation";
import { createKnowledgeEvaluationBackend } from "./src/backend.js";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function serviceFixture() {
  const feedback: EvaluationFeedback[] = [];
  const definitions: EvaluationDefinition[] = [];
  const assessed: EvaluationDefinition[] = [];
  const service: EvaluationService = {
    readiness: async () => ({ status: "ready" }),
    async assess(request) {
      const definition = EvaluationDefinitionSchema.parse(request.definition);
      assessed.push(definition);
      definitions.push(definition);
      return { kind: "started", evaluationRunId: "run-1", orchestrationRunId: "workflow-1" };
    },
    async run() {
      throw new Error("Experiments are unavailable");
    },
    async status(evaluationRunId) {
      return { kind: "completed", evaluationRunId, orchestrationRunId: "workflow-1" };
    },
    async cancel(evaluationRunId) {
      return { kind: "terminal", evaluationRunId, orchestrationRunId: "workflow-1" };
    },
    async getDefinition(ref) {
      return definitions.find((item) => item.id === ref.id && item.revision === ref.revision);
    },
    async getDefinitionHeader(ref) {
      const item = await service.getDefinition(ref);
      if (!item) return;
      const { cases: _cases, ...header } = item;
      return header;
    },
    async getCase(ref, caseId) {
      return (await service.getDefinition(ref))?.cases.find((item) => item.id === caseId);
    },
    async listDefinitions() {
      return { items: [], hasMore: false };
    },
    async getRun() {
      return undefined;
    },
    async getStartAttempt() {
      return undefined;
    },
    async getOrchestrationBinding() {
      return undefined;
    },
    async listRuns() {
      return { items: [], hasMore: false };
    },
    async getTargetCheckpoint() {
      return undefined;
    },
    async getScorerCheckpoint() {
      return undefined;
    },
    async getResultSummary() {
      return undefined;
    },
    async getResult() {
      return undefined;
    },
    async listResults() {
      return { items: [], hasMore: false };
    },
    async listFeedback(input) {
      return {
        items: feedback.filter((item) => !input?.resultId || item.resultId === input.resultId),
        hasMore: false,
      };
    },
    async saveFeedback(value) {
      feedback.push(value);
      return { kind: "accepted" };
    },
  };
  return { service, assessed, feedback };
}

describe("fixed-scope standard MCP Apps backend", () => {
  test("exposes only fixed definitions and app-visible validated evaluation operations", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evaluation-backend-"));
    temporary.push(root);
    await writeFile(
      join(root, "app.html"),
      "<!doctype html><main>Shared evaluation workbench</main>",
    );
    const fixtureRoot = join(import.meta.dirname, "src", "fixtures");
    const before = await Promise.all(
      ["corpus.ts", "local-knowledge-mlx-10k.json", "local-knowledge-answers-10k.json"].map(
        async (name) => digest(await readFile(join(fixtureRoot, name))),
      ),
    );
    const state = serviceFixture();
    let bindings: EvaluationCompositionBindings | undefined;
    const composer: EvaluationComposer = {
      compose(value) {
        bindings = value;
        return { service: state.service, taskHandlers: [] };
      },
    };
    const backend = await createKnowledgeEvaluationBackend({
      installationId: "installed-public",
      packageRoot: root,
      dataDirectory: join(root, "data"),
      configuration: {},
      dependencies: [],
      project: { id: "project-a", directory: root },
      capabilities: { evaluation: composer },
    });
    try {
      expect(bindings?.targets).toBeUndefined();
      expect(bindings?.scorers.map((item) => item.id)).toEqual([
        "relevant-evidence",
        "required-chain-top-k",
        "current-revision",
        "grounded-answer-heuristic",
      ]);
      const client = new Client({ name: "knowledge-test", version: "1" });
      await client.connect(backend.servers![0]!.transport);
      try {
        const tools = (await client.listTools()).tools;
        expect(tools.map((tool) => tool.name)).toEqual(["evaluation.open", "evaluation.request"]);
        expect(tools.every(isToolVisibilityAppOnly)).toBe(true);
        expect(getToolUiResourceUri(tools[0]!)).toBe("ui://drawloom/knowledge-evaluation.html");
        const resource = await client.readResource({
          uri: "ui://drawloom/knowledge-evaluation.html",
        });
        expect(resource.contents[0]).toMatchObject({
          mimeType: "text/html;profile=mcp-app",
          text: expect.stringContaining("Shared evaluation workbench"),
        });

        const listed = await client.callTool({
          name: "evaluation.request",
          arguments: { operation: "listDefinitions", input: { limit: 50 } },
        });
        expect((listed.structuredContent as { items: unknown[] }).items).toHaveLength(7);
        const firstPage = await client.callTool({
          name: "evaluation.request",
          arguments: { operation: "listDefinitions", input: { limit: 2 } },
        });
        const firstPageValue = firstPage.structuredContent as {
          items: Array<{ ref: { id: string } }>;
          cursor?: string;
          hasMore: boolean;
        };
        expect(firstPageValue.items.map((item) => item.ref.id)).toEqual([
          "knowledge.current.lexical",
          "knowledge.current.mlx",
        ]);
        expect(firstPageValue.hasMore).toBe(true);
        expect(typeof firstPageValue.cursor).toBe("string");
        const secondPage = await client.callTool({
          name: "evaluation.request",
          arguments: {
            operation: "listDefinitions",
            input: { limit: 2, after: firstPageValue.cursor },
          },
        });
        expect(
          (secondPage.structuredContent as { items: Array<{ ref: { id: string } }> }).items.map(
            (item) => item.ref.id,
          ),
        ).toEqual(["knowledge.historical.lexical", "knowledge.historical.cpu-qwen"]);
        const summary = (
          listed.structuredContent as { items: Array<{ ref: { id: string; revision: string } }> }
        ).items.find((item) => item.ref.id === "knowledge.current.mlx")!;
        const loaded = await client.callTool({
          name: "evaluation.request",
          arguments: { operation: "getDefinition", input: summary.ref },
        });
        expect((loaded.structuredContent as { cases: unknown[] }).cases).toHaveLength(24);
        const started = await client.callTool({
          name: "evaluation.request",
          arguments: {
            operation: "assess",
            input: { requestId: "request-1", definition: summary.ref },
          },
        });
        expect(started.structuredContent).toMatchObject({
          kind: "started",
          evaluationRunId: "run-1",
        });
        expect(state.assessed).toHaveLength(1);
        expect(state.assessed[0]).toMatchObject({
          id: "knowledge.current.mlx",
          mode: "assess_existing",
        });
        expect(state.assessed[0]!.target).toBeUndefined();
        expect(state.assessed[0]!.cases.every((item) => item.suppliedOutput !== undefined)).toBe(
          true,
        );
        const invented = await client.callTool({
          name: "evaluation.request",
          arguments: {
            operation: "assess",
            input: { requestId: "request-2", definition: { id: "invented", revision: "r1" } },
          },
        });
        expect(invented.isError).toBe(true);
        const invalidFeedback = await client.callTool({
          name: "evaluation.request",
          arguments: {
            operation: "saveFeedback",
            input: {
              schemaVersion: 1,
              id: "feedback-1",
              resultId: "result-1",
              attribution: "",
              rating: "incorrect",
              createdAtMs: 1,
            },
          },
        });
        expect(invalidFeedback.isError).toBe(true);
      } finally {
        await client.close();
      }
      const after = await Promise.all(
        ["corpus.ts", "local-knowledge-mlx-10k.json", "local-knowledge-answers-10k.json"].map(
          async (name) => digest(await readFile(join(fixtureRoot, name))),
        ),
      );
      expect(after).toEqual(before);
    } finally {
      await backend.dispose();
    }
  });
});

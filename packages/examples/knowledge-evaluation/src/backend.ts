import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  CheckpointSelectorSchema,
  DefinitionPageSchema,
  EvaluationCancelResultSchema,
  EvaluationDefinitionHeaderSchema,
  EvaluationDefinitionSchema,
  EvaluationExecutionStatusSchema,
  EvaluationFeedbackSchema,
  EvaluationIdSchema,
  EvaluationPageOptionsSchema,
  EvaluationReadinessSchema,
  EvaluationResultViewSchema,
  EvaluationRunSchema,
  EvaluationStartResultSchema,
  FeedbackPageOptionsSchema,
  FeedbackPageSchema,
  ResultPageOptionsSchema,
  ResultPageSchema,
  ResultSummarySchema,
  RunPageSchema,
  ScorerCheckpointSchema,
  TargetCheckpointSchema,
  VersionedReferenceSchema,
  type EvaluationDefinition,
  type EvaluationService,
} from "@drawloom/evaluation";
import type { PluginBackend, PluginBackendContext } from "@drawloom/desktop-host";
import { loadKnowledgeEvaluation } from "./index.js";

export const knowledgeEvaluationResourceUri = "ui://drawloom/knowledge-evaluation.html";
const operationSchema = z.enum([
  "readiness",
  "listDefinitions",
  "getDefinition",
  "getDefinitionHeader",
  "getCase",
  "assess",
  "listRuns",
  "getRun",
  "status",
  "cancel",
  "listResults",
  "getResultSummary",
  "getResult",
  "getTargetCheckpoint",
  "getScorerCheckpoint",
  "listFeedback",
  "saveFeedback",
]);
const requestSchema = z.strictObject({ operation: operationSchema, input: z.unknown().optional() });
const definitionSelectionSchema = z.strictObject({
  requestId: EvaluationIdSchema,
  definition: VersionedReferenceSchema,
});
const caseSelectionSchema = z.strictObject({
  definition: VersionedReferenceSchema,
  caseId: EvaluationIdSchema,
});
const emptySchema = z.strictObject({});

function text(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message.slice(0, 512)
    : "Evaluation request failed";
}

function definitionsPage(definitions: readonly EvaluationDefinition[], raw: unknown) {
  const input = EvaluationPageOptionsSchema.parse(raw ?? {});
  const match = input.after?.match(/^knowledge-definitions:(0|[1-9]\d*)$/);
  if (input.after && !match) throw new Error("Knowledge definition cursor is invalid");
  const after = match ? Number(match[1]) : -1;
  if (!Number.isSafeInteger(after) || after >= definitions.length)
    throw new Error("Knowledge definition cursor is invalid");
  const start = after + 1;
  const selected = definitions.slice(start, start + (input.limit ?? 50));
  const items = selected.map((definition) => ({
    ref: { id: definition.id, revision: definition.revision },
    name: definition.name,
    mode: definition.mode,
    caseCount: definition.cases.length,
    scorerCount: definition.scorers.length,
  }));
  const hasMore = start + items.length < definitions.length;
  return DefinitionPageSchema.parse({
    items,
    hasMore,
    ...(hasMore ? { cursor: `knowledge-definitions:${start + items.length - 1}` } : {}),
  });
}

async function dispatch(
  service: EvaluationService,
  definitions: readonly EvaluationDefinition[],
  operation: z.infer<typeof operationSchema>,
  raw: unknown,
): Promise<object> {
  const byReference = (value: unknown) => {
    const ref = VersionedReferenceSchema.parse(value);
    const definition = definitions.find(
      (item) => item.id === ref.id && item.revision === ref.revision,
    );
    if (!definition)
      throw new Error("Knowledge evaluation definition is outside the installed fixed scope");
    return definition;
  };
  switch (operation) {
    case "readiness":
      emptySchema.parse(raw ?? {});
      return EvaluationReadinessSchema.parse(await service.readiness());
    case "listDefinitions":
      return definitionsPage(definitions, raw);
    case "getDefinition":
      return EvaluationDefinitionSchema.parse(byReference(raw));
    case "getDefinitionHeader": {
      const { cases: _cases, ...header } = byReference(raw);
      return EvaluationDefinitionHeaderSchema.parse(header);
    }
    case "getCase": {
      const input = caseSelectionSchema.parse(raw);
      const value = byReference(input.definition).cases.find((item) => item.id === input.caseId);
      if (!value) throw new Error("Knowledge evaluation case is outside the installed fixed scope");
      return value;
    }
    case "assess": {
      const input = definitionSelectionSchema.parse(raw);
      return EvaluationStartResultSchema.parse(
        await service.assess({
          requestId: input.requestId,
          definition: byReference(input.definition),
        }),
      );
    }
    case "listRuns":
      return RunPageSchema.parse(
        await service.listRuns(EvaluationPageOptionsSchema.parse(raw ?? {})),
      );
    case "getRun": {
      const id = EvaluationIdSchema.parse(raw);
      const value = await service.getRun(id);
      return value ? EvaluationRunSchema.parse(value) : { absent: true };
    }
    case "status":
      return EvaluationExecutionStatusSchema.parse(
        await service.status(EvaluationIdSchema.parse(raw)),
      );
    case "cancel":
      return EvaluationCancelResultSchema.parse(
        await service.cancel(EvaluationIdSchema.parse(raw)),
      );
    case "listResults":
      return ResultPageSchema.parse(
        await service.listResults(ResultPageOptionsSchema.parse(raw ?? {})),
      );
    case "getResultSummary": {
      const value = await service.getResultSummary(EvaluationIdSchema.parse(raw));
      return value ? ResultSummarySchema.parse(value) : { absent: true };
    }
    case "getResult": {
      const value = await service.getResult(EvaluationIdSchema.parse(raw));
      return value ? EvaluationResultViewSchema.parse(value) : { absent: true };
    }
    case "getTargetCheckpoint": {
      const value = await service.getTargetCheckpoint(CheckpointSelectorSchema.parse(raw));
      return value ? TargetCheckpointSchema.parse(value) : { absent: true };
    }
    case "getScorerCheckpoint": {
      const value = await service.getScorerCheckpoint(CheckpointSelectorSchema.parse(raw));
      return value ? ScorerCheckpointSchema.parse(value) : { absent: true };
    }
    case "listFeedback":
      return FeedbackPageSchema.parse(
        await service.listFeedback(FeedbackPageOptionsSchema.parse(raw ?? {})),
      );
    case "saveFeedback":
      return await service.saveFeedback(EvaluationFeedbackSchema.parse(raw));
  }
}

export async function createKnowledgeEvaluationBackend(
  context: PluginBackendContext,
): Promise<PluginBackend> {
  if (!context.project) throw new Error("Knowledge evaluation requires a fixed project binding");
  const composer = context.capabilities.evaluation;
  if (!composer) throw new Error("Knowledge evaluation capability is unavailable");
  const bundle = await loadKnowledgeEvaluation();
  const composition = composer.compose({ scorers: bundle.scorers });
  const html = await readFile(resolve(context.packageRoot, "app.html"), "utf8");
  if (!html.length || Buffer.byteLength(html) > 8 * 1024 * 1024)
    throw new Error("Knowledge evaluation app resource is unavailable or too large");
  const server = new McpServer({ name: "drawloom-knowledge-evaluation", version: "0.0.0" });
  registerAppResource(
    server,
    "Knowledge evaluation",
    knowledgeEvaluationResourceUri,
    {},
    async () => ({
      contents: [{ uri: knowledgeEvaluationResourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
    }),
  );
  registerAppTool(
    server,
    "evaluation.open",
    {
      title: "Open knowledge evaluation",
      description: "Open the installed fixed-scope public knowledge evaluation.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: knowledgeEvaluationResourceUri, visibility: ["app"] } },
    },
    async () => ({ content: [], structuredContent: definitionsPage(bundle.definitions, {}) }),
  );
  registerAppTool(
    server,
    "evaluation.request",
    {
      title: "Use knowledge evaluation",
      description:
        "Read or act on fixed-scope evaluation records from the shared evaluation workbench.",
      inputSchema: requestSchema.shape,
      _meta: { ui: { visibility: ["app"] } },
    },
    async (raw) => {
      try {
        const request = requestSchema.parse(raw);
        return {
          content: [],
          structuredContent: (await dispatch(
            composition.service,
            bundle.definitions,
            request.operation,
            request.input,
          )) as Record<string, unknown>,
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: text(error) }] };
      }
    },
  );
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  return {
    contributions: {
      workbenches: [
        {
          id: "knowledge-evaluation",
          title: "Knowledge evaluation",
          description: "Assess frozen public saved knowledge outputs.",
          tools: [],
          skills: [],
        },
      ],
      views: [
        {
          id: "knowledge-evaluation-view",
          workbenchId: "knowledge-evaluation",
          title: "Knowledge evaluation",
          entrypoint: knowledgeEvaluationResourceUri,
        },
      ],
    },
    servers: [{ name: "knowledge-evaluation", transport }],
    taskHandlers: composition.taskHandlers,
    async dispose() {
      await server.close();
    },
  };
}

export default createKnowledgeEvaluationBackend;

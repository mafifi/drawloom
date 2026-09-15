import { z } from "zod";
import {
  DefinitionPageSchema,
  EvaluationCancelResultSchema,
  EvaluationCaseSchema,
  EvaluationDefinitionHeaderSchema,
  EvaluationDefinitionSchema,
  EvaluationExecutionStatusSchema,
  EvaluationFeedbackSchema,
  EvaluationPageOptionsSchema,
  EvaluationReadinessSchema,
  EvaluationResultViewSchema,
  EvaluationRunSchema,
  EvaluationStartRequestSchema,
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
  CheckpointSelectorSchema,
  EvaluationIdSchema,
} from "@drawloom/evaluation";
import type { EvaluationPresentationClient } from "@drawloom/evaluation-presentation";

type Call = (operation: string, input: unknown) => Promise<unknown>;
const absentSchema = z.strictObject({ absent: z.literal(true) });
const optional = <T>(schema: z.ZodType<T>, value: unknown): T | undefined =>
  absentSchema.safeParse(value).success ? undefined : schema.parse(value);

export function createKnowledgeEvaluationPresentationClient(
  call: Call,
): EvaluationPresentationClient {
  const client: EvaluationPresentationClient = {
    readiness: async () => EvaluationReadinessSchema.parse(await call("readiness", {})),
    async assess(raw) {
      const request = EvaluationStartRequestSchema.parse(raw);
      return EvaluationStartResultSchema.parse(
        await call("assess", {
          requestId: request.requestId,
          definition: { id: request.definition.id, revision: request.definition.revision },
        }),
      );
    },
    async run() {
      throw new Error("The installed knowledge consumer exposes assess_existing definitions only");
    },
    status: async (value) =>
      EvaluationExecutionStatusSchema.parse(await call("status", EvaluationIdSchema.parse(value))),
    cancel: async (value) =>
      EvaluationCancelResultSchema.parse(await call("cancel", EvaluationIdSchema.parse(value))),
    getDefinition: async (value) =>
      optional(
        EvaluationDefinitionSchema,
        await call("getDefinition", VersionedReferenceSchema.parse(value)),
      ),
    getDefinitionHeader: async (value) =>
      optional(
        EvaluationDefinitionHeaderSchema,
        await call("getDefinitionHeader", VersionedReferenceSchema.parse(value)),
      ),
    async getCase(definition, caseId) {
      return optional(
        EvaluationCaseSchema,
        await call("getCase", {
          definition: VersionedReferenceSchema.parse(definition),
          caseId: EvaluationIdSchema.parse(caseId),
        }),
      );
    },
    listDefinitions: async (value) =>
      DefinitionPageSchema.parse(
        await call("listDefinitions", EvaluationPageOptionsSchema.parse(value ?? {})),
      ),
    getRun: async (value) =>
      optional(EvaluationRunSchema, await call("getRun", EvaluationIdSchema.parse(value))),
    listRuns: async (value) =>
      RunPageSchema.parse(await call("listRuns", EvaluationPageOptionsSchema.parse(value ?? {}))),
    getResultSummary: async (value) =>
      optional(
        ResultSummarySchema,
        await call("getResultSummary", EvaluationIdSchema.parse(value)),
      ),
    getResult: async (value) =>
      optional(
        EvaluationResultViewSchema,
        await call("getResult", EvaluationIdSchema.parse(value)),
      ),
    listResults: async (value) =>
      ResultPageSchema.parse(await call("listResults", ResultPageOptionsSchema.parse(value ?? {}))),
    getTargetCheckpoint: async (value) =>
      optional(
        TargetCheckpointSchema,
        await call("getTargetCheckpoint", CheckpointSelectorSchema.parse(value)),
      ),
    getScorerCheckpoint: async (value) =>
      optional(
        ScorerCheckpointSchema,
        await call("getScorerCheckpoint", CheckpointSelectorSchema.parse(value)),
      ),
    listFeedback: async (value) =>
      FeedbackPageSchema.parse(
        await call("listFeedback", FeedbackPageOptionsSchema.parse(value ?? {})),
      ),
    saveFeedback: async (value) =>
      z
        .discriminatedUnion("kind", [
          z.strictObject({ kind: z.literal("accepted") }),
          z.strictObject({ kind: z.literal("duplicate") }),
        ])
        .parse(await call("saveFeedback", EvaluationFeedbackSchema.parse(value))),
  };
  return Object.freeze(client);
}

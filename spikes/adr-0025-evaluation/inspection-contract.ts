import { z } from "zod";
import { evaluationResultSchema, feedbackSchema } from "./contract.ts";

export const knowledgeQuestionCategorySchema = z.enum(["semantic", "identifier", "chain", "contradiction", "irrelevant"]);
export const inspectionClassificationSchema = z.enum([
  "retained-current-retrieval",
  "retained-historical-answer",
  "synthetic-regression",
]);
export type InspectionClassification = z.infer<typeof inspectionClassificationSchema>;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const inspectionSourceSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  sha256: sha256Schema,
  bytes: z.number().int().positive(),
  classification: inspectionClassificationSchema.exclude(["synthetic-regression"]),
  label: z.string().min(1),
  limitations: z.array(z.string().min(1).max(1_000)).max(20),
});

export const inspectionResultSchema = z.strictObject({
  evaluation: evaluationResultSchema,
  question: z.strictObject({ id: z.string().min(1), text: z.string().min(1), category: knowledgeQuestionCategorySchema }),
  provenance: z.strictObject({
    classification: inspectionClassificationSchema,
    mode: z.string().min(1),
    method: z.string().min(1),
    corpusVersion: z.string().min(1),
    corpusSha256: sha256Schema,
    sourceId: z.string().min(1),
  }),
  details: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("retrieval"), retrieved: z.array(z.string().min(1)).max(100) }),
    z.strictObject({ kind: z.literal("answer"), answer: z.string().min(1).max(10_000), citations: z.array(z.string().min(1)).max(100), abstained: z.boolean() }),
  ]),
  comparison: z.strictObject({ baselineResultId: z.string().min(1).optional() }),
});
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

export const inspectionDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  description: z.string().min(1),
  corpus: z.strictObject({ version: z.string().min(1), sha256: sha256Schema, records: z.number().int().positive() }),
  sources: z.array(inspectionSourceSchema).min(1),
  execution: z.strictObject({
    adapter: z.literal("braintrust"),
    mode: z.literal("assess-existing"),
    targetCalls: z.literal(0),
    modelCalls: z.literal(0),
  }),
  results: z.array(inspectionResultSchema).max(200),
  comparisons: z.array(z.strictObject({ questionId: z.string().min(1), resultIds: z.array(z.string().min(1)).min(1).max(10) })).max(100),
  feedback: z.array(feedbackSchema).max(1_000),
  limitations: z.array(z.string().min(1).max(2_000)).max(30),
});
export type InspectionDocument = z.infer<typeof inspectionDocumentSchema>;

export const persistedFeedbackSchema = feedbackSchema.extend({
  sequence: z.number().int().positive(),
  savedAt: z.string().datetime(),
});
export type PersistedFeedback = z.infer<typeof persistedFeedbackSchema>;
export const persistedFeedbackDocumentSchema = z.strictObject({ schemaVersion: z.literal(1), feedback: z.array(persistedFeedbackSchema).max(1_000) });

export const inspectionOpenResultSchema = z.strictObject({
  document: inspectionDocumentSchema,
  feedback: z.array(persistedFeedbackSchema),
});
export type InspectionOpenResult = z.infer<typeof inspectionOpenResultSchema>;
export const inspectionSaveInputSchema = feedbackSchema.extend({
  resultId: z.string().min(1).max(512),
  attribution: z.string().min(1).max(120),
  correction: z.string().max(2_000).optional(),
}).strict();
export type InspectionSaveInput = z.infer<typeof inspectionSaveInputSchema>;
export const inspectionSaveResultSchema = z.strictObject({ feedback: persistedFeedbackSchema });
export type InspectionSaveResult = z.infer<typeof inspectionSaveResultSchema>;

export const inspectionResourceUri = "ui://knowledge-inspection/view.html";
export const inspectionWorkbenchId = "evaluation-inspection";
export const inspectionServerName = "inspection";
export const inspectionOpeningTool = "inspection.open";
export const inspectionFeedbackTool = "inspection.feedback";

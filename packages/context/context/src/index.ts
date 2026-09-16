import { z } from "zod";
import { ClaimFreshnessSchema, RecordRefSchema } from "@drawloom/knowledge";
export const CompiledContextSchema = z.strictObject({
  text: z.string(),
  sources: z.array(z.string().min(1)).optional(),
});
export type CompiledContext = z.infer<typeof CompiledContextSchema>;

const IdSchema = z.string().trim().min(1).max(256);
export const ContextRecordRefSchema = RecordRefSchema;
export const VerifiedExecutionBindingSchema = z.strictObject({
  executionId: IdSchema,
  conversationId: IdSchema,
});
export type VerifiedExecutionBinding = z.infer<typeof VerifiedExecutionBindingSchema>;
export const ContextPreparationBudgetSchema = z.strictObject({
  maxRecords: z.number().int().min(1).max(8),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(12 * 1024),
});
export const ContextPreparationRequestSchema = z.strictObject({
  request: z.string().trim().min(1).max(10_000),
  binding: VerifiedExecutionBindingSchema,
  budget: ContextPreparationBudgetSchema,
});
export type ContextPreparationRequest = z.infer<typeof ContextPreparationRequestSchema> & {
  signal: AbortSignal;
  /** One host-owned budget shared by every nested read and disclosure pass. */
  remainingMs: () => number;
};
export const PreparedContextReferenceSchema = z.strictObject({
  ref: ContextRecordRefSchema,
  status: z.enum(["active", "withdrawn"]),
  freshness: ClaimFreshnessSchema.optional(),
  inclusion: z.enum(["body", "reference_only"]),
});
export const ContextPreparationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ready"),
    text: z.string().min(1),
    references: z.array(PreparedContextReferenceSchema).max(8),
    bytes: z
      .number()
      .int()
      .positive()
      .max(12 * 1024),
  }),
  z.strictObject({
    kind: z.enum(["empty", "unavailable", "cancelled", "timeout"]),
    references: z.tuple([]),
    bytes: z.literal(0),
  }),
]);
export type ContextPreparationResult = z.infer<typeof ContextPreparationResultSchema>;
export const ContextReferenceMaterialSchema = ContextPreparationResultSchema.options[0];
/** Display metadata only. Receipts describe known provider delivery, not retained model memory. */
export const ContextPreparationSummarySchema = z
  .strictObject({
    kind: z.enum(["ready", "empty", "unavailable", "cancelled", "disabled", "timeout", "denied"]),
    references: z.array(PreparedContextReferenceSchema).max(8),
    receipt: z.strictObject({ executionId: IdSchema, submissionId: IdSchema }).optional(),
  })
  .refine(
    (value) => value.kind === "ready" || value.references.length === 0,
    "Non-success preparation cannot expose references",
  );
export type ContextPreparationSummary = z.infer<typeof ContextPreparationSummarySchema>;
export interface ContextPreparer {
  /** The host supplies a verified binding and owns deadline selection. Returned text is untrusted reference material. */
  prepare(request: ContextPreparationRequest): Promise<ContextPreparationResult>;
}

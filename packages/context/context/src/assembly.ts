import { z } from "zod";
import { AssetSchema } from "@drawloom/host";
import { CompiledContextSchema, ContextReferenceMaterialSchema } from "./index.js";

/** All sources have already been admitted by the host. This API grants no access. */
export const SessionContextAssemblyInputSchema = z.strictObject({
  instructions: z.array(CompiledContextSchema),
  skills: z.array(CompiledContextSchema),
  guidance: z.array(CompiledContextSchema),
});
export type SessionContextAssemblyInput = z.infer<typeof SessionContextAssemblyInputSchema>;
export const ContextSelectionIdentitySchema = z.strictObject({
  id: z.string().min(1),
  revision: z.string().min(1),
});
export const SelectedContextReferenceSchema = z.strictObject({
  text: z.string(),
  source: z.string().min(1),
});
export const TurnContextAssemblyInputSchema = z.strictObject({
  /** Exact submitted words. Do not trim or rewrite them for display/history. */
  request: z.string(),
  instructions: z.array(CompiledContextSchema),
  /** User-selected documents, conversation excerpts and view context are reference data. */
  references: z.array(SelectedContextReferenceSchema),
  attachments: z.array(AssetSchema).max(16),
  selections: z.array(ContextSelectionIdentitySchema).max(32),
  automaticKnowledge: ContextReferenceMaterialSchema.optional(),
});
export type TurnContextAssemblyInput = z.infer<typeof TurnContextAssemblyInputSchema>;
const AssemblyFailureSchema = z.strictObject({
  kind: z.literal("failure"),
  code: z.enum(["invalid_input", "unavailable", "cancelled"]),
});
export const SessionContextAssemblyResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), context: CompiledContextSchema }),
  AssemblyFailureSchema,
]);
export type SessionContextAssemblyResult = z.infer<typeof SessionContextAssemblyResultSchema>;
export const TurnContextAssemblyResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ready"),
    originalText: z.string(),
    /** User-content path: original request and selected untrusted references only. */
    text: z.string(),
    additionalContext: CompiledContextSchema.optional(),
    attachments: z.array(AssetSchema).max(16),
    selections: z.array(ContextSelectionIdentitySchema).max(32),
    /** Keep bounded automatic material separate for host revocation and delivery receipts. */
    automaticKnowledge: ContextReferenceMaterialSchema.optional(),
  }),
  AssemblyFailureSchema,
]);
export type TurnContextAssemblyResult = z.infer<typeof TurnContextAssemblyResultSchema>;
export interface ContextAssemblyOptions {
  readonly signal: AbortSignal;
}
/** Trusted startup replacement. Host owns resolution, access, budgets and final disclosure checks.
 * Implementations preserve original text/attachment/selection identities and keep reference
 * data out of instructions. Framing reference data is not prompt-injection isolation. */
export interface ContextAssembler {
  session(
    input: SessionContextAssemblyInput,
    options: ContextAssemblyOptions,
  ): Promise<SessionContextAssemblyResult>;
  turn(
    input: TurnContextAssemblyInput,
    options: ContextAssemblyOptions,
  ): Promise<TurnContextAssemblyResult>;
}

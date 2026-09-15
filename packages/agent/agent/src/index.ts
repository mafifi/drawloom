import { z } from "zod";
import { CompiledContextSchema, ContextReferenceMaterialSchema, ContextPreparationSummarySchema } from "@drawloom/context";
import { ToolExposureSchema, type ToolContent } from "@drawloom/tools";
import { AssetSchema } from "@drawloom/host";
import type { ConversationHistoryReader } from '@drawloom/conversation-history';

const AbortSignalSchema = z.custom<AbortSignal>((value) => {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<AbortSignal>;
  return typeof signal.aborted === "boolean" &&
    typeof signal.addEventListener === "function" &&
    typeof signal.removeEventListener === "function";
}, "Expected an AbortSignal");
const id = z.string().min(1);
export const DiscoveryKindSchema = z.enum(['skill', 'app', 'plugin', 'tool', 'resource', 'integration']);
export const DiscoverySelectionSchema = z.strictObject({ id, revision: id });
export type DiscoverySelection = z.infer<typeof DiscoverySelectionSchema>;
export const DiscoveryEntrySchema = z.strictObject({
  id, origin: id, kind: DiscoveryKindSchema, name: id,
  description: z.string(), scope: id,
  availability: z.enum(['available', 'unavailable', 'unverified']),
  selectable: z.boolean(), ownerId: id.optional(), readable: z.boolean().optional(),
  authenticationOwner: z.literal('provider').optional(),
});
export type DiscoveryEntry = z.infer<typeof DiscoveryEntrySchema>;
export const DiscoverySnapshotSchema = z.strictObject({
  revision: id, entries: z.array(DiscoveryEntrySchema),
  categories: z.array(z.strictObject({ kind: DiscoveryKindSchema,
    status: z.enum(['loading', 'available', 'unsupported', 'error']), message: z.string().optional() })),
  /** Opaque continuation for a bounded additional page, not a native cursor. */
  nextCursor: id.optional(),
});
export type DiscoverySnapshot = z.infer<typeof DiscoverySnapshotSchema>;
/** Discovery is metadata only. Selection does not grant execution authority. */
export interface AgentDiscovery {
  /** Cumulative metadata for one revision. wait:false returns ready categories
   * while others load; polling never requests subsequent pages automatically.
   * A refresh during active discovery joins it. Additional pages preserve the
   * revision and existing selection identities; invalidation rejects old cursors.
   * Providers without incremental loading may return their complete inventory. */
  list(options?: { refresh?: boolean; wait?: boolean; cursor?: string }): Promise<AgentResult<DiscoverySnapshot>>;
  invalidate(): void;
  /** Source-bound read of a listed resource or retained provider-issued receipt, never a tool call. */
  readResource?(selection: DiscoverySelection): Promise<AgentResult<ToolContent>>;
  /** Provider owns browser authorization and credentials; this returns no tokens. */
  authenticate?(selection: DiscoverySelection): Promise<AgentResult<{ authorizationUrl: string }>>;
}
export const AgentSessionOpenInputSchema = z.strictObject({
  sessionId: id,
  context: CompiledContextSchema,
  tools: ToolExposureSchema,
});
export type AgentSessionOpenInput = z.infer<typeof AgentSessionOpenInputSchema>;
export const AgentReviewerSchema = z.enum(['human', 'delegated']);
export type AgentReviewer = z.infer<typeof AgentReviewerSchema>;
export const AgentModelSelectionSchema = z.strictObject({ model: z.string().min(1).max(256), effort: z.string().min(1).max(64).optional() });
export type AgentModelSelection = z.infer<typeof AgentModelSelectionSchema>;
export const AgentModelSchema = z.strictObject({ id: z.string().min(1).max(256), title: z.string().min(1).max(256), efforts: z.array(z.string().min(1).max(64)).max(32), defaultEffort: z.string().max(64).optional() });
export type AgentModel = z.infer<typeof AgentModelSchema>;
export const AgentOperationInputSchema = z.strictObject({
  operationId: id,
  text: z.string(),
  selections: z.array(DiscoverySelectionSchema).max(32).optional(),
  attachments: z.array(AssetSchema).max(16).optional(),
  additionalContext: CompiledContextSchema.optional(),
  /** User reference content, never application/developer instructions. Framing is not isolation. */
  references: ContextReferenceMaterialSchema.optional(),
  /** Host-owned revocation of automatic references only. Check after awaited
   * preparation/persistence and immediately before delivery; still send original
   * text/manual context and report cancelled preparation without a receipt. */
  referenceSignal: AbortSignalSchema.optional(),
  /** Exact submitted words for durable display correlation, not model instructions. */
  originalDisplayText: z.string().optional(),
  displayId: z.string().uuid().optional(),
  preparation: ContextPreparationSummarySchema.optional(),
  /** Omission retains human review. Providers reject unsupported selections. */
  reviewer: AgentReviewerSchema.optional(),
  /** Explicit next-turn selection; unsupported providers reject before dispatch. */
  modelSelection: AgentModelSelectionSchema.optional(),
});
export type AgentOperationInput = z.infer<typeof AgentOperationInputSchema>;
export type AgentSteeringInput = AgentOperationInput;
export const AgentApprovalResolutionSchema = z.strictObject({
  approvalId: id,
  optionId: id,
});
export type AgentApprovalResolution = z.infer<
  typeof AgentApprovalResolutionSchema
>;
export const AgentInputResolutionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    requestId: id,
    action: z.literal("submit"),
    value: z.json(),
  }),
  z.strictObject({ requestId: id, action: z.literal("cancel") }),
]);
export type AgentInputResolution = z.infer<typeof AgentInputResolutionSchema>;
export const AgentCommandFailureSchema = z.strictObject({
  code: z.enum([
    "invalid_state",
    "invalid_interaction",
    "provider_unavailable",
    "provider_rejected",
  ]),
  message: z.string().max(512),
});
export type AgentCommandFailure = z.infer<typeof AgentCommandFailureSchema>;
export type AgentResult<T> =
  | { status: "ok"; value: T }
  | { status: "rejected"; failure: AgentCommandFailure };
export const AgentOperationFailureSchema = z.strictObject({
  code: z.enum([
    "provider_unavailable",
    "provider_rejected",
    "invalid_provider_response",
  ]),
  summary: z.string().max(512),
});
const usageCount = z.number().int().safe().nonnegative();
/** Provider-reported token counts attributable to one operation; not a bill. */
export const AgentOperationUsageSchema = z.strictObject({
  inputTokens: usageCount.optional(),
  cachedInputTokens: usageCount.optional(),
  outputTokens: usageCount.optional(),
  reasoningTokens: usageCount.optional(),
  totalTokens: usageCount.optional(),
}).superRefine((value, context) => {
  if (Object.values(value).every((item) => item === undefined)) context.addIssue({ code: "custom", message: "Usage must contain an observed value" });
  if (value.inputTokens !== undefined && value.cachedInputTokens !== undefined && value.cachedInputTokens > value.inputTokens) context.addIssue({ code: "custom", path: ["cachedInputTokens"], message: "Cached input is included in input" });
  if (value.outputTokens !== undefined && value.reasoningTokens !== undefined && value.reasoningTokens > value.outputTokens) context.addIssue({ code: "custom", path: ["reasoningTokens"], message: "Reasoning tokens are included in output" });
});
export type AgentOperationUsage = z.infer<typeof AgentOperationUsageSchema>;
export const AgentSessionSignalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("artifact.available"), operationId: id, asset: AssetSchema, messageId: id.optional() }),
  z.strictObject({ kind: z.literal("operation.started"), operationId: id }),
  z.strictObject({ kind: z.literal("operation.completed"), operationId: id, usage: AgentOperationUsageSchema.optional() }),
  z.strictObject({ kind: z.literal("operation.interrupted"), operationId: id, usage: AgentOperationUsageSchema.optional() }),
  z.strictObject({
    kind: z.literal("operation.failed"),
    operationId: id,
    failure: AgentOperationFailureSchema,
    usage: AgentOperationUsageSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("message.delta"),
    operationId: id,
    messageId: id,
    phase: z.enum(["commentary", "final"]).optional(),
    delta: z.string(),
  }),
  z.strictObject({
    kind: z.literal("message.completed"),
    operationId: id,
    messageId: id,
    role: z.enum(['user', 'assistant']).optional(),
    assets: z.array(AssetSchema).optional(),
    preparation: ContextPreparationSummarySchema.optional(),
    displayId: z.string().uuid().optional(),
    phase: z.enum(["commentary", "final"]).optional(),
    text: z.string(),
  }),
  z.strictObject({
    kind: z.literal("approval.requested"),
    request: z.strictObject({
      approvalId: id,
      operationId: id,
      summary: z.string().max(4096),
      details: z.string().max(16384).optional(),
      options: z
        .array(
          z.strictObject({
            optionId: id,
            label: z.string().max(512),
            description: z.string().max(4096).optional(),
          }),
        )
        .min(1),
    }),
  }),
  z.strictObject({
    kind: z.literal("approval.resolved"),
    approvalId: id,
    // Native resolution/cancellation need not disclose a selected option.
    optionId: id.optional(),
  }),
  z.strictObject({
    kind: z.literal("input.requested"),
    request: z.strictObject({
      requestId: id,
      operationId: id,
      prompt: z.string().max(8192),
      responseSchema: z.json().optional(),
    }),
  }),
  z.strictObject({ kind: z.literal("input.resolved"), requestId: id }),
  z.strictObject({
    kind: z.literal("provider.observation"),
    operationId: id,
    name: z.string().min(1).max(128),
    summary: z.string().max(4096).optional(),
    evidence: z.string().min(1).optional(),
  }),
]);
export type AgentSessionSignal = z.infer<typeof AgentSessionSignalSchema>;
export interface AgentDriver {
  readonly driverId: string;
  openSession(input: AgentSessionOpenInput): Promise<AgentResult<AgentSession>>;
}
export interface AgentSession {
  readonly discovery?: AgentDiscovery;
  readonly reviewerModes: readonly AgentReviewer[];
  readonly history?: ConversationHistoryReader;
  readonly sessionId: string;
  execute(
    input: AgentOperationInput,
  ): Promise<AgentResult<{ operationId: string }>>;
  readonly steer?: (input: AgentSteeringInput) => Promise<AgentResult<void>>;
  readonly interrupt?: (operationId: string) => Promise<AgentResult<void>>;
  resolveApproval(input: AgentApprovalResolution): Promise<AgentResult<void>>;
  respondToInput(input: AgentInputResolution): Promise<AgentResult<void>>;
  close(): Promise<AgentResult<void>>;
  signals(): AsyncIterable<AgentSessionSignal>;
}

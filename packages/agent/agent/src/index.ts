import { z } from "zod";
import { CompiledContextSchema } from "@drawloom/context";
import { ToolExposureSchema, type ToolContent } from "@drawloom/tools";
import { AssetSchema } from "@drawloom/host";
import type { ConversationHistoryReader } from '@drawloom/conversation-history';
const id = z.string().min(1);
export const DiscoveryKindSchema = z.enum(['skill', 'app', 'plugin', 'tool', 'resource']);
export const DiscoverySelectionSchema = z.strictObject({ id, revision: id });
export type DiscoverySelection = z.infer<typeof DiscoverySelectionSchema>;
export const DiscoveryEntrySchema = z.strictObject({
  id, origin: id, kind: DiscoveryKindSchema, name: id,
  description: z.string(), scope: id,
  availability: z.enum(['available', 'unavailable', 'unverified']),
  selectable: z.boolean(), ownerId: id.optional(), readable: z.boolean().optional(),
});
export type DiscoveryEntry = z.infer<typeof DiscoveryEntrySchema>;
export const DiscoverySnapshotSchema = z.strictObject({
  revision: id, entries: z.array(DiscoveryEntrySchema),
  categories: z.array(z.strictObject({ kind: DiscoveryKindSchema,
    status: z.enum(['available', 'unsupported', 'error']), message: z.string().optional() })),
});
export type DiscoverySnapshot = z.infer<typeof DiscoverySnapshotSchema>;
/** Discovery is metadata only. Selection does not grant execution authority. */
export interface AgentDiscovery {
  list(options?: { refresh?: boolean }): Promise<AgentResult<DiscoverySnapshot>>;
  invalidate(): void;
  /** Source-bound read of a listed resource or retained provider-issued receipt, never a tool call. */
  readResource?(selection: DiscoverySelection): Promise<AgentResult<ToolContent>>;
}
export const AgentSessionOpenInputSchema = z.strictObject({
  sessionId: id,
  context: CompiledContextSchema,
  tools: ToolExposureSchema,
});
export type AgentSessionOpenInput = z.infer<typeof AgentSessionOpenInputSchema>;
export const AgentReviewerSchema = z.enum(['human', 'delegated']);
export type AgentReviewer = z.infer<typeof AgentReviewerSchema>;
export const AgentOperationInputSchema = z.strictObject({
  operationId: id,
  text: z.string(),
  selections: z.array(DiscoverySelectionSchema).max(32).optional(),
  attachments: z.array(AssetSchema).max(16).optional(),
  additionalContext: CompiledContextSchema.optional(),
  /** Omission retains human review. Providers reject unsupported selections. */
  reviewer: AgentReviewerSchema.optional(),
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
export const AgentSessionSignalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("artifact.available"), operationId: id, asset: AssetSchema, messageId: id.optional() }),
  z.strictObject({ kind: z.literal("operation.started"), operationId: id }),
  z.strictObject({ kind: z.literal("operation.completed"), operationId: id }),
  z.strictObject({ kind: z.literal("operation.interrupted"), operationId: id }),
  z.strictObject({
    kind: z.literal("operation.failed"),
    operationId: id,
    failure: AgentOperationFailureSchema,
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

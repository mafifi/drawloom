import { z } from "zod";
import { CompiledContextSchema } from "@drawloom/context";
import { ToolExposureSchema } from "@drawloom/tools";
import { AssetSchema } from "@drawloom/host";
const id = z.string().min(1);
export const AgentSessionOpenInputSchema = z.strictObject({
  sessionId: id,
  context: CompiledContextSchema,
  tools: ToolExposureSchema,
});
export type AgentSessionOpenInput = z.infer<typeof AgentSessionOpenInputSchema>;
export const AgentOperationInputSchema = z.strictObject({
  operationId: id,
  text: z.string(),
  attachments: z.array(AssetSchema).max(16).optional(),
  additionalContext: CompiledContextSchema.optional(),
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
  z.strictObject({ kind: z.literal("artifact.available"), operationId: id, asset: AssetSchema }),
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
    phase: z.enum(["commentary", "final"]).optional(),
    text: z.string(),
  }),
  z.strictObject({
    kind: z.literal("approval.requested"),
    request: z.strictObject({
      approvalId: id,
      operationId: id,
      summary: z.string().max(4096),
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
    optionId: id,
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
/** Chronological display entries; bounded projections retain the recent tail and flag omissions. */
export const AgentHistorySchema = z.strictObject({
  entries: z.array(z.strictObject({
    id, role: z.enum(["user", "assistant"]), text: z.string(),
    operationId: id.optional(), assets: z.array(AssetSchema),
  })),
  truncated: z.boolean(),
});
export type AgentHistory = z.infer<typeof AgentHistorySchema>;
export interface AgentDriver {
  readonly driverId: string;
  openSession(input: AgentSessionOpenInput): Promise<AgentResult<AgentSession>>;
}
export interface AgentSession {
  /** Read-only display projection of native history, never a replay of signals. */
  readonly readHistory?: () => Promise<AgentResult<AgentHistory>>;
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

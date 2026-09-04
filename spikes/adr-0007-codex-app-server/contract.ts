import { z } from "zod";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const NonEmptyStringSchema = z.string().trim().min(1);

export type CompiledContext = Readonly<
  Record<
    string,
    {
      readonly kind: "application";
      readonly value: string;
    }
  >
>;

export type ToolExposure = {
  readonly mcpServers: Readonly<Record<string, JsonValue>>;
};

export type AgentSessionOpenInput = {
  readonly sessionId: string;
  readonly context: CompiledContext;
  readonly tools: ToolExposure;
};

export type AgentOperationInput = {
  readonly operationId: string;
  readonly text: string;
  readonly additionalContext?: CompiledContext;
};

export type AgentSteeringInput = AgentOperationInput;

export type AgentApprovalResolution = {
  readonly approvalId: string;
  readonly optionId: string;
};

export type AgentInputResolution =
  | {
      readonly requestId: string;
      readonly action: "submit";
      readonly value: JsonValue;
    }
  | {
      readonly requestId: string;
      readonly action: "cancel";
    };

export type AgentCommandFailure = {
  readonly code:
    | "invalid_state"
    | "invalid_interaction"
    | "provider_unavailable"
    | "provider_rejected";
  readonly message: string;
};

export type AgentResult<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "rejected"; readonly failure: AgentCommandFailure };

export const AgentSessionSignalSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("operation.started"),
      operationId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("operation.completed"),
      operationId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("operation.failed"),
      operationId: NonEmptyStringSchema,
      failure: z
        .object({
          code: z.enum([
            "provider_unavailable",
            "provider_rejected",
            "invalid_provider_response",
          ]),
          summary: NonEmptyStringSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("operation.interrupted"),
      operationId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("message.delta"),
      operationId: NonEmptyStringSchema,
      messageId: NonEmptyStringSchema,
      phase: z.enum(["commentary", "final"]).optional(),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("message.completed"),
      operationId: NonEmptyStringSchema,
      messageId: NonEmptyStringSchema,
      phase: z.enum(["commentary", "final"]).optional(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("approval.requested"),
      request: z
        .object({
          approvalId: NonEmptyStringSchema,
          operationId: NonEmptyStringSchema,
          summary: NonEmptyStringSchema,
          options: z.array(
            z
              .object({
                optionId: NonEmptyStringSchema,
                label: NonEmptyStringSchema,
                description: NonEmptyStringSchema.optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("approval.resolved"),
      approvalId: NonEmptyStringSchema,
      optionId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("input.requested"),
      request: z
        .object({
          requestId: NonEmptyStringSchema,
          operationId: NonEmptyStringSchema,
          prompt: NonEmptyStringSchema,
          responseSchema: JsonValueSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("input.resolved"),
      requestId: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("provider.observation"),
      operationId: NonEmptyStringSchema,
      name: NonEmptyStringSchema,
      summary: NonEmptyStringSchema.optional(),
      evidence: NonEmptyStringSchema.optional(),
    })
    .strict(),
]);

export type AgentSessionSignal = z.infer<typeof AgentSessionSignalSchema>;

export interface AgentSession {
  readonly sessionId: string;
  execute(
    input: AgentOperationInput,
  ): Promise<AgentResult<{ readonly operationId: string }>>;
  readonly steer?: (
    input: AgentSteeringInput,
  ) => Promise<AgentResult<void>>;
  readonly interrupt?: (operationId: string) => Promise<AgentResult<void>>;
  resolveApproval(input: AgentApprovalResolution): Promise<AgentResult<void>>;
  respondToInput(input: AgentInputResolution): Promise<AgentResult<void>>;
  close(): Promise<AgentResult<void>>;
  signals(): AsyncIterable<AgentSessionSignal>;
}

export interface AgentDriver {
  readonly driverId: string;
  openSession(input: AgentSessionOpenInput): Promise<AgentResult<AgentSession>>;
}

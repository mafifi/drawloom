import { z } from "zod";

export const JsonSchema = z.json();
export type Json = z.infer<typeof JsonSchema>;
export type ToolContext = Readonly<{
  invocationId: string;
  operationId: string;
  signal: AbortSignal;
}>;

export const OutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("succeeded"), value: JsonSchema, text: z.string() }),
  z.strictObject({
    status: z.literal("failed"),
    code: z.enum([
      "unknown_tool", "invalid_input", "invalid_output", "denied",
      "cancelled", "execution_failed", "presentation_failed", "evidence_unavailable",
    ]),
    execution: z.enum(["not_started", "completed", "unknown"]),
    path: z.array(z.union([z.string(), z.number()])).optional(),
  }),
]);
export type Outcome = z.infer<typeof OutcomeSchema>;
export const ResultSchema = z.strictObject({
  invocationId: z.string().min(1),
  outcome: OutcomeSchema,
  evidence: z.enum(["recorded", "start_failed", "outcome_failed"]),
});
export type ToolResult = z.infer<typeof ResultSchema>;
export const RecordSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("started"), invocationId: z.string(),
    operationId: z.string(), tool: z.string(),
  }),
  z.strictObject({
    kind: z.literal("finished"), invocationId: z.string(),
    operationId: z.string(), tool: z.string(), outcome: OutcomeSchema,
  }),
]);
export type EvidenceRecord = z.infer<typeof RecordSchema>;

// Identity is supplied by trusted composition and checked by object identity.
// It is not a serialized grant and is never accepted from model arguments.
export type Binding = Readonly<{ operationId: string }>;
export type ToolSpec = Readonly<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  parseInput: (value: unknown) => unknown;
  execute: (value: unknown, context: ToolContext) => Promise<unknown>;
  parseOutput: (value: unknown) => Json;
  render: (value: Json) => string;
}>;
export type ToolAuthoring<I extends z.ZodType, O extends z.ZodType> = {
  name: string;
  description: string;
  input: I;
  output: O;
  execute: (input: z.output<I>, context: ToolContext) => Promise<z.input<O>>;
  render?: (value: z.output<O>) => string;
};
export interface ToolGateway {
  catalogue(): readonly Pick<ToolSpec, "name" | "description" | "inputSchema" | "outputSchema">[];
  invoke(binding: Binding, name: string, args: unknown, signal: AbortSignal): Promise<ToolResult>;
}
export type GatewayOptions = {
  tools: readonly ToolSpec[];
  allowed: (binding: Binding, tool: string) => boolean;
  record: (record: EvidenceRecord) => Promise<void>;
};
export type GatewayFactory = (options: GatewayOptions) => ToolGateway;

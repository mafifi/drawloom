import { z } from "zod";
import { JsonValueSchema, type JsonValue } from "@drawloom/host";
export const ToolAnnotationsSchema = z.strictObject({
  title: z.string().optional(),
  readOnlyHint: z.boolean().optional(),
  destructiveHint: z.boolean().optional(),
  idempotentHint: z.boolean().optional(),
  openWorldHint: z.boolean().optional(),
});
export type ToolAnnotations = z.infer<typeof ToolAnnotationsSchema>;
export const ToolExposureSchema = z.strictObject({
  id: z.string().min(1),
  tools: z.array(
    z.strictObject({
      name: z.string().min(1),
      description: z.string(),
      annotations: ToolAnnotationsSchema.optional(),
      inputSchema: JsonValueSchema,
      outputSchema: JsonValueSchema,
    }),
  ),
});
export type ToolExposure = z.infer<typeof ToolExposureSchema>;
export type ToolContext = {
  readonly invocationId: string;
  readonly operationId: string;
  readonly signal: AbortSignal;
};
export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly annotations?: ToolAnnotations;
  readonly inputSchema: JsonValue;
  readonly outputSchema: JsonValue;
  parseInput(value: unknown): unknown;
  parseOutput(value: unknown): JsonValue;
  execute(input: unknown, context: ToolContext): Promise<unknown>;
  render(value: JsonValue): string;
};
export function defineTool<
  I extends z.ZodType,
  O extends z.ZodType,
>(definition: {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  input: I;
  output: O;
  execute: (
    input: z.output<I>,
    context: ToolContext,
  ) => z.input<O> | Promise<z.input<O>>;
  render?: (value: z.output<O>) => string;
}): ToolDefinition {
  const name = z.string().min(1).parse(definition.name);
  const inputSchema = JsonValueSchema.parse(
    z.toJSONSchema(definition.input, { io: "input", target: "draft-7" }),
  );
  const outputSchema = JsonValueSchema.parse(
    z.toJSONSchema(definition.output, { io: "output", target: "draft-7" }),
  );
  return Object.freeze({
    name,
    description: z.string().parse(definition.description),
    ...(definition.annotations !== undefined
      ? {
          annotations: Object.freeze(
            ToolAnnotationsSchema.parse(definition.annotations),
          ),
        }
      : {}),
    inputSchema,
    outputSchema,
    parseInput: (value: unknown) =>
      definition.input.parse(JsonValueSchema.parse(value)),
    parseOutput: (value: unknown) =>
      JsonValueSchema.parse(definition.output.parse(value)),
    execute: async (value: unknown, context: ToolContext) =>
      definition.execute(value as z.output<I>, context),
    render: (value: JsonValue) =>
      definition.render
        ? definition.render(value as z.output<O>)
        : JSON.stringify(value),
  });
}
export const ToolResultSchema = z.strictObject({
  invocationId: z.string().min(1),
  operationId: z.string().min(1).optional(),
  evidence: z.enum(["recorded", "start_failed", "outcome_failed"]),
  outcome: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("ok"),
      value: JsonValueSchema,
      text: z.string(),
    }),
    z.strictObject({
      status: z.literal("failed"),
      code: z.enum([
        "denied",
        "unknown_tool",
        "invalid_input",
        "invalid_output",
        "handler_failed",
        "render_failed",
        "cancelled",
        "evidence_failed",
      ]),
      execution: z.enum(["not_started", "completed", "unknown"]),
      path: z.array(z.union([z.string(), z.number()])).optional(),
    }),
  ]),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;
declare const bindingBrand: unique symbol;
export type ToolBinding = { readonly [bindingBrand]: true };
export type ToolEvidence =
  | {
      kind: "started";
      invocationId: string;
      operationId?: string;
      tool: string;
    }
  | { kind: "finished"; result: ToolResult };
export interface ToolEvidenceSink {
  record(record: ToolEvidence): Promise<void>;
}
export type ToolPolicy = (operationId: string, tool: string) => boolean;
export interface ToolGateway {
  readonly exposure: ToolExposure;
  bind(operationId: string): ToolBinding;
  revoke(binding: ToolBinding): void;
  invoke(
    binding: ToolBinding,
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<ToolResult>;
}

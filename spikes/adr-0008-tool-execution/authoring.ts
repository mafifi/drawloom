import { z } from "zod";
import { JsonSchema, type ToolAuthoring, type ToolSpec } from "./contract.ts";

export const defineTool = <I extends z.ZodType, O extends z.ZodType>(
  definition: ToolAuthoring<I, O>,
): ToolSpec => {
  if (!definition.name.trim()) throw new Error("Tool name is required");
  const inputSchema = z.toJSONSchema(definition.input, { target: "draft-7", io: "input" });
  const outputSchema = z.toJSONSchema(definition.output, { target: "draft-7" });
  return Object.freeze({
    name: definition.name, description: definition.description, inputSchema, outputSchema,
    parseInput: (value: unknown) => definition.input.parse(JsonSchema.parse(value)),
    // The gateway parses through this definition before invoking its handler.
    execute: async (value: unknown, context) => definition.execute(value as z.output<I>, context),
    parseOutput: (value: unknown) => JsonSchema.parse(definition.output.parse(JsonSchema.parse(value))),
    render: (value) => definition.render
      ? definition.render(definition.output.parse(structuredClone(value)))
      : JSON.stringify(value),
  } satisfies ToolSpec);
};

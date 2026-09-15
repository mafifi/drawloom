import { expect, test } from "bun:test";
import { AgentOperationUsageSchema, AgentSessionSignalSchema } from "./src/index.js";

test("operation usage is optional, bounded, and does not double count cached or reasoning subsets", () => {
  expect(
    AgentOperationUsageSchema.parse({
      inputTokens: 100,
      cachedInputTokens: 40,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 120,
    }),
  ).toEqual({
    inputTokens: 100,
    cachedInputTokens: 40,
    outputTokens: 20,
    reasoningTokens: 5,
    totalTokens: 120,
  });
  expect(
    AgentOperationUsageSchema.safeParse({ inputTokens: 10, cachedInputTokens: 11 }).success,
  ).toBeFalse();
  expect(
    AgentOperationUsageSchema.safeParse({ outputTokens: 2, reasoningTokens: 3 }).success,
  ).toBeFalse();
  expect(AgentOperationUsageSchema.safeParse({ inputTokens: 1.5 }).success).toBeFalse();
  expect(AgentOperationUsageSchema.safeParse({}).success).toBeFalse();
  expect(
    AgentSessionSignalSchema.parse({
      kind: "operation.completed",
      operationId: "operation",
      usage: { inputTokens: 2 },
    }),
  ).toMatchObject({ usage: { inputTokens: 2 } });
});

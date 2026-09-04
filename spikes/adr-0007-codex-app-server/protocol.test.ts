import { expect, test } from "bun:test";

import { inspectProtocolSchema } from "./protocol.ts";

test("reports every missing ADR 0007 protocol token", () => {
  expect(
    inspectProtocolSchema({
      oneOf: [{ properties: { method: { enum: ["thread/start"] } } }],
    }),
  ).toEqual({
    supported: false,
    missing: [
      "thread/resume",
      "thread/memoryMode/set",
      "turn/start",
      "turn/steer",
      "turn/interrupt",
      "additionalContext",
      "item/commandExecution/requestApproval",
      "availableDecisions",
      "item/fileChange/requestApproval",
      "item/tool/requestUserInput",
      "mcpServer/elicitation/request",
      "approvalId",
      "collabAgentToolCall",
      "subAgentActivity",
      "tokenUsage",
      "reasoning",
    ],
  });
});

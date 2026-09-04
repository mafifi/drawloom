import { createHash } from "node:crypto";

export const requiredProtocolTokens = [
  "thread/start",
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
] as const;

const collectStrings = (value: unknown, target: Set<string>): void => {
  if (typeof value === "string") {
    target.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, target);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    target.add(key);
    collectStrings(item, target);
  }
};

export const inspectProtocolSchema = (
  schema: unknown,
): { readonly supported: boolean; readonly missing: readonly string[] } => {
  const strings = new Set<string>();
  collectStrings(schema, strings);
  const missing = requiredProtocolTokens.filter((token) => !strings.has(token));
  return { supported: missing.length === 0, missing };
};

export const schemaSha256 = (bytes: ArrayBuffer): string =>
  createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex");

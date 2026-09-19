import { expect, test } from "bun:test";
import { nativeToolOutput } from "./src/native-tool-output.js";

test("structured native results use provider metadata, never text sniffing", () => {
  const base = {
    id: "call",
    server: "server",
    tool: "read",
    status: "completed",
    result: { content: [{ type: "text", text: '{"answer":1}' }] },
  };
  expect(nativeToolOutput(base)?.origin.format).toBe("text");
  const result = nativeToolOutput({
    ...base,
    result: { ...base.result, structuredContent: { answer: 1 } },
  });
  expect(result?.origin.format).toBe("json");
  expect(result?.content[0]).toEqual({
    type: "text",
    text: JSON.stringify({ text: '{"answer":1}', data: { answer: 1 } }, null, 2),
  });
});

test("failed and unfinished native calls never imply successful execution", () => {
  const failed = nativeToolOutput({
    id: "call",
    tool: "read",
    status: "failed",
    error: { message: "Unavailable" },
  });
  expect(failed?.origin.outcome).toBe("failed");
  expect(failed?.content).toEqual([{ type: "text", text: "Unavailable" }]);
  expect(nativeToolOutput({ id: "call", status: "inProgress" })).toBeUndefined();
});

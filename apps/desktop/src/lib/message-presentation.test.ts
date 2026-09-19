import { expect, test } from "bun:test";
import { structuredMessage } from "./message-presentation.js";
const origin = {
  kind: "tool" as const,
  source: "example",
  callId: "call",
  title: "Example",
  outcome: "completed" as const,
  format: "json" as const,
};

test("JSON-shaped assistant prose remains an answer", () => {
  expect(
    structuredMessage({ role: "assistant", origin: { kind: "assistant" }, text: '{"answer":42}' }),
  ).toBeUndefined();
});

test("declared structured output is indented without losing nested evidence", () => {
  expect(
    structuredMessage({ role: "assistant", origin, text: '{"result":{"ok":true,"values":[1,2]}}' }),
  ).toBe('{\n  "result": {\n    "ok": true,\n    "values": [\n      1,\n      2\n    ]\n  }\n}');
});

test("prose, partial JSON, scalar answers and user input are not hidden as structured output", () => {
  for (const text of ['A result: {"ok":true}', '{"ok":', "42", "null", '"hello"']) {
    expect(
      structuredMessage({ role: "assistant", origin: { kind: "assistant" }, text }),
    ).toBeUndefined();
  }
  expect(
    structuredMessage({ role: "user", origin: { kind: "user" }, text: '{"ok":true}' }),
  ).toBeUndefined();
});

test("arrays and whitespace-delimited JSON are formatted", () => {
  expect(structuredMessage({ role: "assistant", origin, text: "  [1,2] \n" })).toBe(
    "[\n  1,\n  2\n]",
  );
});

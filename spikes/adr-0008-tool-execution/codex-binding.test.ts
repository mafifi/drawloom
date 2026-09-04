import { expect, test } from "bun:test";
import { BindingRegistry, parseOrigin, projectResult } from "./codex-binding.ts";

test("projects only provider-authored identity from metadata", () => {
  expect(parseOrigin({ callId: "call-a", "x-codex-turn-metadata": {
    thread_id: "thread-a", turn_id: "turn-a", private: "not forwarded",
  } })).toEqual({ callId: "call-a", threadId: "thread-a", turnId: "turn-a" });
  for (const invalid of [undefined, {}, { operationId: "operation-b" }, {
    callId: "call-a", "x-codex-turn-metadata": { thread_id: "thread-a" },
  }]) expect(parseOrigin(invalid)).toBeUndefined();
});

test("exact provider origin cannot be rebound or resolved from a different thread", () => {
  const registry = new BindingRegistry();
  const a = { threadId: "thread-a", turnId: "turn-a" };
  const b = { threadId: "thread-a", turnId: "turn-b" };
  const bindingA = registry.bind(a, "operation-a");
  registry.bind(b, "operation-b");
  expect(registry.resolve(a)).toBe(bindingA);
  expect(registry.resolve({ ...a, threadId: "thread-other" })).toBeUndefined();
  expect(() => registry.bind(a, "operation-b")).toThrow();
});

test("MCP preserves canonical values and flags evidence failure after success", () => {
  for (const evidence of ["recorded", "outcome_failed"] as const) {
    const result = projectResult({ invocationId: "invocation-a", evidence,
      outcome: { status: "succeeded", value: { count: 2 }, text: "2 words" } });
    expect(result.isError).toBe(evidence !== "recorded");
    expect(result.structuredContent).toMatchObject({ outcome: { value: { count: 2 } }, evidence });
    expect(result._meta).toEqual({ drawloom: { toolInvocationId: "invocation-a" } });
    if (evidence === "recorded") expect(result.content).toEqual([{ type: "text", text: "2 words" }]);
    else expect(result.content[0]?.text).toContain("outcome_failed");
  }
});

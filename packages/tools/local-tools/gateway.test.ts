import { test, expect } from "bun:test";
import { z } from "zod";
import { defineTool, type ToolDefinition } from "@drawloom/tools";
import { toolConformance } from "@drawloom/tools/conformance";
import { createLocalToolGateway } from "./src/index.js";
test("shared tool conformance", () => toolConformance(createLocalToolGateway));
test("cancellation after an effect waits for settlement and does not retry", async () => {
  const controller = new AbortController();
  let effects = 0;
  const tool = defineTool({
    name: "effect",
    description: "Effect",
    input: z.string(),
    output: z.string(),
    execute: async (value, { signal }) => {
      effects++;
      controller.abort();
      expect(signal.aborted).toBe(true);
      return value;
    },
  });
  const gateway = createLocalToolGateway({
    tools: [tool],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => "id",
  });
  expect(
    (await gateway.invoke(gateway.bind("op"), "effect", "x", controller.signal))
      .outcome,
  ).toEqual({ status: "failed", code: "cancelled", execution: "completed" });
  expect(effects).toBe(1);
});
test("custom renderer cannot mutate the canonical result and render failures preserve settlement", async () => {
  let id = 0;
  const tool = defineTool({
    name: "render",
    description: "Render",
    input: z.string(),
    output: z.strictObject({ value: z.string() }),
    execute: (value) => ({ value }),
    render: (result) => {
      result.value = "mutated";
      return "shown";
    },
  });
  const bad = defineTool({
    name: "bad",
    description: "Bad",
    input: z.string(),
    output: z.string(),
    execute: (x) => x,
    render: () => {
      throw Error("private");
    },
  });
  const g = createLocalToolGateway({
    tools: [tool, bad],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => String(++id),
  });
  const binding = g.bind("op");
  expect(
    (
      await g.invoke(
        binding,
        "render",
        "original",
        new AbortController().signal,
      )
    ).outcome,
  ).toEqual({ status: "ok", value: { value: "original" }, text: "shown" });
  expect(
    (await g.invoke(binding, "bad", "x", new AbortController().signal)).outcome,
  ).toEqual({
    status: "failed",
    code: "render_failed",
    execution: "completed",
  });
});
test("output and rendering failures retain execution knowledge without retry", async () => {
  let calls = 0;
  const tool = defineTool({
    name: "effect",
    description: "effect",
    input: z.string(),
    output: z.string(),
    execute: () => {
      calls++;
      return 3 as unknown as string;
    },
  });
  const gateway = createLocalToolGateway({
    tools: [tool],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => String(calls + 1),
  });
  const result = await gateway.invoke(
    gateway.bind("a"),
    "effect",
    "x",
    new AbortController().signal,
  );
  expect(result.outcome).toMatchObject({
    code: "invalid_output",
    execution: "completed",
  });
  expect(calls).toBe(1);
});
test("catalogue rejects duplicates and takes an immutable schema snapshot", () => {
  const tool = defineTool({
    name: "x",
    description: "x",
    input: z.string(),
    output: z.string(),
    execute: (x) => x,
  });
  expect(() =>
    createLocalToolGateway({
      tools: [tool, tool],
      policy: () => true,
      evidence: { record: async () => {} },
      nextInvocationId: () => "1",
    }),
  ).toThrow();
  const g = createLocalToolGateway({
    tools: [tool],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => "1",
  });
  expect(Object.isFrozen(g.exposure.tools)).toBe(true);
  expect(g.exposure.tools[0]?.annotations).toBeUndefined();
});
test("annotation values supplied at authoring and gateway boundaries are validated", () => {
  const definition = {
    name: "boundary",
    description: "boundary",
    input: z.string(),
    output: z.string(),
    execute: (value: string) => value,
  };
  for (const annotations of [
    null,
    false,
    0,
    { readOnlyHint: "yes" },
    { unknownHint: true },
  ]) {
    expect(() =>
      defineTool({
        ...definition,
        // @ts-expect-error Deliberately exercise untyped JavaScript callers.
        annotations,
      }),
    ).toThrow();
  }

  const valid = defineTool(definition);
  for (const annotations of [
    null,
    false,
    0,
    { readOnlyHint: "yes" },
    { unknownHint: true },
  ]) {
    const manual = { ...valid, annotations } as unknown as ToolDefinition;
    expect(() =>
      createLocalToolGateway({
        tools: [manual],
        policy: () => true,
        evidence: { record: async () => {} },
        nextInvocationId: () => "1",
      }),
    ).toThrow();
  }
});

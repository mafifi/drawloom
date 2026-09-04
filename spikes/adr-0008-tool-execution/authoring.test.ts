import { expect, expectTypeOf, test } from "bun:test";
import { z } from "zod";
import { defineTool } from "./authoring.ts";

test("input defaults are optional on the wire and resolved for the typed handler", async () => {
  const definition = defineTool({ name: "default_count", description: "Count supplied text",
    input: z.strictObject({ text: z.string().default("one") }),
    output: z.strictObject({ count: z.number() }),
    execute: async ({ text }) => { expectTypeOf(text).toEqualTypeOf<string>(); return { count: text.length }; },
    render: ({ count }) => { expectTypeOf(count).toEqualTypeOf<number>(); return String(count); },
  });
  expect(definition.inputSchema.required ?? []).not.toContain("text");
  expect(definition.parseInput({})).toEqual({ text: "one" });
});

test("unprojectable schemas and empty names fail before registration", () => {
  expect(() => defineTool({ name: "date", description: "Invalid output",
    input: z.strictObject({}), output: z.date(), execute: async () => new Date(),
  })).toThrow();
  expect(() => defineTool({ name: "transform", description: "Invalid output projection",
    input: z.strictObject({}), output: z.string().transform((text) => text.length), execute: async () => "x",
  })).toThrow();
  expect(() => defineTool({ name: " ", description: "Invalid name",
    input: z.strictObject({}), output: z.string(), execute: async () => "x",
  })).toThrow();
});

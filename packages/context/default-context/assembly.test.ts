import { expect, test } from "bun:test";
import type { ContextAssembler } from "@drawloom/context/assembly";
import { contextAssemblyConformance } from "@drawloom/context/assembly-conformance";
import { createDefaultContextAssembler } from "./src/index.js";

test("shared full context assembly conformance", () =>
  contextAssemblyConformance(createDefaultContextAssembler));
test("shared conformance rejects a provider that misreports turn cancellation", async () => {
  await expect(
    contextAssemblyConformance(() => {
      const delegate = createDefaultContextAssembler();
      return {
        ...delegate,
        turn: async (input, options) =>
          options.signal.aborted
            ? { kind: "failure", code: "invalid_input" }
            : delegate.turn(input, options),
      } satisfies ContextAssembler;
    }),
  ).rejects.toThrow("turn cancellation lost");
});
test("shared conformance rejects automatic knowledge copied into instructions", async () => {
  await expect(
    contextAssemblyConformance(() => {
      const delegate = createDefaultContextAssembler();
      return {
        ...delegate,
        turn: async (input, options) => {
          const result = await delegate.turn(input, options);
          if (result.kind !== "ready" || !result.automaticKnowledge) return result;
          return {
            ...result,
            additionalContext: {
              text: [result.additionalContext?.text, result.automaticKnowledge.text]
                .filter(Boolean)
                .join("\n\n"),
              sources: result.additionalContext?.sources,
            },
          };
        },
      } satisfies ContextAssembler;
    }),
  ).rejects.toThrow("automatic knowledge promoted to instructions");
});
test("malformed mandatory input fails instead of silently dropping it", async () => {
  const assembler = createDefaultContextAssembler();
  expect(
    await assembler.session({ instructions: "wrong", skills: [], guidance: [] } as never, {
      signal: new AbortController().signal,
    }),
  ).toEqual({ kind: "failure", code: "invalid_input" });
});
test("empty turn preserves text and omits empty developer context", async () => {
  const result = await createDefaultContextAssembler().turn(
    {
      request: "\n hello  ",
      instructions: [],
      references: [],
      attachments: [],
      selections: [],
    },
    { signal: new AbortController().signal },
  );
  expect(result).toEqual({
    kind: "ready",
    originalText: "\n hello  ",
    text: "\n hello  ",
    attachments: [],
    selections: [],
  });
});
test("automatic reference body is not copied into the immutable user text", async () => {
  const result = await createDefaultContextAssembler().turn(
    {
      request: "Question",
      instructions: [],
      references: [],
      attachments: [],
      selections: [],
      automaticKnowledge: { kind: "ready", text: "SECRET", bytes: 6, references: [] },
    },
    { signal: new AbortController().signal },
  );
  expect(result.kind).toBe("ready");
  if (result.kind === "ready") {
    expect(result.text).toBe("Question");
    expect(result.automaticKnowledge?.text).toBe("SECRET");
  }
});

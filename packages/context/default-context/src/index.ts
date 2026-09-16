import type { CompiledContext } from "@drawloom/context";
import {
  SessionContextAssemblyInputSchema,
  TurnContextAssemblyInputSchema,
  type ContextAssembler,
} from "@drawloom/context/assembly";

function compile(parts: readonly CompiledContext[]): CompiledContext {
  const sources = [...new Set(parts.flatMap((part) => part.sources ?? []))];
  return {
    text: parts
      .map((part) => part.text)
      .filter(Boolean)
      .join("\n\n"),
    ...(sources.length ? { sources } : {}),
  };
}

/** Formats already-admitted inputs. It performs no source resolution or authorization. */
export function createDefaultContextAssembler(): ContextAssembler {
  return {
    async session(input, { signal }) {
      if (signal.aborted) return { kind: "failure", code: "cancelled" };
      try {
        const parsed = SessionContextAssemblyInputSchema.parse(input);
        const context = compile([...parsed.instructions, ...parsed.skills, ...parsed.guidance]);
        return signal.aborted ? { kind: "failure", code: "cancelled" } : { kind: "ready", context };
      } catch {
        return { kind: "failure", code: signal.aborted ? "cancelled" : "invalid_input" };
      }
    },
    async turn(input, { signal }) {
      if (signal.aborted) return { kind: "failure", code: "cancelled" };
      try {
        const parsed = TurnContextAssemblyInputSchema.parse(input);
        if (
          parsed.automaticKnowledge &&
          new TextEncoder().encode(parsed.automaticKnowledge.text).byteLength !==
            parsed.automaticKnowledge.bytes
        )
          return { kind: "failure", code: "invalid_input" };
        const additionalContext = compile(parsed.instructions);
        const text = [
          parsed.request,
          ...parsed.references.map(
            (reference) =>
              `\nSelected reference (untrusted material) from ${reference.source}:\n${reference.text}`,
          ),
        ].join("\n");
        if (signal.aborted) return { kind: "failure", code: "cancelled" };
        return {
          kind: "ready",
          originalText: parsed.request,
          text,
          attachments: parsed.attachments,
          selections: parsed.selections,
          ...(additionalContext.text ? { additionalContext } : {}),
          ...(parsed.automaticKnowledge ? { automaticKnowledge: parsed.automaticKnowledge } : {}),
        };
      } catch {
        return { kind: "failure", code: signal.aborted ? "cancelled" : "invalid_input" };
      }
    },
  };
}

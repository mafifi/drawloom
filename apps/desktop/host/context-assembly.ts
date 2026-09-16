import { isDeepStrictEqual } from "node:util";
import {
  SessionContextAssemblyInputSchema,
  SessionContextAssemblyResultSchema,
  TurnContextAssemblyInputSchema,
  TurnContextAssemblyResultSchema,
  type ContextAssembler,
  type SessionContextAssemblyInput,
  type TurnContextAssemblyInput,
} from "@drawloom/context/assembly";

/** Selection is trusted startup code. Validate its outputs before native submission;
 * source resolution, disclosure checks and original history remain host-owned. */
export function createDesktopContextAssembly(assembler: ContextAssembler, signal: AbortSignal) {
  async function run<T>(work: () => Promise<T>): Promise<T> {
    if (signal.aborted) throw Error("Conversation context assembly was cancelled");
    let cancel!: () => void;
    try {
      const result = await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          cancel = () => reject(Error("Conversation context assembly was cancelled"));
          signal.addEventListener("abort", cancel, { once: true });
          if (signal.aborted) cancel();
        }),
      ]);
      if (signal.aborted) throw Error("Conversation context assembly was cancelled");
      return result;
    } catch {
      throw Error(
        "Conversation context could not be assembled. Try again or check the configured implementation.",
      );
    } finally {
      if (cancel) signal.removeEventListener("abort", cancel);
    }
  }
  return {
    session(input: SessionContextAssemblyInput) {
      return run(async () => {
        const parsed = SessionContextAssemblyInputSchema.parse(input);
        const result = SessionContextAssemblyResultSchema.parse(
          await assembler.session(parsed, { signal }),
        );
        if (result.kind !== "ready") throw Error("Session context unavailable");
        return result.context;
      });
    },
    turn(input: TurnContextAssemblyInput) {
      return run(async () => {
        const parsed = TurnContextAssemblyInputSchema.parse(input);
        const result = TurnContextAssemblyResultSchema.parse(
          await assembler.turn(structuredClone(parsed), { signal }),
        );
        if (
          result.kind !== "ready" ||
          result.originalText !== parsed.request ||
          !isDeepStrictEqual(result.attachments, parsed.attachments) ||
          !isDeepStrictEqual(result.selections, parsed.selections) ||
          !isDeepStrictEqual(result.automaticKnowledge, parsed.automaticKnowledge)
        )
          throw Error("Turn context changed admitted identities");
        return result;
      });
    },
  };
}

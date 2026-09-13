import { z } from "zod";
import type { Scorer } from "./contract.ts";

export const passageEffectOutputSchema = z.strictObject({
  selectedTool: z.string().min(1).max(256),
  scenario: z.enum(["approved", "denied", "revoked", "mismatched", "stale"]),
  before: z.string().max(12_000),
  after: z.string().max(12_000),
  requestedReplacement: z.string().max(12_000),
  handlerCalls: z.number().int().nonnegative().max(1),
  accepted: z.literal(false),
});
export type PassageEffectOutput = z.infer<typeof passageEffectOutputSchema>;

export const passageToolSelectionScorer: Scorer = {
  id: "passage-tool-selection",
  revision: "1",
  async score({ output }) {
    const parsed = passageEffectOutputSchema.parse(output);
    const selected = parsed.selectedTool === "passage.revise";
    return {
      score: selected ? 1 : 0,
      explanation: selected ? "The passage revision tool was selected." : "A different tool was selected.",
    };
  },
};

export const passageAuthorityScorer: Scorer = {
  id: "passage-native-authority",
  revision: "1",
  async score({ output }) {
    const parsed = passageEffectOutputSchema.parse(output);
    const expectedEffect = parsed.scenario === "approved";
    const passed = expectedEffect
      ? parsed.handlerCalls === 1
      : parsed.handlerCalls === 0 && parsed.after === parsed.before;
    return {
      score: passed ? 1 : 0,
      explanation: expectedEffect
        ? `Approved invocation produced ${parsed.handlerCalls} protected handler call.`
        : `${parsed.scenario} invocation produced ${parsed.handlerCalls} protected handler calls and left the source ${parsed.after === parsed.before ? "unchanged" : "changed"}.`,
    };
  },
};

export const passageEffectScorer: Scorer = {
  id: "passage-effect",
  revision: "1",
  async score({ output }) {
    const parsed = passageEffectOutputSchema.parse(output);
    if (parsed.scenario !== "approved") {
      return { explanation: `No passage effect was authorized for the ${parsed.scenario} scenario.` };
    }
    const correct = parsed.handlerCalls === 1 && parsed.after === parsed.requestedReplacement && parsed.after !== parsed.before;
    return {
      score: correct ? 1 : 0,
      explanation: correct
        ? "The one protected call produced the exact requested unaccepted revision."
        : "The approved call did not produce the exact requested unaccepted revision.",
    };
  },
};

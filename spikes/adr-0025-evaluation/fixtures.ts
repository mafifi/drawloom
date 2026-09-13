import { z } from "zod";
import { ExecutionFailure, type EvaluationCase, type Scorer, type Target } from "./contract.ts";

export const EXPECTED_SENTINEL = "EXPECTED-MUST-NOT-REACH-TARGET";
export const syntheticCases: readonly EvaluationCase[] = [
  { id: "uppercase-good", revision: "1", input: { text: "drawloom" }, expected: "DRAWLOOM", suppliedOutput: "DRAWLOOM", evidence: [] },
  { id: "uppercase-regression", revision: "1", input: { text: "loom" }, expected: "LOOM", suppliedOutput: "wrong", evidence: [] },
];

export function createSyntheticTarget(observe?: (input: Readonly<Record<string, unknown>>) => void): Target {
  return {
    id: "synthetic-uppercase",
    revision: "1",
    inputSchema: z.object({ text: z.string() }),
    outputSchema: z.string(),
    async run(input) {
      observe?.(input);
      const text = input.text;
      if (typeof text !== "string") throw new ExecutionFailure("denied", "Synthetic input denied");
      return text.toUpperCase();
    },
  };
}

export const exactScorer: Scorer = {
  id: "exact",
  revision: "1",
  async score({ output, expected }) {
    return { score: Object.is(output, expected) ? 1 : 0, explanation: "Exact expected-value comparison." };
  },
};

export const scriptedJudge: Scorer = {
  id: "scripted-judge",
  revision: "1",
  async score({ output }) {
    return { score: typeof output === "string" && output.length > 0 ? 1 : 0, explanation: "Scripted shape judgement; no model call." };
  },
};

export function createTinyWav(): Uint8Array {
  const samples = new Int16Array([0, 1000, 0, -1000, 0, 500, 0, -500]);
  const bytes = new Uint8Array(44 + samples.byteLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, samples.byteLength, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

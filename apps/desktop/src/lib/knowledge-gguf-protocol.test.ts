import { expect, test } from "bun:test";
import { LocalLearningSetupCommandSchema } from "./local-knowledge-setup-protocol.js";
test("the browser can request only the GGUF installation with explicit consent", () => {
  expect(
    LocalLearningSetupCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-gguf",
      consent: true,
    }).success,
  ).toBe(true);
  expect(
    LocalLearningSetupCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-mlx",
      consent: true,
    }).success,
  ).toBe(false);
  expect(
    LocalLearningSetupCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-gguf",
      consent: false,
    }).success,
  ).toBe(false);
});
test("obsolete runtime deletion requires explicit consent and cannot accept paths", () => {
  expect(
    LocalLearningSetupCommandSchema.safeParse({ action: "cleanup_obsolete", consent: true })
      .success,
  ).toBe(true);
  expect(LocalLearningSetupCommandSchema.safeParse({ action: "cleanup_obsolete" }).success).toBe(
    false,
  );
  expect(
    LocalLearningSetupCommandSchema.safeParse({
      action: "cleanup_obsolete",
      consent: true,
      path: "/tmp/other",
    }).success,
  ).toBe(false);
});

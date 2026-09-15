import { expect, test } from "bun:test";
import { KnowledgeCommandSchema } from "./knowledge-protocol.js";
test("the browser can request only the GGUF installation with explicit consent", () => {
  expect(
    KnowledgeCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-gguf",
      consent: true,
    }).success,
  ).toBe(true);
  expect(
    KnowledgeCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-mlx",
      consent: true,
    }).success,
  ).toBe(false);
  expect(
    KnowledgeCommandSchema.safeParse({
      action: "download",
      model: "qwen3-embedding-0.6b-gguf",
      consent: false,
    }).success,
  ).toBe(false);
});
test("obsolete runtime deletion requires explicit consent and cannot accept paths", () => {
  expect(
    KnowledgeCommandSchema.safeParse({ action: "cleanup_obsolete", consent: true }).success,
  ).toBe(true);
  expect(KnowledgeCommandSchema.safeParse({ action: "cleanup_obsolete" }).success).toBe(false);
  expect(
    KnowledgeCommandSchema.safeParse({
      action: "cleanup_obsolete",
      consent: true,
      path: "/tmp/other",
    }).success,
  ).toBe(false);
});

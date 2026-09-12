import { LocalEmbeddingsError } from "./errors.js";

export function validateEmbeddingVectors(value: unknown, expected: { readonly count: number; readonly dimensions: number }): readonly (readonly number[])[] {
  if (!Array.isArray(value) || value.length !== expected.count) {
    throw new LocalEmbeddingsError("invalid_result", "embedding output count differs from request");
  }
  return value.map((vector) => {
    if (!Array.isArray(vector) || vector.length !== expected.dimensions) {
      throw new LocalEmbeddingsError("invalid_result", "embedding output dimensions differ from manifest");
    }
    if (!vector.every((component) => typeof component === "number" && Number.isFinite(component))) {
      throw new LocalEmbeddingsError("invalid_result", "embedding output values must be finite numbers");
    }
    return [...vector];
  });
}

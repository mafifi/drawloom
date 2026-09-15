import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyEvaluationCandidate } from "./candidate-runtime.ts";

test("candidate runtime mismatch is checked after a valid model identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-candidate-identity-"));
  try {
    await mkdir(join(root, "bin"));
    await writeFile(join(root, "bin/llama-server"), "candidate executable");
    await writeFile(join(root, "Qwen3-Embedding-0.6B-Q8_0.gguf"), "candidate model");
    await assert.rejects(
      verifyEvaluationCandidate({
        build: root,
        expectedRuntimeSha256: "0".repeat(64),
        hashFile: async (path) =>
          path.endsWith(".gguf")
            ? "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439"
            : "1".repeat(64),
      }),
      /Runtime hash mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("candidate model mismatch is rejected independently", async () => {
  await assert.rejects(
    verifyEvaluationCandidate({
      build: "/unused",
      expectedRuntimeSha256: "0".repeat(64),
      hashFile: async () => "1".repeat(64),
    }),
    /Model hash mismatch/,
  );
});

/** Evaluation-only identity check for an uninstalled local qualification candidate. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { KnownModelManifests } from "@drawloom/local-embeddings";

async function sha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyEvaluationCandidate(options: {
  readonly build: string;
  readonly expectedRuntimeSha256: string;
  /** Deterministic evaluation-test seam; production reads and hashes each file. */
  readonly hashFile?: (path: string) => Promise<string>;
}) {
  if (!/^[a-f0-9]{64}$/.test(options.expectedRuntimeSha256))
    throw Error("Expected candidate runtime SHA-256 is invalid");
  const build = resolve(options.build);
  const manifest = KnownModelManifests["qwen3-embedding-0.6b-gguf"];
  const hashFile = options.hashFile ?? sha256;
  const modelSha256 = await hashFile(join(build, manifest.artifacts[0]!.path));
  if (modelSha256 !== manifest.artifacts[0]!.sha256) throw Error("Model hash mismatch");
  const runtimeSha256 = await hashFile(join(build, "bin", "llama-server"));
  if (runtimeSha256 !== options.expectedRuntimeSha256) throw Error("Runtime hash mismatch");
  return {
    manifest,
    directory: build,
    runtimeDirectory: build,
    runtimeSha256,
    modelSha256,
  };
}

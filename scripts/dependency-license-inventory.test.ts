import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  KnownLlamaRuntime,
  KnownModelManifests,
} from "../packages/knowledge/local-embeddings/src/manifest.js";

test("inventory routes supported external artifacts to separate release review", () => {
  const root = resolve(import.meta.dir, "..");
  const output = mkdtempSync(join(tmpdir(), "drawloom-license-inventory-"));
  try {
    execFileSync("bun", ["run", "scripts/dependency-license-inventory.ts", "--offline"], {
      cwd: root,
      env: { ...process.env, DRAWLOOM_LICENSE_INVENTORY_OUTPUT: output },
      stdio: "pipe",
    });
    const inventory = JSON.parse(readFileSync(join(output, "inventory.json"), "utf8"));

    expect(inventory.scope).toContain("Not an artifact SBOM or licence clearance");
    const temporalBridge = inventory.npm.find(
      (item: { name: string }) => item.name === "@temporalio/core-bridge",
    );
    expect(temporalBridge?.legalFiles).toContain(
      "node_modules/@temporalio/core-bridge/sdk-core/LICENSE.txt",
    );
    expect(inventory).not.toHaveProperty("python");
    expect(inventory.summary).not.toHaveProperty("python");
    expect(inventory.externalArtifacts).toEqual([
      {
        kind: "native-runtime",
        id: KnownLlamaRuntime.id,
        revision: KnownLlamaRuntime.revision,
        sha256: KnownLlamaRuntime.sha256,
        binarySha256: KnownLlamaRuntime.binarySha256,
        authority: "packages/knowledge/local-embeddings/src/manifest.ts#KnownLlamaRuntime",
        buildAuthority: "scripts/build-llama-runtime.sh",
        bundled: false,
        releaseReview: "required",
      },
      ...KnownModelManifests["qwen3-embedding-0.6b-gguf"].artifacts.map((artifact) => ({
        kind: "model",
        id: "qwen3-embedding-0.6b-gguf",
        revision: KnownModelManifests["qwen3-embedding-0.6b-gguf"].revision,
        path: artifact.path,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        authority: "packages/knowledge/local-embeddings/src/manifest.ts#KnownModelManifests",
        bundled: false,
        releaseReview: "required",
      })),
    ]);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

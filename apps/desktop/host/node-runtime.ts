/**
 * The Node runtime Drawloom ships inside the application bundle.
 *
 * ADR 0034 replaced a single compiled binary with an esbuild bundle executed by
 * a pinned Node. That runtime is a distributed native artifact, so it belongs in
 * the licence inventory exactly as the llama.cpp runtime does — the blind spot
 * recorded as audit finding F8, and the same class of omission that motivated
 * the migration in the first place.
 *
 * Packaging owns this declaration because packaging is what copies the bytes.
 * `KnownLlamaRuntime` in packages/knowledge/local-embeddings/src/manifest.ts is
 * the shape this mirrors.
 *
 * `binarySha256` is the UPSTREAM binary, before signing. Signing rewrites the
 * Mach-O, so the signed artifact has a different digest and is recorded
 * separately in the release evidence. Comparing a signed bundle against this
 * value will always fail; that is the point of keeping them distinct.
 */
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const NodeRuntimeArtifactSchema = z.strictObject({
  id: z.literal("node-darwin-arm64"),
  /** Exact `process.version` without the leading `v`; also the `engines.node` pin. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  platform: z.literal("darwin"),
  arch: z.literal("arm64"),
  bytes: z.number().int().positive(),
  /** Digest of the official prebuilt executable as installed, before signing. */
  binarySha256: Sha256Schema,
  /**
   * Node's aggregate LICENSE. SPDX for Node itself is MIT; the file also carries
   * the terms of everything Node bundles, which is why it must ship beside the
   * binary rather than be summarised. See LICENSES/node.md for the determination.
   */
  license: z.literal("MIT"),
  licenseBytes: z.number().int().positive(),
  licenseSha256: Sha256Schema,
});

export type NodeRuntimeArtifact = z.output<typeof NodeRuntimeArtifactSchema>;

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Values are taken from the official darwin-arm64 release build of this version.
 * `scripts/check-node-runtime.ts` re-derives them from the binary that packaging
 * actually copies, so a mismatch fails rather than being carried forward.
 */
export const KnownNodeRuntime: NodeRuntimeArtifact = immutable(
  NodeRuntimeArtifactSchema.parse({
    id: "node-darwin-arm64",
    version: "24.20.0",
    platform: "darwin",
    arch: "arm64",
    bytes: 121911744,
    binarySha256: "9d050fd455b56426e25d4d603c7c501cbb2630348e836cf221dcce748e90588a",
    license: "MIT",
    licenseBytes: 157609,
    licenseSha256: "5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace",
  }),
);

/** Filename the notice takes inside the bundle, beside the `node` it belongs to. */
export const NODE_LICENSE_FILENAME = "LICENSE.node";

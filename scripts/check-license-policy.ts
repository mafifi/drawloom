import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  KnownLlamaRuntime,
  KnownModelManifests,
} from "../packages/knowledge/local-embeddings/src/manifest.ts";
import { KnownNodeRuntime } from "../apps/desktop/host/node-runtime.ts";
import { assessLicense, isReviewedMpl, selectedLicense } from "./license-policy.ts";

const root = resolve(import.meta.dirname, "..");
// Exact-version decisions backed by the installed licence text; never name-wide
// exemptions. The proof is the sha256 of that text, matched against the legal
// files the inventory discovered for that exact version. Paths are deliberately
// not pinned: pnpm's store encodes peer-dependency hashes in directory names,
// so a recorded path would break on unrelated dependency changes while the
// licence text itself is unchanged.
const evidence: Record<string, { license: string; sha256: string }> = {
  "dompurify@3.4.15": {
    license: "Apache-2.0",
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
  "khroma@2.1.0": {
    license: "MIT",
    sha256: "66b333b0f66759a0b710459e03f7029abe17f4358114a128d2c972e642961b49",
  },
  "svelte-toolbelt@0.10.6": {
    license: "MIT",
    sha256: "8914f144af4333312a07b30438dc6b75dd8da7a665c3ae9fa751f229eb615e8b",
  },
  "unionfs@4.6.0": {
    license: "Unlicense",
    sha256: "6b0382b16279f26ff69014300541967a356a666eb0b91b422f6862f6b7dad17e",
  },
};
// Maintainer-approved MPL review; exact versions and retained upstream text.
// Source availability and release notice obligations are recorded in LICENSES/MPL-REVIEW.md.
const inventory = JSON.parse(
  readFileSync(
    resolve(root, "docs/reference/evidence/generated/dependency-licenses/inventory.json"),
    "utf8",
  ),
);
let blocked = 0;
for (const item of inventory.npm) {
  const key = `${item.name}@${item.version}`;
  let licence = item.license;
  if (Array.isArray(licence) && licence.length === 1 && typeof licence[0]?.type === "string")
    licence = licence[0].type;
  const proof = evidence[key];
  if (
    proof &&
    item.legalFiles.some(
      (path: string) =>
        createHash("sha256")
          .update(readFileSync(resolve(root, path)))
          .digest("hex") === proof.sha256,
    )
  )
    licence = proof.license;
  const mplReviewed = item.legalFiles.some((path: string) =>
    isReviewedMpl(
      key,
      createHash("sha256")
        .update(readFileSync(resolve(root, path)))
        .digest("hex"),
    ),
  );
  const result = assessLicense(licence, selectedLicense(key), mplReviewed);
  if (result.kind !== "allowed" && item.distribution.startsWith("runtime candidate")) {
    console.error(`${key}: ${result.kind}: ${result.reason}`);
    blocked++;
  }
}
for (const missing of inventory.unresolvedRuntime.filter(
  (entry: { optional: boolean }) => !entry.optional,
)) {
  console.error(`Unresolved runtime dependency: ${missing.from} -> ${missing.name}`);
  blocked++;
}
const supportedModel = KnownModelManifests["qwen3-embedding-0.6b-gguf"];
const expectedExternalArtifacts = [
  {
    kind: "native-runtime",
    id: KnownNodeRuntime.id,
    revision: KnownNodeRuntime.version,
    binarySha256: KnownNodeRuntime.binarySha256,
    license: KnownNodeRuntime.license,
    licenseSha256: KnownNodeRuntime.licenseSha256,
    authority: "apps/desktop/host/node-runtime.ts#KnownNodeRuntime",
    buildAuthority: "package.json#engines.node",
    bundled: true,
    releaseReview: "required",
  },
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
  ...supportedModel.artifacts.map((artifact) => ({
    kind: "model",
    id: supportedModel.id,
    revision: supportedModel.revision,
    path: artifact.path,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    authority: "packages/knowledge/local-embeddings/src/manifest.ts#KnownModelManifests",
    bundled: false,
    releaseReview: "required",
  })),
];
if (JSON.stringify(inventory.externalArtifacts) !== JSON.stringify(expectedExternalArtifacts)) {
  console.error("Supported external artifacts are not routed to separate release review");
  blocked++;
}
console.log(
  `Installed JavaScript product-candidate licence gate: ${blocked} blockers. Native artifacts, optional platforms and development-only terms require the separate release inventory review.`,
);
process.exitCode = blocked ? 1 : 0;

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessLicense, isReviewedMpl, selectedLicense } from "./license-policy.js";

const root = resolve(import.meta.dir, "..");
// Exact-version decisions backed by the installed licence text; never name-wide exemptions.
const evidence: Record<string, { license: string; path: string; sha256: string }> = {
  "svelte-toolbelt@0.10.6": { license: "MIT", path: "node_modules/svelte-toolbelt/LICENSE", sha256: "8914f144af4333312a07b30438dc6b75dd8da7a665c3ae9fa751f229eb615e8b" },
  "unionfs@4.6.0": { license: "Unlicense", path: "node_modules/unionfs/LICENSE", sha256: "6b0382b16279f26ff69014300541967a356a666eb0b91b422f6862f6b7dad17e" },
};
// Maintainer-approved MPL review; exact versions and retained upstream text.
// Source availability and release notice obligations are recorded in LICENSES/MPL-REVIEW.md.
const inventory = JSON.parse(readFileSync(resolve(root, "docs/reference/evidence/generated/dependency-licenses/inventory.json"), "utf8"));
let blocked = 0;
for (const item of inventory.npm) {
  const key = `${item.name}@${item.version}`;
  let licence = item.license;
  if (Array.isArray(licence) && licence.length === 1 && typeof licence[0]?.type === "string") licence = licence[0].type;
  const proof = evidence[key];
  if (proof && createHash("sha256").update(readFileSync(resolve(root, proof.path))).digest("hex") === proof.sha256) licence = proof.license;
  const mplReviewed = item.legalFiles.some((path: string) => isReviewedMpl(key,
    createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")));
  const result = assessLicense(licence, selectedLicense(key), mplReviewed);
  if (result.kind !== "allowed" && item.distribution.startsWith("runtime candidate")) {
    console.error(`${key}: ${result.kind}: ${result.reason}`); blocked++;
  }
}
for (const missing of inventory.unresolvedRuntime.filter((entry: { optional: boolean }) => !entry.optional)) {
  console.error(`Unresolved runtime dependency: ${missing.from} -> ${missing.name}`); blocked++;
}
if (inventory.python.length) { console.error("Legacy Python runtime still present; product licence review incomplete"); blocked++; }
console.log(`Installed JavaScript product-candidate licence gate: ${blocked} blockers. Native artifacts, optional platforms and development-only terms require the separate release inventory review.`);
process.exitCode = blocked ? 1 : 0;

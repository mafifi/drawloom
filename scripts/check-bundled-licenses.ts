/**
 * Licence gate for what is actually staged into the application bundle.
 *
 * `check:licenses` reads lockfile and package metadata, so it reasons about the
 * dependency GRAPH. It cannot see what survives `pnpm deploy` and the packaging
 * prune, and those are different sets. This walks the staged trees and assesses
 * the licence of every package whose files are present.
 *
 * WHY THIS EXISTS
 * ---------------
 * `@img/sharp-libvips-darwin-arm64` is LGPL-3.0-or-later, which ADR 0026
 * excludes from anything Drawloom distributes. It reaches the tree as a runtime
 * dependency, not only through build tooling: `@temporalio/worker` depends on
 * `webpack` to bundle workflows, webpack pulls `minimizer-webpack-plugin`, and
 * that pulls `sharp`. A `pnpm deploy --prod` of @drawloom/temporal-orchestration
 * therefore contains it.
 *
 * It does not reach the shipped bundle today — but only because
 * `prune-orchestration-sidecar-runtime.mjs` removes it as SIZE dead weight. That
 * script's removal list is a size list; nothing recorded a licence reason, so the
 * obligation was being met by accident. Editing the prune list for size reasons
 * would silently ship an LGPL library. This makes the requirement explicit and
 * enforced at the artifact, which is the only place it can be checked.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import {
  assessLicense,
  isReviewedMpl,
  retainedTextDetermination,
  selectedLicense,
} from "./license-policy.ts";

const root = resolve(import.meta.dirname, "..");
const staged = process.argv[2]
  ? [resolve(process.argv[2])]
  : ["host", "orchestration", "knowledge"].map((name) =>
      join(root, "apps/desktop/src-tauri/binaries", name),
    );

const present = staged.filter((directory) => existsSync(directory));
if (!present.length) {
  console.error(
    "No staged sidecar trees found. Run `pnpm --filter @drawloom/desktop run bundle:host` first.",
  );
  process.exit(2);
}

type Finding = { package: string; version: string; license: string; reason: string; at: string };
const blocked: Finding[] = [];
const review: Finding[] = [];
let inspected = 0;

/**
 * A package is "staged" only when its own directory carries real files. pnpm's
 * hoisted layout still leaves link farms and empty scaffolding, and counting
 * those would report packages that ship nothing.
 */
function licenseTextsOf(
  entries: readonly { name: string; isFile: () => boolean }[],
  manifestPath: string,
): string[] {
  return entries
    .filter((entry) => entry.isFile() && /^(LICEN[CS]E|COPYING)/i.test(entry.name))
    .map((entry) => join(manifestPath, "..", entry.name));
}

function manifestsUnder(directory: string): string[] {
  const found: string[] = [];
  const walk = (current: string, depth: number) => {
    if (depth > 12) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile() && entry.name === "package.json") found.push(path);
    }
  };
  walk(directory, 0);
  return found;
}

for (const directory of present) {
  for (const manifestPath of manifestsUnder(directory)) {
    let manifest: { name?: string; version?: string; license?: unknown; private?: boolean };
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    const name = manifest.name;
    if (!name || name.startsWith("@drawloom/") || manifest.private) continue;
    // Skip manifests that describe no shipped payload of their own.
    const own = readdirSync(join(manifestPath, ".."), { withFileTypes: true }).filter(
      (entry) => entry.name !== "package.json",
    );
    if (!own.length) continue;
    inspected++;
    const identity = `${name}@${manifest.version ?? "0.0.0"}`;
    let declared = manifest.license;
    if (typeof declared !== "string" || !declared.trim()) {
      // No metadata. Resolve from the retained upstream text if, and only if, an
      // exact determination exists for this version and this text.
      const texts = licenseTextsOf(own, manifestPath);
      for (const text of texts) {
        const resolved = retainedTextDetermination(
          identity,
          createHash("sha256").update(readFileSync(text)).digest("hex"),
        );
        if (resolved) {
          declared = resolved;
          break;
        }
      }
    }
    // MPL-2.0 is admitted only for exact reviewed versions carrying the exact
    // reviewed text, so the check needs the retained file, not just the name.
    const reviewedMpl = licenseTextsOf(own, manifestPath).some((text) =>
      isReviewedMpl(identity, createHash("sha256").update(readFileSync(text)).digest("hex")),
    );
    const assessment = assessLicense(declared, selectedLicense(identity), reviewedMpl);
    if (assessment.kind === "allowed") continue;
    const finding: Finding = {
      package: name,
      version: manifest.version ?? "unknown",
      license: typeof manifest.license === "string" ? manifest.license : "(none declared)",
      reason: assessment.reason,
      at: relative(root, manifestPath),
    };
    const bucket = assessment.kind === "blocked" ? blocked : review;
    if (
      !bucket.some((existing) => existing.package === name && existing.version === finding.version)
    )
      bucket.push(finding);
  }
}

const describe = (finding: Finding) =>
  `  ${finding.package}@${finding.version} — ${finding.license}\n    ${finding.reason}\n    ${finding.at}`;

if (review.length) {
  console.error(`Staged packages with unresolved licence evidence (${review.length}):`);
  for (const finding of review) console.error(describe(finding));
  console.error(
    "\nUnresolved is not waived. `check-license-policy.ts` blocks a runtime candidate whose\nassessment is not `allowed`, and these files are not candidates -- they are shipping.\nRecord a determination against the retained text, or remove the package.",
  );
}
if (blocked.length) {
  console.error(`\nExcluded licences present in the staged bundle (${blocked.length}):`);
  for (const finding of blocked) console.error(describe(finding));
  console.error(
    "\nADR 0026 excludes these from anything Drawloom distributes. Remove the package from the\nstaged tree deliberately, or record a reviewed determination; do not rely on a size prune.",
  );
}

console.log(
  `Staged bundle licence gate: inspected ${inspected} packages across ${present.length} tree(s); ${blocked.length} excluded, ${review.length} needing review.`,
);
// Both fail. An excluded licence is a policy breach; unresolved evidence is a
// question nobody answered, and shipping either is the same mistake.
process.exitCode = blocked.length || review.length ? 1 : 0;

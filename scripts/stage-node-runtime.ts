/**
 * Stage the Node runtime the application ships, and prove it is the one declared.
 *
 * Two manifests agreeing with each other establishes nothing about what is in
 * the bundle, so this reads the bytes it just copied: the version the executable
 * reports, its Mach-O architecture, its digest, and the notice beside it.
 *
 * The digest compared here is the UPSTREAM one. Signing rewrites the Mach-O, so
 * the signed artifact has a different digest; that belongs in the release
 * evidence, not here. Run this before signing.
 *
 * Node's LICENSE is an aggregate covering everything Node bundles. It sits beside
 * the binary in the install and is not copied by `copyFileSync` alone, which is
 * how it came to be missing from the bundle: a distribution obligation, not
 * bookkeeping.
 */
import { copyFileSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { KnownNodeRuntime, NODE_LICENSE_FILENAME } from "../apps/desktop/host/node-runtime.ts";

const target = process.argv[2];
if (!target) throw Error("Usage: node scripts/stage-node-runtime.ts <directory>");
const directory = resolve(target);

const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Node installs keep LICENSE at the prefix root, one level above `bin/`. */
const sourceBinary = process.execPath;
const sourceLicense = join(dirname(dirname(sourceBinary)), "LICENSE");

const problems: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  if (actual !== expected)
    problems.push(`${label}: found ${String(actual)}, expected ${String(expected)}`);
};

try {
  statSync(sourceLicense);
} catch {
  throw Error(
    `Node's LICENSE is not beside the runtime at ${sourceLicense}. Drawloom distributes this runtime, so its notice must ship with it.`,
  );
}

const stagedBinary = join(directory, "node");
const stagedLicense = join(directory, NODE_LICENSE_FILENAME);
copyFileSync(sourceBinary, stagedBinary);
copyFileSync(sourceLicense, stagedLicense);

// Everything below inspects the staged copies, never the source.
const reported = execFileSync(stagedBinary, ["--version"], { encoding: "utf8" }).trim();
check("version", reported, `v${KnownNodeRuntime.version}`);

const architecture = execFileSync(stagedBinary, ["-p", "process.arch"], {
  encoding: "utf8",
}).trim();
check("arch", architecture, KnownNodeRuntime.arch);

const machO = execFileSync("/usr/bin/file", ["-b", stagedBinary], { encoding: "utf8" }).trim();
if (!machO.includes(KnownNodeRuntime.arch))
  problems.push(`Mach-O architecture: ${machO} does not name ${KnownNodeRuntime.arch}`);

check("binary bytes", statSync(stagedBinary).size, KnownNodeRuntime.bytes);
check("binary sha256", digest(stagedBinary), KnownNodeRuntime.binarySha256);
check("licence bytes", statSync(stagedLicense).size, KnownNodeRuntime.licenseBytes);
check("licence sha256", digest(stagedLicense), KnownNodeRuntime.licenseSha256);

if (problems.length) {
  console.error(
    `Staged Node runtime does not match apps/desktop/host/node-runtime.ts#KnownNodeRuntime:\n- ${problems.join("\n- ")}`,
  );
  console.error(
    "Update the manifest deliberately if the runtime was intentionally changed; do not edit it to match an unexplained binary.",
  );
  process.exit(1);
}

console.log(
  `Staged Node ${KnownNodeRuntime.version} (${KnownNodeRuntime.arch}) and ${NODE_LICENSE_FILENAME} in ${target}; upstream digests match the manifest.`,
);

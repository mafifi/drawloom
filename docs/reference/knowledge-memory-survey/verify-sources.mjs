// Scoped research-artifact checks. No network, upstream execution or file writes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(directory, "sources.json"), "utf8"));
const visualReview = JSON.parse(readFileSync(resolve(directory, "visual-review.json"), "utf8"));
const repositories = new Map(
  manifest.repositories.map((entry) => [entry.url.toLowerCase(), entry]),
);
const failures = [];
const checked = new Set();
const blobs = new Map();
let localLinks = 0;
let diagrams = 0;

for (const file of readdirSync(directory).filter((name) => name.endsWith(".md"))) {
  const text = readFileSync(resolve(directory, file), "utf8");
  const links = text.matchAll(/https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/blob\/([a-f0-9]{40})\/([^\s)#]+)(?:#L(\d+)(?:-L(\d+))?)?/g);
  for (const match of links) {
    const [url, owner, name, revision, encodedPath, start, end] = match;
    if (checked.has(url)) continue;
    checked.add(url);
    const repository = repositories.get(`https://github.com/${owner}/${name}`.toLowerCase());
    if (!repository) {
      failures.push(`${file}: no registered checkout for ${url}`);
      continue;
    }
    const knownRevisions = [repository.revision, ...(repository.additionalRevisions ?? []).map((entry) => entry.revision)];
    if (!knownRevisions.includes(revision)) failures.push(`${file}: unrecorded revision ${revision}`);
    const path = decodeURIComponent(encodedPath);
    const key = `${repository.id}:${revision}:${path}`;
    try {
      if (!blobs.has(key)) {
        blobs.set(key, execFileSync("git", ["-C", repository.checkout, "show", `${revision}:${path}`], {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        }));
      }
      const lineCount = blobs.get(key).trimEnd().split("\n").length;
      if (start && (Number(start) < 1 || Number(end ?? start) < Number(start) || Number(end ?? start) > lineCount)) {
        failures.push(`${file}: invalid line range in ${url}; blob has ${lineCount} lines`);
      }
    } catch {
      failures.push(`${file}: missing source blob ${url}`);
    }
  }
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#)/i.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    localLinks += 1;
    if (!existsSync(resolve(directory, path))) failures.push(`${file}: missing local target ${target}`);
  }
}

for (const file of readdirSync(directory).filter((name) => name.endsWith(".delivery.json"))) {
  const stem = file.slice(0, -".delivery.json".length);
  const receipt = JSON.parse(readFileSync(resolve(directory, file), "utf8"));
  const browser = JSON.parse(readFileSync(resolve(directory, `${stem}.visual-check.json`), "utf8"));
  for (const [kind, suffix] of [["specification", ".architecture.json"], ["artifact", ".html"]]) {
    const bytes = readFileSync(resolve(directory, stem + suffix));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (receipt[kind]?.sha256 !== sha256 || receipt[kind]?.bytes !== bytes.length) failures.push(`${file}: stale ${kind} receipt`);
  }
  if (!receipt.ok || receipt.validation?.checksPassed !== 9 || receipt.validation?.errors !== 0 || receipt.validation?.warnings !== 0) failures.push(`${file}: no complete showcase pass`);
  if (!browser.ok || browser.status !== "pass" || browser.artifact.sha256 !== receipt.artifact.sha256) failures.push(`${file}: absent, failing or stale browser receipt`);
  const reviewed = visualReview.diagrams.find((entry) => entry.id === stem);
  if (reviewed?.visualReview !== "passed" || reviewed.artifact.sha256 !== receipt.artifact.sha256 || reviewed.artifact.bytes !== receipt.artifact.bytes) failures.push(`${file}: absent or stale perceptual-review binding`);
  diagrams += 1;
}

const result = {
  ok: failures.length === 0,
  pinnedSourceLinks: checked.size,
  uniqueSourceBlobs: blobs.size,
  localLinks,
  diagrams,
  failures,
  limitations: "Checks source existence, line bounds and artifact identity, not semantic accuracy, remote availability or upstream runtime behaviour.",
};
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (!result.ok) process.exitCode = 1;

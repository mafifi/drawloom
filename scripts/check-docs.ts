#!/usr/bin/env node
/**
 * Documentation structure and link check.
 *
 * Two jobs:
 *   1. Every architecture decision record uses the house format from
 *      `docs/adr/0000-template.md`, with a recognised status.
 *   2. Every relative Markdown link in the repository resolves, including its
 *      heading anchor.
 *
 * Prose style is not checked. Line lengths and bold lead-ins measure Markdown
 * source layout, not whether a reader understands the document, and URLs,
 * tables and short paragraphs distort them. Editorial quality stays with
 * review; see `CONTRIBUTING.md`.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, basename } from "node:path";
import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "*.md"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((file) => file && !file.includes("node_modules"));

/** Records, not guides. Their density is deliberate: it stops them overclaiming. */
const RECORD_PREFIXES = ["knowledge/", "docs/reference/evidence/surveys/", "spikes/", "LICENSES/"];

const ADR_SECTIONS = ["Context", "Decision", "Alternatives considered", "Evidence", "Consequences"];
const ADR_STATUSES = ["Proposed", "Accepted", "Deprecated", "Superseded"];

type Problem = { file: string; message: string };
const problems: Problem[] = [];
const fail = (file: string, message: string) => problems.push({ file, message });

/** GitHub-style heading slug, plus any explicit `<a id="...">` anchor. */
function anchorsOf(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/^#{1,6} +(.+?)\s*$/gm)) {
    found.add(
      (match[1] ?? "")
        .replace(/`/g, "")
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-"),
    );
  }
  for (const match of text.matchAll(/<a\s+id="([^"]+)"/g)) {
    if (match[1]) found.add(match[1]);
  }
  return found;
}

const source = new Map<string, string>();
const anchors = new Map<string, Set<string>>();
for (const file of tracked) {
  const text = readFileSync(file, "utf8");
  source.set(file, text);
  anchors.set(file, anchorsOf(text));
}

// ---------------------------------------------------------------- ADR format
for (const file of tracked) {
  if (!/^docs\/adr\/\d{4}-/.test(file)) continue;
  const text = source.get(file)!;
  const isTemplate = basename(file).startsWith("0000-");

  const status = text.match(/^- \*\*Status:\*\* *(.+)$/m);
  if (!status) {
    fail(file, "missing `- **Status:** <status>` (bold, on its own line)");
  } else {
    const value = (status[1] ?? "").split(/[;,]/)[0]?.trim() ?? "";
    if (!ADR_STATUSES.includes(value)) {
      fail(file, `status "${value}" is not one of ${ADR_STATUSES.join(", ")}`);
    }
  }
  if (!/^- \*\*Date:\*\* */m.test(text)) fail(file, "missing `- **Date:**`");

  if (isTemplate) continue;
  const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => (m[1] ?? "").trim());
  const missing = ADR_SECTIONS.filter((s) => !headings.includes(s));
  if (missing.length) fail(file, `missing section(s): ${missing.join(", ")}`);

  const ordered = headings.filter((h) => ADR_SECTIONS.includes(h));
  const expected = ADR_SECTIONS.filter((s) => ordered.includes(s));
  if (ordered.join(">") !== expected.join(">")) {
    fail(file, `sections out of order: ${ordered.join(" > ")}`);
  }
}

// --------------------------------------------------------------------- links
const EXTERNAL = /^(https?:|mailto:|tel:|#!)/;
for (const file of tracked) {
  // Fenced code and inline code hold examples, not real links.
  const prose = source
    .get(file)!
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, "")
    .replace(/`[^`\n]*`/g, "");

  for (const match of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (!target || EXTERNAL.test(target)) continue;
    if (target.startsWith("/")) {
      fail(file, `absolute link "${target}" — use a relative path`);
      continue;
    }
    const [path, anchor] = target.split("#");
    const resolved = path
      ? relative(process.cwd(), resolve(dirname(file), decodeURIComponent(path)))
      : file;

    if (path && !existsSync(resolved)) {
      // Generated output is ignored by Git and absent in a fresh checkout.
      if (resolved.startsWith("docs/reference/evidence/generated/")) continue;
      fail(file, `broken link "${target}"`);
      continue;
    }
    if (!anchor) continue;
    if (path && !resolved.endsWith(".md")) continue;
    if (path && statSync(resolved).isDirectory()) continue;

    const known = anchors.get(resolved);
    if (known && !known.has(anchor)) {
      fail(file, `broken anchor "${target}"`);
    }
  }
}

// -------------------------------------------------------------------- report
const records = tracked.filter((f) => RECORD_PREFIXES.some((p) => f.startsWith(p))).length;

if (problems.length) {
  for (const { file, message } of problems) console.error(`${file}: ${message}`);
  console.error(`\nDocumentation check: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(
  `Documentation check: OK (${tracked.length} files, ${records} retained records, ` +
    `${tracked.filter((f) => /^docs\/adr\/\d{4}-/.test(f)).length} decision records)`,
);

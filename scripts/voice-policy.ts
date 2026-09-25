import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The machine-sounding habits WRITING.md asks us to avoid. Each rule is
 * deliberately narrow: a check that cries wolf trains people to ignore it.
 */
export interface VoiceRule {
  id: string;
  pattern: RegExp;
  advice: string;
  /** Only applies to website and marketing pages. */
  marketingOnly?: boolean;
}

export const voiceRules: readonly VoiceRule[] = [
  {
    id: "honesty",
    pattern:
      /\b(to be honest|in all honesty|honestly|is honest about|say(?:s)? so plainly|plainly)\b/i,
    advice: "Don't talk about honesty or plainness. Just say the thing.",
  },
  {
    id: "commentary",
    pattern:
      /\b(it(?:'|’)?s worth noting|it is worth noting|worth noting that|that is the point|in the other direction|the edge of what|this (?:page|section|document) (?:marks|is where))\b/i,
    advice: "Cut commentary about the writing itself.",
  },
  {
    id: "not-x-but-y",
    pattern: /\bnot (?:just |only |merely |simply )?[^.;:!?\n]{1,40}, but\b/i,
    advice: 'Say what it is. "Not X, but Y" by reflex reads as machine-made.',
  },
  {
    id: "caveat",
    pattern:
      /\b((?:does|do)(?: not|n(?:'|’)t) prove|proves? neither|is not (?:proof|evidence)|not a claim that|tests read are not tests run)\b/i,
    advice: "Keep caveats for records whose job is limits.",
  },
  {
    id: "inflated",
    pattern:
      /\b(delv(?:e|es|ed|ing)|leverag(?:e|es|ed|ing)|seamless(?:ly)?|robust(?:ly|ness)?|unlock(?:s|ed|ing)?|empower(?:s|ed|ing|ment)?|cutting-edge|game-?changer|testament to|tapestry|ever-evolving|crucially|furthermore|moreover)\b/i,
    advice: "Use an everyday word instead.",
  },
  {
    id: "internal-label",
    pattern: /\b(ADR[ -]?\d{4}|synaptic shuttle)\b/i,
    advice: "Record numbers and code names don't belong on the website.",
    marketingOnly: true,
  },
];

export type Severity = "error" | "warning";
export interface VoiceIssue {
  path: string;
  line: number;
  rule: string;
  severity: Severity;
  text: string;
  advice: string;
}

/** Files that quote the habits on purpose. */
const exempt = new Set(["WRITING.md", ".agents/skills/plain-writing/SKILL.md"]);

/** Website and marketing pages: every rule applies, and hits are errors. */
export function isMarketing(path: string) {
  return (
    /^publishing\/explore\/[^/]+\/page\.md$/.test(path) ||
    /^publishing\/site\/src\/(pages|components)\/.+\.(astro|svelte|ts)$/.test(path)
  );
}

/** Reader-facing but not marketing: the README and published essays. */
export function isPublic(path: string) {
  return isMarketing(path) || path === "README.md" || /^publishing\/[^/]+\/article\.md$/.test(path);
}

/** Reduce a line to the prose a reader sees. */
export function prose(line: string, path: string) {
  if (/\.(astro|svelte|ts)$/.test(path)) {
    // Only quoted copy that reads like a sentence, not code.
    return [...line.matchAll(/(['"`])((?:(?!\1).){12,})\1/g)]
      .map((match) => match[2]!)
      .filter((text) => /\s/.test(text) && !/[{}<>=]|\/\//.test(text))
      .join(" ");
  }
  return line
    .replace(/`[^`]*`/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ");
}

export function scanText(path: string, text: string): VoiceIssue[] {
  if (exempt.has(path)) return [];
  const marketing = isMarketing(path);
  const severity: Severity = isPublic(path) ? "error" : "warning";
  const issues: VoiceIssue[] = [];
  let fenced = false;
  let frontMatter = path.endsWith(".md") && text.startsWith("---");
  text.split("\n").forEach((raw, index) => {
    if (frontMatter) {
      if (index > 0 && raw.trim() === "---") frontMatter = false;
      return;
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const line = prose(raw, path);
    for (const rule of voiceRules) {
      if (rule.marketingOnly && !marketing) continue;
      const match = line.match(rule.pattern);
      if (match)
        issues.push({
          path,
          line: index + 1,
          rule: rule.id,
          severity,
          text: match[0],
          advice: rule.advice,
        });
    }
  });
  return issues;
}

export function trackedProse(root: string) {
  return execFileSync("git", ["ls-files", "-z", "--", "*.md", "publishing/site/src"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => path && (path.endsWith(".md") || /\.(astro|svelte|ts)$/.test(path)))
    .filter((path) => !path.includes("node_modules/"));
}

export function scanVoice(root: string) {
  const files = trackedProse(root);
  const issues = files.flatMap((path) => scanText(path, readFileSync(join(root, path), "utf8")));
  return { files: files.length, issues };
}

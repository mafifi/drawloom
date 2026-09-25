import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
  /** Only applies to the website and journal. */
  publishingOnly?: boolean;
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
      /\b((?:does|do)(?: not|n(?:'|’)t) (?:prove|demonstrate)|proves? neither|is not (?:proof|evidence)|not a claim that|tests read are not tests run)\b/i,
    advice: "Keep caveats for records whose job is limits.",
  },
  {
    id: "inflated",
    pattern:
      /\b(delv(?:e|es|ed|ing)|leverag(?:e|es|ed|ing)|seamless(?:ly)?|robust(?:ly|ness)?|unlock(?:s|ed|ing)?|empower(?:s|ed|ing|ment)?|cutting-edge|game-?changer|testament to|tapestry|ever-evolving|crucially|furthermore|moreover)\b/i,
    advice: "Use an everyday word instead.",
  },
  {
    id: "contrast",
    pattern: /(?:[,;]\s+|—\s*)not\s+(?!(?:yet|only|least)\b)|\bnot (?:just|merely|simply)\b/i,
    advice: 'Say what it is. A trailing ", not X" or "not just X" reads as machine-made.',
  },
  {
    id: "hedge",
    pattern:
      /\b(genuinely|deliberately|candid(?:ly)?|arguably|essentially|fundamentally|a little terminology|in the same spirit)\b/i,
    advice: "Cut the hedge and say it directly.",
  },
  {
    id: "untested",
    pattern:
      /\b(untested|not yet (?:been )?(?:tested|run|checked|proven|measured|tried)|not (?:a )?(?:measured|tested) \w+|not\b[^.!?]{0,40}\b(?:tested|proven|measured)|my (?:rough )?estimate|the record (?:says|states|is)|stated limits)\b/i,
    advice: "State an estimate once, simply. Leave test status to the records.",
  },
  {
    id: "explicitly",
    pattern: /\bexplicitly\b/i,
    advice: "Cut the hedge and say it directly.",
    publishingOnly: true,
  },
  {
    id: "internal-label",
    pattern: /\b(ADR[ -]?\d{4}|synaptic shuttle)\b/i,
    advice: "Record numbers and code names don't belong on the website.",
    marketingOnly: true,
  },
  {
    id: "record-talk",
    pattern: /\b(claims?|evidence records?|decision records?|conformance|verified|provenance)\b/i,
    advice: "Say what it means for the reader, not how it was recorded or proven.",
    publishingOnly: true,
  },
  {
    id: "punctuation",
    pattern: /—|;/,
    advice: "Use a full stop or a comma. Em dashes and semicolons read as machine-made.",
    publishingOnly: true,
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
const exempt = new Set(["WRITING.md"]);

/** Website and marketing pages: every rule applies, and hits are errors. */
export function isMarketing(path: string) {
  return (
    /^publishing\/explore\/[^/]+\/page\.md$/.test(path) ||
    /^publishing\/site\/src\/(pages|components)\/.+\.(astro|svelte|ts)$/.test(path)
  );
}

/** Reader-facing but not marketing: the README and published essays. */
export function isPublic(path: string) {
  return (
    isMarketing(path) ||
    path === "README.md" ||
    /^publishing\/[^/]+\/(article|transcript)\.md$/.test(path)
  );
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
  // Image descriptions and labels are prose too, even inside tags.
  const described = [...line.matchAll(/\b(?:alt|aria-label)="([^"]*)"/g)].map((match) => match[1]);
  return [
    line
      .replace(/`[^`]*`/g, " ")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/<[^>]+>/g, " "),
    ...described,
  ].join(" ");
}

export function scanText(
  path: string,
  text: string,
  options: { draft?: boolean } = {},
): VoiceIssue[] {
  if (exempt.has(path)) return [];
  const marketing = isMarketing(path);
  const publishing = isPublic(path) && path !== "README.md";
  // Unpublished drafts warn until they are published.
  // A file without front matter, such as a transcript, is published with its piece.
  const metadata =
    path.endsWith(".md") && text.startsWith("---") ? text.split(/^---$/m)[1] : undefined;
  const draft = options.draft ?? (metadata !== undefined && !/^draft: false$/m.test(metadata));
  const severity: Severity =
    publishing && !(draft && path.startsWith("publishing/")) ? "error" : "warning";
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
      if (rule.publishingOnly && !publishing) continue;
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
  if (publishing && path.endsWith(".md")) issues.push(...longSentences(path, text, severity));
  return issues;
}

/** Sentences over this many words are hard to read on the website. */
export const longestSentence = 30;

function longSentences(path: string, text: string, severity: Severity): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  let fenced = false;
  let frontMatter = path.endsWith(".md") && text.startsWith("---");
  let paragraph: { start: number; words: string[] } | undefined;
  const flush = () => {
    if (!paragraph) return;
    for (const sentence of paragraph.words.join(" ").split(/(?<=[.!?])\s+/)) {
      const count = sentence.split(/\s+/).filter((word) => /\w/.test(word)).length;
      if (count > longestSentence)
        issues.push({
          path,
          line: paragraph.start,
          rule: "long-sentence",
          severity,
          text: `${sentence.split(/\s+/).slice(0, 8).join(" ")}… (${count} words)`,
          advice: `Split sentences over ${longestSentence} words.`,
        });
    }
    paragraph = undefined;
  };
  text.split("\n").forEach((raw, index) => {
    if (frontMatter) {
      if (index > 0 && raw.trim() === "---") frontMatter = false;
      return;
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      flush();
      return;
    }
    const line = fenced ? "" : prose(raw, path).trim();
    const block = /^(#|>|\||<)/.test(raw.trim()) || /^([-*]|\d+\.)\s/.test(raw.trim());
    if (!line || block) flush();
    if (!line) return;
    paragraph ??= { start: index + 1, words: [] };
    paragraph.words.push(line.replace(/^([-*]|\d+\.)\s+/, ""));
  });
  flush();
  return issues;
}

/**
 * Publishing documents (the website and journal) fail on any habit. Developer
 * documents (READMEs, ARCHITECTURE.md, CONTRIBUTING.md and developer guides)
 * warn. Agent documents (AGENTS.md files, plans, records, evidence, research,
 * skills) are the agents' own working space and are not checked.
 */
export function isChecked(path: string) {
  if (isPublic(path)) return true;
  if (["ARCHITECTURE.md", "CONTRIBUTING.md", "SECURITY.md"].includes(path)) return true;
  if (/^docs\/reference\/[^/]+\.md$/.test(path))
    return !/evidence|readiness|^docs\/reference\/adr-/.test(path);
  // READMEs, except in research, records and licence folders.
  if (/(^|\/)README\.md$/.test(path))
    return !/^(docs|knowledge|spikes|LICENSES|\.agents)\/|^publishing\/(site\/public|[^/]+\/assets)\//.test(
      path,
    );
  return /^publishing\/[^/]+\/transcript\.md$/.test(path);
}

export function trackedProse(root: string) {
  return execFileSync("git", ["ls-files", "-z", "--", "*.md", "publishing/site/src"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => path && (path.endsWith(".md") || /\.(astro|svelte|ts)$/.test(path)))
    .filter((path) => !path.includes("node_modules/") && isChecked(path));
}

export function scanVoice(root: string) {
  const files = trackedProse(root);
  const issues = files.flatMap((path) => {
    // A transcript is published or drafted with its article.
    const article = path.replace(/transcript\.md$/, "article.md");
    const draft =
      article !== path && existsSync(join(root, article))
        ? !/^draft: false$/m.test(
            readFileSync(join(root, article), "utf8").split(/^---$/m)[1] ?? "",
          )
        : undefined;
    return scanText(
      path,
      readFileSync(join(root, path), "utf8"),
      draft === undefined ? {} : { draft },
    );
  });
  return { files: files.length, issues };
}

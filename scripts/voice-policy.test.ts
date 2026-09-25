import { expect, test } from "vitest";
import { isChecked, scanText } from "./voice-policy.ts";

const rules = (path: string, text: string) => scanText(path, text).map(({ rule }) => rule);

test("catches each habit WRITING.md asks us to avoid", () => {
  const page = "publishing/explore/questions/page.md";
  expect(rules(page, "Our release record is honest about its limits.")).toEqual(["honesty"]);
  expect(rules(page, "We say so plainly.")).toEqual(["honesty"]);
  expect(rules(page, "It's worth noting that Drawloom is early.")).toEqual(["commentary"]);
  expect(rules(page, "It is not a chat tool, but a workbench.")).toEqual(["not-x-but-y"]);
  expect(rules(page, "The design does not prove compliance.")).toEqual(["caveat"]);
  expect(rules(page, "A seamless way to leverage agents.")).toEqual(["inflated"]);
  expect(rules(page, "See ADR 0023 for details.")).toEqual(["internal-label"]);
});

test("plain writing passes", () => {
  const page = "publishing/explore/decisions/page.md";
  expect(rules(page, "Codex is the first agent Drawloom works with.")).toEqual([]);
  expect(rules(page, "Nothing happens without your say.")).toEqual([]);
  expect(rules(page, "Use it on its own, or with your own parts.")).toEqual([]);
});

test("code, links and front matter are not prose", () => {
  const page = "publishing/explore/principles/page.md";
  expect(rules(page, "---\nsummary: honestly a test\n---\nPlain words.")).toEqual([]);
  expect(rules(page, "Run `robust --seamless` first.")).toEqual([]);
  expect(rules(page, "[Read it](https://example.com/honestly-robust)")).toEqual([]);
  expect(rules(page, "```\nhonestly robust\n```\nPlain words.")).toEqual([]);
});

test("the website and journal fail; developer documents warn", () => {
  const line = "Honestly, it's robust.";
  const published = `---\ndraft: false\n---\n${line}`;
  expect(scanText("publishing/a-place-to-do-the-work/article.md", published)[0]?.severity).toBe(
    "error",
  );
  expect(scanText("README.md", line)[0]?.severity).toBe("warning");
  expect(scanText("apps/desktop/README.md", line)[0]?.severity).toBe("warning");
});

test("record numbers are fine outside the website", () => {
  expect(rules("apps/desktop/README.md", "See ADR 0026.")).toEqual([]);
  expect(rules("README.md", "See ADR 0026.")).toEqual([]);
});

test("site source checks quoted copy, not code", () => {
  const astro = "publishing/site/src/pages/index.astro";
  expect(rules(astro, "  body: 'A seamless way to build workbenches.',")).toEqual(["inflated"]);
  expect(rules(astro, "  const robust = parse(value);")).toEqual([]);
});

test("the writing guide may quote the habits", () => {
  expect(rules("WRITING.md", "Honestly, delve into robust tapestry.")).toEqual([]);
});

test("publishing and developer documents are checked; agent documents are not", () => {
  for (const path of [
    "README.md",
    "ARCHITECTURE.md",
    "CONTRIBUTING.md",
    "docs/reference/plugin-packages.md",
    "packages/ui/ui/README.md",
    "apps/desktop/README.md",
    "publishing/explore/decisions/page.md",
    "publishing/a-place-to-do-the-work/article.md",
  ])
    expect(isChecked(path), path).toBe(true);
  for (const path of [
    "AGENTS.md",
    "docs/plans/pre-publication-audit.md",
    "docs/reference/harness-workbench-survey/README.md",
    "spikes/adr-0022-memory/README.md",
    "docs/adr/0034-node-toolchain.md",
    "knowledge/evidence/adr-0034-notarised-release.md",
    "docs/reference/conversation-history-evidence.md",
    "docs/design/desktop-host.md",
    "spikes/AGENTS.md",
    ".agents/skills/plain-writing/SKILL.md",
    "DESIGN.md",
  ])
    expect(isChecked(path), path).toBe(false);
});

// Real sentences from drafts we rewrote. If the check stops catching these, it
// has gone blind again, however clean the site looks.
test("catches the habits in drafts we actually rewrote", () => {
  const essay = "publishing/a-place-to-do-the-work/article.md";
  const published = (text: string) => `---\ndraft: false\n---\n${text}`;
  for (const [sentence, rule] of [
    [
      "She is at her best as a medical professional, not a salesperson, clinic manager or financial controller.",
      "contrast",
    ],
    ["That is my estimate, not a measured comparison with a finished alternative.", "untested"],
    [
      "The improvement was the stack and the harness around development—not the stack alone.",
      "contrast",
    ],
    ["It was not just Souphi's software.", "contrast"],
    ["It is not an alternative I have already tested.", "untested"],
    ["Providers are allowed to differ honestly; Drawloom does not pretend otherwise.", "honesty"],
    ["We deliberately built extra implementations to prove each interface.", "hedge"],
    ["The decision record states the trade-off openly.", "record-talk"],
  ] as const)
    expect(rules(essay, published(sentence)), sentence).toContain(rule);
});

test("long sentences fail on the website", () => {
  const page = "publishing/explore/research/page.md";
  const long = `${Array.from({ length: 35 }, () => "word").join(" ")}.`;
  expect(rules(page, `---\ndraft: false\n---\n${long}`)).toContain("long-sentence");
  expect(rules(page, "---\ndraft: false\n---\nA short, clear sentence.")).toEqual([]);
});

test("unpublished drafts warn instead of failing", () => {
  const draft = "---\ndraft: true\n---\nIt was not just a draft.";
  expect(scanText("publishing/draft-fixture/article.md", draft)[0]?.severity).toBe("warning");
});

test("transcripts and image descriptions are published prose", () => {
  const transcript = "publishing/a-place-to-do-the-work/transcript.md";
  expect(
    scanText(
      transcript,
      "It shows the order for reading the programme, not every technical dependency.",
    ),
  ).toEqual([expect.objectContaining({ rule: "contrast", severity: "error" })]);
  const essay = "publishing/a-place-to-do-the-work/article.md";
  const figure =
    '---\ndraft: false\n---\n<img src="a.png" alt="The dashboard, not the clinic\'s real performance." />';
  expect(rules(essay, figure)).toContain("contrast");
});

test("a transcript follows its article's draft status", () => {
  const transcript = "publishing/draft-fixture/transcript.md";
  expect(scanText(transcript, "It is not just a draft.", { draft: true })[0]?.severity).toBe(
    "warning",
  );
  expect(
    rules(
      "publishing/a-place-to-do-the-work/transcript.md",
      "They do not demonstrate a finished workbench.",
    ),
  ).toContain("caveat");
});

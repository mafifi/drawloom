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

test("reader-facing pages fail; everything else only warns", () => {
  const line = "Honestly, it's robust.";
  expect(scanText("README.md", line).every(({ severity }) => severity === "error")).toBe(true);
  expect(scanText("publishing/a-place-to-do-the-work/article.md", line)[0]?.severity).toBe("error");
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

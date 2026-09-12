import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const skillPath = resolve(
  root,
  ".agents/skills/microinteraction-design/SKILL.md",
);
const casesPath = resolve(
  root,
  ".agents/skills/microinteraction-design/evals/trigger-cases.json",
);
const cataloguePath = resolve(
  root,
  ".agents/skills/microinteraction-design/references/pattern-catalogue.md",
);

type TriggerCase = {
  id: string;
  prompt: string;
  expected: "trigger" | "skip";
  requiredBehaviors: string[];
};

type TriggerEvaluation = {
  schemaVersion: 1;
  skill: "microinteraction-design";
  cases: TriggerCase[];
};

const read = (path: string): string => readFileSync(path, "utf8");

describe("microinteraction design skill discovery", () => {
  test("routes interactive design work through the repository skill", () => {
    const agentGuide = read(resolve(root, "AGENTS.md"));

    expect(agentGuide).toContain(
      ".agents/skills/microinteraction-design/SKILL.md",
    );
    expect(agentGuide).toMatch(
      /before (?:designing|changing)[\s\S]{0,240}interactive[\s\S]{0,240}use/i,
    );
  });

  test("publishes a discriminating implicit trigger description", () => {
    expect(existsSync(skillPath)).toBe(true);
    const skill = read(skillPath);
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

    expect(frontmatter).toContain("name: microinteraction-design");
    expect(frontmatter).toMatch(/description:\s*>?-?\s*\n?\s*Use when/i);
    expect(frontmatter).toMatch(
      /interaction states|feedback|motion|animation|transition/i,
    );
    expect(frontmatter).toMatch(/design|refin|audit/i);
  });

  test("keeps positive and negative forward-evaluation cases", () => {
    expect(existsSync(casesPath)).toBe(true);
    const evaluation = JSON.parse(read(casesPath)) as TriggerEvaluation;

    expect(evaluation.schemaVersion).toBe(1);
    expect(evaluation.skill).toBe("microinteraction-design");

    const positives = evaluation.cases.filter(
      ({ expected }) => expected === "trigger",
    );
    const negatives = evaluation.cases.filter(
      ({ expected }) => expected === "skip",
    );

    expect(positives.length).toBeGreaterThanOrEqual(6);
    expect(negatives.length).toBeGreaterThanOrEqual(4);
    expect(new Set(evaluation.cases.map(({ id }) => id)).size).toBe(
      evaluation.cases.length,
    );

    for (const scenario of positives) {
      expect(scenario.requiredBehaviors).toContain("select-skill");
      expect(scenario.requiredBehaviors).toContain("interaction-brief");
    }
    for (const scenario of negatives) {
      expect(scenario.requiredBehaviors).not.toContain("select-skill");
    }
  });

  test("keeps the pattern catalogue discoverable and retrieval-tested", () => {
    expect(existsSync(cataloguePath)).toBe(true);
    expect(read(skillPath)).toContain("references/pattern-catalogue.md");

    const evaluation = JSON.parse(read(casesPath)) as TriggerEvaluation;
    const retrievalCases = evaluation.cases.filter(({ requiredBehaviors }) =>
      requiredBehaviors.includes("pattern-selection"),
    );

    expect(retrievalCases.length).toBeGreaterThanOrEqual(3);
    for (const scenario of retrievalCases) {
      expect(scenario.expected).toBe("trigger");
      expect(scenario.requiredBehaviors).toContain("pattern-limits");
      expect(scenario.requiredBehaviors).toContain("pattern-restraint");
    }
  });
});

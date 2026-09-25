import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanVoice } from "./voice-policy.ts";

// Errors: the website and journal break the publishing voice in WRITING.md.
// Warnings: developer documents. `--report` lists them, grouped by area.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { files, issues } = scanVoice(root);
const errors = issues.filter(({ severity }) => severity === "error");
const warnings = issues.filter(({ severity }) => severity === "warning");

for (const issue of errors)
  console.error(`${issue.path}:${issue.line}: "${issue.text}". ${issue.advice}`);

if (process.argv.includes("--report")) {
  const area = (path: string) => {
    const parts = path.split("/");
    return parts.length === 1 ? "(root)" : parts.slice(0, parts[0] === "docs" ? 2 : 1).join("/");
  };
  const byArea = new Map<string, Map<string, number>>();
  for (const { path, rule } of warnings) {
    const rules = byArea.get(area(path)) ?? new Map<string, number>();
    rules.set(rule, (rules.get(rule) ?? 0) + 1);
    byArea.set(area(path), rules);
  }
  const rows = [...byArea].sort(
    ([, a], [, b]) =>
      [...b.values()].reduce((x, y) => x + y) - [...a.values()].reduce((x, y) => x + y),
  );
  for (const [name, rules] of rows)
    console.log(
      `${name}: ${[...rules.values()].reduce((x, y) => x + y)} (${[...rules]
        .map(([rule, count]) => `${rule} ${count}`)
        .join(", ")})`,
    );
}

if (errors.length > 0) process.exitCode = 1;
else
  console.log(
    `Voice: OK (${files} files; ${warnings.length} warnings in developer documents${
      process.argv.includes("--report") ? "" : ", run with --report to list them"
    })`,
  );

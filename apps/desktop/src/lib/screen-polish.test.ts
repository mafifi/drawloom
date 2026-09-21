import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
test("project entry groups folder input and chooser, with a bounded form and footer", () => {
  const view = source("Projects.svelte");
  expect(view).toContain("project-entry");
  expect(view).toContain("folder-input-row");
  expect(view).toContain("form-footer");
  expect(view).not.toContain("vm: DesktopViewModel");
});
test("knowledge does not reserve an empty results grid before searching", () => {
  expect(source("KnowledgeView.svelte")).toContain(
    "{#if p.searched || p.searchPending || p.selected}",
  );
});
test("workbench settings use bound conversation context without internal summaries", () => {
  const view = source("PrimaryView.svelte");
  expect(view).toContain("vm.conversation?.workbenchId");
  expect(view).not.toContain("Workbench configuration");
  expect(view).not.toContain("{vm.state?.operator.summary}");
});

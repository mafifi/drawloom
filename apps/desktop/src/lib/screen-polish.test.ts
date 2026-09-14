import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
const source = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');
test('project entry groups folder input and chooser, with a bounded form and footer', () => {
  const view = source('Projects.svelte');
  expect(view).toContain('project-entry');
  expect(view).toContain('folder-input-row');
  expect(view).toContain('form-footer');
  expect(view).not.toContain('vm: DesktopViewModel');
});
test('main screens share a scroll container while settings have explicit sections', () => {
  const view = source('PrimaryView.svelte');
  expect(view).toContain('primary-view-scroll');
  expect(view.match(/class="settings-section"/g)?.length).toBeGreaterThanOrEqual(4);
});
test('knowledge does not reserve an empty results grid before searching', () => {
  expect(source('KnowledgeView.svelte')).toContain('{#if p.searched || p.searchPending || p.selected}');
});
test('workbench settings use bound conversation context and compact labelled rows', () => {
  const view = source('PrimaryView.svelte');
  expect(view).toContain('workbench-setting-row');
  expect(view).toContain('workbench-setting-controls');
  expect(view).toContain('vm.conversation?.workbenchId');
  expect(view).not.toContain('Workbench configuration');
  expect(view).not.toContain('{vm.state?.operator.summary}');
});

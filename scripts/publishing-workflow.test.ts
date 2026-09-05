import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';

test('journal deployment is path-filtered on main and builds only production output', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publishing.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('push:\n    branches: [main]\n    paths:');
  for (const path of ['publishing/**', 'scripts/build-journal.ts', 'package.json', 'bun.lock', '.github/workflows/publishing.yml']) {
    expect(workflow).toContain(`- '${path}'`);
  }
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  expect(workflow).toContain('bun run check:ci');
  expect(workflow).toContain('bun run journal:render:article');
  expect(workflow).toContain('bun run journal:build');
  expect(workflow).toContain('path: publishing/site/dist');
  expect(workflow).not.toMatch(/--drafts|journal:preview|JOURNAL_DRAFTS/);
});

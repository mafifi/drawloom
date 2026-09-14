import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('publication is callable only after the same-commit CI dependency succeeds', () => {
  const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const publication = parse(readFileSync('.github/workflows/publishing.yml', 'utf8'));
  expect(Object.keys(publication.on)).toEqual(['workflow_call']);
  expect(ci.jobs.publish.needs).toBe('check');
  expect(ci.jobs.publish.uses).toBe('./.github/workflows/publishing.yml');
  expect(ci.jobs.publish.if).toContain("github.ref == 'refs/heads/main'");
  expect(ci.jobs.publish.if).toContain("needs.check.outputs.publish == 'true'");
  expect(ci.jobs.check.outputs.publish).toBe('${{ steps.publication.outputs.publish }}');
  const ciRuns = ci.jobs.check.steps.map((step: {run?: string}) => step.run).filter(Boolean);
  expect(ciRuns.filter((run: string) => run === 'bun run check:ci')).toHaveLength(1);
  const publishRuns = publication.jobs.build.steps.map((step: {run?: string}) => step.run).filter(Boolean);
  expect(publishRuns).not.toContain('bun run check:ci');
  expect(publishRuns).toContain('bun run journal:render:article');
  expect(publishRuns).toContain('bun run journal:build');
  expect(publication.jobs.deploy.needs).toBe('build');
  expect(publication.jobs.build.steps.find((step: {uses?: string}) => step.uses?.startsWith('actions/upload-pages-artifact')).with.path).toBe('publishing/site/dist');
});

test('moving published content out of scope still selects publication to remove the old page', () => {
  const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  const scope = ci.jobs.check.steps.find((step: {id?: string}) => step.id === 'publication').run;
  const root = mkdtempSync(join(tmpdir(), 'drawloom-publishing-scope-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    git('init', '-q');
    mkdirSync(join(root, 'publishing'));
    mkdirSync(join(root, 'docs'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/publishing-scope.ts'), readFileSync('scripts/publishing-scope.ts'));
    writeFileSync(join(root, 'publishing/article.md'), 'A published article.\n');
    git('add', '.'); git('commit', '-qm', 'public fixture');
    const before = git('rev-parse', 'HEAD');
    renameSync(join(root, 'publishing/article.md'), join(root, 'docs/article.md'));
    git('add', '-A'); git('commit', '-qm', 'remove publication');
    git('remote', 'add', 'origin', root);
    const output = join(root, 'output');
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', scope], {cwd: root, env: {...process.env, BEFORE: before, GITHUB_SHA: git('rev-parse', 'HEAD'), GITHUB_EVENT_NAME: 'push', GITHUB_OUTPUT: output}, stdio: ['ignore', 'pipe', 'pipe']});
    expect(readFileSync(output, 'utf8')).toBe('publish=true\n');
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test.each([
  {paths: ['README.md', 'knowledge/evidence/result.md'], expected: 'false'},
  {paths: ['publishing/site/src/pages/index.astro'], expected: 'true'},
  {paths: ['packages/plugins/plugins/src/package.ts'], expected: 'true'},
  {paths: ['scripts/build-journal.ts', 'bun.lock'], expected: 'true'},
  {paths: ['.github/workflows/ci.yml'], expected: 'true'},
  {paths: ['scripts/publishing-scope.ts'], expected: 'true'},
  {paths: ['unrelated/publishing/file.ts'], expected: 'false'},
])('publication scope selects $paths -> $expected', async ({paths, expected}) => {
  const child = Bun.spawn(['bun', 'scripts/publishing-scope.ts'], {stdin: new Blob([paths.join('\0')]), stdout: 'pipe', stderr: 'pipe'});
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exit, stderr).toBe(0);
  expect(stdout).toBe(`publish=${expected}\n`);
});

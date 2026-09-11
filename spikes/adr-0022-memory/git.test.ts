import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitSource } from './git-plugin/source.js';

function git(root: string, ...args: string[]) { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).trim(); }
async function fixture(work: (repo: string, data: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-git-source-'));
  const repo = join(root, 'repo'), data = join(root, 'data');
  try { await mkdir(repo); await mkdir(data); git(repo, 'init', '-q'); await writeFile(join(repo, 'rule.ts'), 'export const limit = 50;'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'Initial'); await work(repo, data); }
  finally { await rm(root, { recursive: true, force: true }); }
}
test('Git batches use committed content, remain replayable until acknowledged and isolate unchanged files', async () => {
  await fixture(async (repo, data) => {
    const source = new GitSource(repo, ['rule.ts'], data);
    await writeFile(join(repo, 'rule.ts'), 'UNCOMMITTED_SECRET');
    const first = await source.changes();
    expect(first.updates).toHaveLength(1);
    expect(first.updates[0]!.text).toContain('limit = 50');
    expect(first.updates[0]!.text).not.toContain('UNCOMMITTED_SECRET');
    expect(await new GitSource(repo, ['rule.ts'], data).changes()).toEqual(first);
    await expect(source.acknowledge('wrong')).rejects.toThrow();
    await source.acknowledge(first.token); await source.acknowledge(first.token);
    expect((await source.changes()).updates).toHaveLength(0);
    await writeFile(join(repo, 'noise.txt'), 'Unrelated'); git(repo, 'add', 'noise.txt'); git(repo, 'commit', '-qm', 'Noise');
    const noise = await source.changes(); expect(noise.updates).toHaveLength(0); await source.acknowledge(noise.token);
    await writeFile(join(repo, 'rule.ts'), 'export const limit = 25;'); git(repo, 'add', 'rule.ts'); git(repo, 'commit', '-qm', 'Change');
    const changed = await source.changes(); expect(changed.updates[0]!.previous).toBe(first.updates[0]!.revision);
    expect(changed.updates[0]!.text).toContain('limit = 25'); await source.acknowledge(changed.token);
    git(repo, 'rm', '-q', 'rule.ts'); git(repo, 'commit', '-qm', 'Delete');
    const deleted = await source.changes(); expect(deleted.updates[0]!.state).toBe('withdrawn');
  });
});
test('Git evidence rejects traversal, symlinks, oversized content and configuration reuse', async () => {
  await fixture(async (repo, data) => {
    expect(() => new GitSource(repo, ['../rule.ts'], data)).toThrow();
    await symlink('/etc/passwd', join(repo, 'link')); git(repo, 'add', 'link'); git(repo, 'commit', '-qm', 'Link');
    await expect(new GitSource(repo, ['link'], data).changes()).rejects.toThrow();
    await writeFile(join(repo, 'huge'), 'x'.repeat(2100)); git(repo, 'add', 'huge'); git(repo, 'commit', '-qm', 'Huge');
    await expect(new GitSource(repo, ['huge'], data).changes()).rejects.toThrow();
    const source = new GitSource(repo, ['rule.ts'], data); await source.changes();
    await expect(new GitSource(repo, ['huge'], data).changes()).rejects.toThrow();
  });
});

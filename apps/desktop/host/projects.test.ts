import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, rename, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bindProjectDirectory, verifyProjectDirectory, ProjectDirectoryError } from './projects.js';

test('directory binding rejects internal state, parents, roots and escaping replacements', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-project-test-'));
  try {
    const internal = join(root, 'private'); const working = join(root, 'working');
    await mkdir(internal); await mkdir(working);
    for (const path of ['/', root, internal, join(internal, 'nested')]) {
      await expect(bindProjectDirectory(path, internal)).rejects.toThrow();
    }
    const binding = await bindProjectDirectory(working, internal);
    expect(await verifyProjectDirectory(binding, internal)).toBe(await realpath(working));
    await rename(working, join(root, 'original'));
    await symlink(internal, working);
    await expect(verifyProjectDirectory(binding, internal)).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('aliases bind to the same canonical directory; missing directories fail without creating them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-project-test-'));
  try {
    await mkdir(join(root, 'private')); await mkdir(join(root, 'working'));
    await symlink(join(root, 'working'), join(root, 'alias'));
    expect(await bindProjectDirectory(join(root, 'alias'), join(root, 'private')))
      .toEqual(await bindProjectDirectory(join(root, 'working'), join(root, 'private')));
    await expect(bindProjectDirectory(join(root, 'absent'), join(root, 'private'))).rejects.toBeInstanceOf(ProjectDirectoryError);
    await expect(bindProjectDirectory(join(root, 'absent'), join(root, 'private'))).rejects.toThrow('unavailable');
  } finally { await rm(root, { recursive: true, force: true }); }
});

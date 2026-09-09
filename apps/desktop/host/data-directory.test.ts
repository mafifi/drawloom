import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectDataDirectory } from './data-directory.js';

test('new, legacy and explicit data locations preserve existing installations', async () => {
  const home = await mkdtemp(join(tmpdir(), 'drawloom-directory-'));
  try {
    const modern = join(home, '.drawloom');
    const legacy = join(home, 'Library/Application Support/Drawloom');
    expect(await selectDataDirectory({ home })).toBe(modern);
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, 'session-marker'), 'keep');
    expect(await selectDataDirectory({ home })).toBe(legacy);
    await mkdir(modern);
    await expect(selectDataDirectory({ home })).rejects.toThrow('DRAWLOOM_DATA_DIR');
    expect(await selectDataDirectory({ home, override: modern })).toBe(modern);
    expect(await readFile(join(legacy, 'session-marker'), 'utf8')).toBe('keep');
  } finally { await rm(home, { recursive: true, force: true }); }
});

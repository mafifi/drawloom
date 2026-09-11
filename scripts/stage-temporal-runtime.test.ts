import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as staging from './stage-temporal-runtime.js';

test('runtime staging preserves nested dependency versions and native resources without checkout symlinks', async () => {
  expect(Reflect.get(staging, 'stageTemporalRuntime')).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), 'drawloom-runtime-stage-'));
  const destination = join(root, 'out', 'orchestration');
  async function pkg(path: string, name: string, version: string, dependencies: Record<string, string>) {
    await mkdir(join(path, 'dist'), { recursive: true });
    await writeFile(join(path, 'package.json'), JSON.stringify({ name, version, dependencies, files: ['dist'] }));
    await writeFile(join(path, 'dist', 'index.js'), `export default '${version}';`);
  }
  try {
    await pkg(join(root, 'packages/orchestration/temporal-orchestration'), '@drawloom/temporal-orchestration', '0.0.0', { first: '1.0.0', second: '1.0.0' });
    await pkg(join(root, 'node_modules/first'), 'first', '1.0.0', { second: '2.0.0' });
    await pkg(join(root, 'node_modules/second'), 'second', '1.0.0', {});
    await pkg(join(root, 'node_modules/first/node_modules/second'), 'second', '2.0.0', {});
    await writeFile(join(root, 'node_modules/first/dist/addon.node'), 'native bytes');
    await staging.stageTemporalRuntime({ repositoryRoot: root, destination });
    expect(await readFile(join(destination, 'node_modules/second/dist/index.js'), 'utf8')).toContain('1.0.0');
    expect(await readFile(join(destination, 'node_modules/first/node_modules/second/dist/index.js'), 'utf8')).toContain('2.0.0');
    expect(await readFile(join(destination, 'node_modules/first/dist/addon.node'), 'utf8')).toBe('native bytes');
    expect(await readFile(join(destination, 'node_modules/@drawloom/temporal-orchestration/dist/index.js'), 'utf8')).toContain('0.0.0');
  } finally { await rm(root, { recursive: true, force: true }); }
});

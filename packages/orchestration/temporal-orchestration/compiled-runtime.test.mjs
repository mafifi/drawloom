import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { command } from './dist/processes.js';

// Ordinary Bun discovery must not register tests through its node:test shim.
if (!process.versions.bun) test('compiled Bun host executes a packaged workflow using only staged Node resources', { skip: process.env.DRAWLOOM_TEMPORAL_COMPILED !== '1', timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-compiled-client-'));
  const pkg = join(root, 'plugin'); await mkdir(pkg);
  const executable = join(root, 'client');
  try {
    await command('bun', ['build', '--compile', resolve('packages/orchestration/temporal-orchestration/fixtures/compiled-client.mjs'), '--outfile', executable]);
    await command('bun', ['build', resolve('packages/orchestration/temporal-orchestration/fixtures/recovery.mjs'), '--target', 'browser', '--outfile', join(pkg, 'workflow.mjs')]);
    const runtime = resolve(process.env.DRAWLOOM_ORCHESTRATION_RUNTIME ?? 'apps/desktop/src-tauri/binaries/orchestration');
    const output = await new Promise((resolve, reject) => {
      const child = spawn(executable, [join(root, 'data'), runtime, pkg], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Compiled client timed out')); }, 45000);
      child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve(stdout) : reject(Error(stderr)); });
    });
    assert.match(output, /COMPILED_RUNTIME_OK/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

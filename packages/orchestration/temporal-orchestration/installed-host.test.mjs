import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { command } from './dist/processes.js';

if (!process.versions.bun) test('real Temporal restores an unrelated trusted package through the desktop loader without repeating its host-stored effect', { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== '1', timeout: 90000 }, async () => {
  const output = await command('bun', ['run', resolve('apps/desktop/tests/installed-temporal-host.mjs')], 80000);
  assert.match(output, /INSTALLED_HOST_TEMPORAL_OK/);
});

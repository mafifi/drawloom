import { test, expect } from 'bun:test';
import { mkdtemp, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectPackage } from './loader.ts';
import { activatePackage } from './runtime.ts';

const root = join(import.meta.dir, 'fixtures/plain');
test('standard package executes over real stdio; failures isolate, data survives restart and instances do not collide', async () => {
  const data = await realpath(await mkdtemp(join(tmpdir(), 'drawloom-plugin-runtime-')));
  try {
    const inventory = await inspectPackage(root);
    expect(await readdir(data)).toEqual([]);
    let active = await activatePackage(inventory, data, 'one');
    try {
      expect(active.diagnostics).toContainEqual({ component: 'server:unavailable', code: 'connection-failed' });
      expect(active.servers.size).toBe(1);
      const client = active.servers.get('notes')!;
      expect((await client.listTools()).tools.map(t => t.name)).toEqual(['open', 'inspect', 'increment']);
      expect((await client.callTool({ name: 'inspect', arguments: {} })).structuredContent).toMatchObject({
        count: 0, root, cwd: root, data: join(data, 'one'), literal: join(data, 'one'),
      });
      expect((await client.callTool({ name: 'increment', arguments: { amount: 3 } })).structuredContent).toEqual({ count: 3 });
    } finally { await active.close(); }
    active = await activatePackage(inventory, data, 'one');
    try {
      expect((await active.servers.get('notes')!.callTool({ name: 'inspect', arguments: {} })).structuredContent).toMatchObject({ count: 3 });
      const other = await activatePackage(inventory, data, 'two');
      try { expect((await other.servers.get('notes')!.callTool({ name: 'inspect', arguments: {} })).structuredContent).toMatchObject({ count: 0 }); }
      finally { await other.close(); }
    } finally { await active.close(); }
    await expect(activatePackage(inventory, data, '../outside')).rejects.toThrow();
  } finally { await rm(data, { recursive: true, force: true }); }
}, 15000);

import { test, expect } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from './plugin-installations.js';
import { createDesktopApplication } from './application.js';

test('parallel connection policy is explicit, validated, durable and restart-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-install-parallel-'));
  try {
    await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference' }));
    await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: {
      render: { type: 'stdio', command: 'must-not-execute' }, consent: { type: 'stdio', command: 'must-not-execute' },
    } }));
    const store = createNodeJsonStore(join(root, 'state'));
    const initial = await createInstallationStore(store); const id = await initial.add(root);
    const current = await createInstallationStore(store);
    expect(current.list()[0]?.elicitationDisabledServers).toEqual([]);
    const settings = { enabled: false, trustedBackend: false, servers: ['render', 'consent'], configuration: {} };
    await current.configure(id, { ...settings, elicitationDisabledServers: ['render'] });
    expect(current.startup[0]?.elicitationDisabledServers).toEqual([]);
    expect(current.pendingRestart(id)).toBe(true);
    expect(current.list()[0]?.elicitationDisabledServers).toEqual(['render']);
    for (const names of [['unknown'], ['render', 'render']]) {
      await expect(current.configure(id, { ...settings, elicitationDisabledServers: names })).rejects.toThrow();
    }
    await expect(current.configure(id, { ...settings, servers: ['consent'], elicitationDisabledServers: ['render'] })).rejects.toThrow();
    const reopened = await createInstallationStore(store);
    expect(reopened.startup[0]?.elicitationDisabledServers).toEqual(['render']);
    expect(reopened.pendingRestart(id)).toBe(false);
    await reopened.configure(id, settings); // Older clients must preserve the policy.
    expect(reopened.list()[0]?.elicitationDisabledServers).toEqual(['render']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('desktop lists deselected servers for later activation without starting them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-install-selection-'));
  try {
    await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference' }));
    await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: {
      one: { type: 'stdio', command: 'must-not-execute' }, two: { type: 'stdio', command: 'must-not-execute' },
    } }));
    const app = await createDesktopApplication(join(root, 'data'));
    try {
      const id = await app.installations.add(root);
      await app.installations.configure(id, { enabled: false, trustedBackend: false, servers: ['one'], configuration: {} });
      const entry = (await app.installedPackages())[0]!;
      expect(entry.servers).toEqual(['one']);
      expect(entry.availableServers.map(server => server.name)).toEqual(['one', 'two']);
      expect(entry.connections).toEqual([]);
    } finally { await app.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installations persist without activation and changes wait for restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-install-'));
  try {
    await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference' }));
    const store = createNodeJsonStore(join(root, 'state'));
    const first = await createInstallationStore(store);
    const id = await first.add(root);
    expect(await first.add(root)).toBe(id);
    expect(first.list()).toHaveLength(1);
    expect(first.list()[0]?.enabled).toBe(false);
    expect(first.startup).toHaveLength(0);
    expect(first.pendingRestart(id)).toBe(true);
    await first.configure(id, { enabled: true, trustedBackend: false, servers: [], configuration: {} });
    const second = await createInstallationStore(store);
    expect(second.startup[0]?.id).toBe(id);
    expect(second.startup[0]?.enabled).toBe(true);
    expect(second.pendingRestart(id)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

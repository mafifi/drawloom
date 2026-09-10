import type { PackageInventory } from './contract.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { StdioSchema, packagePath } from './loader.ts';
export interface RunningPackage {
  servers: Map<string, Client>;
  diagnostics: { component: string; code: string }[];
  close(): Promise<void>;
}
export async function serverTransport(inventory: PackageInventory, id: string, dataRoot: string, instance: string) {
  z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(instance);
  const config = StdioSchema.parse(inventory.servers.find(s => s.name === id)?.config);
  const root = await realpath(inventory.root);
  const base = await realpath(dataRoot);
  await mkdir(join(base, instance), { recursive: true, mode: 0o700 });
  const data = await packagePath(base, instance);
  const expand = (value: string) => value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (_, key: string) => key === 'ROOT' ? root : data);
  const cwdSpec = config.cwd ?? '${PLUGIN_ROOT}';
  const cwd = cwdSpec.startsWith('${PLUGIN_DATA}')
    ? await packagePath(data, expand(cwdSpec)) : await packagePath(root, expand(cwdSpec));
  return new StdioClientTransport({
    command: config.command.startsWith('./') ? await packagePath(root, config.command) : config.command,
    args: (config.args ?? []).map(expand), cwd,
    env: { ...getDefaultEnvironment(), ...Object.fromEntries(Object.entries(config.env ?? {}).map(([k, v]) => [k, expand(v)])),
      PLUGIN_ROOT: root, PLUGIN_DATA: data }, stderr: 'pipe',
  });
}
export async function activatePackage(inventory: PackageInventory, dataRoot: string, instance: string): Promise<RunningPackage> {
  z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(instance);
  const servers = new Map<string, Client>();
  const diagnostics: RunningPackage['diagnostics'] = [];
  for (const server of inventory.servers) {
    const client = new Client({ name: 'drawloom-package-proof', version: '0.0.0' });
    try {
      const transport = await serverTransport(inventory, server.name, dataRoot, instance);
      // Drain without retaining potentially sensitive diagnostics, including startup.
      transport.stderr?.on('data', () => {});
      await client.connect(transport);
      servers.set(server.name, client);
    } catch {
      await client.close(); diagnostics.push({ component: `server:${server.name}`, code: 'connection-failed' });
    }
  }
  return { servers, diagnostics, async close() { await Promise.all([...servers.values()].map(c => c.close())); } };
}

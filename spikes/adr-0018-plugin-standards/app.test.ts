import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '@modelcontextprotocol/ext-apps';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { connectMcpApp } from '../../apps/desktop/host/mcp-app.ts';
import { createPluginViewBridge } from '../../apps/desktop/src/lib/plugin-view-bridge.ts';
import { inspectPackage } from './loader.ts';
import { serverTransport } from './runtime.ts';

test('package-configured MCP App uses the existing public bridge without a plugin factory', async () => {
  const data = await mkdtemp(join(tmpdir(), 'drawloom-standard-app-'));
  const inventory = await inspectPackage(join(import.meta.dir, 'fixtures/plain'));
  const transport = await serverTransport(inventory, 'notes', data, 'app');
  const host = await connectMcpApp({ transport, toolName: 'open' }, 'ui://public-notes/view.html');
  const bridge = createPluginViewBridge({ theme: 'dark', callTool: p => host.callTool(p) });
  const app = new App({ name: 'public-notes', version: '1.0.0' }, {}, { autoResize: false });
  try {
    const [parent, child] = InMemoryTransport.createLinkedPair();
    await bridge.connect(parent); await app.connect(child);
    expect(app.getHostContext()?.theme).toBe('dark');
    expect((await app.callServerTool({ name: 'open', arguments: {} })).structuredContent).toEqual({ count: 0 });
    expect(host.html).toContain('Public notes fixture');
    await expect(app.callServerTool({ name: 'invented', arguments: {} })).rejects.toThrow();
  } finally { await app.close(); await bridge.close(); await host.close(); await rm(data, { recursive: true, force: true }); }
}, 15000);

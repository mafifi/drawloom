import { expect, test } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { App } from '@modelcontextprotocol/ext-apps';
import { getUiCapability, registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { closePluginViewBridge, createPluginViewBridge } from '../src/lib/plugin-view-bridge.js';
import { connectMcpApp } from './mcp-app.js';

async function fixture() {
  const server = new McpServer({ name: 'public-counter', version: '1.0.0' });
  const uri = 'ui://counter/view.html';
  let value = 3, privateCalls = 0;
  registerAppResource(server, 'Counter', uri, {}, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: '<!doctype html><p>Counter</p>' }] }));
  registerAppTool(server, 'counter.open', { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ['app'] } } }, async () => ({ content: [], structuredContent: { value } }));
  registerAppTool(server, 'counter.choose', { inputSchema: { value: z.number().int().min(0) }, _meta: { ui: { visibility: ['app'] } } }, async input => ({ content: [], structuredContent: { value: value = input.value } }));
  registerAppTool(server, 'private.action', { inputSchema: {}, _meta: { ui: { visibility: ['model'] } } }, async () => { privateCalls++; return { content: [] }; });
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  return { server, uri, transport, privateCalls: () => privateCalls };
}

test('standard App reaches plugin-owned data without OperatorSnapshot or controller assumptions', async () => {
  const f = await fixture();
  const host = await connectMcpApp({ transport: f.transport, toolName: 'counter.open' }, f.uri);
  expect(getUiCapability(f.server.server.getClientCapabilities()!)?.mimeTypes).toContain(RESOURCE_MIME_TYPE);
  const bridge = createPluginViewBridge({ theme: 'light', callTool: args => host.callTool(args) });
  const app = new App({ name: 'counter', version: '1.0.0' }, {}, { autoResize: false });
  const [parent, child] = InMemoryTransport.createLinkedPair();
  try {
    await bridge.connect(parent);
    await app.connect(child);
    expect(app.getHostContext()?.theme).toBe('light');
    expect((await app.callServerTool({ name: 'counter.open', arguments: {} })).structuredContent).toEqual({ value: 3 });
    expect((await app.callServerTool({ name: 'counter.choose', arguments: { value: 8 } })).structuredContent).toEqual({ value: 8 });
    expect((await app.callServerTool({ name: 'counter.choose', arguments: { value: -1 } })).isError).toBe(true);
    await expect(app.callServerTool({ name: 'private.action', arguments: {} })).rejects.toThrow();
    await expect(app.callServerTool({ name: 'another-server.action', arguments: {} })).rejects.toThrow();
    expect(f.privateCalls()).toBe(0);
    expect(host.html).toContain('Counter');
    let cleaned = false;
    app.onteardown = async () => { cleaned = true; return {}; };
    await closePluginViewBridge(bridge);
    expect(cleaned).toBe(true);
  } finally { await app.close(); await bridge.close(); await host.close(); }
});

test('host refuses a resource not associated with its opening tool', async () => {
  const f = await fixture();
  await expect(connectMcpApp({ transport: f.transport, toolName: 'counter.open' }, 'ui://other/view.html')).rejects.toThrow();
  await f.server.close();
});

test('standard context and message methods negotiate separately and preserve host rejection', async () => {
  const events: unknown[] = [];
  const bridge = createPluginViewBridge({ theme: 'dark', callTool: async () => ({ content: [] }),
    updateContext: async params => { events.push(params); return {}; },
    message: async params => { events.push(params); return { isError: true }; },
  });
  const app = new App({ name: 'public-editor', version: '1.0.0' }, {}, { autoResize: false });
  const [parent, child] = InMemoryTransport.createLinkedPair();
  try {
    await bridge.connect(parent); await app.connect(child);
    await app.updateModelContext({ structuredContent: { passage: 'Selected public fixture' } });
    expect(events).toEqual([{ structuredContent: { passage: 'Selected public fixture' } }]);
    expect(await app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'Suggest a shorter passage' }] })).toEqual({ isError: true });
    expect(events).toHaveLength(2);
    await app.updateModelContext({});
    expect(events.at(-1)).toEqual({});
  } finally { await app.close(); await bridge.close(); }
});

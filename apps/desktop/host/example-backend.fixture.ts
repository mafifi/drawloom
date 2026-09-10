import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { PluginBackendFactory } from '@drawloom/desktop-host';

const backend: PluginBackendFactory = async ({ capabilities }) => {
  const store = capabilities.host!.store;
  const uri = 'ui://example/view.html';
  const server = new McpServer({ name: 'public-choice', version: '1.0.0' });
  registerAppResource(server, 'Choices', uri, {}, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: '<!doctype html><p>Public fixture</p>' }] }));
  const current = async () => ({ content: [], structuredContent: { choice: await store.get('example.choice') ?? 'first' } });
  registerAppTool(server, 'example.open', { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ['app'] } } }, current);
  registerAppTool(server, 'example.inspect', { inputSchema: { choice: z.enum(['first', 'second']) }, _meta: { ui: { visibility: ['app'] } } }, async ({ choice }) => { await store.set('example.choice', choice); return current(); });
  registerAppTool(server, 'example.reference', { inputSchema: {}, _meta: { ui: { visibility: ['app'] } } }, async () => ({ content: [{ type: 'resource_link' as const, uri: 'document://example/guide', name: 'Writing guide', mimeType: 'text/plain' }] }));
  server.registerResource('Writing guide', 'document://example/guide', { mimeType: 'text/plain' }, async () => {
    await store.set('example.reads', Number(await store.get('example.reads') ?? 0) + 1);
    return { contents: [{ uri: 'document://example/guide', text: 'Use simple words.', mimeType: 'text/plain' }] };
  });
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  return { contributions: {
    workbenches: [{ id: 'example', title: 'Example', description: '', tools: [], skills: [] }],
    views: [{ id: 'example.view', workbenchId: 'example', title: 'Example view', entrypoint: uri }],
  }, servers: [{ name: 'editor', transport }], dispose: () => server.close() };
};
export default backend;

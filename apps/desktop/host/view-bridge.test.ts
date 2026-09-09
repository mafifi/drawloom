import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { definePlugin } from '@drawloom/plugins';
import type { DesktopExtensionFactory } from '@drawloom/desktop-host';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';

const extension: DesktopExtensionFactory = async ({ store }) => {
  const uri = 'ui://example/view.html';
  const server = new McpServer({ name: 'public-choice', version: '1.0.0' });
  registerAppResource(server, 'Choices', uri, {}, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: '<!doctype html><p>Public fixture</p>' }] }));
  const current = async () => ({ content: [], structuredContent: { choice: await store.get('example.choice') ?? 'first' } });
  registerAppTool(server, 'example.open', { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ['app'] } } }, current);
  registerAppTool(server, 'example.inspect', { inputSchema: { choice: z.enum(['first', 'second']) }, _meta: { ui: { visibility: ['app'] } } }, async ({ choice }) => { await store.set('example.choice', choice); return current(); });
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  const plugin = definePlugin({ id: 'public.example', version: '1.0.0', config: z.strictObject({}), contribute: () => ({
    workbenches: [{ id: 'example', title: 'Example', description: '', tools: [], skills: [] }],
    views: [{ id: 'example.view', workbenchId: 'example', title: 'Example view', entrypoint: uri }],
  }) });
  return { installs: [{ plugin, config: {} }], controllers: new Map(), mcpApps: new Map([['example.view', { transport, toolName: 'example.open' }]]) };
};

test('MCP view data stays with its active owner and persists without an OperatorController', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-view-'));
  const app = await createDesktopApplication(root, extension);
  const previous = (await app.snapshot()).selectedId;
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const target = { conversationId: (await app.snapshot()).selectedId, viewId: 'example.view' };
  try {
    expect((await app.viewRequest({ ...target, request: { name: 'example.open', arguments: {} } })).structuredContent).toEqual({ choice: 'first' });
    expect((await app.viewRequest({ ...target, request: { name: 'example.inspect', arguments: { choice: 'second' } } })).structuredContent).toEqual({ choice: 'second' });
    await expect(app.viewRequest({ ...target, viewId: 'other', request: { name: 'example.open' } })).rejects.toThrow();
    await expect(app.viewRequest({ ...target, request: { name: 'review_candidate' } })).rejects.toThrow();
    await app.command({ kind: 'select_conversation', conversationId: previous });
    await expect(app.viewRequest({ ...target, request: { name: 'example.open' } })).rejects.toThrow();
    await app.command({ kind: 'select_conversation', conversationId: target.conversationId });
  } finally { await app.close(); }
  const reopened = await createDesktopApplication(root, extension);
  try { const reply = await reopened.viewRequest({ ...target, request: { name: 'example.open', arguments: {} } }); expect(reply.structuredContent).toEqual({ choice: 'second' }); }
  finally { await reopened.close(); }
});

test('MCP HTML and calls require authenticated parent channel and retain sandbox restrictions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-http-'));
  const app = await createDesktopApplication(root, extension);
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const state = await app.snapshot();
  const server = serveDesktop(app, resolve('apps/desktop/build'));
  try {
    const path = '/api/views/example.view?conversationId=' + state.selectedId;
    expect((await fetch(server.origin + path)).status).toBe(401);
    const boot = await fetch(server.url, { redirect: 'manual' });
    const cookie = boot.headers.get('set-cookie')!.split(';')[0]!;
    const html = await fetch(server.origin + path, { headers: { cookie } });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-security-policy')).toContain('sandbox allow-scripts;');
    expect(html.headers.get('content-security-policy')).not.toContain('allow-same-origin');
    expect(await html.text()).toContain('Public fixture');
    const body = JSON.stringify({ conversationId: state.selectedId, viewId: 'example.view', request: { name: 'example.open', arguments: {} } });
    const endpoint = server.origin + '/api/view-request';
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie, origin: 'null', 'Content-Type': 'application/json' }, body })).status).toBe(403);
    const reply = await fetch(endpoint, { method: 'POST', headers: { cookie, origin: server.origin, 'Content-Type': 'application/json' }, body });
    expect(reply.status).toBe(200);
    expect((await reply.json() as { structuredContent: unknown }).structuredContent).toEqual({ choice: 'first' });
  } finally { await server.close(); }
});

test('context updates do not start an agent and stale views cannot send conversation requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-context-'));
  const app = await createDesktopApplication(root, extension);
  const previous = (await app.snapshot()).selectedId;
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const routing = { conversationId: (await app.snapshot()).selectedId, viewId: 'example.view' };
  const target = { ...routing, ...app.viewSession({ ...routing, action: 'open' }) };
  try {
    const before = await app.snapshot();
    expect(await app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: { content: [{ type: 'text', text: 'A selected revision' }] } } })).toEqual({});
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    expect((await app.snapshot()).signals).toEqual(before.signals);
    expect(await app.viewInteraction({ ...target, request: { method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Revise it' }] } } })).toEqual({ isError: true });
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    const replacement = { ...routing, ...app.viewSession({ ...routing, action: 'open' }) };
    app.viewSession({ ...target, action: 'close' });
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
    expect(await app.viewInteraction({ ...replacement, request: { method: 'ui/update-model-context', params: {} } })).toEqual({});
    await app.command({ kind: 'select_conversation', conversationId: previous });
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Wrong conversation' }] } } })).rejects.toThrow();
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    await app.command({ kind: 'select_conversation', conversationId: routing.conversationId });
    await expect(app.viewInteraction({ ...replacement, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
  } finally { await app.close(); }
});

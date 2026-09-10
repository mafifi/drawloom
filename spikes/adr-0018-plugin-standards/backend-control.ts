import type { BackendCapabilities } from './contract.ts';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { arithmetic } from '../adr-0017-orchestration/fixtures.ts';
import { workflowResult } from '../adr-0017-orchestration/contract.ts';
/** Existing trusted-composition control, NOT a portable MCP capability bridge. */
export function createBackendControl(capabilities: BackendCapabilities): McpServer {
  const server = new McpServer({ name: 'backend-control', version: '1.0.0' });
  const uri = 'ui://control/view.html';
  registerAppResource(server, 'Control', uri, {}, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE,
    text: '<!doctype html><p>Backend capability control</p>' }] }));
  registerAppTool(server, 'open', { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ['app'] } } },
    async () => ({ content: [], structuredContent: { available: Boolean(capabilities.orchestration) } }));
  registerAppTool(server, 'calculate', { inputSchema: { request: z.string().min(1), value: z.number() },
    _meta: { ui: { visibility: ['app'] } } }, async ({ request, value }) => {
    const engine = capabilities.orchestration;
    if (!engine) return { isError: true, content: [{ type: 'text', text: 'Required orchestration capability unavailable' }] };
    const run = await engine.start(request, arithmetic, value);
    return { content: [], structuredContent: { value: await workflowResult(engine, run, arithmetic) } };
  });
  return server;
}

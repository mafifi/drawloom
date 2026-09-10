import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';

const server = new McpServer({ name: 'public-notes', version: '1.0.0' });
const file = join(process.env.PLUGIN_DATA, 'count.json');
async function count() {
  try { return z.number().int().nonnegative().parse(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}
const uri = 'ui://public-notes/view.html';
registerAppResource(server, 'Notes', uri, {}, async () => ({ contents: [{ uri,
  mimeType: RESOURCE_MIME_TYPE, text: '<!doctype html><html><body><p>Public notes fixture</p></body></html>',
}] }));
registerAppTool(server, 'open', { inputSchema: {}, annotations: { readOnlyHint: true },
  _meta: { ui: { resourceUri: uri, visibility: ['app'] } },
}, async () => ({ content: [], structuredContent: { count: await count() } }));
server.registerTool('inspect', { inputSchema: {}, annotations: { readOnlyHint: true } }, async () => ({ content: [],
  structuredContent: { count: await count(), root: process.env.PLUGIN_ROOT, data: process.env.PLUGIN_DATA,
    cwd: process.cwd(), literal: process.env.PROOF_LITERAL },
}));
server.registerTool('increment', { inputSchema: { amount: z.number().int().min(1).max(10) } }, async ({ amount }) => {
  const value = await count() + amount;
  await writeFile(file, JSON.stringify(value));
  return { content: [{ type: 'text', text: String(value) }], structuredContent: { count: value } };
});
await server.connect(new StdioServerTransport());

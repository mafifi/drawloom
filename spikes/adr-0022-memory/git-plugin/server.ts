import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GitSource } from './source.js';
const config = z.strictObject({ repository: z.string().min(1), paths: z.array(z.string()), data: z.string().min(1) }).parse({
  repository: process.env.GIT_SOURCE_REPOSITORY, paths: JSON.parse(process.env.GIT_SOURCE_PATHS ?? 'null'), data: process.env.PLUGIN_DATA,
});
const source = new GitSource(config.repository, config.paths, config.data);
const server = new McpServer({ name: 'git-evidence', version: '0.0.0' });
server.registerTool('git.changes', { description: 'Read a replayable batch of committed-file evidence from configured local paths. Does not execute repository code or tests.', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
  const batch = await source.changes(); return { content: [{ type: 'text', text: JSON.stringify(batch) }], structuredContent: batch };
});
server.registerTool('git.acknowledge', { description: 'Acknowledge a successfully stored evidence batch. Changes only this plugin delivery checkpoint, not the repository.', inputSchema: { token: z.string() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, async ({ token }) => {
  await source.acknowledge(token); return { content: [{ type: 'text', text: 'Acknowledged' }] };
});
await server.connect(new StdioServerTransport());

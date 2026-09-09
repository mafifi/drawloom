import type { DesktopExtension } from '@drawloom/desktop-host';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolRequestSchema, CallToolResultSchema, type CallToolRequest, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getToolUiResourceUri, isToolVisibilityModelOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
type Connection = NonNullable<DesktopExtension['mcpApps']> extends ReadonlyMap<string, infer T> ? T : never;
export async function connectMcpApp(connection: Connection, uri: string): Promise<{
  html: string;
  callTool(params: CallToolRequest['params']): Promise<CallToolResult>;
  close(): Promise<void>;
}> {
  const client = new Client({ name: 'drawloom-ui-host', version: '0.0.0' }, {
    capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
  });
  try {
    await client.connect(connection.transport);
    const tools = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw Error('Invalid MCP tool pagination');
      if (cursor) seen.add(cursor);
    } while (cursor);
    const opening = tools.find(tool => tool.name === connection.toolName);
    if (!opening || isToolVisibilityModelOnly(opening) || getToolUiResourceUri(opening) !== uri)
      throw Error('MCP opening tool does not expose the registered resource');
    const resource = await client.readResource({ uri });
    const html = resource.contents.find(content => content.uri === uri && content.mimeType === RESOURCE_MIME_TYPE && 'text' in content);
    if (!html || !('text' in html) || !html.text.length || html.text.length > 8 * 1024 * 1024)
      throw Error('Invalid MCP HTML resource');
    const policy = z.object({ csp: z.record(z.string(), z.unknown()).optional(), permissions: z.record(z.string(), z.unknown()).optional() }).passthrough().parse(html._meta?.ui ?? {});
    if (Object.keys(policy.permissions ?? {}).length || Object.values(policy.csp ?? {}).some(value => !Array.isArray(value) || value.length))
      throw Error('MCP resource requests unsupported permissions or external origins');
    const allowed = new Set(tools.filter(tool => !isToolVisibilityModelOnly(tool)).map(tool => tool.name));
    return {
      html: html.text,
      async callTool(raw) {
        const params = CallToolRequestSchema.shape.params.parse(raw);
        if (!allowed.has(params.name)) throw Error('Tool is unavailable to this app');
        return CallToolResultSchema.parse(await client.callTool(params, undefined, { timeout: 15_000 }));
      },
      close: () => client.close(),
    };
  } catch (error) { await client.close(); throw error; }
}

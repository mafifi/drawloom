import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, CallToolResultSchema, type CallToolRequest, type CallToolResult, type ListResourcesResult, type ReadResourceResult, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { getToolUiResourceUri, isToolVisibilityModelOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { context, propagation } from '@opentelemetry/api';
import { observed, observeOutcome } from './telemetry.js';
import { mediaPolicy } from './mcp-media-policy.js';
export interface ConnectedMcpApp {
  resourceDomains: string[];
  html: string;
  tools: Tool[];
  canRead(uri: string): boolean;
  listResources(cursor?: string): Promise<ListResourcesResult>;
  readResource(uri: string, previouslyAdvertised?: boolean): Promise<ReadResourceResult>;
  callTool(params: CallToolRequest['params']): Promise<CallToolResult>;
  close(): Promise<void>;
}
/** Connect a standard MCP transport; package hosts reuse their established client instead. */
export async function connectMcpApp(connection: { transport: Transport; toolName: string }, uri: string): Promise<ConnectedMcpApp> {
  const client = new Client({ name: 'drawloom-ui-host', version: '0.0.0' }, {
    capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
  });
  try { await client.connect(connection.transport); }
  catch (error) { await client.close(); throw error; }
  return connectMcpAppClient(client, connection.toolName, uri, true);
}
/** Reuse the installation's MCP session: UI mounting never starts a second server. */
export async function connectMcpAppClient(client: Client, toolName: string, uri: string, ownsClient = false): Promise<ConnectedMcpApp> {
  try {
    const tools = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      tools.push(...page.tools);
      if (tools.length > 2000) throw Error('MCP tool catalogue exceeds host limit');
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor)) throw Error('Invalid MCP tool pagination');
      if (cursor) seen.add(cursor);
    } while (cursor);
    const opening = tools.find(tool => tool.name === toolName);
    if (!opening || isToolVisibilityModelOnly(opening) || getToolUiResourceUri(opening) !== uri)
      throw Error('MCP opening tool does not expose the registered resource');
    const resource = await client.readResource({ uri });
    const html = resource.contents.find(content => content.uri === uri && content.mimeType === RESOURCE_MIME_TYPE && 'text' in content);
    if (!html || !('text' in html) || !html.text.length || html.text.length > 8 * 1024 * 1024)
      throw Error('Invalid MCP HTML resource');
    const resourceDomains = mediaPolicy(html._meta?.ui);
    const allowed = new Set(tools.filter(tool => !isToolVisibilityModelOnly(tool)).map(tool => tool.name));
    const readable = new Set<string>();
    const resourceSupport = Boolean(client.getServerCapabilities()?.resources);
    const cursors = new Set<string>();
    return {
      resourceDomains,
      html: html.text,
      tools,
      canRead: value => resourceSupport && readable.has(value),
      async listResources(cursor) {
        if (!resourceSupport) return { resources: [] };
        if (!cursor) cursors.clear();
        if (cursor && !cursors.has(cursor)) throw Error('Unknown resource cursor');
        const page = await client.listResources(cursor ? { cursor } : {});
        if (page.resources.length > 2000 || cursors.size >= 100) throw Error('Resource catalogue exceeds host limit');
        if (page.nextCursor && (page.nextCursor === cursor || cursors.has(page.nextCursor))) throw Error('Invalid resource pagination');
        if (page.nextCursor) cursors.add(page.nextCursor);
        const resources = page.resources.filter(r => r.uri !== uri && r.mimeType !== RESOURCE_MIME_TYPE).map(r => ({
          uri: r.uri, name: r.name,
          ...(r.title === undefined ? {} : { title: r.title }),
          ...(r.description === undefined ? {} : { description: r.description }),
          ...(r.mimeType === undefined ? {} : { mimeType: r.mimeType }),
          ...(r.size === undefined ? {} : { size: r.size }),
        }));
        resources.forEach(r => readable.add(r.uri));
        return { resources, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
      },
      async readResource(value, previouslyAdvertised = false) {
        // Only the trusted host may restore a source-bound receipt from history.
        if (!resourceSupport || (!readable.has(value) && !previouslyAdvertised)) throw Error('Resource unavailable');
        return client.readResource({ uri: value });
      },
      async callTool(raw) {
        const params = CallToolRequestSchema.shape.params.parse(raw);
        if (!allowed.has(params.name)) throw Error('Tool is unavailable to this app');
        const result = await observed('mcp.request', { 'rpc.method': 'tools/call' }, async () => {
          const carrier: Record<string, string> = {};
          propagation.inject(context.active(), carrier);
          // The host owns propagation; an iframe cannot choose another operation's parent.
          const { traceparent: _ignored, tracestate: _state, baggage: _baggage, ...metadata } = params._meta ?? {};
          const value = CallToolResultSchema.parse(await client.callTool({ ...params, _meta: { ...metadata,
            ...(carrier.traceparent ? { traceparent: carrier.traceparent } : {}) } }, undefined, { timeout: 15_000 }));
          if (value.isError) observeOutcome('error');
          return value;
        });
        for (const block of result.content) {
          if (block.type === 'resource_link') readable.add(block.uri);
          if (block.type === 'resource') readable.add(block.resource.uri);
        }
        return result;
      },
      close: () => ownsClient ? client.close() : Promise.resolve(),
    };
  } catch (error) { if (ownsClient) await client.close(); throw error; }
}

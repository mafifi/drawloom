import { createHash } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { CallToolResultSchema, type Tool, type CallToolRequest, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isToolVisibilityAppOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { JsonValueSchema, type JsonValue } from '@drawloom/host';
import { ToolAnnotationsSchema, type ToolDefinition, type ToolContext } from '@drawloom/tools';

/** Native server names remain private routing data; only the alias is exposed. */
export function packageToolName(installation: string, server: string, tool: string) {
  return 'pkg_' + createHash('sha256').update(JSON.stringify([installation, server, tool])).digest('hex').slice(0, 48);
}
export async function projectPackageServer(installation: string, server: string, client: Client, current: () => Client = () => client,
  invoke?: (params: CallToolRequest['params'], context: ToolContext) => Promise<CallToolResult>) {
  const inventory: Tool[] = [];
  const diagnostics: string[] = [];
  if (!client.getServerCapabilities()?.tools) return { tools: [] as ToolDefinition[], inventory, diagnostics };
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await client.listTools(cursor ? { cursor } : {}, { timeout: 15_000 });
    inventory.push(...page.tools);
    if (inventory.length > 2000) throw Error('Package tool inventory exceeds limit');
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw Error('Package tool cursor did not advance');
    if (cursor) seen.add(cursor);
    if (seen.size > 100) throw Error('Package tool pagination exceeds limit');
  } while (cursor);
  const names = new Set<string>();
  const tools: ToolDefinition[] = [];
  for (const tool of inventory) {
    if (names.has(tool.name)) throw Error('Duplicate tool name within one server');
    names.add(tool.name);
    if (isToolVisibilityAppOnly(tool)) continue;
    try {
      // One validator per declaration prevents unrelated servers' $id collisions.
      const inputSchema = JsonValueSchema.parse(tool.inputSchema);
      if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema) || inputSchema.type !== 'object')
        throw Error('Invalid package tool schema');
      const validate = new AjvJsonSchemaValidator().getValidator({ ...inputSchema, type: 'object' });
      tools.push({
        name: packageToolName(installation, server, tool.name),
        description: tool.description ?? tool.title ?? tool.name,
        ...(tool.annotations ? { annotations: ToolAnnotationsSchema.parse(tool.annotations) } : {}),
        inputSchema,
        // The canonical evidence contains the standard MCP result, including content.
        outputSchema: { type: 'object' },
        parseInput(value) {
          const input = JsonValueSchema.parse(value);
          if (!validate(input).valid) throw Error('Invalid package tool input');
          return input;
        },
        async execute(value, context) {
          const input = JsonValueSchema.parse(value);
          if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Tool arguments must be an object');
          const params = { name: tool.name, arguments: input };
          const result = CallToolResultSchema.parse(await (invoke ? invoke(params, context) : current().callTool(params, undefined, { signal: context.signal, timeout: 60_000 })));
          if (result.isError) throw Error('Package tool execution failed');
          return result;
        },
        parseOutput: value => JsonValueSchema.parse(CallToolResultSchema.parse(value)),
        render: (value: JsonValue) => CallToolResultSchema.parse(value).content.filter(c => c.type === 'text').map(c => c.text).join('\n'),
        renderContent: value => CallToolResultSchema.parse(value).content,
      });
    } catch { diagnostics.push(`unsupported-tool-schema:${tool.name}`); }
  }
  return { tools, inventory, diagnostics };
}

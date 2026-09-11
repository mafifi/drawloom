import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpUiMessageRequest, McpUiUpdateModelContextRequest } from '@modelcontextprotocol/ext-apps';
export function updatePluginViewTheme(
  bridge: AppBridge,
  signal: AbortSignal,
  theme: 'light' | 'dark',
): boolean {
  if (signal.aborted || !bridge.transport) return false;
  bridge.setHostContext({ theme, displayMode: 'inline', availableDisplayModes: ['inline'] });
  return true;
}
export async function closePluginViewBridge(bridge: AppBridge): Promise<void> {
  try { await bridge.teardownResource({}, { timeout: 250 }); }
  catch { /* An unresponsive or not-yet-initialized app must not block closing. */ }
  finally { await bridge.close(); }
}
/** Standard MCP Apps protocol. Routing identities stay outside frame messages. */
export function createPluginViewBridge(options: {
  theme: 'light' | 'dark';
  callTool: (params: CallToolRequest['params']) => Promise<CallToolResult>;
  message?: (params: McpUiMessageRequest['params']) => Promise<{ isError?: boolean }>;
  updateContext?: (params: McpUiUpdateModelContextRequest['params']) => Promise<{}>;
}) {
  const bridge = new AppBridge(null, { name: 'Drawloom', version: '0.0.0' },
    { serverTools: {}, ...(options.message ? { message: { text: {} } } : {}), ...(options.updateContext ? { updateModelContext: { text: {} } } : {}) },
    { hostContext: { theme: options.theme, displayMode: 'inline', availableDisplayModes: ['inline'] } });
  bridge.oncalltool = params => options.callTool(params);
  if (options.message) bridge.onmessage = params => options.message!(params);
  if (options.updateContext) bridge.onupdatemodelcontext = params => options.updateContext!(params);
  return bridge;
}

import type { JsonStore, AssetLibrary } from '@drawloom/host';
import type { PluginContributions } from '@drawloom/plugins';
import type { OperatorController } from '@drawloom/workbench';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ToolGateway } from '@drawloom/tools';
import type { Orchestrator } from '@drawloom/orchestration';
export interface DesktopCompositionContext {
  /** Namespaced persistence; the host owns its project/navigation records. */
  readonly store: JsonStore;
  /** put stores bytes AND registers the resulting asset for authenticated viewing. */
  readonly assets: AssetLibrary;
}

/** Supported backend API, not an OS security boundary or a browser capability. */
export interface PluginBackendCapabilities {
  readonly host?: DesktopCompositionContext;
  readonly tools?: ToolGateway;
  readonly orchestration?: Orchestrator;
}
export interface PluginBackendContext {
  /** Fixed for this activation. Desktop hosts always supply it; headless proofs may omit it. */
  readonly project?: { readonly id: string; readonly directory: string };
  readonly installationId: string;
  readonly packageRoot: string;
  readonly dataDirectory: string;
  /** Host-selected configuration; backend validates its own domain settings. */
  readonly configuration: unknown;
  readonly capabilities: PluginBackendCapabilities;
  /** Startup presence of declared tool/skill dependencies; never a grant or readiness guarantee. */
  readonly dependencies: readonly { readonly kind: 'tool' | 'skill'; readonly id: string; readonly available: boolean }[];
}
export interface PluginBackend {
  /** Additional named MCP connections; never overrides standard mcp.json entries. */
  readonly servers?: readonly { readonly name: string; readonly transport: Transport }[];
  readonly contributions?: PluginContributions;
  readonly controllers?: ReadonlyMap<string, OperatorController>;
  dispose(): Promise<void>;
}
/** A prebuilt trusted module's default export. No arbitrary browser module loading. */
export type PluginBackendFactory = (context: PluginBackendContext) => Promise<PluginBackend>;

import type { JsonStore, AssetLibrary } from '@drawloom/host';
import type { PluginContributions } from '@drawloom/plugins';
import type { OperatorController } from '@drawloom/workbench';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ToolGateway } from '@drawloom/tools';
import { z } from 'zod';
import type { Orchestrator, RegisteredTaskHandler } from '@drawloom/orchestration';
export interface DesktopCompositionContext {
  /** Namespaced persistence; the host owns its project/navigation records. */
  readonly store: JsonStore;
  /** put stores bytes AND registers the resulting asset for authenticated viewing. */
  readonly assets: AssetLibrary;
}

export const OrchestrationReadinessSchema = z.strictObject({
  status: z.enum(['ready', 'configuration_required', 'unavailable']),
  code: z.string().min(1).max(128).optional(),
  message: z.string().min(1).max(512).optional(),
});
export type OrchestrationReadiness = z.infer<typeof OrchestrationReadinessSchema>;

/** Supported backend API, not an OS security boundary or a browser capability. */
export interface PluginBackendCapabilities {
  readonly host?: DesktopCompositionContext;
  readonly tools?: ToolGateway;
  readonly orchestration?: Orchestrator;
  /** Provider/service state stays separate from portable run management. */
  readonly orchestrationReadiness?: () => Promise<OrchestrationReadiness>;
}
export type PluginBackendDependency =
  | { readonly kind: 'tool' | 'skill'; readonly id: string; readonly available: boolean }
  | { readonly kind: 'capability'; readonly id: 'orchestration'; readonly available: boolean };
export interface PluginBackendContext {
  /** Fixed for this activation. Desktop hosts always supply it; headless proofs may omit it. */
  readonly project?: { readonly id: string; readonly directory: string };
  readonly installationId: string;
  readonly packageRoot: string;
  readonly dataDirectory: string;
  /** Host-selected configuration; backend validates its own domain settings. */
  readonly configuration: unknown;
  readonly capabilities: PluginBackendCapabilities;
  /** Startup presence only; never a grant or provider-readiness guarantee. */
  readonly dependencies: readonly PluginBackendDependency[];
}
export interface PluginBackend {
  /** Additional named MCP connections; never overrides standard mcp.json entries. */
  readonly servers?: readonly { readonly name: string; readonly transport: Transport }[];
  readonly contributions?: PluginContributions;
  readonly controllers?: ReadonlyMap<string, OperatorController>;
  /** Implementations match the separately loaded portable workflow module. */
  readonly taskHandlers?: readonly RegisteredTaskHandler[];
  dispose(): Promise<void>;
}
/** A prebuilt trusted module's default export. No arbitrary browser module loading. */
export type PluginBackendFactory = (context: PluginBackendContext) => Promise<PluginBackend>;

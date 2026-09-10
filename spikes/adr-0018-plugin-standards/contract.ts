import type { Orchestrator } from '../adr-0017-orchestration/contract.ts';

/** Retained host-specific proof, not a supported package/installation API. */
export interface PackageInventory {
  root: string;
  name: string;
  version?: string;
  extensions: Record<string, unknown>;
  skills: { name: string; description: string; path: string }[];
  servers: { name: string; config: StdioConfig }[];
  diagnostics: { component: string; code: string }[];
}
export interface StdioConfig {
  type: 'stdio'; command: string; args?: string[] | undefined;
  env?: Record<string, string> | undefined; cwd?: string | undefined;
}
/** Control experiment: host-owned backend injection, never a browser service. */
export interface BackendCapabilities {
  orchestration?: Orchestrator;
}

import { z } from 'zod';
import { PluginRequirementSchema } from './requirements.js';

export const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const MCP_PACKAGE_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
export const DRAWLOOM_EXTENSION = 'io.github.mafifi.drawloom';
const packageName = z.string().min(1).max(64)
  .regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
  .refine(value => !value.includes('--') && !value.includes('..'));

/** Unknown manifest fields are ignored by the standard, unlike invalid known fields. */
export const PackageManifestSchema = z.object({
  $schema: z.literal(PLUGIN_SCHEMA), name: packageName,
  version: z.string().optional(), description: z.string().optional(),
  author: z.strictObject({ name: z.string().optional(), email: z.string().optional(), url: z.string().optional() }).optional(),
  homepage: z.string().optional(), repository: z.string().optional(), license: z.string().optional(),
  keywords: z.array(z.string()).optional(), extensions: z.unknown().optional(),
});
export type PackageManifest = z.infer<typeof PackageManifestSchema>;
export const PackageSkillMetadataSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[\p{Ll}\p{Nd}]+(?:-[\p{Ll}\p{Nd}]+)*$/u),
  description: z.string().min(1).max(1024), license: z.string().optional(),
  compatibility: z.string().min(1).max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(), 'allowed-tools': z.string().optional(),
});
const strings = z.record(z.string(), z.string());
export const PackageStdioConfigSchema = z.strictObject({
  type: z.literal('stdio'), command: z.string().min(1).refine(value =>
    !/[\s\u0000]/u.test(value) && !value.includes('${') &&
    (value.startsWith('./') || !/[\/\\:]/u.test(value))),
  args: z.array(z.string()).optional(),
  env: strings.refine(values => !Object.keys(values).some(key => ['PLUGIN_ROOT', 'PLUGIN_DATA'].includes(key.toUpperCase()))).optional(),
  cwd: z.string().refine(value => value.startsWith('./') || /^\$\{PLUGIN_(ROOT|DATA)\}(?:\/|$)/.test(value)).optional(),
});
function validEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' ||
      /^127\.\d+\.\d+\.\d+$/.test(url.hostname) || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]+\]$/i.test(url.hostname);
    return !url.username && !url.password && !value.includes('#') &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && loopback));
  } catch { return false; }
}
export const PackageRemoteConfigSchema = z.strictObject({
  type: z.enum(['streamable-http', 'sse']), url: z.string().refine(validEndpoint),
  headers: strings.refine(values => {
    const names = Object.keys(values).map(key => key.toLowerCase());
    if (new Set(names).size !== names.length) return false;
    return Object.entries(values).every(([key, value]) =>
      /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) && !/[\u0000-\u0008\u000a-\u001f\u007f\u0100-\u{10ffff}]/u.test(value));
  }).optional(),
});
export const PackageServerConfigSchema = z.union([PackageStdioConfigSchema, PackageRemoteConfigSchema]);
export type PackageServerConfig = z.infer<typeof PackageServerConfigSchema>;
export type PackageRemoteConfig = z.infer<typeof PackageRemoteConfigSchema>;
export const PackageMcpConfigSchema = z.strictObject({
  $schema: z.literal(MCP_PACKAGE_SCHEMA), mcpServers: z.record(z.string(), z.unknown()),
});
const entrypoint = z.string().min(1).refine(value =>
  !value.startsWith('/') && !/[\\:\u0000]/u.test(value) && !value.split('/').includes('..') && /\.(?:mjs|js)$/.test(value));
/** Metadata only. The composition root owns loading and granting backend access. */
export const DrawloomPackageExtensionSchema = z.strictObject({
  version: z.literal(1), backend: z.strictObject({ entrypoint }).optional(),
  requires: z.array(PluginRequirementSchema).optional(),
  optional: z.array(z.strictObject({ kind: z.enum(['tool', 'skill']), id: z.string().min(1) })).optional(),
  workbenches: z.array(z.strictObject({
    id: z.string().min(1), title: z.string().min(1), placement: z.literal('workbench').optional(),
    openingTool: z.strictObject({ server: z.string().min(1), tool: z.string().min(1) }),
  })).optional(),
});
export type DrawloomPackageExtension = z.infer<typeof DrawloomPackageExtensionSchema>;
export interface PackageDiagnostic { component: string; code: string }
export interface PackageSkill { name: string; description: string; /** Package-relative source file. */ path: string }
export interface PackageServer { name: string; config: PackageServerConfig }
export interface PackageInventory {
  root: string; name: string; version?: string;
  skills: PackageSkill[]; servers: PackageServer[]; diagnostics: PackageDiagnostic[];
  /** Raw extension data, including unknown namespaces; never executable authority. */
  extensions: Record<string, unknown>; drawloom?: DrawloomPackageExtension;
}
export interface PackageInspector {
  inspectPackage(root: string): Promise<PackageInventory>;
  readSkill(inventory: PackageInventory, name: string): Promise<string>;
  readSupportingFile(inventory: PackageInventory, skillName: string, path: string): Promise<string>;
}

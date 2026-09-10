import { z } from 'zod';
import { AgentSessionSignalSchema, AgentApprovalResolutionSchema, AgentInputResolutionSchema, AgentReviewerSchema, DiscoveryEntrySchema, DiscoverySnapshotSchema, DiscoverySelectionSchema } from '@drawloom/agent';
import { AssetSchema, JsonValueSchema } from '@drawloom/host';
import { WorkbenchSchema, OperatorSnapshotSchema, OperatorCommandSchema } from '@drawloom/workbench';
import { ToolResultSchema } from '@drawloom/tools';
import { RegisteredWorkbenchViewSchema } from '@drawloom/plugins';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpUiMessageRequestSchema, McpUiUpdateModelContextRequestSchema } from '@modelcontextprotocol/ext-apps';
const id = z.string().min(1).max(256);
export const DesktopCatalogueSchema = z.strictObject({
  entries: z.array(DiscoveryEntrySchema.extend({ revision: z.string().min(1) })),
  categories: DiscoverySnapshotSchema.shape.categories,
  experimentalPluginDiscovery: z.boolean(),
});
export type DesktopCatalogue = z.infer<typeof DesktopCatalogueSchema>;
export const DiscoveryResourceReadSchema = DiscoverySelectionSchema.extend({ conversationId: id });
export const ToolStartSchema = z.strictObject({ kind: z.literal('started'), invocationId: z.string().min(1), operationId: z.string().min(1).optional(), tool: z.string().min(1) });
export const ConversationSchema = z.strictObject({ id, title: z.string().max(120), workbenchId: id, provider: z.enum(['synthetic', 'codex']), reviewer: AgentReviewerSchema.default('human') });
export const DesktopSnapshotSchema = z.strictObject({
  workspace: z.string(), conversations: z.array(ConversationSchema), workbenches: z.array(WorkbenchSchema),
  selectedId: id, operator: OperatorSnapshotSchema,
  activity: z.array(ToolResultSchema), signals: z.array(AgentSessionSignalSchema),
  pendingTools: z.array(ToolStartSchema).default([]),
  activeOperation: id.optional(), controls: z.strictObject({ steer: z.boolean(), interrupt: z.boolean(), reviewerModes: z.array(AgentReviewerSchema).default(['human']) }),
  plugins: z.array(z.strictObject({ id, status: z.enum(['ready', 'unavailable']), summary: z.string() })),
  notice: z.string(),
  activeContext: z.string().default(''),
  views: z.array(RegisteredWorkbenchViewSchema).default([]),
});
export type DesktopSnapshot = z.infer<typeof DesktopSnapshotSchema>;
export const DesktopStateUpdateSchema = z.strictObject({
  kind: z.enum(['snapshot', 'patch']), token: z.string().min(1),
  sections: z.record(z.string(), z.unknown()), removed: z.array(z.string()),
});
export const DesktopCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create_conversation'), workbenchId: id, provider: z.enum(['synthetic', 'codex']) }),
  z.strictObject({ kind: z.literal('select_conversation'), conversationId: id }),
  z.strictObject({ kind: z.literal('set_reviewer'), conversationId: id, reviewer: AgentReviewerSchema }),
  z.strictObject({ kind: z.literal('send'), conversationId: id, text: z.string().min(1).max(100000), attachmentKeys: z.array(id).max(16), contextArtifactIds: z.array(id).max(16), selections: z.array(DiscoverySelectionSchema).max(32).default([]), resourceSelections: z.array(z.strictObject({ entryId: id, resourceId: id })).max(16).default([]) }),
  z.strictObject({ kind: z.literal('stop'), conversationId: id }),
  z.strictObject({ kind: z.literal('operator'), workbenchId: id, command: OperatorCommandSchema }),
  z.strictObject({ kind: z.literal('approval'), conversationId: id, resolution: AgentApprovalResolutionSchema }),
  z.strictObject({ kind: z.literal('input'), conversationId: id, resolution: AgentInputResolutionSchema }),
]);
export type DesktopCommand = z.input<typeof DesktopCommandSchema>;
export const ImportSchema = z.strictObject({ conversationId: id.optional(), name: z.string().max(256), mediaType: z.string().max(128), base64: z.string().max(24 * 1024 * 1024) });
export const ProjectSchema = z.strictObject({ version: z.literal(1), conversations: z.array(ConversationSchema), selectedId: id, assets: z.array(AssetSchema) });
export const ConfigurationSchema = z.record(z.string(), JsonValueSchema);
export const ViewTargetSchema = z.strictObject({ conversationId: id, viewId: id });
export const ResourceReadSchema = z.strictObject({ conversationId: id, entryId: z.string().min(1).max(1024), resourceId: id });
export const ResourceOpenSchema = ViewTargetSchema.extend({ uri: z.string().min(1).max(4096) });
export const DesktopViewRequestSchema = ViewTargetSchema.extend({ request: CallToolRequestSchema.shape.params });
// Internal authenticated callback envelope; the iframe uses upstream MCP Apps.
export const DesktopViewInteractionSchema = ViewTargetSchema.extend({
  mountId: id,
  request: z.union([McpUiMessageRequestSchema, McpUiUpdateModelContextRequestSchema]),
});
// Internal authenticated parent lifecycle, not an MCP App method or plugin API.
export const DesktopViewSessionSchema = z.discriminatedUnion('action', [
  ViewTargetSchema.extend({ action: z.literal('open') }),
  ViewTargetSchema.extend({ action: z.literal('close'), mountId: id }),
]);

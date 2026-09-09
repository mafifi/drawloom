import { z } from 'zod';
import { AgentSessionSignalSchema, AgentApprovalResolutionSchema, AgentInputResolutionSchema } from '@drawloom/agent';
import { AssetSchema, JsonValueSchema } from '@drawloom/host';
import { WorkbenchSchema, OperatorSnapshotSchema, OperatorCommandSchema } from '@drawloom/workbench';
import { ToolResultSchema } from '@drawloom/tools';
const id = z.string().min(1).max(256);
export const ToolStartSchema = z.strictObject({ kind: z.literal('started'), invocationId: z.string().min(1), operationId: z.string().min(1).optional(), tool: z.string().min(1) });
export const ConversationSchema = z.strictObject({ id, title: z.string().max(120), workbenchId: id, provider: z.enum(['synthetic', 'codex']) });
export const MessageSchema = z.strictObject({ id, role: z.enum(['user', 'assistant']), text: z.string(), assets: z.array(AssetSchema), operationId: id.optional() });
export const DesktopSnapshotSchema = z.strictObject({
  workspace: z.string(), conversations: z.array(ConversationSchema), workbenches: z.array(WorkbenchSchema),
  selectedId: id, messages: z.array(MessageSchema), historyTruncated: z.boolean(), operator: OperatorSnapshotSchema,
  activity: z.array(ToolResultSchema), signals: z.array(AgentSessionSignalSchema),
  pendingTools: z.array(ToolStartSchema).default([]),
  activeOperation: id.optional(), controls: z.strictObject({ steer: z.boolean(), interrupt: z.boolean() }),
  plugins: z.array(z.strictObject({ id, status: z.enum(['ready', 'unavailable']), summary: z.string() })),
  notice: z.string(),
});
export type DesktopSnapshot = z.infer<typeof DesktopSnapshotSchema>;
export const DesktopCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create_conversation'), workbenchId: id, provider: z.enum(['synthetic', 'codex']) }),
  z.strictObject({ kind: z.literal('select_conversation'), conversationId: id }),
  z.strictObject({ kind: z.literal('send'), conversationId: id, text: z.string().min(1).max(100000), attachmentKeys: z.array(id).max(16), contextArtifactIds: z.array(id).max(16) }),
  z.strictObject({ kind: z.literal('stop'), conversationId: id }),
  z.strictObject({ kind: z.literal('operator'), workbenchId: id, command: OperatorCommandSchema }),
  z.strictObject({ kind: z.literal('approval'), conversationId: id, resolution: AgentApprovalResolutionSchema }),
  z.strictObject({ kind: z.literal('input'), conversationId: id, resolution: AgentInputResolutionSchema }),
]);
export type DesktopCommand = z.infer<typeof DesktopCommandSchema>;
export const ImportSchema = z.strictObject({ name: z.string().max(256), mediaType: z.string().max(128), base64: z.string().max(24 * 1024 * 1024) });
export const ProjectSchema = z.strictObject({ version: z.literal(1), conversations: z.array(ConversationSchema), selectedId: id, assets: z.array(AssetSchema) });
export const ConfigurationSchema = z.record(z.string(), JsonValueSchema);

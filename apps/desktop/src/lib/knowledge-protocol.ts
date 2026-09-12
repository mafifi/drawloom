import { z } from 'zod';
import { SearchRequestSchema, EvidenceRequestSchema, KnowledgeExportRequestSchema } from '@drawloom/knowledge';

/** Authenticated application API, not a plugin or MCP Apps protocol. Subject is host-owned. */
export const KnowledgeConfigurationSchema = z.strictObject({
  embeddingModel: z.literal('qwen3-embedding-0.6b-mlx'),
  assessmentModel: z.string().trim().min(1).max(128),
  assessmentTimeoutMs: z.number().int().min(1000).max(300000),
  maxAutomaticStartsPerDay: z.number().int().min(1).max(100),
  maxAutomaticMillisecondsPerDay: z.number().int().min(1000).max(86400000),
});
export type KnowledgeConfiguration = z.infer<typeof KnowledgeConfigurationSchema>;
export const KnowledgeStatusSchema = z.strictObject({
  availability: z.enum(['ready', 'unavailable', 'failed']),
  message: z.string().max(1024),
  configuration: KnowledgeConfigurationSchema,
  source: z.strictObject({ projectId: z.string().min(1).max(256), enabled: z.boolean() }).optional(),
  models: z.array(z.strictObject({
    id: z.literal('qwen3-embedding-0.6b-mlx'),
    title: z.string().max(128), licence: z.string().max(512), source: z.string().max(512),
    modelDirectory: z.string().max(4096), runtimeDirectory: z.string().max(4096), prerequisites: z.string().max(512),
    runtime: z.strictObject({ package: z.string(), version: z.string(), licence: z.string() }), weightsBytes: z.number().int().nonnegative(),
    state: z.enum(['missing', 'installing_runtime', 'downloading', 'verifying', 'cancelled', 'ready', 'failed']),
    receivedBytes: z.number().int().nonnegative().optional(),
    expectedBytes: z.number().int().nonnegative().optional(),
    message: z.string().max(512).optional(),
  })).length(1),
  indexing: z.enum(['unavailable', 'pending', 'indexing', 'ready', 'failed']),
  maintenance: z.strictObject({
    state: z.enum(['idle', 'running', 'paused', 'unavailable', 'uncertain', 'failed', 'budget_exhausted']),
    pendingUpdates: z.number().int().nonnegative(),
    message: z.string().max(1024),
    automaticStartsToday: z.number().int().nonnegative(),
    automaticMillisecondsToday: z.number().int().nonnegative(),
  }),
});
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export const KnowledgeCommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('status') }),
  z.strictObject({ action: z.literal('search'), request: SearchRequestSchema }),
  z.strictObject({ action: z.literal('evidence'), request: EvidenceRequestSchema }),
  z.strictObject({ action: z.literal('export'), request: KnowledgeExportRequestSchema }),
  z.strictObject({ action: z.literal('configure'), configuration: KnowledgeConfigurationSchema }),
  z.strictObject({ action: z.literal('source'), enabled: z.boolean() }),
  z.strictObject({ action: z.literal('run'), overrideBudget: z.boolean() }),
  z.strictObject({ action: z.literal('pause'), paused: z.boolean() }),
  z.strictObject({ action: z.literal('download'), model: z.literal('qwen3-embedding-0.6b-mlx'), consent: z.literal(true) }),
  z.strictObject({ action: z.literal('cancel_download'), model: z.literal('qwen3-embedding-0.6b-mlx') }),
]);
export type KnowledgeCommand = z.infer<typeof KnowledgeCommandSchema>;

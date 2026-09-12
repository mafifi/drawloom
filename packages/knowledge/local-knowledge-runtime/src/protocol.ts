import { z } from "zod";
import { KnownModelManifests } from "@drawloom/local-embeddings";

export const LocalKnowledgeConfigurationSchema = z.strictObject({
  embeddingModel: z.literal("qwen3-embedding-0.6b-mlx"),
  assessmentModel: z.string().trim().min(1).max(128),
  assessmentTimeoutMs: z.number().int().min(1000).max(300_000),
  maxAutomaticStartsPerDay: z.number().int().min(1).max(100),
  maxAutomaticMillisecondsPerDay: z.number().int().min(1000).max(86_400_000),
});
export type LocalKnowledgeConfiguration = z.infer<typeof LocalKnowledgeConfigurationSchema>;
export const DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION: LocalKnowledgeConfiguration = Object.freeze({
  embeddingModel: "qwen3-embedding-0.6b-mlx",
  assessmentModel: "gpt-5.6-terra",
  assessmentTimeoutMs: 300_000,
  maxAutomaticStartsPerDay: 6,
  maxAutomaticMillisecondsPerDay: 1_800_000,
});
const ModelStateSchema = z.enum(["missing", "installing_runtime", "downloading", "verifying", "cancelled", "ready", "failed"]);
export const LocalKnowledgeStatusSchema = z.strictObject({
  availability: z.enum(["ready", "unavailable", "failed"]),
  message: z.string().max(1024),
  configuration: LocalKnowledgeConfigurationSchema,
  models: z.array(z.strictObject({
    id: z.literal("qwen3-embedding-0.6b-mlx"),
    title: z.string().max(128), licence: z.string().max(512), source: z.string().max(512),
    modelDirectory: z.string().max(4096), runtimeDirectory: z.string().max(4096),
    prerequisites: z.string().max(512), runtime: z.strictObject({ package: z.string(), version: z.string(), licence: z.string() }),
    weightsBytes: z.number().int().nonnegative(),
    state: ModelStateSchema, receivedBytes: z.number().int().nonnegative().optional(), expectedBytes: z.number().int().nonnegative().optional(), message: z.string().max(512).optional(),
  })).length(Object.keys(KnownModelManifests).length),
  indexing: z.enum(["unavailable", "pending", "indexing", "ready", "failed"]),
  maintenance: z.strictObject({
    state: z.enum(["idle", "running", "paused", "unavailable", "uncertain", "failed", "budget_exhausted"]),
    pendingUpdates: z.number().int().nonnegative(), message: z.string().max(1024),
    automaticStartsToday: z.number().int().nonnegative(), automaticMillisecondsToday: z.number().int().nonnegative(),
  }),
});
export type LocalKnowledgeStatus = z.infer<typeof LocalKnowledgeStatusSchema>;

import { z } from "zod";

export const LocalLearningConfigurationSchema = z.strictObject({
  embeddingModel: z.literal("qwen3-embedding-0.6b-gguf"),
  assessmentModel: z.string().trim().min(1).max(128),
  assessmentTimeoutMs: z.number().int().min(1000).max(300000),
  maxAutomaticStartsPerDay: z.number().int().min(1).max(100),
  maxAutomaticMillisecondsPerDay: z.number().int().min(1000).max(86400000),
});
export type LocalLearningConfiguration = z.infer<typeof LocalLearningConfigurationSchema>;
export const LocalLearningSetupStatusSchema = z.strictObject({
  availability: z.enum(["ready", "unavailable", "failed"]),
  message: z.string().max(1024),
  obsoleteRuntimePresent: z.boolean().optional(),
  configuration: LocalLearningConfigurationSchema,
  models: z
    .array(
      z.strictObject({
        id: z.literal("qwen3-embedding-0.6b-gguf"),
        title: z.string().max(128),
        licence: z.string().max(512),
        source: z.string().max(512),
        modelDirectory: z.string().max(4096),
        runtimeDirectory: z.string().max(4096),
        prerequisites: z.string().max(512),
        runtime: z.strictObject({ package: z.string(), version: z.string(), licence: z.string() }),
        weightsBytes: z.number().int().nonnegative(),
        runtimeBytes: z.number().int().positive(),
        runtimeDownloadAvailable: z.boolean(),
        state: z.enum([
          "missing",
          "installing_runtime",
          "downloading",
          "verifying",
          "cancelled",
          "ready",
          "failed",
        ]),
        receivedBytes: z.number().int().nonnegative().optional(),
        expectedBytes: z.number().int().nonnegative().optional(),
        message: z.string().max(512).optional(),
      }),
    )
    .length(1),
  indexing: z.enum(["unavailable", "pending", "indexing", "ready", "failed"]),
});
export type LocalLearningSetupStatus = z.infer<typeof LocalLearningSetupStatusSchema>;
export const LocalLearningSetupCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status") }),
  z.strictObject({
    action: z.literal("configure"),
    configuration: LocalLearningConfigurationSchema,
  }),
  z.strictObject({
    action: z.literal("download"),
    model: z.literal("qwen3-embedding-0.6b-gguf"),
    consent: z.literal(true),
  }),
  z.strictObject({
    action: z.literal("cancel_download"),
    model: z.literal("qwen3-embedding-0.6b-gguf"),
  }),
  z.strictObject({ action: z.literal("cleanup_obsolete"), consent: z.literal(true) }),
]);

import { z } from "zod";
import {
  SearchRequestSchema,
  EvidenceRequestSchema,
  KnowledgeExportRequestSchema,
} from "@drawloom/knowledge";

/** Authenticated application API, not a plugin or MCP Apps protocol. Subject is host-owned. */
export const KnowledgeConfigurationSchema = z.strictObject({
  automaticContext: z.boolean().default(false),
  captureOutcomes: z.boolean().default(false),
  automaticCuration: z.boolean().default(false),
  embeddingModel: z.literal("qwen3-embedding-0.6b-gguf"),
  assessmentModel: z.string().trim().min(1).max(128),
  assessmentTimeoutMs: z.number().int().min(1000).max(300000),
  maxAutomaticStartsPerDay: z.number().int().min(1).max(100),
  maxAutomaticMillisecondsPerDay: z.number().int().min(1000).max(86400000),
});
export type KnowledgeConfiguration = z.infer<typeof KnowledgeConfigurationSchema>;
const KnowledgeCaptureStatusSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("idle"),
    pendingObservations: z.literal(0),
    message: z.literal(""),
  }),
  z.strictObject({
    state: z.literal("pending"),
    pendingObservations: z.union([z.number().int().positive().safe(), z.null()]),
    message: z.string().trim().min(1).max(1024),
  }),
]);
export const KnowledgeStatusSchema = z.strictObject({
  availability: z.enum(["ready", "unavailable", "failed"]),
  message: z.string().max(1024),
  // Existing host-owned setup/collection warning, independent of a saved source.
  sourceWarning: z.string().trim().min(1).max(1024).optional(),
  configuration: KnowledgeConfigurationSchema,
  capture: KnowledgeCaptureStatusSchema,
  obsoleteRuntimePresent: z.boolean().optional(),
  source: z
    .strictObject({
      projectId: z.string().min(1).max(256),
      enabled: z.boolean(),
      state: z.enum(["ready", "stopped", "unavailable"]),
      message: z.string().max(1024),
    })
    .optional(),
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
  maintenance: z.strictObject({
    // Persisted scheduling choice is independent of the latest maintenance outcome.
    paused: z.boolean(),
    state: z.enum([
      "idle",
      "running",
      "paused",
      "unavailable",
      "uncertain",
      "failed",
      "budget_exhausted",
    ]),
    pendingUpdates: z.number().int().nonnegative(),
    message: z.string().max(1024),
    automaticStartsToday: z.number().int().nonnegative(),
    automaticMillisecondsToday: z.number().int().nonnegative(),
  }),
});
export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export const KnowledgeCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status") }),
  z.strictObject({ action: z.literal("search"), request: SearchRequestSchema }),
  z.strictObject({ action: z.literal("evidence"), request: EvidenceRequestSchema }),
  z.strictObject({ action: z.literal("export"), request: KnowledgeExportRequestSchema }),
  z.strictObject({ action: z.literal("configure"), configuration: KnowledgeConfigurationSchema }),
  z.strictObject({ action: z.literal("source"), enabled: z.boolean() }),
  z.strictObject({ action: z.literal("run"), overrideBudget: z.boolean() }),
  z.strictObject({ action: z.literal("pause"), paused: z.boolean() }),
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
export type KnowledgeCommand = z.infer<typeof KnowledgeCommandSchema>;

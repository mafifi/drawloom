import { z } from "zod";
import {
  SearchRequestSchema,
  EvidenceRequestSchema,
  KnowledgeExportRequestSchema,
} from "@drawloom/knowledge";
import {
  LearningAvailabilitySchema,
  LearningCurationStatusSchema,
} from "@drawloom/knowledge/learning";
import {
  LearningConsentStatusSchema,
  LearningFeatureSchema,
  LearningPreferencesSchema,
  LearningProcessingScopeSchema,
} from "@drawloom/knowledge/consent";

/** Authenticated shared desktop API. Trusted startup alone selects implementations. */
export const LearningStatusSchema = LearningAvailabilitySchema.extend({
  consent: LearningConsentStatusSchema,
  sourceWarning: z.string().trim().min(1).max(1024).optional(),
  capture: z.discriminatedUnion("state", [
    z.strictObject({
      state: z.literal("idle"),
      pendingObservations: z.literal(0),
      message: z.literal(""),
    }),
    z.strictObject({
      state: z.literal("pending"),
      pendingObservations: z.union([z.number().int().positive().safe(), z.null()]),
      message: z.string().min(1).max(1024),
    }),
  ]),
  source: z
    .strictObject({
      projectId: z.string().min(1).max(256),
      enabled: z.boolean(),
      state: z.enum(["ready", "stopped", "unavailable"]),
      message: z.string().max(1024),
    })
    .optional(),
  curation: LearningCurationStatusSchema.optional(),
});
export type LearningStatus = z.infer<typeof LearningStatusSchema>;
export const LearningCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("status") }),
  z.strictObject({ action: z.literal("search"), request: SearchRequestSchema }),
  z.strictObject({ action: z.literal("evidence"), request: EvidenceRequestSchema }),
  z.strictObject({ action: z.literal("export"), request: KnowledgeExportRequestSchema }),
  z.strictObject({ action: z.literal("preferences"), preferences: LearningPreferencesSchema }),
  z.strictObject({
    action: z.literal("confirm"),
    feature: LearningFeatureSchema,
    scope: LearningProcessingScopeSchema,
  }),
  z.strictObject({ action: z.literal("source"), enabled: z.boolean() }),
  z.strictObject({ action: z.literal("run"), overrideBudget: z.boolean() }),
  z.strictObject({ action: z.literal("pause"), paused: z.boolean() }),
]);
export type LearningCommand = z.infer<typeof LearningCommandSchema>;

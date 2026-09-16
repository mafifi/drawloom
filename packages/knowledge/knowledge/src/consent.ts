import { z } from "zod";

/** Preferences express intent. Only a matching host-owned grant permits processing. */
export const LearningFeatureSchema = z.enum([
  "captureOutcomes",
  "automaticContext",
  "automaticCuration",
]);
export type LearningFeature = z.infer<typeof LearningFeatureSchema>;
export const LearningPreferencesSchema = z.strictObject({
  captureOutcomes: z.boolean(),
  automaticContext: z.boolean(),
  automaticCuration: z.boolean(),
});
export type LearningPreferences = z.infer<typeof LearningPreferencesSchema>;
const Labels = z
  .array(z.string().trim().min(1).max(256))
  .min(1)
  .max(32)
  .refine((values) => new Set(values).size === values.length, "Duplicate processing label");

/** Identifiers are supplied by trusted setup, not a model or browser declaration. */
export const LearningProcessingScopeSchema = z.strictObject({
  purpose: z.string().trim().min(1).max(256),
  dataCategories: Labels,
  destinations: Labels,
  boundaries: Labels,
});
export type LearningProcessingScope = z.infer<typeof LearningProcessingScopeSchema>;
export const LearningProcessingDeclarationSchema = z.strictObject({
  captureOutcomes: LearningProcessingScopeSchema,
  automaticContext: LearningProcessingScopeSchema,
  automaticCuration: LearningProcessingScopeSchema,
});
export type LearningProcessingDeclaration = z.infer<typeof LearningProcessingDeclarationSchema>;
export const LearningConsentGrantSchema = z.strictObject({
  scope: LearningProcessingScopeSchema,
  provenance: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("confirmation"), recordedAt: z.iso.datetime() }),
    z.strictObject({
      kind: z.literal("migration"),
      source: z.literal("local-learning-configuration"),
      recordedAt: z.iso.datetime(),
    }),
  ]),
});
export const LearningConsentRecordSchema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().positive().safe(),
  preferences: LearningPreferencesSchema,
  grants: z.strictObject({
    captureOutcomes: LearningConsentGrantSchema.optional(),
    automaticContext: LearningConsentGrantSchema.optional(),
    automaticCuration: LearningConsentGrantSchema.optional(),
  }),
  origin: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("new"), recordedAt: z.iso.datetime() }),
    z.strictObject({
      kind: z.literal("migration"),
      source: z.literal("local-learning-configuration"),
      scopeEstablished: z.boolean(),
      recordedAt: z.iso.datetime(),
    }),
  ]),
});
export type LearningConsentRecord = z.infer<typeof LearningConsentRecordSchema>;
export const LearningFeatureConsentSchema = z.strictObject({
  preferred: z.boolean(),
  state: z.enum(["disabled", "enabled", "consent_required"]),
  scope: LearningProcessingScopeSchema,
});
export const LearningConsentStatusSchema = z.strictObject({
  revision: z.number().int().positive().safe(),
  features: z.strictObject({
    captureOutcomes: LearningFeatureConsentSchema,
    automaticContext: LearningFeatureConsentSchema,
    automaticCuration: LearningFeatureConsentSchema,
  }),
});
export type LearningConsentStatus = z.infer<typeof LearningConsentStatusSchema>;

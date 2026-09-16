import { z } from "zod";
import type { AuthorizationEvaluationOptions } from "@drawloom/authorization";
import type {
  EvidenceRequest,
  EvidenceResult,
  IntakeInput,
  IntakeResult,
  KnowledgeExportRequest,
  KnowledgeExportResult,
  SearchRequest,
  SearchResult,
} from "./index.js";

/** Shared desktop facts. Model names, installation paths and downloads are local setup. */
export const LearningAvailabilitySchema = z.strictObject({
  availability: z.enum(["ready", "unavailable", "failed"]),
  message: z.string().max(1024),
  retrieval: z.enum(["lexical", "hybrid", "rebuilding", "unavailable"]),
});
export type LearningAvailability = z.infer<typeof LearningAvailabilitySchema>;
export const LearningCurationStatusSchema = z.strictObject({
  state: z.enum([
    "idle",
    "running",
    "paused",
    "unavailable",
    "uncertain",
    "failed",
    "budget_exhausted",
  ]),
  message: z.string().max(1024),
  paused: z.boolean(),
  /** Outstanding durable ownership, independent from the displayed phase. */
  active: z.boolean(),
  pendingUpdates: z.number().int().nonnegative(),
  automaticStartsToday: z.number().int().nonnegative(),
  automaticMillisecondsToday: z.number().int().nonnegative(),
});
export type LearningCurationStatus = z.infer<typeof LearningCurationStatusSchema>;
export const LearningCurationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("started"), runId: z.string().min(1).max(256) }),
  z.strictObject({
    kind: z.enum([
      "idle",
      "busy",
      "paused",
      "uncertain",
      "budget_exhausted",
      "unavailable",
      "cancelled",
      "consent_required",
    ]),
  }),
]);
export type LearningCurationResult = z.infer<typeof LearningCurationResultSchema>;
export const LearningControlResultSchema = z.strictObject({
  kind: z.enum(["ready", "unavailable", "cancelled"]),
});
export type LearningControlResult = z.infer<typeof LearningControlResultSchema>;

/** Offered capabilities are complete objects, not optional methods discovered by name.
 * The host supplies effective consent; an enabled preference alone is not permission. */
export interface LearningCuration {
  status(): Promise<LearningCurationStatus>;
  setAutomatic(enabled: boolean): Promise<LearningControlResult>;
  run(overrideBudget: boolean): Promise<LearningCurationResult>;
  pause(): Promise<LearningControlResult>;
  resume(): Promise<LearningControlResult>;
}
export interface LearningWarmup {
  run(signal: AbortSignal): Promise<LearningControlResult>;
}
/** A trusted composition binds identity/access to the retained knowledge contracts.
 * This is their application-facing composition, not a second storage or memory API.
 * Context preparation and implementation-specific setup are supplied independently. */
export interface LearningService {
  readonly capabilities: { readonly curation?: LearningCuration; readonly warmup?: LearningWarmup };
  status(): Promise<LearningAvailability>;
  ingest(input: IntakeInput, options?: AuthorizationEvaluationOptions): Promise<IntakeResult>;
  search(request: SearchRequest, options?: AuthorizationEvaluationOptions): Promise<SearchResult>;
  evidence(
    request: EvidenceRequest,
    options?: AuthorizationEvaluationOptions,
  ): Promise<EvidenceResult>;
  export(
    request: KnowledgeExportRequest,
    options?: AuthorizationEvaluationOptions,
  ): Promise<KnowledgeExportResult>;
  /** Stops owned background work and releases resources; does not remove retained data. */
  close(): Promise<void>;
}

import { z } from "zod";

export const evidenceReferenceSchema = z.object({
  assetKey: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.string().min(1),
  size: z.number().int().positive(),
});

export const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  revision: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  expected: z.unknown().optional(),
  suppliedOutput: z.unknown().optional(),
  evidence: z.array(evidenceReferenceSchema).default([]),
});
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const findingSchema = z.object({
  scorerId: z.string(),
  scorerRevision: z.string(),
  score: z.number().min(0).max(1).optional(),
  explanation: z.string().optional(),
  error: z.string().optional(),
}).refine((value) => value.score !== undefined || value.error !== undefined || value.explanation !== undefined)
  .refine((value) => !(value.score !== undefined && value.error !== undefined));
export type Finding = z.infer<typeof findingSchema>;

export const evaluationResultSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  caseId: z.string(),
  caseRevision: z.string(),
  targetId: z.string(),
  targetRevision: z.string(),
  trial: z.number().int().positive(),
  status: z.enum(["scored", "unscored", "target-error", "denied", "cancelled", "timed-out", "uncertain", "invalid-input", "invalid-output"]),
  output: z.unknown().optional(),
  findings: z.array(findingSchema),
  durationMs: z.number().nonnegative(),
  usage: z.object({ costUsd: z.number().nonnegative().optional() }),
  evidence: z.array(evidenceReferenceSchema),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

export type EvaluationMode = "assess-existing" | "experiment";
export const feedbackSchema = z.object({ resultId: z.string().min(1), attribution: z.string().min(1), rating: z.enum(["correct", "incorrect", "uncertain"]), correction: z.string().optional() });
export class ExecutionFailure extends Error {
  readonly status: Exclude<EvaluationResult["status"], "scored">;
  constructor(status: Exclude<EvaluationResult["status"], "scored">, message: string) { super(message); this.status = status; }
}
export type Target = {
  id: string;
  revision: string;
  inputSchema: z.ZodType<Record<string, unknown>>;
  outputSchema: z.ZodType<unknown>;
  run(input: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<unknown>;
};
export type Scorer = {
  id: string;
  revision: string;
  score(args: { input: Readonly<Record<string, unknown>>; output: unknown; expected?: unknown; evidence: readonly z.infer<typeof evidenceReferenceSchema>[]; signal: AbortSignal }): Promise<Omit<Finding, "scorerId" | "scorerRevision">>;
};
export type RunRequest = {
  experimentId: string;
  mode: EvaluationMode;
  cases: readonly EvaluationCase[];
  target?: Target;
  scorers: readonly Scorer[];
  repetitions: number;
  concurrency: number;
  signal?: AbortSignal;
  onProgress?: (event: { type: "case-started" | "case-finished"; caseId: string; trial: number }) => void;
};
export type RunnerMetrics = { targetCalls: number; scorerCalls: number; peakConcurrency: number };
export type RunResponse = { results: EvaluationResult[]; metrics: RunnerMetrics };
export type EvaluationRunner = { adapter: string; run(request: RunRequest): Promise<RunResponse> };

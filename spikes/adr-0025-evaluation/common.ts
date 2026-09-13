import { ExactMatch } from "autoevals";
import { z } from "zod";
import { ExecutionFailure, evaluationCaseSchema, evaluationResultSchema, type EvaluationResult, type Finding, type RunRequest, type RunnerMetrics, type Scorer } from "./contract.ts";

export function validateRequest(request: RunRequest): void {
  if (request.mode !== "assess-existing" && request.mode !== "experiment") throw new Error("mode must be assess-existing or experiment");
  if (!request.experimentId.trim()) throw new Error("experiment identity is required");
  if (!Number.isInteger(request.repetitions) || request.repetitions < 1 || request.repetitions > 100) throw new Error("repetitions must be between 1 and 100");
  if (!Number.isInteger(request.concurrency) || request.concurrency < 1 || request.concurrency > 32) throw new Error("concurrency must be between 1 and 32");
  if (request.cases.length < 1 || request.cases.length > 100) throw new Error("cases must be between 1 and 100");
  if (new Set(request.cases.map((item) => item.id)).size !== request.cases.length) throw new Error("case identities must be unique");
  if (request.scorers.length < 1 || request.scorers.some((item) => !item.id.trim() || !item.revision.trim())) throw new Error("at least one identified scorer is required");
  if (new Set(request.scorers.map((item) => item.id)).size !== request.scorers.length) throw new Error("scorer identities must be unique");
  if (request.mode === "experiment" && !request.target) throw new Error("experiment mode requires a target");
  for (const candidate of request.cases) evaluationCaseSchema.parse(candidate);
}

export function statusFromError(error: unknown): EvaluationResult["status"] {
  return error instanceof ExecutionFailure ? error.status : "target-error";
}

export const autoevalsExactScorer: Scorer = { id: "autoevals-exact", revision: "0.3.0", async score({ output, expected }) {
  const result = await ExactMatch({ output, expected });
  return { ...(result.score === null ? {} : { score: result.score }), explanation: "Autoevals ExactMatch." };
} };

export function findingError(id: string, revision: string, error: unknown): Finding {
  return { scorerId: id, scorerRevision: revision, error: error instanceof Error ? error.message : String(error) };
}

const scorerOutputSchema = z.object({ score: z.number().min(0).max(1).optional(), explanation: z.string().optional(), error: z.string().optional() })
  .refine((value) => value.score !== undefined || value.error !== undefined || value.explanation !== undefined)
  .refine((value) => !(value.score !== undefined && value.error !== undefined));

export async function callScorer(scorer: Scorer, args: Parameters<Scorer["score"]>[0]): Promise<Finding> {
  try { return { scorerId: scorer.id, scorerRevision: scorer.revision, ...scorerOutputSchema.parse(await scorer.score(args)) }; }
  catch (error) { return findingError(scorer.id, scorer.revision, error instanceof z.ZodError ? new Error("Invalid scorer output") : error); }
}

export function parseTargetInput(request: RunRequest, input: Record<string, unknown>): Record<string, unknown> {
  try { return request.target!.inputSchema.parse(input); }
  catch { throw new ExecutionFailure("invalid-input", "Target input failed its runtime schema"); }
}

export function parseTargetOutput(request: RunRequest, output: unknown): unknown {
  try { return request.target!.outputSchema.parse(output); }
  catch { throw new ExecutionFailure("invalid-output", "Target output failed its runtime schema"); }
}

export function finalResult(value: EvaluationResult): EvaluationResult { return evaluationResultSchema.parse(value); }

export function createCounters() {
  const metrics: RunnerMetrics = { targetCalls: 0, scorerCalls: 0, peakConcurrency: 0 };
  let active = 0;
  return {
    metrics,
    targetStarted() { metrics.targetCalls += 1; active += 1; metrics.peakConcurrency = Math.max(metrics.peakConcurrency, active); },
    targetSettled() { active -= 1; },
    scorerCalled() { metrics.scorerCalls += 1; },
  };
}

export function stableResultId(experimentId: string, caseId: string, trial: number): string {
  return `${experimentId}:${caseId}:trial-${trial}`;
}

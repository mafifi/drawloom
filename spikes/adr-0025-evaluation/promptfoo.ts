import { evaluate } from "promptfoo";
import type { EvaluationResult, EvaluationRunner, Finding, RunRequest } from "./contract.ts";
import { callScorer, createCounters, finalResult, parseTargetInput, parseTargetOutput, stableResultId, statusFromError, validateRequest } from "./common.ts";

type Captured = { caseId: string; trial: number; started: number; settledAt?: number; output?: unknown; status: EvaluationResult["status"]; findings: Finding[]; pending: Set<string> };
type VendorOutput = { token: string; value: unknown };

export function createPromptfooRunner(): EvaluationRunner {
  return { adapter: "promptfoo", run: runPromptfoo };
}

async function runPromptfoo(request: RunRequest) {
  validateRequest(request);
  const counters = createCounters();
  const captures = new Map<string, Captured[]>();
  const byId = new Map(request.cases.map((item) => [item.id, item]));
  const provider = {
    id: () => `drawloom:${request.target?.id ?? "existing"}`,
    callApi: async (_prompt: string, context?: { vars?: Record<string, unknown> }, options?: { abortSignal?: AbortSignal }) => {
      const caseId = String(context?.vars?.caseId ?? "");
      const item = byId.get(caseId);
      if (!item) return { error: "invalid input: unknown case" };
      const records = captures.get(caseId) ?? [];
      const captured: Captured = { caseId, trial: records.length + 1, started: performance.now(), status: "scored", findings: [], pending: new Set() };
      records.push(captured); captures.set(caseId, records);
      request.onProgress?.({ type: "case-started", caseId, trial: captured.trial });
      if (request.signal?.aborted || options?.abortSignal?.aborted) { captured.status = "cancelled"; return { error: "cancelled before target start" }; }
      try {
        if (request.mode === "assess-existing") captured.output = item.suppliedOutput;
        else {
          const parsedInput = parseTargetInput(request, item.input);
          counters.targetStarted();
          try {
            captured.output = parseTargetOutput(request, await request.target!.run(Object.freeze({ ...parsedInput }), request.signal ?? options?.abortSignal ?? new AbortController().signal));
          }
          finally { counters.targetSettled(); }
        }
        return { output: JSON.stringify({ token: `${caseId}:${captured.trial}`, value: captured.output } satisfies VendorOutput) };
      } catch (error) {
        captured.status = statusFromError(error);
        captured.settledAt = performance.now();
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
  const assertions = request.scorers.map((scorer) => ({
    type: "javascript" as const,
    metric: scorer.id,
    value: async (serialized: string, context: { vars?: Record<string, unknown> }) => {
      const caseId = String(context.vars?.caseId ?? "");
      const item = byId.get(caseId)!;
      const token = (JSON.parse(serialized) as VendorOutput).token;
      const trial = Number(token.split(":").at(-1));
      const captured = captures.get(caseId)?.find((record) => record.trial === trial);
      if (!captured || captured.status !== "scored") return { pass: false, score: 0, reason: "Target did not produce a scorable output" };
      if (request.signal?.aborted) return { pass: false, score: 0, reason: "cancelled before scorer start" };
      captured.pending.add(scorer.id);
      counters.scorerCalled();
      try {
        const finding = await callScorer(scorer, { input: item.input, output: captured.output, ...(item.expected === undefined ? {} : { expected: item.expected }), evidence: item.evidence, signal: request.signal ?? new AbortController().signal });
        captured.findings.push(finding);
        if (captured.findings.length === request.scorers.length) captured.settledAt = performance.now();
        return { pass: finding.score !== undefined && finding.score >= 0.5, score: finding.score ?? 0, reason: finding.explanation ?? "Scored" };
      } catch (error) {
        captured.findings.push({ scorerId: scorer.id, scorerRevision: scorer.revision, error: error instanceof Error ? error.message : String(error) });
        return { pass: false, score: 0, reason: `scorer error: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  }));
  await evaluate({
    prompts: ["{{caseId}}"], providers: [provider],
    tests: request.cases.map((item) => ({ vars: { caseId: item.id }, assert: assertions })),
    writeLatestResults: false, sharing: false,
  }, { cache: false, maxConcurrency: request.concurrency, repeat: request.repetitions });
  for (const records of captures.values()) for (const captured of records) {
    if (captured.status === "scored" && captured.findings.length < request.scorers.length) captured.status = "unscored";
  }
  if (request.signal?.aborted) for (const item of request.cases) {
    const records = captures.get(item.id) ?? [];
    while (records.length < request.repetitions) records.push({ caseId: item.id, trial: records.length + 1, started: performance.now(), status: "cancelled", findings: [], pending: new Set() });
    captures.set(item.id, records);
  }
  for (const [caseId, records] of captures) for (const captured of records) request.onProgress?.({ type: "case-finished", caseId, trial: captured.trial });
  const results = request.cases.flatMap((item) => (captures.get(item.id) ?? []).map((captured) => finalResult({
    id: stableResultId(request.experimentId, item.id, captured.trial), experimentId: request.experimentId,
    caseId: item.id, caseRevision: item.revision, targetId: request.target?.id ?? "existing-output", targetRevision: request.target?.revision ?? "1",
    trial: captured.trial, status: captured.status, ...(captured.output === undefined ? {} : { output: captured.output }), findings: captured.findings,
    durationMs: (captured.settledAt ?? performance.now()) - captured.started, usage: {}, evidence: item.evidence,
  })));
  return { results, metrics: counters.metrics };
}

import { Eval } from "braintrust";
import type { EvaluationResult, EvaluationRunner, Finding, RunRequest } from "./contract.ts";
import { callScorer, createCounters, finalResult, parseTargetInput, parseTargetOutput, stableResultId, statusFromError, validateRequest } from "./common.ts";

type Metadata = { caseId: string; caseRevision: string; evidence: RunRequest["cases"][number]["evidence"] };
type Captured = { trial: number; started: number; settledAt?: number; status: EvaluationResult["status"]; output?: unknown; findings: Finding[]; pending: Set<string> };
type VendorOutput = { token: string; value: unknown };

export function createBraintrustRunner(): EvaluationRunner { return { adapter: "braintrust", run: runBraintrust }; }

async function runBraintrust(request: RunRequest) {
  validateRequest(request);
  const counters = createCounters();
  const captures = new Map<string, Captured[]>();
  const inFlight = new Set<Promise<unknown>>();
  const inFlightScorers = new Set<Promise<unknown>>();
  try { await Eval<Record<string, unknown>, VendorOutput, unknown, Metadata>(request.experimentId, {
    // Retained full-decode consumers need a bounded allowance above the
    // runner's historical 30-second per-case behavior.
    timeout: 120_000,
    data: request.cases.map((item) => ({ input: item.input, expected: item.expected, metadata: { caseId: item.id, caseRevision: item.revision, evidence: item.evidence } })),
    trialCount: request.repetitions,
    maxConcurrency: request.concurrency,
    ...(request.signal ? { signal: request.signal } : {}),
    task: async (input, hooks) => {
      const caseId = hooks.metadata.caseId;
      const records = captures.get(caseId) ?? [];
      const captured: Captured = { trial: records.length + 1, started: performance.now(), status: "scored", findings: [], pending: new Set() };
      records.push(captured); captures.set(caseId, records);
      request.onProgress?.({ type: "case-started", caseId, trial: captured.trial });
      if (request.signal?.aborted) { captured.status = "cancelled"; throw new Error("cancelled before target start"); }
      try {
        if (request.mode === "assess-existing") captured.output = request.cases.find((item) => item.id === caseId)!.suppliedOutput;
        else {
          const parsedInput = parseTargetInput(request, input);
          counters.targetStarted();
          const operation = (async () => {
            return parseTargetOutput(request, await request.target!.run(Object.freeze({ ...parsedInput }), request.signal ?? new AbortController().signal));
          })();
          inFlight.add(operation);
          try { captured.output = await operation; }
          finally { inFlight.delete(operation); counters.targetSettled(); }
        }
        return { token: `${caseId}:${captured.trial}`, value: captured.output };
      } catch (error) { captured.status = statusFromError(error); captured.settledAt = performance.now(); throw error; }
    },
    scores: request.scorers.map((scorer) => async ({ input, output, expected, metadata }) => {
      const scoring = (async () => {
      const trial = Number(output.token.split(":").at(-1));
      const captured = captures.get(metadata.caseId)?.at(trial - 1);
      if (request.signal?.aborted) return { name: scorer.id, score: null, metadata: { error: "cancelled before scorer start" } };
      counters.scorerCalled();
      captured?.pending.add(scorer.id);
      try {
        const finding = await callScorer(scorer, { input, output: output.value, ...(expected === undefined ? {} : { expected }), evidence: metadata.evidence, signal: request.signal ?? new AbortController().signal });
        captured?.findings.push(finding);
        if (captured?.findings.length === request.scorers.length) captured.settledAt = performance.now();
        return { name: scorer.id, score: finding.score ?? null, metadata: { explanation: finding.explanation } };
      } catch (error) {
        captured?.findings.push({ scorerId: scorer.id, scorerRevision: scorer.revision, error: error instanceof Error ? error.message : String(error) });
        return { name: scorer.id, score: null, metadata: { error: error instanceof Error ? error.message : String(error) } };
      }
      })();
      inFlightScorers.add(scoring);
      try { return await scoring; } finally { inFlightScorers.delete(scoring); }
    }),
    errorScoreHandler: () => undefined,
  }, { noSendLogs: true, returnResults: true, enableCache: false }); } catch (error) {
    if (!request.signal?.aborted) throw error;
  }
  await Promise.allSettled([...inFlight]);
  await Promise.allSettled([...inFlightScorers]);
  for (const records of captures.values()) for (const captured of records) {
    if (captured.status === "scored" && captured.findings.length < request.scorers.length) captured.status = "unscored";
  }
  if (request.signal?.aborted) for (const item of request.cases) {
    const records = captures.get(item.id) ?? [];
    while (records.length < request.repetitions) records.push({ trial: records.length + 1, started: performance.now(), status: "cancelled", findings: [], pending: new Set() });
    captures.set(item.id, records);
  }
  for (const [caseId, records] of captures) for (const captured of records) request.onProgress?.({ type: "case-finished", caseId, trial: captured.trial });
  const results = request.cases.flatMap((item) => (captures.get(item.id) ?? []).map((captured, index) => finalResult({
    id: stableResultId(request.experimentId, item.id, index + 1), experimentId: request.experimentId,
    caseId: item.id, caseRevision: item.revision, targetId: request.target?.id ?? "existing-output", targetRevision: request.target?.revision ?? "1", trial: index + 1,
    status: captured.status, ...(captured.output === undefined ? {} : { output: captured.output }), findings: captured.findings,
    durationMs: (captured.settledAt ?? performance.now()) - captured.started, usage: {}, evidence: item.evidence,
  })));
  return { results, metrics: counters.metrics };
}

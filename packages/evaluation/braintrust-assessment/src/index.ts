import { Eval } from "braintrust";
import { ExactMatch, Levenshtein } from "autoevals";
import { z } from "zod";
import type { AgentDriver, AgentOperationUsage, AgentSessionSignal } from "@drawloom/agent";
import {
  EvaluationJsonSchema,
  ScorerInvocationResultSchema,
  type EvaluationAssessmentProvider,
  type EvaluationInvocationContext,
  type EvaluationJson,
  type EvaluationScorer,
  type Finding,
  type ScorerInvocationResult,
} from "@drawloom/evaluation";

export const AUTOEVALS_EXACT_MATCH_SCORER = Object.freeze({ id: "autoevals.exact-match", revision: "0.3.0" });
export const AUTOEVALS_LEVENSHTEIN_SCORER = Object.freeze({ id: "autoevals.levenshtein", revision: "0.3.0" });
export const AGENT_RUBRIC_SCORER = Object.freeze({ id: "drawloom.agent-rubric", revision: "1" });

const autoevalsExactMatchScorer: EvaluationScorer = Object.freeze({
  ...AUTOEVALS_EXACT_MATCH_SCORER,
  input: EvaluationJsonSchema,
  output: EvaluationJsonSchema,
  expected: EvaluationJsonSchema,
  async score({ output, expected }: Parameters<EvaluationScorer["score"]>[0]): Promise<ScorerInvocationResult> {
    if (expected === undefined) return { outcome: "succeeded", findings: [{ id: "exact-match", name: "Exact match", outcome: "unscored", explanation: "Exact match requires expected material.", references: [] }] };
    const value = await ExactMatch({ output, expected });
    const finding: Finding = value.score === null
      ? { id: "exact-match", name: "Exact match", outcome: "unscored", explanation: "Autoevals ExactMatch returned no score.", references: [] }
      : { id: "exact-match", name: "Exact match", outcome: "scored", score: value.score, explanation: "Autoevals ExactMatch.", references: [] };
    return { outcome: "succeeded", findings: [finding] };
  },
});

const autoevalsLevenshteinScorer: EvaluationScorer<string, string, string> = Object.freeze({
  ...AUTOEVALS_LEVENSHTEIN_SCORER,
  input: z.string(), output: z.string(), expected: z.string(),
  async score({ output, expected }: Parameters<EvaluationScorer<string, string, string>["score"]>[0]): Promise<ScorerInvocationResult> {
    if (expected === undefined) return { outcome: "succeeded", findings: [{ id: "levenshtein", name: "Levenshtein similarity", outcome: "unscored", explanation: "Levenshtein similarity requires expected material.", references: [] }] };
    const value = await Levenshtein({ output, expected });
    const finding: Finding = value.score === null
      ? { id: "levenshtein", name: "Levenshtein similarity", outcome: "unscored", explanation: "Autoevals Levenshtein returned no score.", references: [] }
      : { id: "levenshtein", name: "Levenshtein similarity", outcome: "scored", score: value.score, explanation: "Autoevals Levenshtein.", references: [] };
    return { outcome: "succeeded", findings: [finding] };
  },
});

export interface BraintrustAssessmentOptions {
  /** Additional host-owned built-ins, such as an explicitly configured managed judge. */
  readonly scorers?: readonly EvaluationScorer[];
}

/** Braintrust is used only as a single local assessment envelope, never as the case scheduler. */
export function createBraintrustAssessmentProvider(options: BraintrustAssessmentOptions = {}): EvaluationAssessmentProvider {
  const scorers = Object.freeze([autoevalsExactMatchScorer, autoevalsLevenshteinScorer, ...(options.scorers ?? [])]);
  const seen = new Set<string>();
  for (const scorer of scorers) {
    const key = `${scorer.id}\u0000${scorer.revision}`;
    if (seen.has(key)) throw new Error(`Duplicate assessment scorer ${scorer.id}@${scorer.revision}`);
    seen.add(key);
  }
  const provider: EvaluationAssessmentProvider = {
    scorers,
    async assess(scorer, args, context) {
      let captured: ScorerInvocationResult | undefined;
      let activeAssessment: Promise<ScorerInvocationResult> | undefined;
      const scorerContext: EvaluationInvocationContext = { ...context, signal: AbortSignal.any([context.signal]) };
      try {
        await Eval<EvaluationJson, EvaluationJson, void, {}>("drawloom-individual-assessment", {
          data: [{ input: args.input, metadata: {} }],
          task: () => args.output,
          scores: [async () => {
            activeAssessment = Promise.resolve(scorer.score(args, scorerContext)).then((value) => ScorerInvocationResultSchema.parse(value));
            captured = await activeAssessment;
            const values = captured.findings.map((finding) => ({ name: finding.id, score: finding.outcome === "scored" ? finding.score! : null, metadata: { outcome: finding.outcome } }));
            return values.length ? values : [{ name: "drawloom-assessment", score: null, metadata: { outcome: captured.outcome } }];
          }],
          trialCount: 1,
          maxConcurrency: 1,
          signal: scorerContext.signal,
        }, { noSendLogs: true, returnResults: false, enableCache: false });
      } catch (error) {
        if (!activeAssessment) throw error;
        captured = await activeAssessment;
      }
      if (!captured) throw new Error("Braintrust did not complete the individual assessment");
      return captured;
    },
  };
  return Object.freeze(provider);
}

export const AgentRubricConfigurationSchema = z.strictObject({
  rubric: z.string().min(1).max(8192),
});
export type AgentRubricConfiguration = z.infer<typeof AgentRubricConfigurationSchema>;

const judgeResponse = z.strictObject({ score: z.number().finite().min(0).max(1).nullable(), explanation: z.string().min(1).max(8192) });
const encoder = new TextEncoder();
const MAX_JUDGE_REQUEST_BYTES = 128 * 1024;

export interface AgentRubricScorerOptions {
  readonly driver?: AgentDriver;
  /** Configured selection only. It is not measured per-response actual-model telemetry. */
  readonly configuredModel?: string;
}

function judgeFailure(code: string, message: string, outcome: ScorerInvocationResult["outcome"] = "failed"): ScorerInvocationResult {
  return ScorerInvocationResultSchema.parse({ outcome, findings: [{ id: "agent-rubric", name: "Agent rubric", outcome: "error", error: { code, message }, references: [] }] });
}

function withCleanupFailure(result: ScorerInvocationResult): ScorerInvocationResult {
  return ScorerInvocationResultSchema.parse({
    ...result,
    outcome: "uncertain",
    findings: [...result.findings, {
      id: "agent-rubric-cleanup",
      name: "Agent rubric cleanup",
      outcome: "error",
      error: { code: "cleanup_failed", message: "Managed judge cleanup is unresolved" },
      references: [],
    }],
  });
}

function parseJudgeResponse(response: string | undefined): z.infer<typeof judgeResponse> | undefined {
  if (response === undefined) return undefined;
  try {
    const parsed = judgeResponse.safeParse(JSON.parse(response));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Host-owned optional scorer. The AgentDriver never crosses into plugin or browser context. */
export function createAgentRubricScorer(options: AgentRubricScorerOptions): EvaluationScorer {
  const configuredModel = options.configuredModel === undefined ? undefined : z.string().min(1).max(256).parse(options.configuredModel);
  return Object.freeze({
    ...AGENT_RUBRIC_SCORER,
    input: EvaluationJsonSchema,
    output: EvaluationJsonSchema,
    expected: EvaluationJsonSchema,
    async score(args: { readonly input: EvaluationJson; readonly output: EvaluationJson; readonly expected?: EvaluationJson; readonly configuration?: EvaluationJson }, context: EvaluationInvocationContext): Promise<ScorerInvocationResult> {
      const configuration = AgentRubricConfigurationSchema.safeParse(args.configuration);
      if (!configuration.success) return judgeFailure("invalid_rubric", "Agent rubric configuration is invalid");
      if (!configuredModel || !options.driver) return judgeFailure("judge_unavailable", "Agent rubric requires an explicitly configured model and host agent driver", "uncertain");
      const prompt = [
        "Assess the supplied output against the rubric. Do not call tools, delegate, edit files, or take external actions.",
        "Return only JSON with this shape: {\"score\": number|null, \"explanation\": string}.",
        `Rubric: ${configuration.data.rubric}`,
        `Input: ${JSON.stringify(args.input)}`,
        `Output: ${JSON.stringify(args.output)}`,
        ...(args.expected === undefined ? [] : [`Expected: ${JSON.stringify(args.expected)}`]),
      ].join("\n");
      if (encoder.encode(prompt).byteLength > MAX_JUDGE_REQUEST_BYTES) return judgeFailure("request_too_large", "Agent rubric request exceeds the local bound");
      if (context.signal.aborted) return judgeFailure("judge_interrupted", "Configured agent judge was cancelled before submission", "cancelled");
      const opened = await options.driver.openSession({ sessionId: `evaluation-${context.invocationId}`, context: { text: "This is a bounded evaluation-only session. Follow the requested rubric and do not use tools." }, tools: { id: "evaluation-none", tools: [] } });
      if (opened.status !== "ok") return judgeFailure("judge_unavailable", "Configured agent judge is unavailable", opened.failure.code === "provider_unavailable" ? "uncertain" : "failed");
      const session = opened.value;
      const operationId = context.invocationId;
      const abort = () => {
        try { void session.interrupt?.(operationId).catch(() => undefined); } catch { /* best effort only */ }
      };
      let result: ScorerInvocationResult;
      let listening = false;
      try {
        if (context.signal.aborted) {
          result = judgeFailure("judge_interrupted", "Configured agent judge was cancelled before submission", "cancelled");
        } else {
          context.signal.addEventListener("abort", abort, { once: true });
          listening = true;
          const signals = session.signals();
          const submitted = await session.execute({ operationId, text: prompt });
          if (submitted.status !== "ok") {
            result = judgeFailure("judge_rejected", "Configured agent judge rejected the request", submitted.failure.code === "provider_unavailable" ? "uncertain" : "failed");
          } else {
            let terminal: Extract<AgentSessionSignal, { kind: "operation.completed" | "operation.interrupted" | "operation.failed" }> | undefined;
            let response: string | undefined;
            let unexpectedActivity = false;
            let unexpectedInterruptionFailed = false;
            const interruptUnexpectedActivity = async (): Promise<boolean> => {
              if (unexpectedActivity) return !unexpectedInterruptionFailed;
              unexpectedActivity = true;
              if (!session.interrupt) { unexpectedInterruptionFailed = true; return false; }
              try {
                const interrupted = await session.interrupt(operationId);
                if (interrupted.status !== "ok") unexpectedInterruptionFailed = true;
              } catch { unexpectedInterruptionFailed = true; }
              return !unexpectedInterruptionFailed;
            };
            for await (const signal of signals) {
              if ("operationId" in signal && signal.operationId !== operationId) continue;
              if (signal.kind === "message.completed" && signal.role !== "user" && (signal.phase === undefined || signal.phase === "final")) response = signal.text;
              if (signal.kind === "artifact.available" || signal.kind === "approval.requested" || signal.kind === "input.requested") {
                if (!await interruptUnexpectedActivity()) break;
              }
              if (signal.kind === "provider.observation" && !["usage", "reasoning-summary"].includes(signal.name)) {
                if (!await interruptUnexpectedActivity()) break;
              }
              if (["operation.completed", "operation.interrupted", "operation.failed"].includes(signal.kind)) { terminal = signal as typeof terminal; break; }
            }
            const nativeSettlementUnconfirmed = terminal?.kind === "operation.failed"
              && ["provider_unavailable", "invalid_provider_response"].includes(terminal.failure.code);
            if (unexpectedActivity) {
              result = judgeFailure("unexpected_activity", "Agent judge reported unexpected activity", !terminal || nativeSettlementUnconfirmed || unexpectedInterruptionFailed ? "uncertain" : "failed");
            } else if (!terminal) {
              result = judgeFailure("judge_unavailable", "Configured agent judge ended without a terminal result", "uncertain");
            } else if (nativeSettlementUnconfirmed) {
              result = judgeFailure("judge_unavailable", "Configured agent judge ended without confirmed native settlement", "uncertain");
            } else if (terminal.kind !== "operation.completed") {
              result = judgeFailure(terminal.kind === "operation.interrupted" ? "judge_interrupted" : "judge_failed", "Configured agent judge did not complete", context.signal.aborted ? "cancelled" : "failed");
            } else {
              const parsed = parseJudgeResponse(response);
              if (!parsed) {
                result = judgeFailure("invalid_judge_response", "Agent judge response is invalid");
              } else {
                const finding: Finding = parsed.score === null
                  ? { id: "agent-rubric", name: "Agent rubric", outcome: "unscored", explanation: parsed.explanation, references: [] }
                  : { id: "agent-rubric", name: "Agent rubric", outcome: "scored", score: parsed.score, explanation: parsed.explanation, references: [] };
                result = ScorerInvocationResultSchema.parse({
                  outcome: "succeeded", findings: [finding],
                  ...(terminal.usage ? { usage: terminal.usage as AgentOperationUsage } : {}),
                  ...(configuredModel ? { model: { requested: configuredModel } } : {}),
                });
              }
            }
          }
        }
      } catch {
        result = judgeFailure("judge_unavailable", "Configured agent judge failed before a terminal result", context.signal.aborted ? "cancelled" : "uncertain");
      } finally {
        if (listening) context.signal.removeEventListener("abort", abort);
      }
      let cleaned = false;
      for (let attempt = 0; attempt < 2 && !cleaned; attempt++) {
        try { cleaned = (await session.close()).status === "ok"; } catch { /* retry cleanup only */ }
      }
      return cleaned ? result : withCleanupFailure(result);
    },
  });
}

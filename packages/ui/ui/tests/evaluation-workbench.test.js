import { beforeAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { render } from "svelte/server";

let EvaluationWorkbench;
beforeAll(async () => {
  ({ EvaluationWorkbench } = await import("@drawloom/ui"));
});
const presentation = {
  copy: {
    title: "Quality checks",
    definitionsHeading: "Checks",
    runsHeading: "Runs",
    resultsHeading: "Cases",
    feedbackHeading: "Advisory feedback",
    emptyDefinitions: "No checks saved.",
    emptyRuns: "No runs saved.",
    emptyResults: "No cases saved.",
    start: "Start check",
    starting: "Starting check",
    cancel: "Request cancellation",
    cancelling: "Requesting cancellation",
    saveFeedback: "Save feedback",
    savingFeedback: "Saving feedback",
    usageUnknown: "Usage not reported",
    executionLabels: {
      saved: "Saved",
      start_uncertain: "Start uncertain",
      running: "Running",
      cancellationRequested: "Cancellation requested",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
      uncertain: "Uncertain",
      unavailable: "Starts unavailable",
    },
  },
  definitions: [
    {
      ref: { id: "check", revision: "r1" },
      name: "Non-default check",
      mode: "assess_existing",
      caseCount: 1,
      scorerCount: 1,
    },
  ],
  runs: [
    {
      schemaVersion: 1,
      id: "run",
      requestId: "request",
      definition: { id: "check", revision: "r1" },
      settings: { repetitions: 1, concurrency: 1 },
      createdAtMs: 1,
    },
  ],
  results: [
    {
      schemaVersion: 1,
      id: "result",
      runId: "run",
      caseId: "case",
      caseRevision: "r1",
      trial: 0,
      status: "completed",
      scorerInvocationIds: ["score"],
      startedAtMs: 1,
      completedAtMs: 2,
      findingCount: 1,
    },
  ],
  selectedDefinition: {
    ref: { id: "check", revision: "r1" },
    name: "Non-default check",
    mode: "assess_existing",
    caseCount: 1,
    scorerCount: 1,
  },
  selectedRun: undefined,
  selectedResult: undefined,
  baselineResultId: "",
  startReadiness: { status: "ready" },
  feedback: [],
  feedbackDraft: { attribution: "", rating: undefined, correction: "" },
  definitionsLoading: false,
  runsLoading: false,
  resultLoading: false,
  targetLoading: false,
  scorerLoading: false,
  feedbackLoading: false,
  startPending: false,
  cancelPending: false,
  feedbackPending: false,
  hasMoreDefinitions: false,
  hasMoreRuns: false,
  hasMoreResults: false,
  error: "",
  detailError: "",
  feedbackError: "",
  execution: undefined,
  detail: undefined,
  selectedTarget: undefined,
  selectedScorer: undefined,
  baseline: undefined,
  comparison: undefined,
};
const actions = {
  selectDefinition() {},
  start() {},
  selectRun() {},
  refreshRun() {},
  cancel() {},
  selectResult() {},
  selectTarget() {},
  selectScorer() {},
  selectBaseline() {},
  setBaselineResultId() {},
  setFeedback() {},
  saveFeedback() {},
  reloadFeedback() {},
  moreDefinitions() {},
  latestDefinitions() {},
  moreRuns() {},
  latestRuns() {},
  moreResults() {},
  latestResults() {},
};

describe("EvaluationWorkbench controlled presentation", () => {
  test("exports a real reusable component with injected headings and semantic navigation", () => {
    const html = render(EvaluationWorkbench, { props: { presentation, actions } }).body;
    expect(EvaluationWorkbench).toBeTypeOf("function");
    expect(html).toContain("Quality checks");
    expect(html).toContain("Non-default check");
    expect(html).toContain("<nav");
    expect(html).toContain("Start check");
  });
  test("only the active command presents pending feedback and durable errors stay inline", () => {
    const html = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          startPending: true,
          error: "Saved reads remain available.",
        },
        actions,
      },
    }).body;
    expect(html.match(/aria-busy="true"/g)).toHaveLength(1);
    expect(html).toContain("Starting check");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Saved reads remain available.");
  });
  test("feedback fields have labels and unknown usage is not rendered as zero", () => {
    const html = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          selectedRun: presentation.runs[0],
          selectedResult: presentation.results[0],
          detail: {
            result: presentation.results[0],
            scorers: [
              {
                schemaVersion: 1,
                invocationId: "score",
                runId: "run",
                caseId: "case",
                caseRevision: "r1",
                trial: 0,
                scorer: { id: "criterion", revision: "r1" },
                outcome: "succeeded",
                findings: [
                  { id: "finding", name: "Criterion", outcome: "scored", score: 1, references: [] },
                ],
                startedAtMs: 1,
                completedAtMs: 2,
              },
            ],
            findings: [
              { id: "finding", name: "Criterion", outcome: "scored", score: 1, references: [] },
            ],
          },
        },
        actions,
      },
    }).body;
    expect(html).toContain('for="evaluation-feedback-attribution"');
    expect(html).toContain('for="evaluation-feedback-rating"');
    expect(html).toContain('for="evaluation-feedback-correction"');
    expect(html).toContain("Usage not reported");
    expect(html).not.toContain("0 tokens");
  });
  test("selected result identities retain wrapping opportunities on narrow surfaces", () => {
    const revision = "a".repeat(64);
    const selectedResult = {
      ...presentation.results[0],
      id: `result-${revision}`,
      caseId: "saved-master",
      caseRevision: revision,
    };
    const html = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          results: [selectedResult],
          selectedRun: presentation.runs[0],
          selectedResult,
        },
        actions,
      },
    }).body;
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*break-all[^"]*">saved-master@a{64}/);
    expect(html).toMatch(/class="[^"]*break-all[^"]*">Result result-a{64}/);
  });
  test("renders retained target and finding evidence in combined detail and checkpoint fallbacks", () => {
    const reference = {
      id: "evidence",
      source: "fixture",
      uri: "asset://evidence",
      revision: "rev-2",
    };
    const target = {
      schemaVersion: 1,
      invocationId: "target",
      runId: "run",
      caseId: "case",
      caseRevision: "r1",
      trial: 0,
      target: { id: "model", revision: "r1" },
      outcome: "failed",
      error: { code: "target_failed", message: "Target failure evidence" },
      references: [reference],
      usage: { totalTokens: 9 },
      startedAtMs: 1,
      completedAtMs: 2,
    };
    const checkpoint = {
      schemaVersion: 1,
      invocationId: "score",
      runId: "run",
      caseId: "case",
      caseRevision: "r1",
      trial: 0,
      scorer: { id: "criterion", revision: "r1" },
      outcome: "failed",
      findings: [
        {
          id: "finding",
          name: "Criterion",
          outcome: "error",
          explanation: "Finding explanation",
          error: { code: "criterion_failed", message: "Finding error evidence" },
          references: [reference],
        },
      ],
      startedAtMs: 1,
      completedAtMs: 2,
    };
    const selectedResult = { ...presentation.results[0], targetInvocationId: "target" };
    const combined = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          selectedRun: presentation.runs[0],
          selectedResult,
          detail: {
            result: selectedResult,
            target,
            scorers: [checkpoint],
            findings: checkpoint.findings,
          },
        },
        actions,
      },
    }).body;
    expect(combined).toContain("Target failure evidence");
    expect(combined).toContain("9 total tokens");
    expect(combined).toContain("Finding explanation");
    expect(combined).toContain("Finding error evidence");
    expect(combined).toContain("asset://evidence");

    const fallback = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          selectedRun: presentation.runs[0],
          selectedResult,
          selectedTarget: target,
          selectedScorer: checkpoint,
        },
        actions,
      },
    }).body;
    expect(fallback).toContain("Inspect target target");
    expect(fallback).toContain("Target failure evidence");
    expect(fallback).toContain("Finding explanation");
    expect(fallback).toContain("Finding error evidence");
    expect(fallback).toContain("asset://evidence");
  });
  test("authoritative unavailable readiness disables start and keeps its setup reason beside the action", () => {
    const html = render(EvaluationWorkbench, {
      props: {
        presentation: {
          ...presentation,
          startReadiness: { status: "unavailable", reason: "Configure orchestration." },
        },
        actions,
      },
    }).body;
    expect(html).toContain("Configure orchestration.");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Start check/);
    expect(html).toContain("Refresh setup");
  });
});

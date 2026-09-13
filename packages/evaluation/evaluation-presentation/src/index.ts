import {
  EvaluationFeedbackSchema,
  EvaluationReadinessSchema,
  type DefinitionSummary,
  type EvaluationCancelResult,
  type EvaluationCase,
  type EvaluationDefinition,
  type EvaluationDefinitionHeader,
  type EvaluationExecutionStatus,
  type EvaluationFeedback,
  type EvaluationPageOptions,
  type EvaluationReadiness,
  type EvaluationResultView,
  type EvaluationRun,
  type EvaluationService,
  type FeedbackPageOptions,
  type ResultPageOptions,
  type ResultSummary,
  type ScorerCheckpoint,
  type TargetCheckpoint,
  type VersionedReference,
} from "@drawloom/evaluation";

export interface EvaluationPresentationClient extends Pick<EvaluationService,
  "readiness" | "assess" | "run" | "status" | "cancel" | "getDefinition" |
  "getDefinitionHeader" | "getCase" | "listDefinitions" | "getRun" |
  "listRuns" | "getResultSummary" | "getResult" | "listResults" |
  "getTargetCheckpoint" | "getScorerCheckpoint" | "listFeedback" | "saveFeedback"> {}

export const evaluationCopy = Object.freeze({
  title: "Evaluation",
  definitionsHeading: "Checks",
  runsHeading: "Runs",
  resultsHeading: "Cases",
  feedbackHeading: "Advisory feedback",
  emptyDefinitions: "No saved checks are available.",
  emptyRuns: "No saved runs are available.",
  emptyResults: "No case results are available.",
  start: "Start check",
  starting: "Starting check",
  cancel: "Request cancellation",
  cancelling: "Requesting cancellation",
  saveFeedback: "Save feedback",
  savingFeedback: "Saving feedback",
  usageUnknown: "Usage not reported",
  executionLabels: Object.freeze({
    saved: "Saved",
    start_uncertain: "Start uncertain",
    running: "Running",
    cancellationRequested: "Cancellation requested",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    uncertain: "Uncertain",
    unavailable: "Starts unavailable",
  }),
});

export interface EvaluationFeedbackDraft {
  readonly attribution: string;
  readonly rating?: EvaluationFeedback["rating"];
  readonly correction: string;
}

export type FindingComparison = {
  readonly scorer: VersionedReference;
  readonly findingId: string;
  readonly name: string;
  readonly current?: { readonly outcome: string; readonly score?: number };
  readonly baseline?: { readonly outcome: string; readonly score?: number };
};

export type EvaluationComparison =
  | { readonly kind: "comparable"; readonly findings: readonly FindingComparison[] }
  | { readonly kind: "incomparable"; readonly reason: string };

export interface EvaluationBaselinePresentation {
  readonly summary: ResultSummary;
  readonly detail?: EvaluationResultView;
  readonly header?: EvaluationDefinitionHeader;
  readonly selectedCase?: EvaluationCase;
}

export interface EvaluationPresentation {
  readonly copy: typeof evaluationCopy;
  readonly definitions: readonly DefinitionSummary[];
  readonly runs: readonly EvaluationRun[];
  readonly results: readonly ResultSummary[];
  readonly selectedDefinition: DefinitionSummary | undefined;
  readonly selectedRun: EvaluationRun | undefined;
  readonly selectedResult: ResultSummary | undefined;
  readonly selectedHeader: EvaluationDefinitionHeader | undefined;
  readonly selectedCase: EvaluationCase | undefined;
  readonly startReadiness: EvaluationReadiness;
  readonly execution: EvaluationExecutionStatus | undefined;
  readonly detail: EvaluationResultView | undefined;
  readonly selectedTarget: TargetCheckpoint | undefined;
  readonly selectedScorer: ScorerCheckpoint | undefined;
  readonly baseline: EvaluationBaselinePresentation | undefined;
  readonly baselineResultId: string;
  readonly comparison: EvaluationComparison | undefined;
  readonly feedback: readonly EvaluationFeedback[];
  readonly feedbackDraft: EvaluationFeedbackDraft;
  readonly definitionsLoading: boolean;
  readonly runsLoading: boolean;
  readonly resultLoading: boolean;
  readonly targetLoading: boolean;
  readonly scorerLoading: boolean;
  readonly feedbackLoading: boolean;
  readonly startPending: boolean;
  readonly cancelPending: boolean;
  readonly feedbackPending: boolean;
  readonly hasMoreDefinitions: boolean;
  readonly hasMoreRuns: boolean;
  readonly hasMoreResults: boolean;
  readonly error: string;
  readonly detailError: string;
  readonly feedbackError: string;
}

export interface EvaluationActions {
  selectDefinition(ref: VersionedReference): void;
  start(): Promise<void>;
  selectRun(runId: string): Promise<void>;
  refreshRun(): Promise<void>;
  cancel(): Promise<void>;
  selectResult(resultId: string): Promise<void>;
  selectTarget(): Promise<void>;
  selectScorer(invocationId: string): Promise<void>;
  selectBaseline(resultId: string): Promise<void>;
  setBaselineResultId(resultId: string): void;
  setFeedback(value: Partial<EvaluationFeedbackDraft>): void;
  saveFeedback(): Promise<void>;
  reloadFeedback(): Promise<void>;
  moreDefinitions(): Promise<void>;
  latestDefinitions(): Promise<void>;
  moreRuns(): Promise<void>;
  latestRuns(): Promise<void>;
  moreResults(): Promise<void>;
  latestResults(): Promise<void>;
}

export interface EvaluationViewModel {
  readonly presentation: EvaluationPresentation;
  readonly actions: EvaluationActions;
  open(): Promise<void>;
  close(): void;
  subscribe(listener: (presentation: EvaluationPresentation) => void): () => void;
}

type ResultContext = {
  summary: ResultSummary;
  run: EvaluationRun;
  header: EvaluationDefinitionHeader;
  selectedCase: EvaluationCase;
  detail?: EvaluationResultView;
};

const EMPTY_DRAFT: EvaluationFeedbackDraft = Object.freeze({ attribution: "", correction: "" });

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameScorers(a: EvaluationDefinitionHeader, b: EvaluationDefinitionHeader): boolean {
  const identity = (value: EvaluationDefinitionHeader["scorers"][number]) => stable({ id: value.id, revision: value.revision, configuration: value.configuration });
  return stable(a.scorers.map(identity).sort()) === stable(b.scorers.map(identity).sort());
}

function compare(current: ResultContext, baseline: ResultContext): EvaluationComparison {
  if (current.summary.caseId !== baseline.summary.caseId || current.summary.caseRevision !== baseline.summary.caseRevision) {
    return { kind: "incomparable", reason: "Case identities or revisions do not match." };
  }
  if (stable(current.selectedCase.input) !== stable(baseline.selectedCase.input) || stable(current.selectedCase.expected) !== stable(baseline.selectedCase.expected)) {
    return { kind: "incomparable", reason: "Case input or expected material does not match." };
  }
  if (!sameScorers(current.header, baseline.header)) return { kind: "incomparable", reason: "Criterion revisions or configurations do not match." };
  if (!current.detail || !baseline.detail) return { kind: "incomparable", reason: "Combined details are unavailable. Inspect one scorer checkpoint at a time." };
  const byFinding = (view: EvaluationResultView) => new Map(view.scorers.flatMap(checkpoint => checkpoint.findings.map(finding => [stable([checkpoint.scorer.id, checkpoint.scorer.revision, finding.id]), { checkpoint, finding }] as const)));
  const currentFindings = byFinding(current.detail), baselineFindings = byFinding(baseline.detail);
  const keys = [...new Set([...currentFindings.keys(), ...baselineFindings.keys()])].sort();
  return { kind: "comparable", findings: keys.map(key => {
    const currentItem = currentFindings.get(key), baselineItem = baselineFindings.get(key), item = currentItem ?? baselineItem!;
    return {
      scorer: item.checkpoint.scorer,
      findingId: item.finding.id,
      name: item.finding.name,
      ...(currentItem ? { current: { outcome: currentItem.finding.outcome, ...(currentItem.finding.score === undefined ? {} : { score: currentItem.finding.score }) } } : {}),
      ...(baselineItem ? { baseline: { outcome: baselineItem.finding.outcome, ...(baselineItem.finding.score === undefined ? {} : { score: baselineItem.finding.score }) } } : {}),
    };
  }) };
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message.slice(0, 512) : fallback;
}

export function createEvaluationViewModel(options: {
  readonly client: EvaluationPresentationClient;
  readonly nextId?: () => string;
  readonly clock?: () => number;
}): EvaluationViewModel {
  const client = options.client;
  const nextId = options.nextId ?? (() => crypto.randomUUID());
  const clock = options.clock ?? (() => Date.now());
  const listeners = new Set<(presentation: EvaluationPresentation) => void>();
  let definitions: DefinitionSummary[] = [], runs: EvaluationRun[] = [], results: ResultSummary[] = [];
  let selectedDefinition: DefinitionSummary | undefined, selectedRun: EvaluationRun | undefined, selectedResult: ResultSummary | undefined;
  let selectedHeader: EvaluationDefinitionHeader | undefined, selectedCase: EvaluationCase | undefined;
  let startReadiness: EvaluationReadiness = { status: "unavailable", reason: "Start availability is being checked." };
  let execution: EvaluationExecutionStatus | undefined, detail: EvaluationResultView | undefined, selectedTarget: TargetCheckpoint | undefined, selectedScorer: ScorerCheckpoint | undefined;
  let baseline: EvaluationBaselinePresentation | undefined, comparison: EvaluationComparison | undefined;
  let baselineResultId = "";
  const drafts = new Map<string, EvaluationFeedbackDraft>(), feedbackIntents = new Map<string, EvaluationFeedback>();
  const feedbackPages = new Map<string, readonly EvaluationFeedback[]>(), feedbackErrors = new Map<string, string>();
  const feedbackLoadingResults = new Set<string>(), feedbackSavingResults = new Set<string>(), feedbackReadVersions = new Map<string, number>();
  const startIntents = new Map<string, string>(), startsInFlight = new Set<string>();
  let definitionsLoading = false, runsLoading = false, resultLoading = false, targetLoading = false, scorerLoading = false;
  let cancelPending = false, opened = false;
  let hasMoreDefinitions = false, hasMoreRuns = false, hasMoreResults = false;
  let definitionCursor: string | undefined, runCursor: string | undefined, resultCursor: string | undefined;
  let definitionPageCursor: string | undefined, runPageCursor: string | undefined, resultPageCursor: string | undefined;
  let error = "", detailError = "";
  let life = 0, definitionsVersion = 0, runsVersion = 0, resultVersion = 0, readinessVersion = 0;
  let runSelectionVersion = 0, resultSelectionVersion = 0, targetVersion = 0, scorerVersion = 0, baselineVersion = 0, cancelVersion = 0;

  const presentation: EvaluationPresentation = {
    copy: evaluationCopy,
    get definitions() { return definitions; }, get runs() { return runs; }, get results() { return results; },
    get selectedDefinition() { return selectedDefinition; }, get selectedRun() { return selectedRun; }, get selectedResult() { return selectedResult; },
    get selectedHeader() { return selectedHeader; }, get selectedCase() { return selectedCase; }, get startReadiness() { return startReadiness; },
    get execution() { return execution; }, get detail() { return detail; }, get selectedTarget() { return selectedTarget; }, get selectedScorer() { return selectedScorer; },
    get baseline() { return baseline; }, get baselineResultId() { return baselineResultId; }, get comparison() { return comparison; },
    get feedback() { return selectedResult ? feedbackPages.get(selectedResult.id) ?? [] : []; },
    get feedbackDraft() { return selectedResult ? drafts.get(selectedResult.id) ?? EMPTY_DRAFT : EMPTY_DRAFT; },
    get definitionsLoading() { return definitionsLoading; }, get runsLoading() { return runsLoading; }, get resultLoading() { return resultLoading; },
    get targetLoading() { return targetLoading; }, get scorerLoading() { return scorerLoading; },
    get feedbackLoading() { return selectedResult ? feedbackLoadingResults.has(selectedResult.id) : false; }, get startPending() { return selectedDefinition ? startsInFlight.has(stable(selectedDefinition.ref)) : false; },
    get cancelPending() { return cancelPending; }, get feedbackPending() { return selectedResult ? feedbackSavingResults.has(selectedResult.id) : false; }, get hasMoreDefinitions() { return hasMoreDefinitions; },
    get hasMoreRuns() { return hasMoreRuns; }, get hasMoreResults() { return hasMoreResults; }, get error() { return error; },
    get detailError() { return detailError; }, get feedbackError() { return selectedResult ? feedbackErrors.get(selectedResult.id) ?? "" : ""; },
  };
  const changed = () => { for (const listener of listeners) listener(presentation); };

  async function readDefinitions(after?: string) {
    const version = ++definitionsVersion, active = life; definitionsLoading = true; error = ""; changed();
    try {
      const page = await client.listDefinitions({ limit: 50, ...(after ? { after } : {}) });
      if (active !== life || version !== definitionsVersion) return;
      definitions = page.items; definitionCursor = page.cursor; definitionPageCursor = after; hasMoreDefinitions = page.hasMore;
      if (selectedDefinition) selectedDefinition = page.items.find(item => stable(item.ref) === stable(selectedDefinition!.ref)) ?? selectedDefinition;
    } catch (cause) { if (active === life && version === definitionsVersion) error = message(cause, "Saved checks are unavailable."); }
    finally { if (active === life && version === definitionsVersion) { definitionsLoading = false; changed(); } }
  }
  async function readRuns(after?: string) {
    const version = ++runsVersion, active = life; runsLoading = true; error = ""; changed();
    try {
      const page = await client.listRuns({ limit: 50, ...(after ? { after } : {}) });
      if (active !== life || version !== runsVersion) return;
      runs = page.items; runCursor = page.cursor; runPageCursor = after; hasMoreRuns = page.hasMore;
    } catch (cause) { if (active === life && version === runsVersion) error = message(cause, "Saved runs are unavailable."); }
    finally { if (active === life && version === runsVersion) { runsLoading = false; changed(); } }
  }
  async function readResults(after?: string) {
    if (!selectedRun) return;
    const runId = selectedRun.id, version = ++resultVersion, active = life; resultLoading = true; error = ""; changed();
    try {
      const page = await client.listResults({ runId, limit: 50, ...(after ? { after } : {}) });
      if (active !== life || version !== resultVersion || selectedRun?.id !== runId) return;
      results = page.items; resultCursor = page.cursor; resultPageCursor = after; hasMoreResults = page.hasMore;
    } catch (cause) { if (active === life && version === resultVersion) error = message(cause, "Case results are unavailable."); }
    finally { if (active === life && version === resultVersion) { resultLoading = false; changed(); } }
  }
  async function resultContext(summary: ResultSummary): Promise<ResultContext> {
    const run = await client.getRun(summary.runId);
    if (!run) throw Error("The saved evaluation run is unavailable.");
    const header = await client.getDefinitionHeader(run.definition);
    if (!header) throw Error("The saved evaluation definition is unavailable.");
    const caseValue = await client.getCase(run.definition, summary.caseId);
    if (!caseValue || caseValue.revision !== summary.caseRevision) throw Error("The saved evaluation case is unavailable.");
    return { summary, run, header, selectedCase: caseValue };
  }
  async function readReadiness() {
    const version = ++readinessVersion, active = life;
    startReadiness = { status: "unavailable", reason: "Checking evaluation setup." }; changed();
    try {
      const next = EvaluationReadinessSchema.parse(await client.readiness());
      if (active === life && version === readinessVersion) startReadiness = next;
    } catch (cause) {
      if (active === life && version === readinessVersion) startReadiness = { status: "unavailable", reason: message(cause, "Start availability could not be read.") };
    } finally { if (active === life && version === readinessVersion) changed(); }
  }
  async function reloadFeedbackFor(resultId: string) {
    const version = (feedbackReadVersions.get(resultId) ?? 0) + 1, active = life;
    feedbackReadVersions.set(resultId, version); feedbackLoadingResults.add(resultId); feedbackErrors.delete(resultId); changed();
    try {
      const page = await client.listFeedback({ resultId, limit: 50 });
      if (active === life && feedbackReadVersions.get(resultId) === version) feedbackPages.set(resultId, page.items);
    } catch (cause) {
      if (active === life && feedbackReadVersions.get(resultId) === version) feedbackErrors.set(resultId, message(cause, "Feedback is unavailable."));
    } finally {
      if (active === life && feedbackReadVersions.get(resultId) === version) { feedbackLoadingResults.delete(resultId); changed(); }
    }
  }
  async function reloadFeedback() { if (selectedResult) await reloadFeedbackFor(selectedResult.id); }
  async function selectRun(runId: string) {
    const selection = ++runSelectionVersion, active = life;
    const candidate = runs.find(item => item.id === runId) ?? await client.getRun(runId);
    if (active !== life || selection !== runSelectionVersion || !candidate) return;
    runsVersion++; resultVersion++; resultSelectionVersion++; targetVersion++; scorerVersion++; baselineVersion++; cancelVersion++;
    selectedRun = candidate; selectedResult = undefined; selectedHeader = undefined; selectedCase = undefined; detail = undefined; detailError = "";
    selectedTarget = undefined; selectedScorer = undefined; targetLoading = false; scorerLoading = false; baseline = undefined; comparison = undefined; baselineResultId = "";
    results = []; resultCursor = undefined; resultPageCursor = undefined; execution = undefined; cancelPending = false; error = ""; changed();
    const [statusResult] = await Promise.allSettled([client.status(candidate.id), readResults()]);
    if (active !== life || selection !== runSelectionVersion || selectedRun?.id !== candidate.id) return;
    execution = statusResult.status === "fulfilled" ? statusResult.value : { kind: "unavailable", evaluationRunId: candidate.id, reason: "Execution status is unavailable." };
    changed();
  }
  async function selectResult(resultId: string) {
    const selection = ++resultSelectionVersion, active = life;
    targetVersion++; scorerVersion++; baselineVersion++;
    const listed = results.find(item => item.id === resultId);
    selectedResult = listed; selectedHeader = undefined; selectedCase = undefined; detail = undefined; selectedTarget = undefined; selectedScorer = undefined;
    targetLoading = false; scorerLoading = false; baseline = undefined; comparison = undefined; baselineResultId = ""; detailError = ""; resultLoading = true; changed();
    try {
      const summary = listed ?? await client.getResultSummary(resultId);
      if (!summary || summary.id !== resultId) throw Error("The selected case result is unavailable.");
      if (active !== life || selection !== resultSelectionVersion) return;
      selectedResult = summary; changed();
      const context = await resultContext(summary);
      let detailFailure = "";
      try {
        const view = await client.getResult(summary.id);
        if (view && view.result.id !== summary.id) throw Error("Evaluation result identity changed.");
        if (view) context.detail = view;
      } catch (cause) {
        detailFailure = `${message(cause, "Combined result detail is unavailable.")} The saved summary remains available; inspect one retained checkpoint at a time.`;
      }
      if (active !== life || selection !== resultSelectionVersion || selectedResult?.id !== resultId) return;
      selectedHeader = context.header; selectedCase = context.selectedCase; detail = context.detail; detailError = detailFailure; changed();
      await reloadFeedbackFor(resultId);
    } catch (cause) { if (active === life && selection === resultSelectionVersion) detailError = message(cause, "The selected result is unavailable."); }
    finally { if (active === life && selection === resultSelectionVersion) { resultLoading = false; changed(); } }
  }
  async function start() {
    if (!selectedDefinition) return;
    const selection = selectedDefinition, selectedKey = stable(selection.ref), active = life;
    if (startsInFlight.has(selectedKey)) return;
    if (startReadiness.status !== "ready") { error = startReadiness.reason ?? "Starts are unavailable."; changed(); return; }
    const requestId = startIntents.get(selectedKey) ?? nextId();
    startIntents.set(selectedKey, requestId); startsInFlight.add(selectedKey); error = ""; changed();
    let submitted = false;
    try {
      const selected = await client.getDefinition(selection.ref);
      if (!selected || selected.id !== selection.ref.id || selected.revision !== selection.ref.revision) throw Error("The selected saved check is unavailable.");
      submitted = true;
      const request = { requestId, definition: selected };
      const result = selected.mode === "assess_existing" ? await client.assess(request) : await client.run(request);
      const stillSelected = () => selectedDefinition?.ref.id === selection.ref.id && selectedDefinition.ref.revision === selection.ref.revision;
      if (result.kind === "unavailable") {
        if (active === life && stillSelected()) { startReadiness = { status: "unavailable", reason: result.reason }; error = result.reason; }
        return;
      }
      if (result.kind === "uncertain") {
        if (active === life && stillSelected()) error = "The start outcome is uncertain. Retrying will reconcile the same request identity.";
        return;
      }
      if (startIntents.get(selectedKey) === requestId) startIntents.delete(selectedKey);
      if (active !== life) return;
      const created = await client.getRun(result.evaluationRunId);
      await readRuns();
      if (created && stillSelected() && active === life) await selectRun(created.id);
    } catch (cause) {
      if (!submitted && startIntents.get(selectedKey) === requestId) startIntents.delete(selectedKey);
      if (active === life) error = message(cause, "The evaluation could not be started.");
    } finally { startsInFlight.delete(selectedKey); changed(); }
  }
  async function cancel() {
    if (!selectedRun || cancelPending) return;
    const runId = selectedRun.id, selection = runSelectionVersion, operation = ++cancelVersion, active = life;
    cancelPending = true; error = ""; changed();
    const current = () => active === life && selection === runSelectionVersion && operation === cancelVersion && selectedRun?.id === runId;
    try {
      const result: EvaluationCancelResult = await client.cancel(runId);
      if (!current()) return;
      if (result.kind === "requested") execution = { kind: "running", evaluationRunId: runId, orchestrationRunId: result.orchestrationRunId, cancellationRequested: true };
      else if (result.kind === "terminal") {
        const next = await client.status(runId);
        if (!current()) return;
        execution = next;
      } else if (result.kind === "not_started") execution = { kind: "saved", evaluationRunId: runId };
      else if (result.kind === "uncertain") error = "Cancellation could not be confirmed. Effects may still settle.";
      else error = result.reason;
    } catch (cause) { if (current()) error = message(cause, "Cancellation could not be confirmed."); }
    finally { if (current()) { cancelPending = false; changed(); } }
  }
  async function selectTarget() {
    if (!selectedResult?.targetInvocationId || targetLoading) return;
    const summary = selectedResult, invocationId = selectedResult.targetInvocationId, selection = resultSelectionVersion, operation = ++targetVersion, active = life;
    targetLoading = true; detailError = ""; changed();
    const current = () => active === life && selection === resultSelectionVersion && operation === targetVersion && selectedResult?.id === summary.id;
    try {
      const checkpoint = await client.getTargetCheckpoint({ invocationId, runId: summary.runId, caseId: summary.caseId, caseRevision: summary.caseRevision, trial: summary.trial });
      if (!checkpoint) throw Error("The retained target checkpoint is unavailable.");
      if (current()) selectedTarget = checkpoint;
    } catch (cause) { if (current()) detailError = message(cause, "The retained target checkpoint is unavailable."); }
    finally { if (current()) { targetLoading = false; changed(); } }
  }
  async function selectScorer(invocationId: string) {
    if (!selectedResult || !selectedResult.scorerInvocationIds.includes(invocationId) || scorerLoading) return;
    const summary = selectedResult, selection = resultSelectionVersion, operation = ++scorerVersion, active = life;
    scorerLoading = true; detailError = ""; changed();
    const current = () => active === life && selection === resultSelectionVersion && operation === scorerVersion && selectedResult?.id === summary.id;
    try {
      const checkpoint = await client.getScorerCheckpoint({ invocationId, runId: summary.runId, caseId: summary.caseId, caseRevision: summary.caseRevision, trial: summary.trial });
      if (!checkpoint) throw Error("The selected scorer checkpoint is unavailable.");
      if (current()) selectedScorer = checkpoint;
    } catch (cause) { if (current()) detailError = message(cause, "The selected scorer checkpoint is unavailable."); }
    finally { if (current()) { scorerLoading = false; changed(); } }
  }
  async function selectBaseline(resultId: string) {
    if (!selectedResult || resultId === selectedResult.id) return;
    baselineResultId = resultId;
    const currentSummary = selectedResult, selection = resultSelectionVersion, operation = ++baselineVersion, active = life;
    resultLoading = true; detailError = ""; changed();
    const current = () => active === life && selection === resultSelectionVersion && operation === baselineVersion && selectedResult?.id === currentSummary.id && baselineResultId === resultId;
    try {
      const baselineSummary = await client.getResultSummary(resultId);
      if (!baselineSummary || baselineSummary.id !== resultId) throw Error("The baseline result is unavailable.");
      if (!current() || !selectedRun || !selectedHeader || !selectedCase) return;
      const currentContext: ResultContext = { summary: currentSummary, run: selectedRun, header: selectedHeader, selectedCase, ...(detail ? { detail } : {}) };
      const baselineContext = await resultContext(baselineSummary);
      try {
        const view = await client.getResult(baselineSummary.id);
        if (view && view.result.id !== baselineSummary.id) throw Error("Baseline result identity changed.");
        if (view) baselineContext.detail = view;
      } catch { /* Exact compatibility remains visible even when combined detail is too large. */ }
      if (!current()) return;
      baseline = { summary: baselineSummary, ...(baselineContext.detail ? { detail: baselineContext.detail } : {}), header: baselineContext.header, selectedCase: baselineContext.selectedCase };
      comparison = compare(currentContext, baselineContext);
    } catch (cause) { if (current()) detailError = message(cause, "The baseline could not be compared."); }
    finally { if (current()) { resultLoading = false; changed(); } }
  }
  function setFeedback(value: Partial<EvaluationFeedbackDraft>) {
    if (!selectedResult || feedbackSavingResults.has(selectedResult.id)) return;
    const resultId = selectedResult.id, draft = Object.freeze({ ...(drafts.get(resultId) ?? EMPTY_DRAFT), ...value });
    drafts.set(resultId, draft); feedbackIntents.delete(resultId); feedbackErrors.delete(resultId); changed();
  }
  async function saveFeedback() {
    if (!selectedResult || feedbackSavingResults.has(selectedResult.id)) return;
    const resultId = selectedResult.id, draft = drafts.get(resultId) ?? EMPTY_DRAFT;
    if (!draft.attribution.trim()) { feedbackErrors.set(resultId, "Feedback attribution is required."); changed(); return; }
    if (!draft.rating) { feedbackErrors.set(resultId, "Choose correct, incorrect, or uncertain before saving feedback."); changed(); return; }
    let value = feedbackIntents.get(resultId);
    try {
      value ??= EvaluationFeedbackSchema.parse({ schemaVersion: 1, id: nextId(), resultId, attribution: draft.attribution.trim(), rating: draft.rating, ...(draft.correction ? { correction: draft.correction } : {}), createdAtMs: clock() });
    } catch (cause) { feedbackErrors.set(resultId, message(cause, "Feedback is invalid.")); changed(); return; }
    feedbackIntents.set(resultId, value); feedbackSavingResults.add(resultId); feedbackErrors.delete(resultId); changed();
    try {
      await client.saveFeedback(value);
      feedbackIntents.delete(resultId); drafts.delete(resultId); feedbackErrors.delete(resultId);
      const cached = feedbackPages.get(resultId) ?? [];
      if (!cached.some(item => item.id === value.id)) feedbackPages.set(resultId, [value, ...cached]);
      if (opened) await reloadFeedbackFor(resultId);
    } catch (cause) { feedbackErrors.set(resultId, message(cause, "Feedback could not be saved. Your draft is unchanged.")); }
    finally { feedbackSavingResults.delete(resultId); changed(); }
  }
  async function refreshRun() {
    if (!selectedRun) return;
    const runId = selectedRun.id, selection = runSelectionVersion, active = life;
    try {
      const next = await client.status(runId);
      if (active !== life || selection !== runSelectionVersion || selectedRun?.id !== runId) return;
      execution = next; await readResults(resultPageCursor);
    } catch (cause) { if (active === life && selection === runSelectionVersion) error = message(cause, "Evaluation status is unavailable."); }
    if (active === life && selection === runSelectionVersion) changed();
  }
  const actions: EvaluationActions = {
    selectDefinition(ref) {
      selectedDefinition = definitions.find(item => item.ref.id === ref.id && item.ref.revision === ref.revision);
      error = ""; changed();
    },
    setBaselineResultId(resultId) { baselineVersion++; baselineResultId = resultId; comparison = undefined; baseline = undefined; resultLoading = false; changed(); },
    start, selectRun, refreshRun, cancel, selectResult, selectTarget, selectScorer, selectBaseline, setFeedback, saveFeedback, reloadFeedback,
    moreDefinitions: () => definitionCursor ? readDefinitions(definitionCursor) : Promise.resolve(),
    async latestDefinitions() { await Promise.all([readReadiness(), readDefinitions()]); },
    moreRuns: () => runCursor ? readRuns(runCursor) : Promise.resolve(),
    latestRuns: () => readRuns(),
    moreResults: () => resultCursor ? readResults(resultCursor) : Promise.resolve(),
    latestResults: () => readResults(),
  };
  return {
    presentation, actions,
    async open() { opened = true; const active = ++life; await Promise.all([readReadiness(), readDefinitions(), readRuns()]); if (active === life) changed(); },
    close() {
      opened = false;
      life++; definitionsVersion++; runsVersion++; resultVersion++; readinessVersion++;
      runSelectionVersion++; resultSelectionVersion++; targetVersion++; scorerVersion++; baselineVersion++; cancelVersion++;
      definitions = []; runs = []; results = []; selectedDefinition = undefined; selectedRun = undefined; selectedResult = undefined;
      selectedHeader = undefined; selectedCase = undefined; startReadiness = { status: "unavailable", reason: "Start availability is being checked." };
      execution = undefined; detail = undefined; selectedTarget = undefined; selectedScorer = undefined; baseline = undefined; comparison = undefined;
      baselineResultId = "";
      for (const [resultId, version] of feedbackReadVersions) feedbackReadVersions.set(resultId, version + 1);
      feedbackLoadingResults.clear();
      definitionsLoading = false; runsLoading = false; resultLoading = false; targetLoading = false; scorerLoading = false;
      cancelPending = false; error = ""; detailError = ""; changed();
    },
    subscribe(listener) { listeners.add(listener); listener(presentation); return () => listeners.delete(listener); },
  };
}

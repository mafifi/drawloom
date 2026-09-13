import type { InspectionDocument, InspectionOpenResult, InspectionResult, InspectionSaveInput, InspectionSaveResult, PersistedFeedback } from "../inspection-contract.ts";

export type FeedbackDraft = { attribution: string; rating: InspectionSaveInput["rating"]; correction: string };
export type InspectionCopy = {
  defaultTitle: string; defaultDescription: string; loading: string; empty: string; reload: string;
  findingsUnavailable: string; inspectionProvenance: string; corpus: string; records: string; execution: string;
  allModes: string; comparisonModes: string; cases: string; comparisons: string; provenance: string;
  mode: string; source: string; method: string; savedOutput: string; abstained: string; answered: string;
  citations: string; none: string; findings: string; findingError: string; notScored: string;
  controlledComparison: string; findingColumn: string; baselineColumn: string; selectedColumn: string;
  otherModes: string; provenanceColumn: string; findingsColumn: string; feedback: string;
  feedbackTargetPrefix: string; feedbackTargetSuffix: string; savedFeedback: string; savedSequence: string;
  attribution: string; attributionHelp: string; correction: string; rating: string; save: string; saving: string;
  saved: string; sourcesAndLimits: string;
};
export type InspectionPresentation = {
  phase: "initial" | "loading" | "ready" | "error";
  document?: InspectionDocument;
  selected?: InspectionResult;
  draft: FeedbackDraft;
  saveState: "idle" | "pending" | "saved" | "failed" | "invalid";
  error: string;
  loadError: string;
  feedback: readonly PersistedFeedback[];
  selectedFeedback: readonly PersistedFeedback[];
  baseline?: InspectionResult;
  comparisonResults: readonly InspectionResult[];
  pending: boolean;
  mode: string;
  modes: readonly string[];
  visibleResults: readonly InspectionResult[];
  copy: InspectionCopy;
  ratingOptions: readonly { value: InspectionSaveInput["rating"]; label: string }[];
};
export type InspectionActions = {
  retry(): Promise<void>;
  selectMode(mode: string): void;
  selectResult(id: string): void;
  editAttribution(value: string): void;
  editRating(value: InspectionSaveInput["rating"]): void;
  editCorrection(value: string): void;
  saveFeedback(): Promise<void>;
};
export type InspectionClient = { open(): Promise<InspectionOpenResult>; save(input: InspectionSaveInput): Promise<InspectionSaveResult> };

const blankDraft = (): FeedbackDraft => ({ attribution: "", rating: "uncertain", correction: "" });
const message = (error: unknown): string => error instanceof Error ? error.message : "The inspection operation failed";
const defaultCopy: InspectionCopy = {
  defaultTitle: "Evaluation findings", defaultDescription: "Read saved knowledge evaluation findings.", loading: "Loading saved findings…",
  empty: "No evaluation results are installed.", reload: "Reload findings", findingsUnavailable: "Findings unavailable",
  inspectionProvenance: "Inspection provenance", corpus: "Corpus", records: "Records", execution: "Execution",
  allModes: "All modes", comparisonModes: "Comparison modes", cases: "Evaluation cases", comparisons: "Comparison",
  provenance: "Provenance", mode: "Mode", source: "Source", method: "Method", savedOutput: "Saved output",
  abstained: "Abstained", answered: "Answered", citations: "citations", none: "none", findings: "Findings",
  findingError: "Error", notScored: "Not scored", controlledComparison: "Controlled output compared with retained baseline",
  findingColumn: "Finding", baselineColumn: "Baseline", selectedColumn: "Selected", otherModes: "Other saved modes for",
  provenanceColumn: "Provenance", findingsColumn: "Findings", feedback: "Advisory feedback", feedbackTargetPrefix: "Targets exact result",
  feedbackTargetSuffix: "Feedback is advisory and never accepts work.", savedFeedback: "Saved feedback", savedSequence: "saved #",
  attribution: "Attribution", attributionHelp: "Entered label only; identity is not verified.", correction: "Correction",
  rating: "Assessment", save: "Save feedback", saving: "Saving feedback", saved: "Feedback saved. It did not change scores or accept work.",
  sourcesAndLimits: "Sources and limits",
};
const ratingOptions: InspectionPresentation["ratingOptions"] = [
  { value: "correct", label: "correct" }, { value: "incorrect", label: "incorrect" }, { value: "uncertain", label: "uncertain" },
];

export class InspectionViewModel {
  readonly actions: InspectionActions;
  #phase: InspectionPresentation["phase"] = "initial";
  #document?: InspectionDocument;
  #selectedId = "";
  #loadError = "";
  #feedback: PersistedFeedback[] = [];
  #drafts = new Map<string, FeedbackDraft>();
  #saveStates = new Map<string, InspectionPresentation["saveState"]>();
  #saveErrors = new Map<string, string>();
  #pendingResultId = "";
  #generation = 0;
  #mode = "all";
  #listeners = new Set<() => void>();

  #copy: InspectionCopy;

  constructor(private readonly client: InspectionClient, copy: Partial<InspectionCopy> = {}) {
    this.#copy = { ...defaultCopy, ...copy };
    this.actions = {
      retry: () => this.load(),
      selectMode: mode => this.#selectMode(mode),
      selectResult: id => this.#selectResult(id),
      editAttribution: value => this.#editDraft({ attribution: value }),
      editRating: value => this.#editDraft({ rating: value }),
      editCorrection: value => this.#editDraft({ correction: value }),
      saveFeedback: () => this.#saveFeedback(),
    };
  }

  get presentation(): InspectionPresentation {
    const selected = this.#document?.results.find(result => result.evaluation.id === this.#selectedId);
    const draft = selected ? this.#drafts.get(selected.evaluation.id) ?? blankDraft() : blankDraft();
    const modes = [...new Set(this.#document?.results.map(result => result.provenance.mode) ?? [])];
    const visibleResults = this.#document?.results.filter(result => this.#mode === "all" || result.provenance.mode === this.#mode) ?? [];
    const baseline = selected?.comparison.baselineResultId
      ? this.#document?.results.find(result => result.evaluation.id === selected.comparison.baselineResultId)
      : undefined;
    const comparisonResults = selected
      ? this.#document?.results.filter(result => result.question.id === selected.question.id && result.evaluation.id !== selected.evaluation.id) ?? []
      : [];
    const selectedFeedback = selected ? this.#feedback.filter(feedback => feedback.resultId === selected.evaluation.id) : [];
    return {
      phase: this.#phase,
      ...(this.#document ? { document: this.#document } : {}),
      ...(selected ? { selected } : {}),
      draft: { ...draft },
      saveState: selected ? this.#saveStates.get(selected.evaluation.id) ?? "idle" : "idle",
      error: selected ? this.#saveErrors.get(selected.evaluation.id) ?? "" : "",
      loadError: this.#loadError,
      feedback: [...this.#feedback],
      selectedFeedback,
      ...(baseline ? { baseline } : {}),
      comparisonResults,
      pending: this.#pendingResultId !== "",
      mode: this.#mode,
      modes,
      visibleResults,
      copy: this.#copy,
      ratingOptions,
    };
  }

  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  async load(): Promise<void> {
    if (this.#pendingResultId) return;
    const generation = ++this.#generation;
    this.#phase = "loading"; this.#loadError = ""; this.#emit();
    try {
      const opened = await this.client.open();
      if (generation !== this.#generation) return;
      this.#document = opened.document;
      this.#feedback = [...opened.feedback];
      if (!opened.document.results.some(result => result.evaluation.id === this.#selectedId)) this.#selectedId = opened.document.results[0]?.evaluation.id ?? "";
      this.#phase = "ready";
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#phase = "error"; this.#loadError = message(error);
    }
    this.#emit();
  }

  #selectResult(id: string): void {
    if (!this.#document?.results.some(result => result.evaluation.id === id)) return;
    this.#selectedId = id; this.#emit();
  }

  #selectMode(mode: string): void {
    if (mode !== "all" && !this.#document?.results.some(result => result.provenance.mode === mode)) return;
    this.#mode = mode;
    const visible = this.#document?.results.filter(result => mode === "all" || result.provenance.mode === mode) ?? [];
    if (!visible.some(result => result.evaluation.id === this.#selectedId)) this.#selectedId = visible[0]?.evaluation.id ?? "";
    this.#emit();
  }

  #editDraft(change: Partial<FeedbackDraft>): void {
    if (!this.#selectedId) return;
    const current = this.#drafts.get(this.#selectedId) ?? blankDraft();
    this.#drafts.set(this.#selectedId, { ...current, ...change });
    if (this.#saveStates.get(this.#selectedId) !== "pending") {
      this.#saveStates.set(this.#selectedId, "idle"); this.#saveErrors.delete(this.#selectedId);
    }
    this.#emit();
  }

  async #saveFeedback(): Promise<void> {
    const resultId = this.#selectedId;
    if (!resultId || this.#pendingResultId || this.#phase !== "ready") return;
    const draft = this.#drafts.get(resultId) ?? blankDraft();
    const attribution = draft.attribution.trim();
    if (!attribution) {
      this.#saveStates.set(resultId, "invalid");
      this.#saveErrors.set(resultId, "Enter an attribution label before saving. This label is not verified identity.");
      this.#emit(); return;
    }
    const generation = this.#generation;
    const input: InspectionSaveInput = { resultId, attribution, rating: draft.rating, ...(draft.correction.trim() ? { correction: draft.correction.trim() } : {}) };
    this.#pendingResultId = resultId; this.#saveStates.set(resultId, "pending"); this.#saveErrors.delete(resultId); this.#emit();
    try {
      const saved = await this.client.save(input);
      if (generation !== this.#generation || saved.feedback.resultId !== resultId) return;
      this.#feedback.push(saved.feedback); this.#saveStates.set(resultId, "saved");
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#saveStates.set(resultId, "failed"); this.#saveErrors.set(resultId, message(error));
    } finally {
      if (this.#pendingResultId === resultId) this.#pendingResultId = "";
      this.#emit();
    }
  }

  #emit(): void { for (const listener of this.#listeners) listener(); }
}

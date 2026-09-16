import type { KnowledgeRecord, KnowledgeLink, RecordRef, SearchResult } from "@drawloom/knowledge";
import type { LearningStatus } from "./learning-protocol.js";
import type { LearningFeature, LearningProcessingScope } from "@drawloom/knowledge/consent";

const processingLabels: Record<string, string> = {
  "retain-tool-outcomes": "Remember useful results",
  "inform-conversation": "Inform your conversation",
  "curate-retained-learning": "Build and update knowledge",
  "validated-tool-outcomes": "Selected tool results",
  "execution-status": "Execution status",
  provenance: "Source information",
  "user-request": "Your request",
  "knowledge-records": "Knowledge records",
  "evidence-references": "Evidence references",
  "supporting-evidence": "Supporting evidence",
  "device:drawloom": "This device",
  "agent:codex": "Codex",
  "local-storage": "Storage on this device",
  "local-embeddings": "Local search model",
  "local-retrieval": "Local retrieval",
  "provider-disclosure": "Sent to the named provider",
};
export function describeProcessing(scope: LearningProcessingScope) {
  const label = (value: string) => processingLabels[value] ?? value;
  return {
    purpose: label(scope.purpose),
    data: scope.dataCategories.map(label).join(", "),
    destinations: scope.destinations.map(label).join(", "),
    boundaries: scope.boundaries.map(label).join(", "),
  };
}

export const knowledgeCopy = {
  learning: "Learning from your work",
  captureOutcomes: "Remember useful tool outcomes",
  capture: "Remember useful tool outcomes",
  captureHelp:
    "Retain selected results from participating tools, not full conversations or arbitrary tool input.",
  automaticContext: "Use knowledge in conversations",
  automaticContextHelp:
    "Include relevant knowledge with your messages. Review where it will be sent before enabling disclosure; existing access permissions still apply.",
  automaticCuration: "Curate knowledge automatically",
  automaticCurationHelp:
    "Assess retained evidence to build and update knowledge. Review its processing and destinations before granting permission.",
  curationDisableHelp:
    "Turning this off prevents new automatic assessments. An assessment already accepted may finish.",
  disableHelp:
    "Turning this off stops new references being sent. Material already sent remains in earlier conversation turns.",
  title: "Knowledge",
  introduction: "Find what you’ve learned across your projects, with the evidence behind it.",
  searchLabel: "Search knowledge",
  searchPlaceholder: "Search your knowledge…",
  search: "Search",
  searching: "Searching",
  more: "Next results",
  inspect: "Inspect evidence",
  empty: "No matching knowledge. Try another phrase or add a source.",
  loading: "Loading",
  evidence: "Evidence",
  relationships: "Evidence relationships",
  moreEvidence: "Next evidence page",
  firstEvidence: "First evidence page",
  export: "Export this page (OKF profile)",
  partial: "More evidence is available. This page is not the complete chain.",
  refresh: "Refresh status",
  confidence: "Confidence",
  source: "Learn from a repository",
  sourceHelp:
    "Use your project’s installed Git source to keep knowledge up to date with committed files.",
  sourceStart: "Connect project source",
  sourceStop: "Stop collection",
  sourceProject: "Project",
  maintenance: "Keep knowledge up to date",
  maintenanceHelp: "Check new evidence and revisit claims with the selected learning service.",
  unsupportedCuration: "Curation is not available with this learning service.",
  permissionNeeded: "permission needed",
  permissionHelp: "Your choice is saved. Review this processing before allowing it.",
  permissionPurpose: "Purpose",
  permissionData: "Information",
  permissionDestination: "Destination",
  permissionBoundaries: "Processing",
  permissionAllow: "Allow this processing",
  run: "Run now",
  override: "Run now despite the daily limit",
  pause: "Pause maintenance",
  resume: "Resume maintenance",
  save: "Save settings",
} as const;
export interface KnowledgePresentation {
  readonly sourceName?: string;
  readonly copy: typeof knowledgeCopy;
  readonly query: string;
  readonly results: Extract<SearchResult, { kind: "ok" }>["items"];
  readonly evidence?: { readonly records: KnowledgeRecord[]; readonly links: KnowledgeLink[] };
  readonly selected?: RecordRef;
  readonly hasMoreResults: boolean;
  readonly hasMoreEvidence: boolean;
  readonly searched: boolean;
  readonly searchPending: boolean;
  readonly evidencePending: boolean;
  readonly statusPending: boolean;
  readonly pendingAction?: string;
  readonly error: string;
  readonly notice: string;
  readonly recoveryNotices: readonly string[];
  readonly searchStatus: string;
  readonly status?: LearningStatus;
  readonly consentRequests: readonly ({
    feature: LearningFeature;
    scope: LearningProcessingScope;
    title: string;
  } & ReturnType<typeof describeProcessing>)[];
  readonly learning: {
    readonly captureOutcomes: boolean;
    readonly automaticContext: boolean;
    readonly automaticCuration: boolean;
    readonly dirty: boolean;
  };
}
export interface KnowledgeActions {
  setLearning(
    key: "captureOutcomes" | "automaticContext" | "automaticCuration",
    enabled: boolean,
  ): void;
  saveLearning(): Promise<void>;
  setQuery(value: string): void;
  search(more?: boolean): Promise<void>;
  inspect(ref: RecordRef, more?: boolean): Promise<void>;
  refresh(): Promise<void>;
  confirmConsent(feature: LearningFeature, scope: LearningProcessingScope): Promise<void>;
  source(enabled: boolean): Promise<void>;
  run(override: boolean): Promise<void>;
  pause(paused: boolean): Promise<void>;
  export(): Promise<void>;
}

import type {
  LocalLearningSetupStatus,
  LocalLearningConfiguration,
} from "./local-knowledge-setup-protocol.js";
export const localKnowledgeCopy = {
  setupHelp:
    "Add a local model to find related ideas, even when the words differ. Text search is already available.",
  cleanupHelp:
    "Remove only Drawloom’s obsolete MLX runtime and model files. Your knowledge, evidence and conversations are preserved. This cannot be undone.",
  confidentiality:
    "Knowledge sent for assessment is disclosed to the configured Codex model. Local embedding inference does not send it to a hosted service.",
  setup: "Search by meaning",
  download: "Download and install",
  retry: "Retry installation",
  cancel: "Cancel installation",
  refresh: "Refresh local setup",
  cleanup: "Remove previous runtime",
  cleanupTitle: "Remove the previous search runtime?",
  cleanupCancel: "Keep files",
  selectedModel: "Only supported semantic model",
  modelWeights: "Model weights",
  runtimeExtra: "Runtime installed separately",
  location: "Location",
  sourceLabel: "Source",
  prerequisites: "Prerequisites",
  settings: "Maintenance limits",
  assessmentModel: "Codex model",
  embeddingModel: "Search model",
  starts: "Automatic assessment starts per day",
  minutes: "Automatic assessment minutes per day",
  timeout: "Assessment timeout in seconds",
  save: "Save settings",
} as const;

export interface LocalKnowledgeSetupPresentation {
  readonly copy: typeof localKnowledgeCopy;
  readonly status?: LocalLearningSetupStatus;
  readonly configuration?: LocalLearningConfiguration;
  readonly pendingAction?: string;
  readonly statusPending: boolean;
  readonly error: string;
  readonly notice: string;
}
export interface LocalKnowledgeSetupActions {
  refresh(): Promise<void>;
  configure(value: LocalLearningConfiguration): Promise<void>;
  download(model: LocalLearningConfiguration["embeddingModel"]): Promise<void>;
  cancelDownload(model: LocalLearningConfiguration["embeddingModel"]): Promise<void>;
  cleanupObsolete(): Promise<void>;
}

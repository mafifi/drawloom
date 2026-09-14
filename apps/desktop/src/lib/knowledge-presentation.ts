import type { KnowledgeRecord, KnowledgeLink, RecordRef, SearchResult } from '@drawloom/knowledge';
import type { KnowledgeConfiguration, KnowledgeStatus } from './knowledge-protocol.js';

export const knowledgeCopy = {
  title: 'Knowledge', introduction: 'Find what you’ve learned across your projects, with the evidence behind it.',
  searchLabel: 'Search knowledge', searchPlaceholder: 'Search your knowledge…', search: 'Search', searching: 'Searching',
  more: 'Next results', inspect: 'Inspect evidence', empty: 'No matching knowledge. Try another phrase or add a source.',
  loading: 'Loading', evidence: 'Evidence', relationships: 'Evidence relationships', moreEvidence: 'Next evidence page', firstEvidence: 'First evidence page', export: 'Export this page (OKF profile)',
  partial: 'More evidence is available. This page is not the complete chain.',
  setup: 'Search by meaning', setupHelp: 'Add a local model to find related ideas, even when the words differ. Text search is already available.',
  download: 'Download and install', retry: 'Retry installation', cancel: 'Cancel installation', refresh: 'Refresh status',
  cleanup: 'Remove previous runtime', cleanupTitle: 'Remove the previous search runtime?', cleanupHelp: 'Remove only Drawloom’s obsolete MLX runtime and model files. Your knowledge, evidence and conversations are preserved. This cannot be undone.', cleanupCancel: 'Keep files',
  selectedModel: 'Only supported semantic model', modelWeights: 'Model weights', runtimeExtra: 'Runtime installed separately', location: 'Location', sourceLabel: 'Source', prerequisites: 'Prerequisites', confidence: 'Confidence',
  source: 'Learn from a repository', sourceHelp: 'Use your project’s installed Git source to keep knowledge up to date with committed files.',
  sourceStart: 'Connect project source', sourceStop: 'Stop collection', sourceProject: 'Project',
  maintenance: 'Keep knowledge up to date', maintenanceHelp: 'Nightloom checks new evidence and revisits claims while Drawloom is open.',
  run: 'Run now', override: 'Run now despite the daily limit', pause: 'Pause maintenance', resume: 'Resume maintenance',
  settings: 'Maintenance limits', assessmentModel: 'Codex model', embeddingModel: 'Search model',
  starts: 'Automatic assessment starts per day', minutes: 'Automatic assessment minutes per day', timeout: 'Assessment timeout in seconds',
  save: 'Save settings', confidentiality: 'Knowledge sent for assessment is disclosed to the configured Codex model. Local embedding inference does not send it to a hosted service.',
} as const;
export interface KnowledgePresentation {
  readonly sourceName?: string;
  readonly copy: typeof knowledgeCopy;
  readonly query: string;
  readonly results: Extract<SearchResult, { kind: 'ok' }>['items'];
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
  readonly searchStatus: string;
  readonly status?: KnowledgeStatus;
  readonly configuration?: KnowledgeConfiguration;
}
export interface KnowledgeActions {
  setQuery(value: string): void;
  search(more?: boolean): Promise<void>;
  inspect(ref: RecordRef, more?: boolean): Promise<void>;
  refresh(): Promise<void>;
  configure(value: KnowledgeConfiguration): Promise<void>;
  source(enabled: boolean): Promise<void>;
  run(override: boolean): Promise<void>;
  pause(paused: boolean): Promise<void>;
  download(model: KnowledgeConfiguration['embeddingModel']): Promise<void>;
  cancelDownload(model: KnowledgeConfiguration['embeddingModel']): Promise<void>;
  cleanupObsolete(): Promise<void>;
  export(): Promise<void>;
}

import type { KnowledgeRecord, KnowledgeLink, RecordRef, SearchResult } from '@drawloom/knowledge';
import type { KnowledgeConfiguration, KnowledgeStatus } from './knowledge-protocol.js';

export const knowledgeCopy = {
  title: 'Knowledge', introduction: 'Knowledge and memory across your projects. Every claim stays connected to its evidence.',
  searchLabel: 'Search knowledge', searchPlaceholder: 'Ask a question or enter an identifier', search: 'Search', searching: 'Searching',
  more: 'Next results', inspect: 'Inspect evidence', empty: 'No matching knowledge. Try another phrase or add a source.',
  loading: 'Loading', evidence: 'Evidence', relationships: 'Evidence relationships', moreEvidence: 'Next evidence page', firstEvidence: 'First evidence page', export: 'Export this page (OKF profile)',
  partial: 'More evidence is available. This page is not the complete chain.',
  setup: 'Local search models', setupHelp: 'Text search works without MLX. Installation stays in the selected data directory; there is no CPU or hosted embedding fallback.',
  download: 'Download and install', retry: 'Retry installation', cancel: 'Cancel installation', refresh: 'Refresh status',
  selectedModel: 'Only supported semantic model', modelWeights: 'Model weights', runtimeExtra: 'Runtime installed separately', location: 'Location', sourceLabel: 'Source', prerequisites: 'Prerequisites', confidence: 'Confidence',
  source: 'Git source', sourceHelp: 'Collect committed files through the selected project’s configured Git source plugin. This does not grant the plugin access to other files.',
  sourceStart: 'Use installed Git source from selected project', sourceStop: 'Stop collection', sourceProject: 'Configured project',
  maintenance: 'Nightloom', maintenanceHelp: 'Maintains knowledge while Drawloom is open. Judgements do not require individual approval.',
  run: 'Run now', override: 'Run now despite the daily limit', pause: 'Pause maintenance', resume: 'Resume maintenance',
  settings: 'Knowledge settings', assessmentModel: 'Codex assessment model', embeddingModel: 'Local embedding model',
  starts: 'Automatic assessment starts per day', minutes: 'Automatic assessment minutes per day', timeout: 'Assessment timeout in seconds',
  save: 'Save settings', confidentiality: 'Knowledge sent for assessment is disclosed to the configured Codex model. Local embedding inference does not send it to a hosted service.',
} as const;
export interface KnowledgePresentation {
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
  export(): Promise<void>;
}

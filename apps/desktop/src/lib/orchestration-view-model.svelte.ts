import { WorkflowOwnersSchema, WorkflowPageSchema, WorkflowRunSchema, WorkflowCommandSchema, WorkflowStepsSchema, type WorkflowOwner, type WorkflowRun } from './orchestration-protocol.js';
import { telemetryFetch as fetch } from './telemetry.js';

export function createOrchestrationViewModel() {
  let projectId = $state(''), installationId = $state('');
  let owners = $state<WorkflowOwner[]>([]), runs = $state<WorkflowRun[]>([]);
  let error = $state(''), loading = $state(false), cursor = $state<string>();
  let loadingAction = $state<'refresh' | 'more' | 'latest' | 'owner' | 'owners'>();
  let pageCursor = $state<string>();
  let stepPage = $state<{ runId: string; steps: WorkflowRun['steps']; cursor?: string | undefined; pageCursor?: string | undefined }>();
  let stepLoading = $state(false);
  let stepAction = $state<{ runId: string; kind: 'first' | 'more' | 'refresh' }>();
  let pendingAction = $state<{ action: 'cancel' | 'respond'; runId: string; requestId?: string }>();
  let epoch = 0, read = new AbortController();
  const params = () => new URLSearchParams({ projectId, installationId, limit: '20' });
  function invalidate() { epoch++; read.abort(); read = new AbortController(); loading = false; loadingAction = undefined; stepLoading = false; stepAction = undefined; stepPage = undefined; pendingAction = undefined; error = ''; }
  async function body(response: Response) {
    if (!response.ok) {
      const value: unknown = await response.json().catch(() => undefined);
      if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' && value.error.length <= 512) throw Error(value.error);
      throw Error('Workflow controls are unavailable. Check orchestration readiness and refresh.');
    }
    return response.json() as Promise<unknown>;
  }
  async function readSteps(runId: string, requestedCursor?: string, kind: 'first' | 'more' | 'refresh' = 'refresh') {
    const version = epoch, query = params(); query.set('runId', runId);
    if (requestedCursor) query.set('cursor', requestedCursor);
    stepLoading = true; stepAction = { runId, kind };
    try {
      const page = WorkflowStepsSchema.parse(await body(await fetch('/api/orchestration/steps?' + query, { signal: read.signal })));
      if (version === epoch) stepPage = { runId, ...page, pageCursor: requestedCursor };
    } catch (cause) { if (version === epoch) error = cause instanceof Error ? cause.message : 'Workflow steps unavailable'; }
    finally { if (version === epoch) { stepLoading = false; stepAction = undefined; } }
  }
  async function refresh(more = false, action: 'refresh' | 'latest' | 'owner' = 'refresh') {
    if (!projectId || !installationId || loading || stepLoading || pendingAction) return;
    const version = epoch, query = params();
    const requestedCursor = more ? cursor : pageCursor;
    if (requestedCursor) query.set('cursor', requestedCursor);
    loading = true; loadingAction = more ? 'more' : action; error = '';
    try {
      const page = WorkflowPageSchema.parse(await body(await fetch('/api/orchestration/runs?' + query, { signal: read.signal })));
      if (version !== epoch) return;
      // One bounded page, not an ever-growing list of every historical run.
      runs = page.runs; cursor = page.cursor; pageCursor = requestedCursor;
      if (stepPage && runs.some(run => run.runId === stepPage?.runId)) await readSteps(stepPage.runId, stepPage.pageCursor);
      else stepPage = undefined;
    } catch (cause) { if (version === epoch) error = cause instanceof Error ? cause.message : 'Workflows unavailable'; }
    finally { if (version === epoch) { loading = false; loadingAction = undefined; } }
  }
  async function action(kind: 'cancel' | 'respond', runId: string, requestId?: string, raw?: string) {
    if (pendingAction) return;
    const current = runs.find(item => item.runId === runId);
    if (!current || current.status !== 'running' || current.cancellationRequested) return;
    let version = epoch;
    try {
      if (kind === 'respond' && (!requestId || !current.pendingInputs.includes(requestId))) throw Error('This input request is no longer pending. Refresh the run.');
      if (raw && new TextEncoder().encode(raw).length > 65536) throw Error('Workflow input is too large. Use file references instead.');
      const command = WorkflowCommandSchema.parse(kind === 'cancel'
        ? { action: kind, projectId, installationId, runId }
        : { action: kind, projectId, installationId, runId, requestId, value: JSON.parse(raw ?? '') });
      // Commands never wait for a slow poll. Invalidate that read so its older
      // state cannot overwrite the command response when it eventually settles.
      invalidate(); version = epoch;
      pendingAction = { action: kind, runId, ...(requestId ? { requestId } : {}) }; error = '';
      const updated = WorkflowRunSchema.parse(await body(await fetch('/api/orchestration/runs', {
        // Navigation may cancel reads, never an already submitted decision.
        // The epoch below still discards its reply after changing projects.
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      })));
      if (version !== epoch) return;
      if (updated.runId !== runId) throw Error('Workflow identity changed. Refresh the run.');
      runs = runs.map(item => item.runId === runId ? updated : item);
    } catch (cause) { if (version === epoch) error = cause instanceof SyntaxError ? 'Enter valid JSON for this input request.' : cause instanceof Error ? cause.message : 'Workflow action unavailable'; }
    finally { if (version === epoch) pendingAction = undefined; }
  }
  return {
    get projectId() { return projectId; }, get installationId() { return installationId; },
    get owners() { return owners; }, get runs() { return runs; }, get error() { return error; },
    get loading() { return loading; }, get cursor() { return cursor; }, get pendingAction() { return pendingAction; },
    get loadingAction() { return loadingAction; },
    get isFirstPage() { return pageCursor === undefined; },
    get stepPage() { return stepPage; }, get stepLoading() { return stepLoading; }, get stepAction() { return stepAction; },
    async browseSteps(runId: string, more = false) {
      if (loading || stepLoading || pendingAction || !runs.some(run => run.runId === runId)) return;
      if (more && (stepPage?.runId !== runId || !stepPage.cursor)) return;
      error = ''; await readSteps(runId, more ? stepPage?.cursor : undefined, more ? 'more' : 'first');
    },
    async open(id: string) {
      invalidate(); projectId = id; installationId = ''; owners = []; runs = []; cursor = undefined; pageCursor = undefined;
      if (!id) return;
      const version = epoch; loading = true; loadingAction = 'owners';
      try {
        const available = WorkflowOwnersSchema.parse(await body(await fetch('/api/orchestration/owners?' + new URLSearchParams({ projectId: id }), { signal: read.signal })));
        if (version === epoch) owners = available;
      } catch (cause) { if (version === epoch) error = cause instanceof Error ? cause.message : 'Orchestration unavailable'; }
      finally { if (version === epoch) { loading = false; loadingAction = undefined; } }
    },
    async selectOwner(id: string) {
      if (!owners.some(owner => owner.installationId === id)) return;
      invalidate(); installationId = id; runs = []; cursor = undefined; pageCursor = undefined; await refresh(false, 'owner');
    },
    refresh: () => refresh(), more: () => refresh(true),
    latest() { if (loading || pendingAction) return; pageCursor = undefined; return refresh(false, 'latest'); },
    cancel: (runId: string) => action('cancel', runId),
    respond: (runId: string, requestId: string, raw: string) => action('respond', runId, requestId, raw),
    close() { invalidate(); projectId = ''; installationId = ''; owners = []; runs = []; cursor = undefined; pageCursor = undefined; },
  };
}
export type OrchestrationViewModel = ReturnType<typeof createOrchestrationViewModel>;

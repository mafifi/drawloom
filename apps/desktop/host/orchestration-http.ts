import { WorkflowCommandSchema, WorkflowReadSchema, WorkflowScopeSchema, KnowledgeActivityReadSchema, KnowledgeActivityDetailSchema } from '../src/lib/orchestration-protocol.js';
import type { createDesktopApplication } from './application.js';

/** Separate short management-command queue; never waits for task/operator work. */
export function createOrchestrationHttp(app: Pick<Awaited<ReturnType<typeof createDesktopApplication>>, 'workflowOwners' | 'workflowRuns' | 'workflowSteps' | 'workflowCommand' | 'knowledgeActivityOwner' | 'knowledgeActivityRuns' | 'knowledgeActivityRun' | 'knowledgeActivitySteps'>) {
  const commands = new Map<string, Promise<unknown>>();
  return async (request: Request, url: URL): Promise<{ body: unknown; status: number }> => {
    const query = Object.fromEntries(url.searchParams);
    if (url.pathname.startsWith('/api/knowledge-activity/')) {
      if (request.method !== 'GET') return { body: { error: 'Knowledge maintenance activity is read-only.' }, status: 405 };
      if (url.pathname.endsWith('/owner')) {
        KnowledgeActivityReadSchema.pick({}).parse(query);
        return { body: await app.knowledgeActivityOwner(), status: 200 };
      }
      if (url.pathname.endsWith('/runs')) return { body: await app.knowledgeActivityRuns(KnowledgeActivityReadSchema.parse(query)), status: 200 };
      const input = KnowledgeActivityDetailSchema.parse(query);
      return { body: await (url.pathname.endsWith('/steps') ? app.knowledgeActivitySteps(input) : app.knowledgeActivityRun(input)), status: 200 };
    }
    if (request.method === 'GET') {
      if (url.pathname.endsWith('/owners')) {
        const { projectId } = WorkflowScopeSchema.pick({ projectId: true }).parse(query);
        return { body: await app.workflowOwners(projectId), status: 200 };
      }
      const scope = WorkflowReadSchema.parse(query);
      return { body: await (url.pathname.endsWith('/steps') ? app.workflowSteps(scope) : app.workflowRuns(scope)), status: 200 };
    }
    if (request.method !== 'POST' || !url.pathname.endsWith('/runs')) return { body: { error: 'Not found' }, status: 404 };
    const reader = request.body?.getReader();
    if (!reader) return { body: { error: 'Enter a workflow command' }, status: 400 };
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); return { body: { error: 'Workflow input is too large. Use file references instead.' }, status: 413 }; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const command = WorkflowCommandSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    const key = JSON.stringify([command.projectId, command.installationId, command.runId]);
    const next = (commands.get(key) ?? Promise.resolve()).then(() => app.workflowCommand(command));
    const settled = next.catch(() => {});
    commands.set(key, settled);
    try { return { body: await next, status: 200 }; }
    finally { if (commands.get(key) === settled) commands.delete(key); }
  };
}

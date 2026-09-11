import { AsyncLocalStorage } from 'node:async_hooks';
import type { RegisteredTaskHandler, TaskContext } from '@drawloom/orchestration';

type Owner = { projectId: string; installationId: string };
type TaskOwner = Owner & { runId: string; stepId: string; attemptId: string; recovering: boolean; signal: AbortSignal };

/** Host-only dispatch provenance. It supplies no grant and is never sent to an App. */
export function createWorkflowAuthority() {
  const scope = new AsyncLocalStorage<{ owner: TaskOwner; active: boolean }>();
  const current = () => { const value = scope.getStore(); return value?.active ? value.owner : undefined; };
  return {
    current,
    capture() { const value = scope.getStore(); return () => value?.active === true; },
    wrap(owner: Owner, handlers: readonly RegisteredTaskHandler[], refreshGrants: () => Promise<void>): readonly RegisteredTaskHandler[] {
      async function execute<T>(context: TaskContext, recovering: boolean, work: () => T | Promise<T>): Promise<T> {
        context.signal.throwIfAborted();
        await refreshGrants();
        context.signal.throwIfAborted();
        const lease = { owner: { ...owner, runId: context.runId, stepId: context.stepId, attemptId: context.attemptId, recovering, signal: context.signal }, active: true };
        return scope.run(lease, async () => { try { return await work(); } finally { lease.active = false; } });
      }
      return handlers.map(handler => ({ id: handler.id, version: handler.version,
        run: (input, context) => execute(context, false, () => handler.run(input, context)),
        ...(handler.recover ? { recover: (input: unknown, context: TaskContext) => execute(context, true, () => handler.recover!(input, context)) } : {}),
      }));
    },
  };
}

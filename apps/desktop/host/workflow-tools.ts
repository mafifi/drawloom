import type { JsonStore } from '@drawloom/host';
import type { ToolEvidence, ToolGateway } from '@drawloom/tools';
import type { createWorkflowAuthority } from './workflow-authority.js';
import { createDesktopEvidence } from './evidence.js';
import { createHash } from 'node:crypto';

export const workflowEvidenceKey=(installationId:string,runId:string,stepId:string,attemptId:string)=>
  'workflow:'+createHash('sha256').update(JSON.stringify([installationId,runId,stepId,attemptId])).digest('hex');

/** Workflow provenance plugs into the existing gateway, never supplies grants. */
export function createWorkflowToolScope(options: {
  authority: ReturnType<typeof createWorkflowAuthority>;
  projectId: string; installationId: string; workbenchIds: readonly string[];
  grants: ReadonlyMap<string, ReadonlySet<string>>;
  refreshGrants: () => Promise<void>; store: JsonStore;
}) {
  const evidence = new Map<string, ReturnType<typeof createDesktopEvidence>>();
  function owner(operationId?: string) {
    const current = options.authority.current();
    return current && current.projectId === options.projectId && current.installationId === options.installationId &&
      current.runId === operationId ? current : undefined;
  }
  return {
    refresh: options.refreshGrants,
    owns: (operationId?: string) => Boolean(owner(operationId)),
    allowed(operationId: string, name: string) {
      const current = owner(operationId);
      return Boolean(current && !current.signal.aborted && options.workbenchIds.length && options.workbenchIds.every(id => options.grants.get(id)?.has(name)));
    },
    async record(record: ToolEvidence) {
      const current = owner(record.kind === 'started' ? record.operationId : record.result.operationId);
      if (!current) throw Error('No active workflow task owns this tool invocation');
      const key = workflowEvidenceKey(current.installationId,current.runId,current.stepId,current.attemptId);
      let sink = evidence.get(key);
      if (!sink) { sink = createDesktopEvidence(options.store, key); evidence.set(key, sink); }
      await (await sink).record(record);
    },
    wrap(gateway: ToolGateway): ToolGateway {
      return { ...gateway, async invoke(...args) {
        if (options.authority.current()) {
          const valid = options.authority.capture();
          await options.refreshGrants();
          if (!valid()) throw Error('Workflow task is no longer active');
        }
        return gateway.invoke(...args);
      } };
    },
  };
}

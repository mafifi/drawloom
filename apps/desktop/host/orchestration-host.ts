import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { createLocalTemporalManager, LocalTemporalRegistration } from '@drawloom/temporal-orchestration';
import type { OrchestrationReadiness } from '@drawloom/desktop-host';
import type { PackageInventory } from '@drawloom/plugins';
import type { RegisteredTaskHandler } from '@drawloom/orchestration';
import type { Installation } from './plugin-installations.js';
import type { InstalledWorkflowRegistration } from './plugin-packages.js';
import { WorkflowOwnersSchema, WorkflowScopeSchema } from '../src/lib/orchestration-protocol.js';
import { createOrchestrationPresentation, WorkflowControlError } from './orchestration-presentation.js';

type Manager = ReturnType<typeof createLocalTemporalManager>;
type Entry = { title: string; registration?: LocalTemporalRegistration; readiness: OrchestrationReadiness };
const key = (projectId: string, installationId: string) => JSON.stringify([projectId, installationId]);
const projectUnavailable: OrchestrationReadiness = { status: 'unavailable', code: 'project_unavailable', message: 'The owning project or installed plugin is unavailable. Saved work has not been removed.' };
function unavailable(error: unknown): OrchestrationReadiness {
  const message = error instanceof Error ? error.message : '';
  if (/ENOENT|not found|executable|version|spawn/i.test(message)) return { status: 'configuration_required', code: 'local_runtime_required', message: 'Install a compatible Temporal CLI and Node, or configure their executable paths, then restart Drawloom.' };
  if (/bundle|changed|unfinished/i.test(message)) return { status: 'unavailable', code: 'workflow_code_changed', message: 'Workflow code changed while saved work still needs it. Restore the installed package before recovery.' };
  return { status: 'unavailable', code: 'local_runtime_unavailable', message: 'Local workflow startup failed. Check the runtime installation and saved orchestration data; nothing has been reset.' };
}

/** Desktop composition only; no lifecycle or privileged object is added to MCP Apps. */
export function createOrchestrationHost(options: {
  dataDirectory: string;
  manager: () => Promise<Manager>;
  ensureProject: (projectId: string) => Promise<void>;
}) {
  let pending: Promise<Manager> | undefined;
  const manager = () => pending ??= options.manager();
  const entries = new Map<string, Entry>();
  const changes = new Map<string, Promise<unknown>>();
  const restartRequired = new Set<string>();
  let closed = false;
  let closing: Promise<void> | undefined;
  function serialize<T>(installationId: string, work: () => Promise<T>): Promise<T> {
    const next = (changes.get(installationId) ?? Promise.resolve()).then(work);
    changes.set(installationId, next.catch(() => {}));
    return next;
  }
  function requireCurrent(installationId: string) {
    if (closed) throw new WorkflowControlError('Local workflows are stopped');
    if (restartRequired.has(installationId)) throw new WorkflowControlError('Plugin configuration changed; restart Drawloom before starting workflows.');
  }
  async function guardInstallation(installationId: string) {
    if (await persisted() && await (await manager()).hasUnfinishedInstallation(installationId)) throw new WorkflowControlError('This plugin has unfinished workflows. Finish or cancel them before changing its configuration.');
  }
  async function persisted() {
    if (pending) return true;
    try { await access(join(options.dataDirectory, 'orchestration')); return true; }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false; throw error; }
  }
  const presentation = createOrchestrationPresentation(async raw => {
    const scope = WorkflowScopeSchema.parse({ projectId: raw.projectId, installationId: raw.installationId });
    await options.ensureProject(scope.projectId);
    const entry = entries.get(key(scope.projectId, scope.installationId));
    if (closed || !entry?.registration || entry.readiness.status !== 'ready') throw new WorkflowControlError(entry?.readiness.message ?? 'Workflow owner unavailable');
    return entry.registration.orchestrator;
  });
  return {
    ...presentation,
    async prepare(projectId: string, installation: Installation, inventory: PackageInventory,
      wrap: (handlers: readonly RegisteredTaskHandler[]) => readonly RegisteredTaskHandler[]): Promise<InstalledWorkflowRegistration> {
      if (closed || !installation.trustedBackend || !inventory.drawloom?.workflows) throw Error('Trusted workflow package required');
      const entry: Entry = { title: inventory.name, readiness: { status: 'unavailable', code: 'starting', message: 'Preparing local workflows.' } };
      entries.set(key(projectId, installation.id), entry);
      try {
        const entrypoint = inventory.drawloom.workflows.entrypoint;
        entry.registration = await serialize(installation.id, async () => {
          requireCurrent(installation.id);
          const registration = await (await manager()).prepare({ projectId, installationId: installation.id,
            packageDirectory: inventory.root, entrypoint });
          return { ...registration, orchestrator: { ...registration.orchestrator,
            start: (identity, workflow, input) => serialize(installation.id, async () => {
              requireCurrent(installation.id);
              return registration.orchestrator.start(identity, workflow, input);
            }),
          } };
        });
      } catch (error) { entry.readiness = unavailable(error); }
      return {
        capabilities: { ...(entry.registration ? { orchestration: entry.registration.orchestrator } : {}),
          orchestrationReadiness: async () => entry.registration && entry.readiness.status === 'ready' ? entry.registration.readiness() : entry.readiness },
        async attach(handlers) {
          if (!entry.registration) return;
          try { await entry.registration.attach(wrap(handlers)); entry.readiness = entry.registration.readiness(); }
          catch (error) { entry.readiness = unavailable(error); throw error; }
        },
        async close() { await entry.registration?.close(); entry.readiness = { status: 'unavailable', code: 'stopped', message: 'Local execution is stopped.' }; },
      };
    },
    async owners(projectId: string) {
      let missing = false;
      try { await options.ensureProject(projectId); }
      catch (error) {
        if (![...entries.keys()].some(id => (JSON.parse(id) as string[])[0] === projectId)) throw error;
        missing = true;
      }
      return WorkflowOwnersSchema.parse([...entries].flatMap(([id, entry]) => {
        const [project, installationId] = JSON.parse(id) as [string, string];
        return project === projectId ? [{ installationId, title: entry.title,
          readiness: missing ? projectUnavailable : entry.registration && entry.readiness.status === 'ready' ? entry.registration.readiness() : entry.readiness }] : [];
      }));
    },
    async restore() {
      if (!await persisted()) return;
      // Persisted owners include projects not selected in the UI. No user
      // conversation is opened and no model is called to resume local tasks.
      let owners;
      try { owners = await (await manager()).listOwners(); }
      catch (error) { return unavailable(error); }
      for (const projectId of new Set(owners.map(owner => owner.projectId))) {
        try { await options.ensureProject(projectId); } catch { /* Keep unavailable owners visible below. */ }
        for (const owner of owners.filter(owner => owner.projectId === projectId)) if (!entries.has(key(projectId, owner.installationId))) entries.set(key(projectId, owner.installationId), {
          title: owner.installationId, readiness: projectUnavailable,
        });
      }
    },
    guardInstallation,
    changeInstallation<T>(installationId: string, change: () => Promise<T>, pendingRestart:()=>boolean=()=>true) {
      return serialize(installationId, async () => {
        await guardInstallation(installationId);
        const result = await change();
        if(pendingRestart())restartRequired.add(installationId);
        else restartRequired.delete(installationId);
        return result;
      });
    },
    close() {
      closed = true;
      return closing ??= (async () => {
        await Promise.all(changes.values());
        const instance = await pending?.catch(() => undefined);
        await instance?.close();
      })();
    },
  };
}

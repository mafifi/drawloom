import { expect, test } from 'bun:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { createLocalTemporalManager } from '@drawloom/temporal-orchestration';
import type { PackageInventory } from '@drawloom/plugins';
import type { Installation } from './plugin-installations.js';
import { createOrchestrationHost } from './orchestration-host.js';
import type { Orchestrator } from '@drawloom/orchestration';
import { z } from 'zod';

test('configuration is serialized with starts and blocks old configuration until restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-workflow-guard-'));
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let unfinished = false, applied = false, starts = 0;
  const orchestrator: Orchestrator = { start: async () => { starts++; entered(); await held; unfinished = true; return 'r'; },
    get: async () => { throw Error('unused'); }, list: async () => ({ runs: [] }), getSteps: async () => ({ steps: [] }), result: async () => ({}), respond: async () => {}, cancel: async () => {} };
  const manager: ReturnType<typeof createLocalTemporalManager> = { prepare: async () => ({ registry: { workflows: [], tasks: [] }, orchestrator,
    readiness: () => ({ status: 'ready' }), attach: async () => {}, close: async () => {} }),
    prepareHost: async () => { throw Error('not used'); }, listHostOwners: async () => [],
    listOwners: async () => [], hasUnfinishedInstallation: async () => unfinished, close: async () => {} };
  const host = createOrchestrationHost({ dataDirectory: root, manager: async () => manager, ensureProject: async () => {} });
  const installation: Installation = { id: crypto.randomUUID(), name: 'documents', root, enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] };
  const inventory: PackageInventory = { root, name: 'documents', extensions: {}, skills: [], servers: [], diagnostics: [], drawloom: { version: 1, backend: { entrypoint: 'backend.mjs' }, workflows: { entrypoint: 'workflow.mjs' } } };
  try {
    const registration = await host.prepare('a', installation, inventory, handlers => handlers);
    const workflow = { id: 'documents', version: '1', input: z.object({}), output: z.object({}), run: async () => ({}) };
    const start = registration.capabilities.orchestration!.start('one', workflow, {});
    await started;
    const change = host.changeInstallation(installation.id, async () => { applied = true; });
    await Promise.resolve(); expect(applied).toBe(false);
    release(); await start;
    await expect(change).rejects.toThrow('unfinished workflows');
    unfinished = false;
    await host.changeInstallation(installation.id, async () => { applied = true; });
    expect(applied).toBe(true);
    await expect(registration.capabilities.orchestration!.start('two', workflow, {})).rejects.toThrow('restart');
    expect(starts).toBe(1);
    await host.changeInstallation(installation.id,async()=>{},()=>false);
    await expect(registration.capabilities.orchestration!.start('three',workflow,{})).resolves.toBe('r');
  } finally { release(); await host.close(); await rm(root, { recursive: true, force: true }); }
});

test('ordinary startup is lazy; saved owners restore unopened projects and protect installation changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-orchestration-host-'));
  const restored: string[] = [];
  let created = 0, closed = 0;
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    prepare: async () => { throw Error('not used'); },
    prepareHost: async () => { throw Error('not used'); }, listHostOwners: async () => [],
    listOwners: async () => ['a', 'b'].map(projectId => ({ projectId, installationId: 'i', packageDirectory: root, entrypoint: 'workflow.mjs', bundleFingerprint: 'hash', owner: projectId })),
    hasUnfinishedInstallation: async id => id === 'i', close: async () => { closed++; },
  };
  const host = createOrchestrationHost({ dataDirectory: root, manager: async () => { created++; return manager; }, ensureProject: async id => { restored.push(id); } });
  try {
    await host.restore(); expect(created).toBe(0);
    await mkdir(join(root, 'orchestration'));
    await host.restore(); expect(restored).toEqual(['a', 'b']);
    expect((await host.owners('b'))[0]?.readiness).toMatchObject({ status: 'unavailable', code: 'project_unavailable' });
    await expect(host.guardInstallation('i')).rejects.toThrow('unfinished workflows');
    await host.guardInstallation('other');
    await Promise.all([host.close(), host.close()]); expect(closed).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing prerequisites expose actionable readiness without disabling ordinary backend use', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-orchestration-unavailable-'));
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    prepare: async () => { throw Error('spawn temporal ENOENT'); }, prepareHost: async () => { throw Error('not used'); }, listOwners: async () => [], listHostOwners: async () => [], hasUnfinishedInstallation: async () => false, close: async () => {},
  };
  const host = createOrchestrationHost({ dataDirectory: root, manager: async () => manager, ensureProject: async () => {} });
  try {
    const installed: Installation = { id: crypto.randomUUID(), name: 'documents', root, enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] };
    const inventory: PackageInventory = { root, name: 'documents', extensions: {}, skills: [], servers: [], diagnostics: [], drawloom: { version: 1, backend: { entrypoint: 'backend.mjs' }, workflows: { entrypoint: 'workflows.mjs' } } };
    const registration = await host.prepare('a', installed, inventory, handlers => handlers);
    expect(registration.capabilities.orchestration).toBeUndefined();
    expect(await registration.capabilities.orchestrationReadiness!()).toMatchObject({ status: 'configuration_required', code: 'local_runtime_required' });
    await registration.attach([]);
    expect(await host.owners('a')).toHaveLength(1);
    await expect(host.list({ projectId: 'a', installationId: installed.id })).rejects.toThrow('Install a compatible');
    await host.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saved owners remain visible when their project is unavailable; changed bundles remain blocked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-workflow-offline-'));
  await mkdir(join(root, 'orchestration'));
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    prepare: async () => { throw Error('Workflow bundle changed with unfinished runs'); },
    prepareHost: async () => { throw Error('not used'); }, listHostOwners: async () => [],
    listOwners: async () => [{ projectId: 'offline', installationId: 'i', packageDirectory: root, entrypoint: 'workflow.mjs', bundleFingerprint: 'hash', owner: 'offline-i' }],
    hasUnfinishedInstallation: async () => true, close: async () => {},
  };
  const host = createOrchestrationHost({ dataDirectory: root, manager: async () => manager, ensureProject: async () => { throw Error('Project directory missing'); } });
  try {
    await host.restore();
    expect((await host.owners('offline'))[0]?.readiness).toMatchObject({ status: 'unavailable', code: 'project_unavailable' });
    await expect(host.list({ projectId: 'offline', installationId: 'i' })).rejects.toThrow();
    await expect(host.changeInstallation('i', async () => {})).rejects.toThrow('unfinished workflows');
    const registration = await host.prepare('online', { id: 'i', root, name: 'documents', enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] },
      { root, name: 'documents', extensions: {}, skills: [], servers: [], diagnostics: [], drawloom: { version: 1, workflows: { entrypoint: 'workflow.mjs' } } }, handlers => handlers);
    expect(await registration.capabilities.orchestrationReadiness!()).toMatchObject({ code: 'workflow_code_changed' });
    expect(registration.capabilities.orchestration).toBeUndefined();
  } finally { await host.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed manager restoration reports readiness instead of disabling ordinary startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-workflow-restore-failure-'));
  await mkdir(join(root, 'orchestration'));
  const host = createOrchestrationHost({ dataDirectory: root, manager: async () => { throw Error('private internal startup detail'); }, ensureProject: async () => {} });
  try {
    expect(await host.restore()).toMatchObject({ status: 'unavailable', code: 'local_runtime_unavailable' });
  } finally { await host.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
});

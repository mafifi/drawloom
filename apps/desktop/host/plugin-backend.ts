import { realpath, mkdir, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { DrawloomPackageExtensionSchema, type PackageInventory, type PluginRequirement } from '@drawloom/plugins';
import { OrchestrationReadinessSchema, type PluginBackend, type PluginBackendCapabilities, type PluginBackendContext, type PluginBackendDependency, type PluginBackendFactory } from '@drawloom/desktop-host';

export type BackendActivation =
  | { status: 'ready'; backend: PluginBackend }
  | { status: 'absent' | 'untrusted' }
  | { status: 'unavailable'; missing: readonly PluginRequirement[] }
  | { status: 'failed'; code: string };
export interface BackendActivationOptions extends Omit<PluginBackendContext, 'packageRoot' | 'dependencies'> {
  trusted: boolean;
  available: readonly PluginRequirement[];
}
const method = (value: unknown, key: string) => typeof value === 'object' && value !== null &&
  typeof Reflect.get(value, key) === 'function';

/** Composition-owned loader. Trust authorizes process execution, not sandboxed code. */
export function createBackendLoader() {
  const active = new Map<string, Promise<BackendActivation>>();
  let closing: Promise<void> | undefined;
  async function start(inventory: PackageInventory, options: BackendActivationOptions): Promise<BackendActivation> {
    const parsed = DrawloomPackageExtensionSchema.safeParse(inventory.drawloom);
    if (!parsed.success) return { status: 'failed', code: 'invalid_backend_extension' };
    const definition = parsed.data;
    if (!definition.backend) return { status: 'absent' };
    if (!options.trusted) return { status: 'untrusted' };
    const present = new Set(options.available.map(r => `${r.kind}:${r.id}`));
    // Only capability objects actually provided count as available backend services.
    for (const name of ['host', 'tools', 'orchestration'] as const)
      if (options.capabilities[name]) present.add(`capability:${name}`);
      else present.delete(`capability:${name}`);
    const missing = (definition.requires ?? []).filter(r => !present.has(`${r.kind}:${r.id}`));
    if (missing.length) return { status: 'unavailable', missing };
    let root: string, entry: string;
    try {
      root = await realpath(inventory.root);
      entry = await realpath(resolve(root, definition.backend.entrypoint));
      const path = relative(root, entry);
      if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path) || !(await stat(entry)).isFile())
        throw Error('Outside package');
    } catch { return { status: 'failed', code: 'backend_path_unavailable' }; }
    if (closing) return { status: 'failed', code: 'backend_host_closed' };
    const declared = [...(definition.requires ?? []), ...(definition.optional ?? [])];
    const requested = new Set(declared.filter(r => r.kind === 'capability').map(r => r.id));
    const capabilities: PluginBackendCapabilities = {
      ...(requested.has('host') && options.capabilities.host ? { host: options.capabilities.host } : {}),
      ...(requested.has('tools') && options.capabilities.tools ? { tools: options.capabilities.tools } : {}),
      ...(requested.has('orchestration') && options.capabilities.orchestration ? { orchestration: options.capabilities.orchestration } : {}),
      ...(requested.has('orchestration') && options.capabilities.orchestrationReadiness ? {
        orchestrationReadiness: async () => OrchestrationReadinessSchema.parse(await options.capabilities.orchestrationReadiness!()),
      } : {}),
    };
    const dependencies = new Map<string, PluginBackendDependency>();
    for (const item of declared) {
      const available = present.has(`${item.kind}:${item.id}`);
      if (item.kind === 'tool' || item.kind === 'skill') dependencies.set(`${item.kind}:${item.id}`, Object.freeze({ kind: item.kind, id: item.id, available }));
      else if (item.id === 'orchestration') dependencies.set('capability:orchestration', Object.freeze({ kind: 'capability' as const, id: 'orchestration' as const, available }));
    }
    let backend: PluginBackend | undefined;
    try {
      await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
      const module: unknown = await import(pathToFileURL(entry).href);
      const factory = z.object({ default: z.custom<PluginBackendFactory>(v => typeof v === 'function') }).parse(module).default;
      backend = await factory(Object.freeze({ installationId: options.installationId, packageRoot: root,
        ...(options.project ? { project: Object.freeze({ ...options.project }) } : {}),
        dataDirectory: options.dataDirectory, configuration: options.configuration,
        dependencies: Object.freeze([...dependencies.values()]),
        capabilities: Object.freeze(capabilities) }));
      if (!method(backend, 'dispose')) throw Error('Missing cleanup');
      if (backend.servers !== undefined && !Array.isArray(backend.servers)) throw Error('Invalid servers');
      const names = new Set(inventory.servers.map(server => server.name));
      for (const server of backend.servers ?? []) {
        if (!server || typeof server.name !== 'string' || !server.name || names.has(server.name) ||
          !method(server.transport, 'start') || !method(server.transport, 'send') || !method(server.transport, 'close'))
          throw Error('Invalid or conflicting server');
        names.add(server.name);
      }
      return { status: 'ready', backend };
    } catch {
      if (backend && method(backend, 'dispose')) { try { await backend.dispose(); } catch { /* Preserve activation failure. */ } }
      return { status: 'failed', code: 'backend_activation_failed' };
    }
  }
  return {
    async activate(inventory: PackageInventory, options: BackendActivationOptions): Promise<BackendActivation> {
      if (closing) return { status: 'failed', code: 'backend_host_closed' };
      if (!inventory.drawloom?.backend) return { status: 'absent' };
      const id = options.installationId;
      if (!id || !/^[A-Za-z0-9._-]+$/.test(id) || id === '.' || id === '..')
        return { status: 'failed', code: 'invalid_installation' };
      const key = JSON.stringify([id, options.project?.id ?? null]);
      let promise = active.get(key);
      if (!promise) { promise = start(inventory, options); active.set(key, promise); }
      const result = await promise;
      // Explicit configuration/trust correction can retry, never a running replacement.
      if (result.status !== 'ready' && active.get(key) === promise) active.delete(key);
      return result;
    },
    close(): Promise<void> {
      closing ??= (async () => {
        const results = await Promise.all(active.values());
        active.clear();
        const closed = await Promise.allSettled(results.filter(r => r.status === 'ready').map(async r => r.backend.dispose()));
        if (closed.some(r => r.status === 'rejected')) throw Error('Plugin backend cleanup failed');
      })();
      return closing;
    },
  };
}

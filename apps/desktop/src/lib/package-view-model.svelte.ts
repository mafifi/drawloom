import { InstalledPackagesSchema, PackageInspectionSchema, PackageOAuthStatusSchema, PackageSettingsSchema, type PackageAction, type PackageOAuthActionSchema } from './package-protocol.js';
import type { z } from 'zod';
export function createPackageViewModel() {
  let root = $state(''), error = $state(''), pending = $state('');
  let inspection = $state<z.infer<typeof PackageInspectionSchema>>();
  let installations = $state<z.infer<typeof InstalledPackagesSchema>>([]);
  let authentication = $state<Record<string, z.infer<typeof PackageOAuthStatusSchema>>>({});
  const authEpoch = new Map<string, number>();
  async function request(action?: PackageAction) {
    const response = await fetch('/api/packages', action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : {});
    if (!response.ok) throw Error('Package request failed. Check the path, package metadata and host permissions.');
    return response.json();
  }
  async function run(key: string, action: () => Promise<void>, interrupt = false) {
    if (pending && !interrupt) return;
    pending = key; error = '';
    try { await action(); } catch (e) { error = e instanceof Error ? e.message : 'Package request failed'; }
    finally { if (pending === key) pending = ''; }
  }
  return {
    get root() { return root; }, set root(value: string) { root = value; inspection = undefined; },
    get error() { return error; }, get pending() { return pending; }, get inspection() { return inspection; }, get installations() { return installations; },
    get authentication() { return authentication; },
    serverChoices(id: string) {
      const entry = installations.find(item => item.id === id);
      if (!entry) return [];
      return [...entry.availableServers, ...entry.servers.filter(name => !entry.availableServers.some(server => server.name === name)).map(name => ({ name, transport: 'unknown' }))];
    },
    authenticate: (id: string, server: string, action: z.infer<typeof PackageOAuthActionSchema>['action'], registrationFile?: string) => run('oauth:' + id + ':' + server + ':' + action, async () => {
      const key = id + ':' + server; const epoch = (authEpoch.get(key) ?? 0) + 1; authEpoch.set(key, epoch);
      try {
        const response = await fetch('/api/packages/oauth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, server, ...(action === 'configure-client' ? { registrationFile } : {}) }) });
        if (!response.ok) throw Error('Connection action failed. Check activation and current work before trying again.');
        const status = PackageOAuthStatusSchema.parse(await response.json());
        if (authEpoch.get(key) !== epoch) return;
        authentication[key] = status;
        const latest = InstalledPackagesSchema.parse(await request());
        if (authEpoch.get(key) === epoch) installations = latest;
      } catch (error) { if (authEpoch.get(key) === epoch) throw error; }
    }, action === 'cancel'),
    refresh: () => run('refresh', async () => { installations = InstalledPackagesSchema.parse(await request()); }),
    inspect: () => run('inspect', async () => { inspection = PackageInspectionSchema.parse(await request({ action: 'inspect', root })); root = inspection.root; }),
    add: () => run('add', async () => { if (!inspection || inspection.root !== root) throw Error('Inspect this package first.'); installations = InstalledPackagesSchema.parse(await request({ action: 'add', root })); inspection = undefined; root = ''; }),
    configure: (id: string, enabled: boolean, trustedBackend: boolean, servers?: string[], approvedResourceOrigins?: string[], elicitationDisabledServers?: string[]) => run(id, async () => {
      const current = installations.find(i => i.id === id); if (!current) throw Error('Installation unavailable');
      const settings = PackageSettingsSchema.parse({ enabled, trustedBackend, servers: servers ?? current.servers, ...(approvedResourceOrigins ? { approvedResourceOrigins } : {}), ...(elicitationDisabledServers ? { elicitationDisabledServers } : {}) });
      installations = InstalledPackagesSchema.parse(await request({ action: 'configure', id, settings }));
    }),
  };
}
import { telemetryFetch as fetch } from './telemetry.js';

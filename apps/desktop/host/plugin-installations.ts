import { z } from 'zod';
import { JsonValueSchema, type JsonStore } from '@drawloom/host';
import type { PackageInventory } from '@drawloom/plugins';
import { inspectPackage } from '@drawloom/local-plugin-packages';

// Host configuration, not a plugin capability or a browser credential envelope.
export const InstallationSchema = z.strictObject({
  id: z.string().uuid(), root: z.string().min(1), name: z.string().min(1),
  enabled: z.boolean(), trustedBackend: z.boolean(), servers: z.array(z.string()),
  configuration: z.record(z.string(), JsonValueSchema).default({}),
});
export type Installation = z.infer<typeof InstallationSchema>;
const State = z.strictObject({ version: z.literal(1), installations: z.array(InstallationSchema) });
export async function createInstallationStore(store: JsonStore) {
  const raw = await store.get('plugin-installations');
  let state = State.parse(raw ?? { version: 1, installations: [] });
  const startup = structuredClone(state.installations);
  let queue: Promise<unknown> = Promise.resolve();
  function change(action: (next: typeof state) => void) {
    const result = queue.then(async () => {
      const next = structuredClone(state); action(next);
      await store.set('plugin-installations', State.parse(next));
      state = next;
    });
    queue = result.catch(() => {}); return result;
  }
  return {
    startup,
    list: () => structuredClone(state.installations),
    async inspect(root: string): Promise<PackageInventory> { return inspectPackage(root); },
    async add(root: string) {
      const inventory = await inspectPackage(root);
      let id = '';
      await change(next => {
        const existing = next.installations.find(i => i.root === inventory.root);
        if (existing) { id = existing.id; return; }
        id = crypto.randomUUID();
        next.installations.push({ id, root: inventory.root, name: inventory.name,
          enabled: false, trustedBackend: false, servers: inventory.servers.filter(s => s.config.type !== 'sse').map(s => s.name), configuration: {} });
      });
      return id;
    },
    async configure(id: string, input: Pick<Installation, 'enabled' | 'trustedBackend' | 'servers' | 'configuration'>) {
      const current = state.installations.find(i => i.id === id);
      if (!current) throw Error('Installation unavailable');
      const parsed = InstallationSchema.parse({ ...current, ...input });
      const inventory = await inspectPackage(current.root);
      if (parsed.servers.some(name => !inventory.servers.some(s => s.name === name && s.config.type !== 'sse')))
        throw Error('Unknown or unsupported server');
      await change(next => { next.installations = next.installations.map(i => i.id === id ? parsed : i); });
    },
    pendingRestart(id: string) {
      return JSON.stringify(state.installations.find(i => i.id === id)) !== JSON.stringify(startup.find(i => i.id === id));
    },
  };
}

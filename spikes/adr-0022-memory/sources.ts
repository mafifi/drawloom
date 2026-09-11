import { z } from 'zod';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
const identity = z.string().min(1).max(100);
export const SourceUpdate = z.strictObject({ id: identity, revision: identity, previous: identity.nullable(), kind: z.enum(['fibre', 'thread', 'source']), state: z.enum(['active', 'withdrawn']), text: z.string().min(1).max(2000) });
export const Claims = z.array(z.strictObject({ id: identity, text: z.string().min(1).max(2000), links: z.array(z.strictObject({ key: z.string().min(1).max(250), revision: identity })).min(1).max(100) })).max(8);
const Change = SourceUpdate.omit({ id: true, previous: true }).extend({ key: z.string() });
const State = z.strictObject({ changes: z.array(Change).max(200), claims: Claims, waterline: z.number().int().nonnegative() });
// Disposable single-writer revision experiment, not a supported provider.
export class SourceNotebook {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string, readonly threshold = 50) { z.number().int().min(1).max(200).parse(threshold); }
  private async read(): Promise<z.infer<typeof State>> {
    try { return State.parse(JSON.parse(await readFile(join(this.directory, 'sources.json'), 'utf8'))); }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { changes: [], claims: [], waterline: 0 }; throw error; }
  }
  private change(edit: (state: z.infer<typeof State>) => void) {
    const task = this.queue.then(async () => {
      const state = await this.read(); edit(state); State.parse(state);
      const path = join(this.directory, 'sources.json');
      await writeFile(path + '.next', JSON.stringify(state), { mode: 0o600 }); await rename(path + '.next', path);
    });
    this.queue = task.catch(() => {}); return task;
  }
  producer(owner: string) {
    identity.parse(owner);
    return { update: async (raw: z.infer<typeof SourceUpdate>) => {
      const { id, previous, ...value } = SourceUpdate.parse(raw);
      const incoming = { ...value, key: JSON.stringify([owner, id]) };
      await this.change(state => {
        const old = state.changes.find(row => row.key === incoming.key && row.revision === incoming.revision);
        if (old) { if (JSON.stringify(old) !== JSON.stringify(incoming)) throw Error('Conflicting revision'); return; }
        const current = [...state.changes].reverse().find(row => row.key === incoming.key);
        if ((current?.revision ?? null) !== previous) throw Error('Stale source position');
        state.changes.push(incoming);
      });
    } };
  }
  async snapshot() {
    await this.queue; const state = await this.read();
    const latest = new Map(state.changes.map(row => [row.key, row.revision]));
    return { ...state, through: state.changes.length, pending: state.changes.length - state.waterline, due: state.changes.length - state.waterline >= this.threshold,
      claims: state.claims.map(claim => ({ ...claim, needsRecheck: claim.links.some(link => !claim.links.some(other => other.key === link.key && other.revision === latest.get(link.key))) })),
    };
  }
  async publish(base: number, through: number, raw: unknown) {
    const claims = Claims.parse(raw);
    await this.change(state => {
      if (base !== state.waterline || !Number.isInteger(through) || through <= base || through > state.changes.length) throw Error('Stale or invalid assessment position');
      if (new Set(claims.map(claim => claim.id)).size !== claims.length) throw Error('Duplicate claim');
      const assessed = state.changes.slice(0, through);
      for (const claim of claims) for (const link of claim.links) {
        if (!assessed.some(row => row.key === link.key && row.revision === link.revision)) throw Error('Unknown evidence revision');
      }
      state.claims = claims; state.waterline = through;
    });
  }
}

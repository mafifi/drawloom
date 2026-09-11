import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

// Provisional experiment shapes, NOT supported Drawloom contracts.
export const Observation = z.strictObject({
  id: z.string().min(1).max(100), topic: z.string().min(1).max(100),
  outcome: z.string().min(1).max(100), detail: z.string().min(1).max(2000),
});
export const OrganisedNotes = z.array(z.strictObject({ topic: z.string().min(1).max(100), text: z.string().min(1).max(2000), sources: z.array(z.string()).min(1).max(100) })).min(1).max(8);
const State = z.strictObject({
  observations: z.array(Observation).max(100),
  notes: z.array(z.strictObject({ topic: z.string(), text: z.string().max(2000), sources: z.array(z.string()) })),
});
// One writer instance per isolated proof; no distributed/concurrent-process claims.
export class Notebook {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  async snapshot(): Promise<z.infer<typeof State>> { await this.pending; return this.read(); }
  async organise(raw: unknown): Promise<void> {
    const notes = OrganisedNotes.parse(raw);
    await this.change(state => {
      const expected = state.observations.map(row => row.id).sort();
      const covered = [...new Set(notes.flatMap(note => note.sources))].sort();
      if (new Set(notes.map(note => note.topic)).size !== notes.length) throw Error('Duplicate topic');
      if (JSON.stringify(expected) !== JSON.stringify(covered)) throw Error('Missing, unknown or stale evidence');
      state.notes = notes;
    });
  }
  private async read() {
    try { return State.parse(JSON.parse(await readFile(join(this.directory, 'notebook.json'), 'utf8'))); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return { observations: [], notes: [] } as z.infer<typeof State>;
      throw error;
    }
  }
  private change(edit: (state: z.infer<typeof State>) => void) {
    const operation = this.pending.then(async () => {
      const state = await this.read(); edit(state); State.parse(state);
      const path = join(this.directory, 'notebook.json');
      await writeFile(path + '.next', JSON.stringify(state), { mode: 0o600 });
      await rename(path + '.next', path);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  async capture(raw: unknown): Promise<void> {
    const event = Observation.parse(raw);
    await this.change(state => {
      const previous = state.observations.find(row => row.id === event.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw Error('Conflicting observation identity');
      if (!previous) state.observations.push(event);
    });
  }
  async evidence(topic: string) {
    await this.pending;
    return (await this.read()).observations.filter(row => row.topic === topic);
  }
  async publish(topic: string, text: string, sources: string[]): Promise<void> {
    await this.change(state => {
      const expected = state.observations.filter(row => row.topic === topic).map(row => row.id).sort();
      if (!expected.length || JSON.stringify(expected) !== JSON.stringify([...new Set(sources)].sort())) throw Error('Missing or stale evidence');
      state.notes = state.notes.filter(note => note.topic !== topic);
      state.notes.push({ topic, text: z.string().min(1).max(2000).parse(text), sources: expected });
    });
  }
  async search(topic: string) {
    await this.pending;
    const state = await this.read();
    return state.notes.filter(note => note.topic === topic).map(note => ({
      topic, text: note.text,
      sources: state.observations.filter(row => note.sources.includes(row.id)),
      stale: state.observations.some(row => row.topic === topic && !note.sources.includes(row.id)),
    }));
  }
}

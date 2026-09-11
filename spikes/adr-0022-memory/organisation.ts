import type { Notebook } from './store.js';
type Snapshot = Awaited<ReturnType<Notebook['snapshot']>>;
export function readOrganised(state: Snapshot, topic: string) {
  const covered = new Set(state.notes.flatMap(note => note.sources));
  const unreviewed = state.observations.filter(row => !covered.has(row.id));
  return {
    notes: state.notes.filter(note => note.topic === topic).map(note => ({ ...note, sources: state.observations.filter(row => note.sources.includes(row.id)) })),
    unreviewed, stale: unreviewed.length > 0,
  };
}

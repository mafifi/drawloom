import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Notebook } from './store.js';
import { readOrganised } from './organisation.js';

const a = { id: 'a', topic: 'unfiled', outcome: 'observed', detail: 'Incident X: native failed.' };
const b = { id: 'b', topic: 'unfiled', outcome: 'reported', detail: 'Another report of incident X, not a second test.' };
const c = { id: 'c', topic: 'unfiled', outcome: 'observed', detail: 'Speech test: retain pauses.' };
const notes = [{ topic: 'Cut-out export', text: 'One incident, two reports.', sources: ['a', 'b'] }, { topic: 'Narration', text: 'Keep pauses.', sources: ['c'] }];
async function check(work: (book: Notebook, path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), 'drawloom-memory-organisation-'));
  try { await work(new Notebook(path), path); } finally { await rm(path, { recursive: true, force: true }); }
}
test('agent-chosen grouping preserves original observations and survives reopen', async () => {
  await check(async (book, path) => {
    for (const row of [a, b, a, c]) await book.capture(row);
    await book.organise(notes);
    expect(await new Notebook(path).snapshot()).toEqual({ observations: [a, b, c], notes });
  });
});
test('incomplete, unknown and duplicate-topic publication cannot replace good notes', async () => {
  await check(async book => {
    for (const row of [a, b, c]) await book.capture(row);
    await book.organise(notes);
    await expect(book.organise([notes[0]])).rejects.toThrow();
    await expect(book.organise([{ ...notes[0], sources: ['a', 'b', 'c', 'missing'] }])).rejects.toThrow();
    await expect(book.organise([notes[0], { ...notes[1], topic: 'Cut-out export' }])).rejects.toThrow();
    expect((await book.snapshot()).notes).toEqual(notes);
  });
});
test('interrupted or stale maintenance leaves previous notes and new evidence readable', async () => {
  await check(async (book, path) => {
    for (const row of [a, b, c]) await book.capture(row);
    await book.organise(notes);
    const later = { ...a, id: 'later', detail: 'New version passed the same test.' };
    await book.capture(later);
    // No publish after reading: reopening must retain the last successful snapshot.
    const reopened = new Notebook(path);
    expect((await reopened.snapshot()).notes).toEqual(notes);
    expect((await reopened.snapshot()).observations).toEqual([a, b, c, later]);
    await expect(reopened.organise(notes)).rejects.toThrow();
    await reopened.organise([{ ...notes[0], text: 'New version passed; retain the earlier incident.', sources: ['a', 'b', 'later'] }, notes[1]]);
    expect((await reopened.snapshot()).notes[0]?.sources).toEqual(['a', 'b', 'later']);
  });
});
test('reader sees pending observations rather than silently trusting an old organised note', () => {
  const old = [{ topic: 'Cut-out export', text: 'One incident.', sources: ['a'] }];
  expect(readOrganised({ observations: [a, c], notes: old }, 'Cut-out export')).toEqual({
    notes: [{ topic: 'Cut-out export', text: 'One incident.', sources: [a] }], unreviewed: [c], stale: true,
  });
  expect(readOrganised({ observations: [a, b, c], notes }, 'Narration')).toEqual({
    notes: [{ topic: 'Narration', text: 'Keep pauses.', sources: [c] }], unreviewed: [], stale: false,
  });
  expect(readOrganised({ observations: [a, b, c], notes }, 'Unknown')).toEqual({ notes: [], unreviewed: [], stale: false });
});

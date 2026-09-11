import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Notebook } from './store.js';

const first = { id: 'inspection-1', topic: 'fern-renderer', outcome: 'capacity_failure', detail: 'One Saturday attempt failed in region west.' };
async function withNotebook(work: (book: Notebook, path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), 'drawloom-memory-unit-'));
  try { await work(new Notebook(path), path); } finally { await rm(path, { recursive: true, force: true }); }
}
test('capture is durable and duplicate delivery cannot become independent evidence', async () => {
  await withNotebook(async (book, path) => {
    await book.capture(first); await book.capture(first);
    expect(await new Notebook(path).evidence('fern-renderer')).toEqual([first]);
    await expect(book.capture({ ...first, outcome: 'success' })).rejects.toThrow();
    expect(await book.evidence('fern-renderer')).toEqual([first]);
  });
});
test('publication rejects missing or incomplete evidence without replacing the last note', async () => {
  await withNotebook(async book => {
    await book.capture(first);
    await book.publish('fern-renderer', 'One failure does not establish a pattern.', ['inspection-1']);
    await expect(book.publish('fern-renderer', 'Unsupported', ['missing'])).rejects.toThrow();
    await book.capture({ ...first, id: 'inspection-2', outcome: 'success' });
    await expect(book.publish('fern-renderer', 'Stale snapshot', ['inspection-1'])).rejects.toThrow();
    expect(await book.search('fern-renderer')).toMatchObject([{ text: 'One failure does not establish a pattern.', stale: true }]);
  });
});
test('new evidence marks notes stale until published and unrelated topics return nothing', async () => {
  await withNotebook(async (book, path) => {
    await book.capture(first);
    await book.publish('fern-renderer', 'One capacity failure.', ['inspection-1']);
    await book.capture({ ...first, id: 'inspection-2', outcome: 'success', detail: 'A later Saturday attempt succeeded in region west.' });
    expect(await book.search('fern-renderer')).toMatchObject([{ stale: true }]);
    await book.publish('fern-renderer', 'Mixed Saturday outcomes, not a universal rule.', ['inspection-1', 'inspection-2']);
    expect(await new Notebook(path).search('fern-renderer')).toMatchObject([{ stale: false, sources: [first, { id: 'inspection-2' }] }]);
    expect(await book.search('unrelated')).toEqual([]);
  });
});

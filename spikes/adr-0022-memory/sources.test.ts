import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceNotebook, type SourceUpdate } from './sources.js';
import type { z } from 'zod';
const first: z.infer<typeof SourceUpdate> = { id: 'guide', revision: 'r1', previous: null, kind: 'source', state: 'active', text: 'Initial guide.' };
async function check(work: (book: SourceNotebook, path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), 'drawloom-memory-sources-'));
  try { await work(new SourceNotebook(path), path); } finally { await rm(path, { recursive: true, force: true }); }
}
test('one threshold counts mixed changes once and survives reopen', async () => {
  await check(async (book, path) => {
    const plugin = book.producer('plugin');
    for (let n = 0; n < 49; n++) await plugin.update({ ...first, id: `item-${n}`, kind: n % 3 === 0 ? 'fibre' : n % 3 === 1 ? 'thread' : 'source' });
    await plugin.update({ ...first, id: 'item-0', kind: 'fibre' });
    expect(await book.snapshot()).toMatchObject({ pending: 49, due: false });
    await plugin.update(first);
    expect(await new SourceNotebook(path).snapshot()).toMatchObject({ pending: 50, due: true });
  });
});
test('producer identities are isolated and conflicting or stale revisions cannot replace a source', async () => {
  await check(async book => {
    const one = book.producer('one'); const two = book.producer('two');
    await one.update(first); await two.update(first);
    await one.update({ ...first, revision: 'r2', previous: 'r1', text: 'Revised.' });
    await one.update(first); // Redelivery must not reactivate r1.
    await expect(one.update({ ...first, text: 'Conflict' })).rejects.toThrow();
    await expect(one.update({ ...first, revision: 'r3', previous: 'r1' })).rejects.toThrow();
    const s = await book.snapshot();
    expect(s.pending).toBe(3); expect(new Set(s.changes.map(c => c.key)).size).toBe(2);
  });
});
test('publication advances only its snapshot and leaves a later withdrawal pending with linked claims loose', async () => {
  await check(async (book, path) => {
    const plugin = book.producer('one'); await plugin.update(first);
    const snapshot = await book.snapshot(); const key = snapshot.changes[0]!.key;
    const claims = [{ id: 'Export', text: 'Provisional advice.', links: [{ key, revision: 'r1' }] }];
    await plugin.update({ ...first, revision: 'r2', previous: 'r1', state: 'withdrawn', text: 'Guide withdrawn.' });
    await book.publish(0, 1, claims);
    const reopened = new SourceNotebook(path); const pending = await reopened.snapshot();
    expect(pending).toMatchObject({ waterline: 1, through: 2, pending: 1, claims: [{ needsRecheck: true }] });
    await expect(reopened.publish(0, 1, claims)).rejects.toThrow();
    await expect(reopened.publish(1, 2, [{ ...claims[0], links: [{ key, revision: 'unknown' }] }])).rejects.toThrow();
    await reopened.publish(1, 2, [{ id: 'Export', text: 'Support withdrawn; no current conclusion.', links: [{ key, revision: 'r2' }] }]);
    expect(await reopened.snapshot()).toMatchObject({ waterline: 2, pending: 0, claims: [{ needsRecheck: false }] });
  });
});
test('an unlinked source enters the backlog without falsely identifying a claim as already contradicted', async () => {
  await check(async book => {
    const plugin = book.producer('one'); await plugin.update(first); const key = (await book.snapshot()).changes[0]!.key;
    await book.publish(0, 1, [{ id: 'Export', text: 'A claim.', links: [{ key, revision: 'r1' }] }]);
    await plugin.update({ ...first, id: 'new-study', text: 'Potential contradiction.' });
    expect(await book.snapshot()).toMatchObject({ pending: 1, claims: [{ needsRecheck: false }] });
  });
});

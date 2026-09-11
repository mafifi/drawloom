import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceNotebook } from './sources.js';
import { beginAssessment, readKnowledge } from './knowledge.js';

const guide = { id: 'guide', revision: 'r1', previous: null, kind: 'source' as const, state: 'active' as const, text: 'The measured native export loses transparency.' };
async function check(work: (book: SourceNotebook, path: string) => Promise<void>) {
  const path = await mkdtemp(join(tmpdir(), 'drawloom-memory-knowledge-'));
  try { await work(new SourceNotebook(path), path); } finally { await rm(path, { recursive: true, force: true }); }
}

test('assessment hides maintenance fields and binds saved claims to the evidence actually read', async () => {
  await check(async book => {
    await book.producer('lab').update(guide);
    const assessment = await beginAssessment(book);
    expect(Object.keys(assessment.knowledge).sort()).toEqual(['claims', 'evidence']);
    const evidence = assessment.knowledge.evidence[0]!;
    expect(Object.keys(evidence).sort()).toEqual(['id', 'source', 'text']);
    expect(evidence.source).toBe('lab / guide');
    expect(evidence.text).toContain(guide.text);
    await assessment.save([{ id: 'transparency', text: 'Native failed in this test.', evidence: [evidence.id] }]);
    const stored = await book.snapshot();
    expect(stored).toMatchObject({ waterline: 1, pending: 0 });
    expect(stored.claims[0]!.links).toEqual([{ key: '["lab","guide"]', revision: 'r1' }]);
    const found = await readKnowledge(book, 'transparency');
    expect(Object.keys(found.claims[0]!).sort()).toEqual(['evidence', 'id', 'text']);
    expect(found.claims[0]!.evidence).toEqual([evidence.id]);
    expect((await readKnowledge(book, 'unrelated')).claims).toEqual([]);
  });
});

test('a withdrawal arriving during assessment stays pending and readers see the caveat and evidence after reopen', async () => {
  await check(async (book, path) => {
    const producer = book.producer('lab'); await producer.update(guide);
    const assessment = await beginAssessment(book);
    await producer.update({ ...guide, revision: 'r2', previous: 'r1', state: 'withdrawn', text: 'The test was invalid; correctness is unknown.' });
    await assessment.save([{ id: 'transparency', text: 'Native failed in this test.', evidence: [assessment.knowledge.evidence[0]!.id] }]);
    const reopened = new SourceNotebook(path);
    expect(await reopened.snapshot()).toMatchObject({ waterline: 1, pending: 1, claims: [{ needsRecheck: true }] });
    const found = await readKnowledge(reopened, 'transparency');
    expect(found.claims[0]!.text).toContain('Evidence has changed');
    expect(found.evidence.some(e => e.text.includes('Withdrawn source'))).toBe(true);
    expect(found.evidence.some(e => e.text.includes('Historical source'))).toBe(true);
    expect(Object.keys(found).sort()).toEqual(['claims', 'evidence']);
  });
});

test('unknown references and supplied maintenance positions cannot advance the host checkpoint', async () => {
  await check(async book => {
    await book.producer('lab').update(guide);
    const assessment = await beginAssessment(book);
    const claim = { id: 'transparency', text: 'Unverified.', evidence: ['foreign-evidence'] };
    await expect(assessment.save([claim])).rejects.toThrow('Unknown evidence');
    await expect(assessment.save([{ ...claim, evidence: [assessment.knowledge.evidence[0]!.id], through: 200 }])).rejects.toThrow();
    expect(await book.snapshot()).toMatchObject({ waterline: 0, pending: 1, claims: [] });
  });
});

test('competing assessments cannot overwrite committed knowledge; unrelated new evidence remains available', async () => {
  await check(async book => {
    const producer = book.producer('lab'); await producer.update(guide);
    const one = await beginAssessment(book); const two = await beginAssessment(book);
    const claims = [{ id: 'transparency', text: 'A limited test.', evidence: [one.knowledge.evidence[0]!.id] }];
    await one.save(claims);
    await expect(two.save(claims)).rejects.toThrow('Stale');
    await producer.update({ ...guide, id: 'independent', text: 'A new independent test disagrees.' });
    const found = await readKnowledge(book, 'transparency');
    expect(found.evidence.some(e => e.text.includes('independent test disagrees'))).toBe(true);
    expect(found.claims[0]!.text).toBe('A limited test.');
  });
});

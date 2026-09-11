import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceNotebook } from './sources.js';
import { beginAssessment } from './knowledge.js';
import { createKnowledgeReader } from './retrieval.js';
test('query retrieval filters unrelated pending evidence, deduplicates within an operation and shows changed evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drawloom-retrieval-'));
  try {
    const book = new SourceNotebook(dir), source = book.producer('git');
    const row = { id: 'sidebar.ts', revision: '1', previous: null, kind: 'source' as const, state: 'active' as const, text: 'Sidebar cookie lifetime is seven days.' };
    await source.update(row);
    const assessment = await beginAssessment(book);
    await assessment.save([{ id: 'sidebar-cookie', text: 'Sidebar cookie persists for seven days.', evidence: [assessment.knowledge.evidence[0]!.id] }]);
    for (let i = 0; i < 30; i++) await source.update({ ...row, id: `audio-${i}`, text: 'Audio narration pacing and audio volume.' });
    const reader = createKnowledgeReader(book);
    const first = await reader.search('How long does the sidebar cookie last?');
    expect(first.claims).toHaveLength(1); expect(first.evidence).toHaveLength(1);
    expect((await reader.search('sidebar cookie')).evidence).toEqual([]);
    expect((await reader.search('unknown subject')).claims).toEqual([]);
    await source.update({ ...row, revision: '2', previous: '1', text: 'Sidebar cookie lifetime is now one day.' });
    const changed = await reader.search('sidebar cookie');
    expect(changed.claims[0]!.text).toContain('Evidence has changed');
    expect(changed.evidence.some(e => e.text.includes('one day'))).toBe(true);
    // A new operation must not inherit a prior agent's read receipts.
    expect((await createKnowledgeReader(book).search('sidebar cookie')).evidence.length).toBeGreaterThan(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

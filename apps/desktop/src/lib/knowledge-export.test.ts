import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { serializeKnowledgeExport } from './knowledge-export.js';

test('exports a Drawloom OKF profile document with pinned records and every edge', async () => {
  const ref = { type: 'source' as const, origin: 'public:origin', id: 'quote " and newline\n', revision: 'r1' };
  const record = { ref, body: 'Evidence\n```\nnot executable', status: 'active' as const, confidence: {}, provenance: { producer: { type: 'test', id: 'example' }, inputs: [] } };
  const links = [{ from: { ...ref, type: 'claim' as const, id: 'another-page' }, to: ref, relation: 'contrary' as const }];
  const result = await serializeKnowledgeExport({ records: [record], links }, new Date('2026-09-12T12:00:00Z'));
  const metadata = parse(result.split('---\n')[1]!);
  expect(metadata.type).toBe('index'); expect(metadata.status).toBe('draft');
  expect(metadata.created).toBe('2026-09-12'); expect(metadata.id).toMatch(/^knowledge-export-/);
  expect(metadata.records).toEqual([record]); expect(metadata.links).toEqual(links);
  expect(result).not.toContain('"kind":"ok"'); expect(result).toContain('page');
});

import { expect, test } from 'bun:test';
import { presentKnowledgeDisclosure } from './knowledge-disclosure.js';

test('disclosure only claims use after confirmed delivery and labels reference-only evidence', () => {
  const summary = { kind: 'ready' as const, references: [{ ref: { type: 'claim' as const, origin: 'public', id: 'large', revision: '2' }, status: 'active' as const, inclusion: 'reference_only' as const }] };
  expect(presentKnowledgeDisclosure(summary).references).toEqual([]);
  const result = presentKnowledgeDisclosure({ ...summary, receipt: { executionId: 'execution', submissionId: 'submission' } });
  expect(result.label).toBe('Knowledge used · 1');
  expect(result.references[0]?.detail).toContain('full text was not sent');
  expect(result.references[0]?.ref.revision).toBe('2');
});

test('empty and disabled preparation are quiet; failure does not claim nothing was relevant', () => {
  for (const kind of ['empty', 'disabled', 'denied'] as const) expect(presentKnowledgeDisclosure({ kind, references: [] }).notice).toBe('');
  for (const kind of ['timeout', 'unavailable', 'cancelled'] as const) expect(presentKnowledgeDisclosure({ kind, references: [] }).notice).toContain('unavailable');
});

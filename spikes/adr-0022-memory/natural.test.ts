import { test, expect } from 'bun:test';
import { indexContext } from './natural.js';
test('index context exposes only validated routing metadata, not note bodies', () => {
  const context = indexContext([{ topic: 'topic-1', title: 'Image delivery' }]);
  expect(context).toContain('topic-1'); expect(context).toContain('Image delivery');
  expect(() => indexContext([{ topic: 'topic-1', title: 'Image delivery', text: 'Untrusted note body' }])).toThrow();
});
test('index context rejects oversized catalogues and oversized titles rather than overflowing context', () => {
  expect(() => indexContext(Array.from({ length: 9 }, (_, n) => ({ topic: `topic-${n}`, title: 'Title' })))).toThrow();
  expect(() => indexContext([{ topic: 'topic-1', title: 'x'.repeat(161) }])).toThrow();
});

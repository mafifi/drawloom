import { expect, test } from 'bun:test';
import { createViewContext } from './view-context.js';

test('context is replaced, scoped and cleared instead of accumulating selected material', () => {
  const context = createViewContext();
  const target = { conversationId: 'one', viewId: 'view' };
  context.set(target, { content: [{ type: 'text', text: 'Earlier draft' }] });
  context.set(target, { content: [{ type: 'text', text: 'Chosen draft' }], structuredContent: { revision: 'r2' } });
  expect(context.forConversation('one')).toContain('Chosen draft');
  expect(context.forConversation('one')).toContain('r2');
  expect(context.forConversation('one')).not.toContain('Earlier draft');
  expect(context.forConversation('two')).toBe('');
  context.set(target, {});
  expect(context.forConversation('one')).toBe('');
  context.set(target, { content: [{ type: 'text', text: 'Another draft' }] });
  context.clear();
  expect(context.forConversation('one')).toBe('');
});

test('unsupported media and oversized context cannot replace the last valid context', () => {
  const context = createViewContext();
  const target = { conversationId: 'one', viewId: 'view' };
  context.set(target, { content: [{ type: 'text', text: 'Keep this' }] });
  expect(() => context.set(target, { content: [{ type: 'image', data: 'AAAA', mimeType: 'image/png' }] })).toThrow();
  expect(() => context.set(target, { structuredContent: { text: 'x'.repeat(100_001) } })).toThrow();
  expect(context.forConversation('one')).toContain('Keep this');
});

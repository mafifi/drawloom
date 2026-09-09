import { test, expect } from 'bun:test';
import { createStateFeed } from './state-feed.js';

test('state feed sends a baseline, no unchanged body and only changed sections', () => {
  const feed = createStateFeed();
  const first = feed.read({ selectedId: 'a', active: 'op', operator: { title: 'one' } });
  expect(first?.kind).toBe('snapshot');
  expect(feed.read({ selectedId: 'a', active: 'op', operator: { title: 'one' } }, first!.token)).toBeUndefined();
  const delta = feed.read({ selectedId: 'a', operator: { title: 'two' } }, first!.token);
  expect(delta).toMatchObject({ kind: 'patch', sections: { operator: { title: 'two' } }, removed: ['active'] });
  expect(delta?.sections).not.toHaveProperty('selectedId');
  expect(feed.read({ selectedId: 'a', operator: { title: 'two' } }, 'other-generation:2')?.kind).toBe('snapshot');
});

test('clients at older valid revisions receive all changed sections without retained snapshots', () => {
  const feed = createStateFeed();
  const first = feed.read({ a: 1, b: 1 })!;
  feed.read({ a: 2, b: 1 }, first.token);
  const last = feed.read({ a: 2, b: 3 }, first.token)!;
  expect(last.sections).toEqual({ a: 2, b: 3 });
});

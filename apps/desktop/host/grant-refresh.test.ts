import { expect, test } from 'bun:test';
import { createGrantRefresh } from './grant-refresh.js';

test('a delayed older snapshot cannot overwrite a newer revocation or expose a partial group', async () => {
  const grants = new Map([['a', new Set(['tool'])], ['b', new Set(['tool'])]]);
  let release!: () => void, calls = 0, allowed = true;
  const refresh = createGrantRefresh(grants, async id => {
    const captured = allowed;
    if (++calls === 1) await new Promise<void>(resolve => { release = resolve; });
    return { id, allowed: captured };
  }, state => new Set(state.allowed ? ['tool'] : []));
  const older = refresh(['a', 'b']);
  await Promise.resolve();
  allowed = false;
  const newer = refresh(['a', 'b']);
  expect(calls).toBe(1);
  expect(grants.get('a')!.has('tool')).toBe(true);
  release(); await Promise.all([older, newer]);
  expect(grants.get('a')!.size).toBe(0);
  expect(grants.get('b')!.size).toBe(0);
});

test('failed refresh revokes its group and does not poison subsequent refreshes', async () => {
  const grants = new Map([['a', new Set(['tool'])]]);
  let fail = true;
  const refresh = createGrantRefresh(grants, async () => { if (fail) throw Error('offline'); return true; }, () => new Set(['tool']));
  await expect(refresh(['a'])).rejects.toThrow('offline');
  expect(grants.has('a')).toBe(false);
  fail = false; await refresh(['a']);
  expect(grants.get('a')!.has('tool')).toBe(true);
});

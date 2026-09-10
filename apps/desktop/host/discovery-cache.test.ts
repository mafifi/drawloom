import { expect, test } from 'bun:test';
import { createDiscoveryCache } from './discovery-cache.js';

test('registered entries need not wait for package resources and refresh joins an active read', async () => {
  let resolve = (_value: string[]) => {};
  let calls = 0;
  const cache = createDiscoveryCache(async () => {
    calls++;
    return new Promise<string[]>((r) => {
      resolve = r;
    });
  });
  expect(cache.read()).toEqual({ status: 'loading' });
  expect(cache.read(true)).toEqual({ status: 'loading' });
  await Promise.resolve();
  expect(calls).toBe(1);
  resolve(['reference']);
  await new Promise((r) => setTimeout(r, 0));
  expect(cache.read()).toEqual({ status: 'available', value: ['reference'] });
  expect(calls).toBe(1);
});
test('failed discovery is visible and retries only on explicit refresh', async () => {
  let calls = 0;
  const cache = createDiscoveryCache(async () => {
    calls++;
    throw Error('private data');
  });
  cache.read();
  await new Promise((r) => setTimeout(r, 0));
  expect(cache.read()).toEqual({ status: 'error' });
  expect(calls).toBe(1);
  cache.read(true);
  await new Promise((r) => setTimeout(r, 0));
  expect(calls).toBe(2);
});
test('a successful session established elsewhere supersedes a cached connection failure', async () => {
  let calls = 0;
  const cache = createDiscoveryCache<string>(async () => {
    calls++;
    throw Error('Connection failed');
  });
  cache.read();
  await new Promise((r) => setTimeout(r, 0));
  expect(cache.read()).toEqual({ status: 'error' });
  expect(cache.read(false, 'live-session')).toEqual({
    status: 'available',
    value: 'live-session',
  });
  expect(cache.read(true, 'live-session')).toEqual({
    status: 'available',
    value: 'live-session',
  });
  expect(calls).toBe(1);
});

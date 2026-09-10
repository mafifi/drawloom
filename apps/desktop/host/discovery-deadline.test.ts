import { expect, test } from 'bun:test';
import { readProviderDiscovery } from './discovery-deadline.js';

test('slow provider discovery cannot withhold the registered catalogue indefinitely', async () => {
  let finish!: (value: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const result = await readProviderDiscovery(() => pending, 5);
  expect(result.status).toBe('unavailable');
  finish('late provider catalogue');
  await pending;
  expect(result.status).toBe('unavailable');
});

test('provider discovery preserves successful responses and contains rejected reads', async () => {
  expect(await readProviderDiscovery(async () => 'catalogue', 50)).toEqual({ status: 'ok', value: 'catalogue' });
  expect(await readProviderDiscovery(async () => { throw Error('private provider detail'); }, 50)).toEqual({ status: 'unavailable' });
});

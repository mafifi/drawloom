import { test, expect } from 'bun:test';
import { createNativeCredentialStore, createSessionCredentialStore, createPluginCredentialStore } from './plugin-credentials.js';

test('session credentials are isolated to the process-owned store', async () => {
  const store = createSessionCredentialStore();
  await store.set('server/issuer', 'secret');
  expect(await store.get('server/issuer')).toBe('secret');
  expect(await createSessionCredentialStore().get('server/issuer')).toBeUndefined();
  await store.delete('server/issuer');
  expect(await store.get('server/issuer')).toBeUndefined();
  expect(store.mode).toBe('session');
});
test('unavailable native storage visibly falls back to memory but deletion errors remain visible', async () => {
  const store = createNativeCredentialStore(() => ({
    async getPassword() { throw Error('Locked'); }, async setPassword() { throw Error('Locked'); }, async deleteCredential() { throw Error('Locked'); },
  }));
  expect(await store.get('key')).toBeUndefined();
  expect(store.mode).toBe('session');
  await store.set('key', 'session-secret');
  expect(await store.get('key')).toBe('session-secret');
  await expect(store.delete('key')).rejects.toThrow('Credential deletion unavailable');
  expect(await store.get('key')).toBeUndefined();
});
test.skipIf(process.env.DRAWLOOM_TEST_OS_CREDENTIALS !== '1' || process.platform !== 'darwin')('opt-in synthetic OS credential round trip', async () => {
  const key = `test-${crypto.randomUUID()}`, store = await createPluginCredentialStore();
  try {
    await store.set(key, 'drawloom-synthetic-test-value');
    expect(store.mode).toBe('os');
    expect(await store.get(key)).toBe('drawloom-synthetic-test-value');
  } finally { await store.delete(key); }
});

import { expect, test } from 'bun:test';
import { workflowFingerprint } from './src/storage.js';

test('workflow fingerprint binds executable bytes as well as a stable dependency closure', () => {
  const files: [string, string][] = [['b', 'hash-b'], ['a', 'hash-a']];
  expect(workflowFingerprint('original bundle', files)).toBe(workflowFingerprint('original bundle', [...files].reverse()));
  expect(workflowFingerprint('original bundle', files)).not.toBe(workflowFingerprint('different emitted code', files));
});

import { canonical } from './index.js';
/** Assertions belong to the suite; importing conformance needs no Node ambient APIs. */
export const check = {
  ok(value: unknown, message = 'Expected a truthy value') {
    if (!value) throw Error(message);
  },
  equal(actual: unknown, expected: unknown, message = 'Expected equal values') {
    if (actual !== expected) throw Error(message);
  },
  notEqual(actual: unknown, expected: unknown, message = 'Expected different values') {
    if (actual === expected) throw Error(message);
  },
  deepEqual(actual: unknown, expected: unknown, message = 'Expected equal JSON values') {
    if (canonical(actual) !== canonical(expected)) throw Error(message);
  },
  async rejects(action: Promise<unknown>) {
    try { await action; } catch { return; }
    throw Error('Expected operation to reject');
  },
};

import { expect, test } from 'bun:test';
import { presentToolOutcome } from './tool-outcome.js';

test('tool outcomes preserve completed, denied, cancelled, and uncertain states', () => {
  expect(presentToolOutcome({ invocationId: 'ok', evidence: 'recorded', outcome: { status: 'ok', value: {}, text: 'done' } })).toMatchObject({ state: 'completed', statusLabel: 'Completed' });
  expect(presentToolOutcome({ invocationId: 'denied', evidence: 'start_failed', outcome: { status: 'failed', code: 'denied', execution: 'not_started' } })).toMatchObject({ state: 'denied', statusLabel: 'Denied' });
  expect(presentToolOutcome({ invocationId: 'cancelled', evidence: 'recorded', outcome: { status: 'failed', code: 'cancelled', execution: 'not_started' } })).toMatchObject({ state: 'cancelled', statusLabel: 'Cancelled' });
  expect(presentToolOutcome({ invocationId: 'unknown', evidence: 'outcome_failed', outcome: { status: 'failed', code: 'evidence_failed', execution: 'unknown' } })).toMatchObject({ state: 'uncertain', statusLabel: 'Outcome uncertain' });
  expect(presentToolOutcome({ invocationId: 'denied-unknown', evidence: 'outcome_failed', outcome: { status: 'failed', code: 'denied', execution: 'unknown' } })).toMatchObject({ state: 'uncertain', statusLabel: 'Outcome uncertain' });
  expect(presentToolOutcome({ invocationId: 'cancelled-completed', evidence: 'recorded', outcome: { status: 'failed', code: 'cancelled', execution: 'completed' } })).toMatchObject({ state: 'failed', statusLabel: 'Failed' });
});

test('successful tool execution is not presented as business acceptance', () => {
  const outcome = presentToolOutcome({ invocationId: 'ok', evidence: 'recorded', outcome: { status: 'ok', value: {}, text: 'done' } });
  expect(outcome.description).toContain('not acceptance or publication');
  expect(outcome.label).toBe('Tool activity');
});

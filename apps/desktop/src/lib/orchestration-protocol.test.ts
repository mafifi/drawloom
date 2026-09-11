import { expect, test } from 'bun:test';
import { WorkflowRunSchema } from './orchestration-protocol.js';
const run = { runId: 'run', identity: 'request', workflow: 'sample', version: '1', status: 'running', cancellationRequested: false, childRunIds: [], pendingInputs: [], unresolvedEffects: [], steps: [], stepsTruncated: false };
test('browser workflow projections bound every string and attempt count', () => {
  expect(WorkflowRunSchema.safeParse(run).success).toBe(true);
  for (const key of ['runId', 'identity', 'workflow', 'version']) expect(WorkflowRunSchema.safeParse({ ...run, [key]: 'x'.repeat(2048) }).success).toBe(false);
  for (const step of [{ stepId: 'x'.repeat(2048), attempts: 1 }, { stepId: 'safe', attempts: -1 }, { stepId: 'safe', attempts: 1.5 }, { stepId: 'safe', attempts: 11 }])
    expect(WorkflowRunSchema.safeParse({ ...run, steps: [{ ...step, status: 'running' }] }).success).toBe(false);
  expect(WorkflowRunSchema.safeParse({ ...run, output: 'not browser data' }).success).toBe(false);
});

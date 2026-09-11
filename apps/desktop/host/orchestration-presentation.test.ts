import { expect, test } from 'bun:test';
import type { Orchestrator, RunSnapshot } from '@drawloom/orchestration';
import { createOrchestrationPresentation, WorkflowControlError } from './orchestration-presentation.js';

const snapshot: RunSnapshot = { runId: 'run', identity: 'request', workflow: 'documents', version: '1', status: 'running',
  cancellationRequested: false, childRunIds: [], unresolvedEffects: [], stepsTruncated: false, pendingInputs: ['review'],
  steps: [{ stepId: 'inspect', attempts: 1, status: 'completed', result: { secret: 'private-result' } }], output: { secret: 'private-output' }, failure: 'private-failure' };

test('presentation validates scope before provider access and strips task content', async () => {
  const calls: string[] = [];
  const provider: Orchestrator = { start: async () => 'run', get: async () => snapshot,
    list: async () => { calls.push('list'); return { runs: [snapshot] }; },
    getSteps: async () => ({ steps: snapshot.steps }), result: async () => ({}),
    respond: async (run, request) => { if (request !== 'review') throw Error('Input request unavailable'); calls.push(`${run}:${request}`); }, cancel: async run => { calls.push(`cancel:${run}`); },
  };
  const presentation = createOrchestrationPresentation(async scope => {
    if (scope.projectId !== 'a' || scope.installationId !== 'i') throw Error('Owner unavailable');
    return provider;
  });
  await expect(presentation.list({ projectId: 'b', installationId: 'i' })).rejects.toThrow('Owner unavailable');
  expect(calls).toEqual([]);
  const page = await presentation.list({ projectId: 'a', installationId: 'i' });
  expect(JSON.stringify(page)).not.toContain('private-');
  expect(page.runs[0]?.steps[0]).toEqual({ stepId: 'inspect', attempts: 1, status: 'completed' });
  await presentation.command({ action: 'respond', projectId: 'a', installationId: 'i', runId: 'run', requestId: 'review', value: { keep: true } });
  expect(calls).toEqual(['list', 'run:review']);
  await expect(presentation.command({ action: 'respond', projectId: 'a', installationId: 'i', runId: 'run', requestId: 'stale', value: true })).rejects.toThrow(WorkflowControlError);
  expect(calls.length).toBe(2);
});

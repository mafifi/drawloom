import { expect, test } from 'bun:test';
import type { Orchestrator, RunSnapshot } from '@drawloom/orchestration';
import { createKnowledgeActivity } from './knowledge-activity.js';
const run: RunSnapshot = { runId: 'run', identity: 'request', workflow: 'nightloom.maintenance', version: '2', status: 'completed',
  steps: [{ stepId: 'run/assess-50', status: 'completed', attempts: 1, result: { secret: 'raw-evidence' } }],
  pendingInputs: [], childRunIds: [], unresolvedEffects: [], cancellationRequested: false, stepsTruncated: true, output: { secret: 'raw-output' }, failure: 'raw-error' };
test('fixed host activity is bounded, content-free and read-only, including held terminal runs', async () => {
  const calls: unknown[] = [];
  const provider: Orchestrator = {
    start: async () => { throw Error('must not start'); }, cancel: async () => { throw Error('must not cancel'); }, respond: async () => { throw Error('must not respond'); },
    list: async input => { calls.push(input); return { runs: [run], cursor: 'next' }; },
    get: async id => { if (id !== 'run') throw Error('secret unknown run'); return run; },
    getSteps: async (id, input) => { calls.push({ id, ...input }); return { steps: run.steps, cursor: 'next-step' }; },
    result: async () => ({ kind: 'deferred', processed: 0, remaining: true }),
  };
  const activity = createKnowledgeActivity(() => ({ orchestrator: provider, readiness: () => ({ status: 'ready' }) }));
  expect(await activity.owner()).toMatchObject({ title: 'Knowledge maintenance', context: 'Across all projects' });
  for (const forged of [{ projectId: 'p' }, { installationId: 'i' }, { capabilityId: 'other' }, { limit: 101 }]) await expect(activity.list(forged)).rejects.toThrow();
  expect(calls).toEqual([]);
  const page = await activity.list({ limit: 2, cursor: 'page' });
  expect(page.runs[0]).toMatchObject({ displayStatus: 'Needs attention', status: 'completed' });
  expect(JSON.stringify(page)).not.toContain('raw-');
  expect(calls).toEqual([{ limit: 2, cursor: 'page' }]);
  calls.length = 0;
  await activity.list({ limit: 2, cursor: undefined });
  await activity.steps({ runId: 'run', limit: 1, cursor: undefined });
  expect(calls).toEqual([{ limit: 2 }, { id: 'run', limit: 1 }]);
  expect(calls.every(input => !Object.hasOwn(input as object, 'cursor'))).toBe(true);
  expect(await activity.detail({ runId: 'run' })).toMatchObject({ displayStatus: 'Needs attention' });
  expect(await activity.steps({ runId: 'run', limit: 1, cursor: 'steps' })).toEqual({ steps: [{ stepId: 'run/assess-50', status: 'completed', attempts: 1 }], cursor: 'next-step' });
  await expect(activity.detail({ runId: 'forged' })).rejects.toThrow('Knowledge maintenance run is unavailable');
  await expect(activity.steps({ runId: 'forged' })).rejects.toThrow('Knowledge maintenance run is unavailable');
  expect('command' in activity).toBe(false);
});
test('unavailable host reads never initialize an owner', async () => {
  const activity = createKnowledgeActivity(() => undefined);
  expect(await activity.owner()).toMatchObject({ readiness: { status: 'unavailable' } });
  await expect(activity.list({})).rejects.toThrow('Knowledge maintenance is unavailable');
});

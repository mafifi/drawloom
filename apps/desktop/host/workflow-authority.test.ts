import { expect, test } from 'bun:test';
import type { RegisteredTaskHandler, TaskContext } from '@drawloom/orchestration';
import { createWorkflowAuthority } from './workflow-authority.js';

const context = (runId: string): TaskContext => ({ runId, stepId: 'render', attemptId: runId + ':1', attempt: 1, taskVersion: '1', signal: new AbortController().signal });

test('task authority is installation/project scoped, concurrent and expires after the handler', async () => {
  const authority = createWorkflowAuthority();
  const seen: string[] = [];
  let late: () => boolean = () => true;
  const handler: RegisteredTaskHandler = { id: 'render', version: '1', async run() {
    const owner = authority.current()!;
    await Promise.resolve();
    seen.push(authority.current()!.projectId);
    if (owner.projectId === 'a') late = authority.capture();
    return owner.runId;
  } };
  const a = authority.wrap({ projectId: 'a', installationId: 'i' }, [handler], async () => {});
  const b = authority.wrap({ projectId: 'b', installationId: 'j' }, [handler], async () => {});
  expect(await Promise.all([a[0]!.run({}, context('first')), b[0]!.run({}, context('second'))])).toEqual(['first', 'second']);
  expect(seen.sort()).toEqual(['a', 'b']);
  expect(authority.current()).toBeUndefined();
  expect(late()).toBe(false);
});

test('recovery is marked inspection-only and cancelled work never enters handler', async () => {
  const authority = createWorkflowAuthority();
  let calls = 0;
  const wrapped = authority.wrap({ projectId: 'a', installationId: 'i' }, [{ id: 'render', version: '1',
    run() { calls++; return {}; }, recover() { expect(authority.current()?.recovering).toBe(true); return { status: 'unknown' }; },
  }], async () => {});
  expect(await wrapped[0]!.recover!({}, context('r'))).toEqual({ status: 'unknown' });
  const cancelled = context('r');
  cancelled.signal = AbortSignal.abort();
  await expect(wrapped[0]!.run({}, cancelled)).rejects.toThrow();
  expect(calls).toBe(0);
});

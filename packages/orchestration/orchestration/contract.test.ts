import { test, expect } from 'bun:test';
import { z } from 'zod';
import { parse, canonical, workflowResult, type Orchestrator } from './src/index.ts';
import * as orchestration from './src/index.ts';

test('published orchestration boundary rejects non-JSON transforms and mismatched result definitions', async () => {
  expect(() => parse(z.number().transform(() => new Date()), 1)).toThrow();
  expect(canonical({ b: [2, 1], a: 3 })).toBe('{"a":3,"b":[2,1]}');
  let resultReads = 0;
  const engine = {
    get: async () => ({ workflow: 'other', version: '1' }),
    result: async () => { resultReads++; return 4; },
  } as unknown as Orchestrator;
  const definition = { id: 'requested', version: '1', input: z.number(), output: z.number(), run: async () => 4 };
  await expect(workflowResult(engine, 'run', definition)).rejects.toThrow('Workflow identity mismatch');
  expect(resultReads).toBe(0);
});

test('workflow module definitions reject invalid identities and schema fields', () => {
  expect(typeof (orchestration as Record<string, unknown>).defineWorkflowModule).toBe('function');
  const defineWorkflowModule = orchestration.defineWorkflowModule;
  const workflow = orchestration.registerWorkflow({
    id: 'render', version: '1', input: z.string(), output: z.string(),
    run: async (_context, input) => input,
  });
  const task = { id: 'frame', version: '1', input: z.string(), output: z.string() };
  expect(defineWorkflowModule({ workflows: [workflow], tasks: [task] }).tasks[0]?.id).toBe('frame');
  for (const invalid of [
    { ...task, id: '' },
    { ...task, version: '' },
    { ...task, input: 'not-a-schema' },
    { ...task, future: true },
  ]) {
    expect(() => defineWorkflowModule({ workflows: [workflow], tasks: [invalid] })).toThrow();
  }
  expect(() => defineWorkflowModule({ workflows: [workflow], tasks: [task], future: true })).toThrow();
});

test('workflow modules reject duplicate identities within each definition kind', () => {
  const task = { id: 'frame', version: '1', input: z.string(), output: z.string() };
  const workflow = orchestration.registerWorkflow({
    id: 'render', version: '1', input: z.string(), output: z.string(),
    run: async (_context, input) => input,
  });
  expect(() => orchestration.defineWorkflowModule({ workflows: [workflow, workflow], tasks: [task] })).toThrow('Duplicate workflow identity render@1');
  expect(() => orchestration.defineWorkflowModule({ workflows: [workflow], tasks: [task, task] })).toThrow('Duplicate task identity frame@1');
});

test('task execution limits are bounded and legacy tasks receive the documented default', () => {
  const task = { id: 'frame', version: '1', input: z.string(), output: z.string() };
  expect(orchestration.taskExecutionLimits(task)).toEqual({ startToCloseTimeoutMs: 30_000 });
  expect(orchestration.taskExecutionLimits({ ...task, limits: { startToCloseTimeoutMs: 75_000 } })).toEqual({ startToCloseTimeoutMs: 75_000 });
  for (const startToCloseTimeoutMs of [0, -1, 1.5, Number.POSITIVE_INFINITY, 86_400_001]) {
    expect(() => orchestration.defineWorkflowModule({ workflows: [], tasks: [{ ...task, limits: { startToCloseTimeoutMs } }] })).toThrow();
  }
});

test('task handlers must match every module task identity exactly once', () => {
  expect(typeof (orchestration as Record<string, unknown>).matchTaskHandlers).toBe('function');
  const task = { id: 'frame', version: '1', input: z.string(), output: z.number() };
  const module = orchestration.defineWorkflowModule({ workflows: [], tasks: [task] });
  const handler = orchestration.registerTaskHandler(task, { run: (input) => input.length });
  expect(orchestration.matchTaskHandlers(module, [handler])).toHaveLength(1);
  expect(() => orchestration.matchTaskHandlers(module, [])).toThrow('Missing task handler frame@1');
  expect(() => orchestration.matchTaskHandlers(module, [handler, handler])).toThrow('Duplicate task handler identity frame@1');
  const wrongVersion = orchestration.registerTaskHandler({ ...task, version: '2' }, { run: (input) => input.length });
  expect(() => orchestration.matchTaskHandlers(module, [wrongVersion])).toThrow('Unexpected task handler frame@2');
});

test('matched task handlers validate module-owned inputs, outputs and recovery outcomes', async () => {
  const task = { id: 'frame', version: '1', input: z.string(), output: z.number(), limits: { startToCloseTimeoutMs: 75_000 } };
  const module = orchestration.defineWorkflowModule({ workflows: [], tasks: [task] });
  let calls = 0;
  const context = {
    taskVersion: '1', runId: 'run', stepId: 'step', attemptId: 'attempt', attempt: 1,
    signal: new AbortController().signal,
  };
  const [handler] = orchestration.matchTaskHandlers(module, [
    orchestration.registerTaskHandler(task, {
      run: (input) => { calls++; return input.length; },
      recover: async (input) => input === 'settled'
        ? { status: 'completed', output: input.length }
        : input === 'safe'
          ? { status: 'retryable' }
          : { status: 'unknown' },
    }),
  ]);
  expect(await handler!.run('value', context)).toBe(5);
  await expect(handler!.run(7, context)).rejects.toThrow();
  expect(calls).toBe(1);
  expect(handler!.task.limits).toEqual({ startToCloseTimeoutMs: 75_000 });
  expect(await handler!.recover?.('settled', context)).toEqual({ status: 'completed', output: 7 });
  expect(await handler!.recover?.('safe', context)).toEqual({ status: 'retryable' });
  expect(await handler!.recover?.('other', context)).toEqual({ status: 'unknown' });

  const [invalid] = orchestration.matchTaskHandlers(module, [
    orchestration.registerTaskHandler({
      id: 'frame', version: '1', input: z.unknown(), output: z.unknown(),
      limits: { startToCloseTimeoutMs: 1 },
    }, {
      run: () => 'invalid',
      recover: async () => ({ status: 'completed', output: 'invalid' }),
    }),
  ]);
  await expect(invalid!.run('value', context)).rejects.toThrow();
  await expect(invalid!.recover?.('settled', context)).rejects.toThrow();
});

import { test, expect } from 'bun:test';
import { z } from 'zod';
import { parse, canonical, workflowResult, type Orchestrator } from './src/index.ts';

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

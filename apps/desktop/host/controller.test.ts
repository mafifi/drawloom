import { test, expect } from 'bun:test';
import { operatorConformance } from '@drawloom/workbench/conformance';
import { createTextController } from './text-controller.js';
import type { JsonValue } from '@drawloom/host';

test('overlapping review and native intake retain both committed changes', async () => {
  const values = new Map<string, JsonValue>();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let block = false;
  const controller = await createTextController({
    get: async key => values.get(key),
    set: async (key, value) => {
      if (block) {
        block = false;
        entered?.();
        await new Promise<void>(resolve => { release = resolve; });
      }
      values.set(key, structuredClone(value));
    },
  });
  await controller.addText('A');
  const candidate = (await controller.snapshot()).candidates[0]!;
  const started = new Promise<void>(resolve => { entered = resolve; });
  block = true;
  const review = controller.dispatch({ kind: 'review_candidate', candidateId: candidate.id, decision: 'accepted', summary: 'Keep this review' });
  await started;
  const intake = controller.observeArtifact({ operationId: 'image-op', asset: { key: 'image-key', mediaType: 'image/png', size: 1 } });
  release!();
  expect((await review).status).toBe('ok');
  await intake;
  const result = await controller.snapshot();
  expect(result.reviews.map(r => r.summary)).toEqual(['Keep this review']);
  expect(result.candidates[0]?.status).toBe('accepted');
  expect(result.artifacts.length).toBe(2);
});

test('concurrent text additions and duplicate intake retain every distinct item once', async () => {
  const values = new Map<string, JsonValue>();
  const controller = await createTextController({
    get: async key => values.get(key),
    set: async (key, value) => { await Promise.resolve(); values.set(key, value); },
  });
  await Promise.all([controller.addText('A'), controller.addText('B')]);
  const input = { operationId: 'image-op', asset: { key: 'image-key', mediaType: 'image/png', size: 1 } };
  await Promise.all([controller.observeArtifact(input), controller.observeArtifact(input)]);
  const result = await controller.snapshot();
  expect(result.artifacts.map(a => a.content.kind === 'text' ? a.content.text : a.content.asset.key)).toEqual(['A', 'B', 'image-key']);
  expect(result.candidates.length).toBe(3);
});
test('text operator conformance and review persistence', async () => {
  const values = new Map();
  const store = { get: async (key: string) => values.get(key), set: async (key: string, value: unknown) => { values.set(key, value); } };
  await operatorConformance(() => createTextController(store));
  const controller = await createTextController(store);
  await controller.addText('A local example');
  const initial = await controller.snapshot();
  const candidate = initial.candidates[0]!;
  await controller.dispatch({ kind: 'select_candidate', candidateId: candidate.id });
  expect((await controller.snapshot()).candidates[0]?.status).toBe('draft');
  await controller.dispatch({ kind: 'review_candidate', candidateId: candidate.id, decision: 'accepted', summary: 'Readable' });
  expect((await (await createTextController(store)).snapshot()).reviews[0]?.summary).toBe('Readable');
  const grants = (await controller.snapshot()).grants;
  await controller.dispatch({ kind: 'configure', key: 'title', value: 'Draft' });
  expect((await controller.snapshot()).grants).toEqual(grants);
});

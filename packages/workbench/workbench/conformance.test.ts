import { expect, test } from 'bun:test';
import { operatorConformance } from './src/conformance.js';
import type { OperatorSnapshot } from './src/index.js';

test('shared operator suite rejects intake that loses overlapping mutations', async () => {
  await expect(operatorConformance(async () => {
    let state: OperatorSnapshot = {
      artifacts: [], candidates: [], reviews: [], readiness: 'ready',
      summary: '', configuration: [], grants: [],
    };
    return {
      snapshot: async () => structuredClone(state),
      dispatch: async () => ({ status: 'rejected', code: 'not_found', message: 'Missing' }),
      observeArtifact: async input => {
        if (state.artifacts.some(a => a.operationId === input.operationId && a.content.kind === 'asset' && a.content.asset.key === input.asset.key)) return;
        // Deliberately broken asynchronous clone/write, matching the lost-update regression.
        const next = structuredClone(state);
        next.artifacts.push({ id: input.operationId, operationId: input.operationId, title: 'Image', content: { kind: 'asset', asset: input.asset } });
        await Promise.resolve();
        state = next;
      },
    };
  })).rejects.toThrow('Concurrent intake must retain each operation and asset identity once');
});

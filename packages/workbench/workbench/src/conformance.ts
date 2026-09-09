import type { OperatorController } from './index.js';
import { OperatorSnapshotSchema, OperatorCommandSchema } from './index.js';
export async function operatorConformance(factory: () => Promise<OperatorController>): Promise<void> {
  const controller = await factory();
  const before = OperatorSnapshotSchema.parse(await controller.snapshot());
  const result = await controller.dispatch({ kind: 'select_candidate', candidateId: 'missing-conformance-candidate' });
  if (result.status !== 'rejected') throw Error('Missing candidate must reject');
  if (JSON.stringify(before) !== JSON.stringify(await controller.snapshot())) throw Error('Rejected command mutated state');
  if (OperatorCommandSchema.safeParse({ kind: 'select_candidate', candidateId: 'x', origin: 'operator' }).success) throw Error('Origin cannot establish authority');
  if (controller.observeArtifact) {
    const input = { operationId: 'conformance-operation', asset: { key: 'conformance-image', mediaType: 'image/png', size: 4 } };
    await controller.observeArtifact(input);
    const first = OperatorSnapshotSchema.parse(await controller.snapshot());
    await controller.observeArtifact(input);
    const second = OperatorSnapshotSchema.parse(await controller.snapshot());
    if (JSON.stringify(first) !== JSON.stringify(second)) throw Error('Artifact intake must be idempotent');
    if (JSON.stringify(first.grants) !== JSON.stringify(before.grants)) throw Error('Artifact intake cannot grant authority');
    if (!first.artifacts.some(a => a.content.kind === 'asset' && a.content.asset.key === input.asset.key)) throw Error('Intake must expose the asset');
    await controller.observeArtifact({ ...input, operationId: 'conformance-operation-2' });
    const later = OperatorSnapshotSchema.parse(await controller.snapshot());
    for (const operationId of ['conformance-operation', 'conformance-operation-2']) if (!later.artifacts.some(a => a.operationId === operationId && a.content.kind === 'asset' && a.content.asset.key === input.asset.key)) throw Error('Distinct operation provenance must survive identical bytes');
    const concurrent = [
      { operationId: 'concurrent-operation-a', asset: { ...input.asset, key: 'concurrent-asset-a' } },
      { operationId: 'concurrent-operation-b', asset: { ...input.asset, key: 'concurrent-asset-b' } },
    ];
    await Promise.all(concurrent.map(item => controller.observeArtifact!(item)));
    const settled = OperatorSnapshotSchema.parse(await controller.snapshot());
    for (const item of concurrent) {
      if (settled.artifacts.filter(a => a.operationId === item.operationId && a.content.kind === 'asset' && a.content.asset.key === item.asset.key).length !== 1) {
        throw Error('Concurrent intake must retain each operation and asset identity once');
      }
    }
  }
}

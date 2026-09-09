import { z } from 'zod';
import { ArtifactIntakeSchema, OperatorCommandSchema, OperatorSnapshotSchema, type OperatorController, type OperatorSnapshot, type OperatorResult } from '@drawloom/workbench';
import type { JsonStore, Asset } from '@drawloom/host';
import { JsonValueSchema } from '@drawloom/host';
export async function createTextController(store: JsonStore) {
  let state: OperatorSnapshot = OperatorSnapshotSchema.parse(await store.get('text-presentation') ?? {
    artifacts: [], candidates: [], reviews: [], readiness: 'ready', summary: 'Local synthetic text inspection. No model calls.',
    configuration: [{ key: 'title', label: 'Artifact title', value: 'Introduction' }], grants: [{ toolName: 'text.word_count', allowed: false }],
  });
  // Historical text drafts remain editable; unrelated histories gain no guessed lineage.
  for (const artifact of state.artifacts) if (artifact.content.kind === 'text') artifact.editable = true;
  for (const candidate of state.candidates) if (candidate.artifactIds.some(id => state.artifacts.some(a => a.id === id && a.content.kind === 'text'))) candidate.comparisonKey ??= candidate.id;
  async function save(next: OperatorSnapshot) { await store.set('text-presentation', JsonValueSchema.parse(next)); state = next; }
  // Every writer shares this boundary, including signal-driven native intake.
  let mutations: Promise<unknown> = Promise.resolve();
  function mutate<T>(write: () => Promise<T>): Promise<T> {
    const result = mutations.then(write);
    mutations = result.catch(() => {});
    return result;
  }
  async function addAsset(asset: Asset, title: string, operationId?: string) {
    const next = structuredClone(state);
    const artifactId = crypto.randomUUID();
    next.artifacts.push({ id: artifactId, title, ...(operationId ? { operationId } : {}), content: { kind: 'asset', asset } });
    next.candidates.push({ id: crypto.randomUUID(), label: title, artifactIds: [artifactId], status: 'draft' });
    await save(next);
  }
  const controller: OperatorController = {
    async snapshot() { return structuredClone(state); },
    dispatch(raw): Promise<OperatorResult> { return mutate(async () => {
      const p = OperatorCommandSchema.safeParse(raw);
      const reject = (code: 'invalid_command' | 'not_found', message: string): OperatorResult => ({ status: 'rejected', code, message });
      if (!p.success) return reject('invalid_command', 'Invalid operator command');
      const command = p.data;
      const next = structuredClone(state);
      if (command.kind === 'revise_document') {
        const candidate = next.candidates.find(c => c.id === command.candidateId);
        const artifact = next.artifacts.find(a => a.id === command.artifactId);
        if (!candidate?.artifactIds.includes(command.artifactId) || artifact?.content.kind !== 'text') return reject('not_found', 'Document revision unavailable');
        const id = crypto.randomUUID();
        next.artifacts.push({ id, title: artifact.title, editable: true, content: { kind: 'text', text: command.text } });
        next.candidates.push({ id: crypto.randomUUID(), comparisonKey: candidate.comparisonKey ?? candidate.id, label: `Revision ${next.candidates.length + 1}`, artifactIds: [id], status: 'draft' });
        candidate.comparisonKey ??= candidate.id;
      } else if (command.kind === 'select_candidate' || command.kind === 'review_candidate') {
        const candidate = next.candidates.find(c => c.id === command.candidateId);
        if (!candidate) return reject('not_found', 'Candidate unavailable');
        if (command.kind === 'select_candidate') next.selectedCandidateId = candidate.id;
        else {
          candidate.status = command.decision;
          next.reviews.push({ id: crypto.randomUUID(), candidateId: candidate.id, summary: command.summary, findings: [] });
        }
      } else if (command.kind === 'configure') {
        if (command.key !== 'title' || !z.string().min(1).max(120).safeParse(command.value).success) return reject('invalid_command', 'Artifact title must be 1–120 characters');
        next.configuration[0]!.value = command.value;
      } else {
        const grant = next.grants.find(g => g.toolName === command.toolName);
        if (!grant) return reject('not_found', 'Tool unavailable');
        grant.allowed = command.allowed;
      }
      await save(next);
      return { status: 'ok', snapshot: structuredClone(state) };
    }); },
  };
  return {
    ...controller,
    observeArtifact(raw: import('@drawloom/workbench').ArtifactIntake) { return mutate(async () => {
      const input = ArtifactIntakeSchema.parse(raw);
      if (state.artifacts.some(a => a.operationId === input.operationId && a.content.kind === 'asset' && a.content.asset.key === input.asset.key)) return;
      await addAsset(input.asset, 'Image result', input.operationId);
    }); },
    addText(text: string) { return mutate(async () => {
      const next = structuredClone(state);
      const artifactId = crypto.randomUUID();
      const revision = next.candidates.length + 1;
      next.artifacts.push({ id: artifactId, editable: true, title: String(next.configuration[0]!.value), content: { kind: 'text', text } });
      next.candidates.push({ id: crypto.randomUUID(), comparisonKey: artifactId, label: `Revision ${revision}`, artifactIds: [artifactId], status: 'draft' });
      await save(next);
    }); },
    addAsset(asset: Asset, title: string, operationId?: string) {
      return mutate(() => addAsset(asset, title, operationId));
    },
  };
}

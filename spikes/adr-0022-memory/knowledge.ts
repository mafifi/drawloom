import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SourceNotebook } from './sources.js';

export const KnowledgeClaims = z.array(z.strictObject({
  id: z.string().min(1).max(100), text: z.string().min(1).max(2000),
  evidence: z.array(z.string().min(1).max(100)).min(1).max(100),
})).max(8);
type Snapshot = Awaited<ReturnType<SourceNotebook['snapshot']>>;
type Source = Snapshot['changes'][number];
// Citation handles, not progress tokens or caller-selected source revisions.
const evidenceId = (row: { key: string; revision: string }) =>
  'e-' + createHash('sha256').update(JSON.stringify([row.key, row.revision])).digest('hex');

export function projectKnowledge(state: Snapshot, claims: Snapshot['claims'], sources: Source[]) {
  const latest = new Map(state.changes.map(row => [row.key, row]));
  return {
    claims: claims.map(claim => ({ id: claim.id,
      text: claim.text + (claim.needsRecheck ? '\nEvidence has changed; reassess this claim using the accompanying evidence before relying on it.' : ''),
      evidence: claim.links.map(evidenceId),
    })),
    evidence: sources.map(row => ({ id: evidenceId(row),
      source: z.array(z.string()).parse(JSON.parse(row.key)).join(' / '),
      text: (row.state === 'withdrawn' ? 'Withdrawn source. ' : latest.get(row.key) !== row ? 'Historical source; a later account is included. ' : '') + row.text,
    })),
  };
}

export async function readKnowledge(book: SourceNotebook, topic: string) {
  const state = await book.snapshot();
  const claims = state.claims.filter(claim => claim.id === topic);
  const linked = new Set(claims.flatMap(claim => claim.links.map(link => link.key)));
  // Small-notebook control: include new evidence even if not linked yet. This
  // is not the eventual relevance/ranking implementation for a large corpus.
  const sources = state.changes.filter((row, index) => linked.has(row.key) || index >= state.waterline);
  return projectKnowledge(state, claims, sources);
}

export async function beginAssessment(book: SourceNotebook) {
  const state = await book.snapshot();
  const evidence = new Map(state.changes.map(row => [evidenceId(row), row]));
  return { knowledge: projectKnowledge(state, state.claims, state.changes),
    save: async (raw: unknown) => {
      const claims = KnowledgeClaims.parse(raw).map(claim => ({ id: claim.id, text: claim.text,
        links: claim.evidence.map(id => {
          const row = evidence.get(id); if (!row) throw Error('Unknown evidence');
          return { key: row.key, revision: row.revision };
        }),
      }));
      await book.publish(state.waterline, state.through, claims);
    },
  };
}

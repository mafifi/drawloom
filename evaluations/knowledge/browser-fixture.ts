/** Opt-in invented records for the existing desktop; never connects to a model. */
import { resolve } from 'node:path';
import { createManagedLocalKnowledgeClient } from '@drawloom/local-knowledge-runtime';
const root = process.argv[2];
if (!root || !resolve(root).startsWith('/private/tmp/drawloom-adr24-browser.')) throw Error('Use an explicitly created isolated browser-check directory');
const client = createManagedLocalKnowledgeClient({ root: resolve(root, 'knowledge'), workingDirectory: root });
try {
  const source = { type: 'source' as const, origin: 'public-browser-fixture', id: 'library-hours', revision: 'r1' };
  const claim = { type: 'claim' as const, origin: 'public-browser-fixture', id: 'monday-closure', revision: 'r1' };
  for (const record of [
    { ref: source, body: 'The invented Moss Library closes on Mondays and opens at 09:00 on Tuesdays.', status: 'active' as const, confidence: { basis: 'invented fixture' }, provenance: { producer: { type: 'fixture', id: 'browser-check' }, inputs: [] } },
    { ref: claim, body: 'Moss Library is closed on Monday.', status: 'active' as const, freshness: 'current' as const, confidence: { basis: 'invented fixture' }, provenance: { producer: { type: 'fixture', id: 'browser-check' }, inputs: [source] } },
  ]) {
    const outcome = await client.ingest({ operation: 'upsert', expectedRevision: null, record, links: record.ref.type === 'claim' ? [{ from: claim, to: source, relation: 'support' }] : [] });
    if (!['accepted', 'duplicate'].includes(outcome.kind)) throw Error(`Fixture intake failed: ${outcome.kind}`);
  }
  console.log('Two invented records stored through the managed knowledge client. No model or embedding calls.');
} finally { await client.close(); }

import type { SourceNotebook } from './sources.js';
import { projectKnowledge } from './knowledge.js';
import { z } from 'zod';
const stop = new Set('the a an is are does do how what which for to of in on and it that this long now ts'.split(' '));
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1 && !stop.has(w));
export function createKnowledgeReader(book: SourceNotebook) {
  const supplied = new Map<string, string>(); // One agent operation only.
  return { async search(raw: string) {
    const query = new Set(words(z.string().min(1).max(200).parse(raw)));
    const score = (text: string) => new Set(words(text).filter(w => query.has(w))).size;
    const state = await book.snapshot();
    const claims = state.claims.map(c => ({ c, score: score(c.id + ' ' + c.text) })).filter(c => c.score > 0).sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id)).slice(0, 3).map(c => c.c);
    const keys = new Set(claims.flatMap(c => c.links.map(l => l.key)));
    const latest = [...new Map(state.changes.map(row => [row.key, row])).values()];
    const matching = latest.map(row => ({ row, score: score(row.key + ' ' + row.text) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.row.key.localeCompare(b.row.key)).slice(0, 3);
    for (const { row } of matching) keys.add(row.key);
    const result = projectKnowledge(state, claims, state.changes.filter(row => keys.has(row.key)));
    result.evidence = result.evidence.filter(e => supplied.get(e.id) !== e.text);
    if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024) throw Error('Evidence exceeds this proof read budget; narrow the query');
    for (const e of result.evidence) supplied.set(e.id, e.text);
    return result;
  } };
}

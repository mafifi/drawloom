import type { KnowledgeRecord, KnowledgeLink } from '@drawloom/knowledge';

/** One explicit page document in the repository's Drawloom OKF profile.
 * This is neither an editable database mirror nor a claim of universal bundle compatibility.
 * Authorization must have been freshly checked by the host for records AND links.
 */
export async function serializeKnowledgeExport(value: { records: KnowledgeRecord[]; links: KnowledgeLink[] }, at = new Date()): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  const id = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const date = at.toISOString().slice(0, 10);
  // JSON flow values are valid YAML and preserve literal newlines/quotes safely.
  const frontmatter = ['---', 'type: index', `id: knowledge-export-${id}`, 'title: "Drawloom knowledge page export"', 'status: draft', `created: ${JSON.stringify(date)}`, `updated: ${JSON.stringify(date)}`, `records: ${JSON.stringify(value.records)}`, `links: ${JSON.stringify(value.links)}`, '---'];
  const sections = value.records.map(record => {
    const fence = '`'.repeat(Math.max(3, ...[...record.body.matchAll(/`+/g)].map(match => match[0].length + 1)));
    return [`## ${JSON.stringify(record.ref.id)}`, '', `Identity: ${JSON.stringify(record.ref)}`, '', `${fence}text`, record.body, fence].join('\n');
  });
  return [...frontmatter, '', '# Drawloom knowledge page export', '', 'This is one explicitly selected page, not necessarily the complete evidence chain. Exact identities, confidence, provenance and directed links are preserved in the document metadata. The SQLite store remains authoritative.', '', ...sections, ''].join('\n');
}

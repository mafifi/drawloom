import { requestSchema, resourceSchema, subjectSchema, type Engine, type Labels, type Subject } from './contract.ts';
export type Material = { labels: Labels; sources?: string[]; read: () => string };
export type Facts = { subjects: Map<string, Subject>; material: Map<string, Material> };
export function knowledgeHost(engine: Engine, facts: Facts) {
  function resolve(id: string, visiting = new Set<string>(), budget = { left: 32 }): Labels {
    if (visiting.has(id) || --budget.left < 0) throw new Error('Unresolvable lineage');
    const material = facts.material.get(id);
    if (!material) throw new Error('Missing source');
    let labels = resourceSchema.parse(material.labels);
    visiting.add(id);
    for (const source of material.sources ?? []) {
      const other = resolve(source, visiting, budget);
      if (other.tenant !== labels.tenant) throw new Error('Mixed tenants unsupported');
      labels = { ...labels, active: labels.active && other.active, sensitivity: Math.max(labels.sensitivity, other.sensitivity),
        compartments: [...new Set([...labels.compartments, ...other.compartments])], expires: Math.min(labels.expires, other.expires), remoteAllowed: labels.remoteAllowed && other.remoteAllowed };
    }
    visiting.delete(id);
    return labels;
  }
  return async (identity: string, input: unknown, now: number) => {
    const denied = { decision: false, content: undefined as string | undefined };
    try {
      const request = requestSchema.parse(input);
      if (request.subject.id !== identity || request.subject.type !== 'user' || request.resource.type !== 'knowledge') return denied;
      const subject = subjectSchema.parse(facts.subjects.get(identity));
      const labels = resolve(request.resource.id);
      const material = facts.material.get(request.resource.id)!;
      const result = await engine({ subject: { type: 'user', id: identity, properties: subject }, action: { name: request.action.name }, resource: { type: 'knowledge', id: request.resource.id, properties: labels }, context: { now } });
      if (!result.decision) return denied;
      // Fixture has synchronous reads. Don't use an earlier decision after facts change.
      if (material !== facts.material.get(request.resource.id) || JSON.stringify(subject) !== JSON.stringify(facts.subjects.get(identity)) || JSON.stringify(labels) !== JSON.stringify(resolve(request.resource.id))) return denied;
      return { decision: true, content: material.read() };
    } catch {
      return { ...denied, error: 'Authorization unavailable or invalid facts' };
    }
  };
}

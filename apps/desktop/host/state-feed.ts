export type StateUpdate = { kind: 'snapshot' | 'patch'; token: string; sections: Record<string, unknown>; removed: string[] };

/** One latest value and revision per section; no full-snapshot archive. */
export function createStateFeed() {
  const generation = crypto.randomUUID();
  let revision = 0;
  const sections = new Map<string, { serialized?: string; revision: number }>();
  return {
    read(value: object, since?: string): StateUpdate | undefined {
      const current = Object.entries(value);
      const keys = new Set(current.map(([key]) => key));
      const changes = current.filter(([key, data]) => sections.get(key)?.serialized !== JSON.stringify(data));
      const removed = [...sections].filter(([key, section]) => section.serialized !== undefined && !keys.has(key)).map(([key]) => key);
      if (changes.length || removed.length) {
        revision++;
        for (const [key, data] of changes) sections.set(key, { serialized: JSON.stringify(data), revision });
        for (const key of removed) sections.set(key, { revision });
      }
      const prefix = generation + ':';
      const position = since?.startsWith(prefix) ? Number(since.slice(prefix.length)) : NaN;
      const valid = Number.isSafeInteger(position) && position >= 0 && position <= revision;
      if (valid && position === revision) return;
      return {
        kind: valid ? 'patch' : 'snapshot', token: prefix + revision,
        sections: Object.fromEntries(current.filter(([key]) => !valid || sections.get(key)!.revision > position)),
        removed: valid ? [...sections].filter(([, section]) => section.serialized === undefined && section.revision > position).map(([key]) => key) : [],
      };
    },
  };
}

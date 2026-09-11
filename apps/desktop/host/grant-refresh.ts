/** Serialize authority refreshes and publish each complete group without awaits. */
export function createGrantRefresh<T>(
  grants: Map<string, Set<string>>,
  read: (id: string) => Promise<T>,
  project: (state: T, id: string) => Set<string>,
) {
  let tail: Promise<unknown> = Promise.resolve();
  return (ids: readonly string[]): Promise<Map<string, T>> => {
    const selected = [...new Set(ids)];
    const result = tail.then(async () => {
      try {
        const states = new Map<string, T>();
        for (const id of selected) states.set(id, await read(id));
        const next = selected.map(id => [id, project(states.get(id)!, id)] as const);
        for (const [id, value] of next) grants.set(id, value);
        return states;
      } catch (error) {
        for (const id of selected) grants.delete(id);
        throw error;
      }
    });
    tail = result.catch(() => {});
    return result;
  };
}

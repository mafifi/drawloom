import { createManagedLocalKnowledgeClient } from '@drawloom/local-knowledge-runtime';

/** Test-only ownership for the connected fixture, including incomplete setup. */
export function createLearningApplicationFixture() {
  let client: ReturnType<typeof createManagedLocalKnowledgeClient> | undefined;
  let application: { close(): Promise<void> } | undefined;
  async function close() {
    const failures: unknown[] = [];
    try { await application?.close(); application = undefined; } catch (error) { failures.push(error); }
    try { await client?.close(); client = undefined; } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'Learning fixture cleanup failed');
  }
  return {
    async open<T extends { close(): Promise<void> }>(
      options: Parameters<typeof createManagedLocalKnowledgeClient>[0],
      create: (client: ReturnType<typeof createManagedLocalKnowledgeClient>) => Promise<T>,
    ): Promise<T> {
      if (client || application) throw Error('Close the previous learning fixture before opening another application');
      client = createManagedLocalKnowledgeClient(options);
      try {
        const created = await create(client);
        application = created;
        return created;
      } catch (error) {
        try { await close(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Learning fixture construction and cleanup failed'); }
        throw error;
      }
    },
    close,
  };
}

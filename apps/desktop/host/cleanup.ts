/** Release resources in dependency order, retaining every failure until all steps settle. */
export async function cleanup(steps: Iterable<() => unknown | Promise<unknown>>): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, "Desktop cleanup failed");
}

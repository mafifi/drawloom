import type { ToolResult } from '@drawloom/tools';

/** Retry display projection from the existing authoritative evidence, not tools. */
export function createResourceRecovery(retained: readonly ToolResult[], capture: (result: ToolResult) => Promise<void>) {
  const pending = new Map<string, ToolResult>();
  const add = (result: ToolResult) => {
    if (result.outcome.status === 'ok' && result.outcome.content?.some(block => block.type !== 'text'))
      pending.set(result.invocationId, result);
  };
  retained.forEach(add);
  let queue: Promise<void> = Promise.resolve();
  const recover = () => {
    const next = queue.then(async () => {
      for (const [id, result] of pending) {
        await capture(result);
        pending.delete(id);
      }
    });
    queue = next.catch(() => {});
    return next;
  };
  return { recover, record(result: ToolResult) { add(result); return recover(); } };
}

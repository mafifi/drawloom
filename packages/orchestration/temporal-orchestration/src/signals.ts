/** Same-host abort reason. Not a wire value, workflow input or plugin protocol. */
export const LOCAL_EXECUTION_PAUSED = Symbol("drawloom.local-execution-paused");
/** Trusted composition may distinguish owner suspension from operator cancel.
 * Exact identity only: strings and lookalike symbols do not suppress cancellation. */
export function isLocalExecutionPaused(reason: unknown): boolean {
  return reason === LOCAL_EXECUTION_PAUSED;
}

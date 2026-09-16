import { DesktopClosedError } from "./application-lifecycle.js";

/** Serialize HTTP dispatch while preserving immediate Stop/cancel routes. */
export function queueDesktopRequest<T>(
  previous: Promise<unknown>,
  running: () => boolean,
  work: () => T | Promise<T>,
): Promise<T> {
  return previous.then(() => {
    if (!running()) throw new DesktopClosedError("closing");
    return work();
  });
}

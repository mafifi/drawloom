import { isAbsolute, relative, sep } from "node:path";

/**
 * Is `child` inside `parent`? One meaning, for every caller in this host.
 *
 * The rule was reimplemented nine times across the repository and three copies
 * disagreed, all by rejecting legitimate paths rather than admitting bad ones:
 * `startsWith("..")` without a separator refuses a directory named `..draft`,
 * and `includes("../")` additionally refuses one named `b..`.
 *
 * Both arguments must already be resolved. This is purely lexical:
 *
 *   - It answers `true` for `parent` itself. A caller that must exclude the
 *     root layers that on top, because that is an access decision.
 *   - It does not resolve symlinks, and does not care whether the path exists.
 *     Callers that need `realpath` call it first and re-check, or refuse links
 *     outright; either is the caller's policy.
 *   - It rejects ESCAPE, not traversal: `/a/sub/../file` is inside `/a`.
 *
 * `@drawloom/host`'s `pathContainmentConformance` pins this meaning, and
 * `path-containment.test.ts` runs it against this function.
 */
export function containsPath(parent: string, child: string): boolean {
  const delta = relative(parent, child);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(".." + sep));
}

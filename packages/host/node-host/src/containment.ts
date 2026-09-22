import { isAbsolute, relative, sep } from "node:path";

/**
 * Is `candidate` inside `root`? Both arguments must already be resolved.
 *
 * Purely lexical: answers `true` for `root` itself, does not resolve symlinks,
 * does not check existence. This implementation was already correct; it is
 * extracted so `containment.test.ts` can run
 * `pathContainmentConformance` against the function the store actually uses,
 * rather than against a copy of it.
 */
export function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(".." + sep) && path !== ".." && !isAbsolute(path));
}

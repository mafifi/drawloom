import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Is `candidate` inside `root`? Resolves both first, so callers may pass
 * relative paths.
 *
 * Purely lexical: it answers `true` for `root` itself, and does not resolve
 * symlinks or check existence. Callers add their own rules — `ownedTargetState`
 * additionally refuses the root, because the root is not an owned target.
 *
 * Pinned by `pathContainmentConformance` from `@drawloom/host/conformance`;
 * see `containment.test.ts`.
 */
export function isSubpath(root: string, candidate: string): boolean {
  const between = relative(resolve(root), resolve(candidate));
  return (
    between === "" || (!isAbsolute(between) && between !== ".." && !between.startsWith(".." + sep))
  );
}

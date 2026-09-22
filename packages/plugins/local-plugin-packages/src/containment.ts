import { isAbsolute, relative, sep } from "node:path";

/**
 * Is `path` inside `root`? Both arguments must already be resolved.
 *
 * Purely lexical: answers `true` for `root` itself, and resolves nothing.
 * `containedPath` calls `realpath` on both sides before asking, which is that
 * caller's policy rather than part of containment.
 *
 * This replaces a hand-rolled separator (`process.platform === "win32" ? "\\"
 * : "/"`), which was correct but was a fifth spelling of the same rule.
 * Pinned by `pathContainmentConformance` from `@drawloom/host/conformance`;
 * see `containment.test.ts`.
 */
export function insidePath(root: string, path: string): boolean {
  const delta = relative(root, path);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(".." + sep));
}

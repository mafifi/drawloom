import { isAbsolute, relative, sep } from "node:path";

/**
 * Is `path` inside `root`? Both arguments must already be resolved.
 *
 * Purely lexical, and deliberately so: it answers `true` for `root` itself, does
 * not resolve symlinks, and does not care whether the path exists. Callers
 * call `realpath` first when they need to, and add their own rules — the
 * workflow entrypoint must also be prebuilt JavaScript, for instance.
 *
 * This replaces two separate `startsWith("..")` expressions, in `index.ts` and
 * `sidecar.ts`, which stood in for a path comparison and refused a directory
 * named `..draft`. Pinned by `pathContainmentConformance` from
 * `@drawloom/host/conformance`; see `containment.test.ts`.
 */
export function insidePath(root: string, path: string): boolean {
  const delta = relative(root, path);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(".." + sep));
}

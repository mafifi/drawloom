import { lstat, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { containsPath } from "./path-containment.js";
import { DRAWLOOM_EXTENSION } from "@drawloom/plugins";

/** Rechecks physical extension namespace containment immediately before activation. */
export async function executableExtensionPath(
  packageRoot: string,
  entrypoint: string,
): Promise<{ root: string; entry: string }> {
  const root = await realpath(packageRoot);
  const namespace = resolve(root, DRAWLOOM_EXTENSION);
  const namespaceInfo = await lstat(namespace);
  if (namespaceInfo.isSymbolicLink() || !namespaceInfo.isDirectory())
    throw Error("Invalid extension namespace");
  const prefix = `./${DRAWLOOM_EXTENSION}/`;
  if (!entrypoint.startsWith(prefix)) throw Error("Invalid extension entrypoint");
  const parts = entrypoint.slice(prefix.length).split("/");
  let cursor = namespace;
  for (const part of parts) {
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw Error("Extension path is symbolic");
  }
  const entry = await realpath(cursor);
  // Containment plus "is a regular file"; the file check is what excludes the
  // namespace directory itself, so containment is not asked to reject the root.
  if (!containsPath(namespace, entry) || !(await stat(entry)).isFile())
    throw Error("Extension path unavailable");
  return { root, entry };
}

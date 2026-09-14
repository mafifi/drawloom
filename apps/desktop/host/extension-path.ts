import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DRAWLOOM_EXTENSION } from '@drawloom/plugins';

/** Rechecks physical extension namespace containment immediately before activation. */
export async function executableExtensionPath(packageRoot: string, entrypoint: string): Promise<{ root: string; entry: string }> {
  const root = await realpath(packageRoot);
  const namespace = resolve(root, DRAWLOOM_EXTENSION);
  const namespaceInfo = await lstat(namespace);
  if (namespaceInfo.isSymbolicLink() || !namespaceInfo.isDirectory()) throw Error('Invalid extension namespace');
  const prefix = `./${DRAWLOOM_EXTENSION}/`;
  if (!entrypoint.startsWith(prefix)) throw Error('Invalid extension entrypoint');
  const parts = entrypoint.slice(prefix.length).split('/');
  let cursor = namespace;
  for (const part of parts) {
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw Error('Extension path is symbolic');
  }
  const entry = await realpath(cursor);
  const delta = relative(namespace, entry);
  if (delta === '..' || delta.startsWith(`..${sep}`) || isAbsolute(delta) || !(await stat(entry)).isFile())
    throw Error('Extension path unavailable');
  return { root, entry };
}

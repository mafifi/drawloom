import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, parse, relative, sep } from 'node:path';
export interface DirectoryBinding { directory: string; device: string; inode: string }
/** Finite, content-free messages safe to show at the local UI boundary. */
export class ProjectDirectoryError extends Error {}
function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
}
export async function bindProjectDirectory(directory: string, internal: string): Promise<DirectoryBinding> {
  if (!isAbsolute(directory)) throw new ProjectDirectoryError('Choose an absolute project directory');
  const [canonical, protectedRoot] = await Promise.all([realpath(directory), realpath(internal)]).catch(() => {
    throw new ProjectDirectoryError('The project folder is unavailable. Reconnect it or choose an existing folder. Saved history remains available.');
  });
  if (canonical === parse(canonical).root || contains(canonical, protectedRoot) || contains(protectedRoot, canonical))
    throw new ProjectDirectoryError('Choose a project directory outside Drawloom’s private data');
  const facts = await stat(canonical, { bigint: true });
  if (!facts.isDirectory()) throw new ProjectDirectoryError('The project path must be a directory');
  return { directory: canonical, device: String(facts.dev), inode: String(facts.ino) };
}
export async function verifyProjectDirectory(binding: DirectoryBinding, internal: string): Promise<string> {
  const current = await bindProjectDirectory(binding.directory, internal);
  if (current.directory !== binding.directory || current.device !== binding.device || current.inode !== binding.inode)
    throw new ProjectDirectoryError('The project directory has changed. Restore the original folder or add the replacement as a new project.');
  return current.directory;
}

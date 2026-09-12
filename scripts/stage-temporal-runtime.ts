import { cp, mkdir, readFile, realpath, readdir, lstat, rm, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, isAbsolute, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const Manifest = z.object({ name: z.string(), version: z.string(), files: z.array(z.string()).optional(),
  dependencies: z.record(z.string(), z.string()).optional(), optionalDependencies: z.record(z.string(), z.string()).optional() });
const contained = (root: string, path: string) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); };
/** Reproduce the installed, frozen dependency layout. Do not resolve new versions,
 * execute package scripts, or copy private source into the public app bundle.
 */
export async function stageTemporalRuntime(options: { repositoryRoot: string; destination: string; packageDirectories?: readonly string[]; destinationName?: string }) {
  const repository = await realpath(options.repositoryRoot);
  const modules = await realpath(join(repository, 'node_modules'));
  const destination = resolve(options.destination);
  const destinationName = options.destinationName ?? 'orchestration';
  if (basename(destination) !== destinationName || destination === repository || contained(destination, repository)) throw Error('Invalid generated runtime destination');
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(dirname(destination), `.${destinationName}-${randomUUID()}`);
  await mkdir(temporary);
  const copied = new Set<string>();
  const packages: { name: string; version: string; path: string }[] = [];
  async function dependency(name: string, from: string): Promise<string | undefined> {
    for (let current = from;; current = dirname(current)) {
      const candidate = join(current, 'node_modules', name);
      try { await readFile(join(candidate, 'package.json')); return realpath(candidate); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
      if (current === dirname(current)) return undefined;
    }
  }
  async function copyPackage(source: string): Promise<void> {
    source = await realpath(source);
    if (copied.has(source)) return;
    copied.add(source);
    const manifest = Manifest.parse(JSON.parse(await readFile(join(source, 'package.json'), 'utf8')));
    const internal = contained(join(repository, 'packages'), source) && manifest.name.startsWith('@drawloom/');
    if (!internal && !contained(modules, source)) throw Error(`Runtime dependency escapes public installation: ${manifest.name}`);
    // The canonical frozen Bun install is hoisted, including nested version
    // conflicts. Fail visibly if a different linker requires a new layout proof.
    const localPath = internal ? manifest.name : relative(modules, source);
    if (localPath.startsWith('.bun/')) throw Error('Runtime staging requires the canonical hoisted dependency layout');
    const target = join(temporary, 'node_modules', localPath);
    await mkdir(target, { recursive: true });
    const entries = internal ? ['package.json', ...(manifest.files ?? ['dist', 'src'])] : await readdir(source);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const path = resolve(source, entry);
      if (!contained(source, path)) throw Error('Invalid package file declaration');
      try {
        await cp(path, join(target, entry), { recursive: true, filter: async (candidate) => {
          if (basename(candidate) === 'node_modules' || basename(candidate) === '.git') return false;
          if ((await lstat(candidate)).isSymbolicLink()) throw Error(`Runtime package contains an unsupported file symlink: ${manifest.name}`);
          return true;
        } });
      } catch (error) { if (!(internal && error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    }
    packages.push({ name: manifest.name, version: manifest.version, path: `node_modules/${localPath}` });
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      const found = await dependency(name, source);
      if (!found) {
        if (name in (manifest.optionalDependencies ?? {})) continue;
        throw Error(`Missing installed runtime dependency: ${name}`);
      }
      await copyPackage(found);
    }
  }
  try {
    for (const packageDirectory of options.packageDirectories ?? [join(repository, 'packages/orchestration/temporal-orchestration')]) await copyPackage(packageDirectory);
    await writeFile(join(temporary, 'runtime-manifest.json'), JSON.stringify({ format: 1, platform: process.platform, arch: process.arch, packages }, null, 2));
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
    return { packages: packages.length, destination };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dir, '..');
  const result = await stageTemporalRuntime({ repositoryRoot, destination: join(repositoryRoot, 'apps/desktop/src-tauri/binaries/orchestration') });
  console.log(`Staged ${result.packages} installed Node runtime packages`);
}

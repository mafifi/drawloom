import { readFile, realpath, stat, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  PackageManifestSchema, PackageSkillMetadataSchema, PackageMcpConfigSchema,
  PackageServerConfigSchema, DrawloomPackageExtensionSchema, DRAWLOOM_EXTENSION,
  type PackageInventory,
} from '@drawloom/plugins';

/** Symlink-aware containment, not a sandbox against concurrent filesystem mutation. */
export async function containedPath(root: string, path: string): Promise<string> {
  const base = await realpath(root), target = await realpath(resolve(base, path));
  const delta = relative(base, target);
  if (delta === '..' || delta.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(delta)) throw Error('Path escapes package boundary');
  return target;
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false; throw error; }
}
async function readFileWithin(root: string, path: string): Promise<string> {
  const target = await containedPath(root, path), info = await stat(target);
  if (!info.isFile()) throw Error('Expected a regular package file');
  return readFile(target, 'utf8');
}
export async function readSkill(inventory: PackageInventory, name: string): Promise<string> {
  const skill = inventory.skills.find(skill => skill.name === name);
  if (!skill) throw Error('Unknown package skill');
  return readFileWithin(inventory.root, skill.path);
}
export async function readSupportingFile(inventory: PackageInventory, name: string, path: string): Promise<string> {
  const skill = inventory.skills.find(skill => skill.name === name);
  if (!skill) throw Error('Unknown package skill');
  const source = await containedPath(inventory.root, skill.path);
  // Supporting files may be elsewhere in this package, as permitted by the standard.
  return readFileWithin(inventory.root, resolve(dirname(source), path));
}
export async function inspectPackage(inputRoot: string): Promise<PackageInventory> {
  const root = await realpath(inputRoot);
  const raw: unknown = JSON.parse(await readFileWithin(root, 'plugin.json'));
  const manifest = PackageManifestSchema.parse(raw);
  const inventory: PackageInventory = { root, name: manifest.name,
    ...(manifest.version === undefined ? {} : { version: manifest.version }),
    skills: [], servers: [], diagnostics: [], extensions: {},
  };
  const report = (component: string, code: string) => inventory.diagnostics.push({ component, code });
  for (const key of Object.keys(raw as object)) {
    if (!Object.hasOwn(PackageManifestSchema.shape, key)) report('manifest', `ignored-field:${key}`);
  }
  if (manifest.extensions !== undefined) {
    if (!manifest.extensions || typeof manifest.extensions !== 'object' || Array.isArray(manifest.extensions)) report('manifest', 'ignored-extensions');
    else inventory.extensions = Object.fromEntries(Object.entries(manifest.extensions));
  }
  for (const namespace of Object.keys(inventory.extensions)) {
    if (namespace !== DRAWLOOM_EXTENSION) report(`extension:${namespace}`, 'ignored-extension');
  }
  if (Object.hasOwn(inventory.extensions, DRAWLOOM_EXTENSION)) {
    const parsed = DrawloomPackageExtensionSchema.safeParse(inventory.extensions[DRAWLOOM_EXTENSION]);
    if (parsed.success) {
      try {
        if (parsed.data.backend) {
          const target = await containedPath(root, parsed.data.backend.entrypoint);
          if (!(await stat(target)).isFile()) throw Error('Expected backend file');
        }
        inventory.drawloom = parsed.data;
      } catch { report(`extension:${DRAWLOOM_EXTENSION}`, 'invalid'); }
    } else report(`extension:${DRAWLOOM_EXTENSION}`, 'invalid');
  }
  if (await exists(join(root, 'skills'))) {
    try {
      const directory = await containedPath(root, 'skills');
      if (!(await stat(directory)).isDirectory()) throw Error('Expected skills directory');
      for (const name of (await readdir(directory)).sort()) {
        const path = join('skills', name, 'SKILL.md');
        try {
          const child = await containedPath(root, join('skills', name));
          if (!(await stat(child)).isDirectory() || !await exists(join(child, 'SKILL.md'))) continue;
          const text = await readFileWithin(root, path);
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
          if (!frontmatter) throw Error('Missing skill frontmatter');
          const metadata = PackageSkillMetadataSchema.parse(parseYaml(frontmatter[1]!));
          if (metadata.name !== name) throw Error('Skill name must match directory');
          inventory.skills.push({ name: metadata.name, description: metadata.description, path });
        } catch { report(`skill:${name}`, 'invalid'); }
      }
    } catch { report('skills', 'invalid'); }
  }
  if (await exists(join(root, 'mcp.json'))) {
    try {
      const mcp = PackageMcpConfigSchema.parse(JSON.parse(await readFileWithin(root, 'mcp.json')));
      for (const [name, value] of Object.entries(mcp.mcpServers)) {
        try {
          const config = PackageServerConfigSchema.parse(value);
          if (config.type === 'sse') { report(`server:${name}`, 'unsupported-transport'); continue; }
          if (config.type === 'stdio') {
            if (config.command.startsWith('./')) {
              const target = await containedPath(root, config.command);
              if (!(await stat(target)).isFile()) throw Error('Expected executable file');
            }
            if (config.cwd && !config.cwd.startsWith('${PLUGIN_DATA}')) {
              const cwd = config.cwd.replace(/\$\{PLUGIN_ROOT\}/g, () => root);
              if (!(await stat(await containedPath(root, cwd))).isDirectory()) throw Error('Expected cwd directory');
            }
          }
          inventory.servers.push({ name, config });
        } catch { report(`server:${name}`, 'invalid'); }
      }
    } catch { report('mcp', 'invalid'); }
  }
  return inventory;
}

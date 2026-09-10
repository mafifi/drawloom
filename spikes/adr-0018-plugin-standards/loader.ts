import { readFile, realpath, stat, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { PackageInventory } from './contract.ts';

const name = z.string().min(1).max(64).regex(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/)
  .refine(s => !s.includes('--') && !s.includes('..'));
const manifestSchema = z.object({
  $schema: z.literal('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'), name,
  version: z.string().optional(), description: z.string().optional(),
  author: z.strictObject({ name: z.string().optional(), email: z.string().optional(), url: z.string().optional() }).optional(),
  homepage: z.string().optional(), repository: z.string().optional(), license: z.string().optional(),
  keywords: z.array(z.string()).optional(), extensions: z.unknown().optional(),
});
export const StdioSchema = z.strictObject({
  type: z.literal('stdio'), command: z.string().min(1)
    .refine(s => !/[\s\u0000]/u.test(s) && (s.startsWith('./') || !/[\/\\:$]/u.test(s))),
  args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().refine(s => s.startsWith('./') || /^\$\{PLUGIN_(ROOT|DATA)\}(?:\/|$)/.test(s)).optional(),
});
/** Resolves symlinks before checking containment; no arbitrary URI resolution. */
export async function packagePath(root: string, path: string): Promise<string> {
  const base = await realpath(root), target = await realpath(resolve(base, path));
  const delta = relative(base, target);
  if (delta === '..' || delta.startsWith('../') || isAbsolute(delta)) throw Error('Package path escapes root');
  return target;
}
async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function readSkillFile(root: string, path: string): Promise<string> {
  const file = await packagePath(root, path);
  if (!(await stat(file)).isFile()) throw Error('Expected a regular package file');
  if ((await stat(file)).size > 1024 * 1024) throw Error('Proof file limit exceeded');
  return readFile(file, 'utf8');
}
export async function inspectPackage(root: string): Promise<PackageInventory> {
  root = await realpath(root);
  const raw: unknown = JSON.parse(await readSkillFile(root, 'plugin.json'));
  const manifest = manifestSchema.parse(raw);
  const diagnostics: PackageInventory['diagnostics'] = [];
  const report = (component: string, code: string) => diagnostics.push({ component, code });
  for (const key of Object.keys(raw as object)) if (!(key in manifestSchema.shape)) report('manifest', `ignored-field:${key}`);
  const extensions = z.record(z.string(), z.unknown()).safeParse(manifest.extensions ?? {});
  if (!extensions.success) report('manifest', 'ignored-extensions');
  const inventory: PackageInventory = { root, name: manifest.name,
    ...(manifest.version === undefined ? {} : { version: manifest.version }),
    extensions: extensions.success ? extensions.data : {}, skills: [], servers: [], diagnostics };
  if (await exists(join(root, 'skills'))) {
    try {
      const dir = await packagePath(root, 'skills');
      for (const entry of await readdir(dir)) {
        const skill = join('skills', entry, 'SKILL.md');
        if (!await exists(join(root, skill))) continue;
        try {
          const text = await readSkillFile(root, skill);
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
          if (!frontmatter) throw Error('Missing frontmatter');
          const metadata = z.object({ name: name.refine(n => n === entry && !n.includes('.')),
            description: z.string().min(1).max(1024), license: z.string().optional(),
            compatibility: z.string().min(1).max(500).optional(),
            metadata: z.record(z.string(), z.string()).optional(), 'allowed-tools': z.string().optional(),
          }).parse(parseYaml(frontmatter[1]!));
          inventory.skills.push({ name: metadata.name, description: metadata.description, path: skill });
        } catch { report(`skill:${entry}`, 'invalid'); }
      }
    } catch { report('skills', 'invalid'); }
  }
  if (await exists(join(root, 'mcp.json'))) {
    try {
      const config = z.strictObject({ $schema: z.literal('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'),
        mcpServers: z.record(z.string(), z.unknown()),
      }).parse(JSON.parse(await readSkillFile(root, 'mcp.json')));
      for (const [id, rawServer] of Object.entries(config.mcpServers)) {
        try {
          const server = StdioSchema.parse(rawServer);
          if (server.command.startsWith('./')) await packagePath(root, server.command);
          inventory.servers.push({ name: id, config: server });
        } catch { report(`server:${id}`, 'invalid-or-unsupported'); }
      }
    } catch { report('mcp', 'invalid'); }
  }
  return inventory;
}

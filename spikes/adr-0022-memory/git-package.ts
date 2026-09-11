import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA } from '@drawloom/plugins';
export async function prepareGitPackage(directory: string, repository: string, paths: string[]) {
  await mkdir(directory, { recursive: true });
  const build = await Bun.build({ entrypoints: [fileURLToPath(new URL('./git-plugin/server.ts', import.meta.url))], outdir: directory, naming: 'server.mjs', target: 'node', minify: false });
  if (!build.success) throw Error('Git plugin build failed');
  await writeFile(join(directory, 'plugin.json'), JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'git-evidence', version: '0.0.0', description: 'Read-only committed Git evidence (ADR 0022 experiment)' }));
  await writeFile(join(directory, 'mcp.json'), JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: { git: { type: 'stdio', command: 'bun', args: ['./server.mjs'], env: { GIT_SOURCE_REPOSITORY: repository, GIT_SOURCE_PATHS: JSON.stringify(paths) } } } }));
}

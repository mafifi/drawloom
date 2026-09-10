// Opt-in public synthetic desktop with a standard package built outside checkout.
import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDesktopApplication } from '../../apps/desktop/host/application.js';
import { serveDesktop } from '../../apps/desktop/host/server.js';

const root = await mkdtemp(join(tmpdir(), 'drawloom-adr0018-standard-browser-'));
const pkg = join(root, 'package');
await mkdir(join(pkg, 'skills/outline/references'), { recursive: true });
const source = join(import.meta.dir, 'fixtures/plain');
const build = await Bun.build({ entrypoints: [join(source, 'server.mjs')], target: 'node', outdir: pkg, naming: 'server.mjs' });
if (!build.success) throw Error('Synthetic MCP server build failed');
await copyFile(join(source, 'plugin.json'), join(pkg, 'plugin.json'));
await copyFile(join(source, 'skills/outline/SKILL.md'), join(pkg, 'skills/outline/SKILL.md'));
await copyFile(join(source, 'skills/outline/references/style.md'), join(pkg, 'skills/outline/references/style.md'));
await writeFile(join(pkg, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers: { notes: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.mjs'], env: { PROOF_LITERAL: '${PLUGIN_DATA}' } } },
}));
const data = join(root, 'data');
const setup = await createDesktopApplication(data);
const id = await setup.installations.add(pkg);
await setup.installations.configure(id, { enabled: true, trustedBackend: false, servers: ['notes'], configuration: {} });
await setup.close();
const app = await createDesktopApplication(data);
const status = app.packageStatuses()[0];
if (status?.status !== 'ready' || status.servers[0]?.status !== 'connected') { await app.close(); throw Error('Standard package failed activation'); }
const host = serveDesktop(app, resolve(import.meta.dir, '../../apps/desktop/build'));
console.log(JSON.stringify({ root, package: pkg, url: host.url, connected: true }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void host.close().finally(() => process.exit(0)); });

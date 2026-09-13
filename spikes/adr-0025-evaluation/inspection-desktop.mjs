// Opt-in fixture: existing desktop + installed synthetic MCP App. No model calls.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from '../../apps/desktop/host/plugin-installations.ts';
import { createDesktopApplication } from '../../apps/desktop/host/application.ts';
import { serveDesktop } from '../../apps/desktop/host/server.ts';

const [runtimeArgument, packageArgument] = process.argv.slice(2);
if (!runtimeArgument || !packageArgument) throw Error('Supply a disposable runtime folder and the built inspection package folder.');
const runtime = await realpath(runtimeArgument);
const packageRoot = await realpath(packageArgument);
const manifest = z.object({ extensions: z.object({ 'io.github.mafifi.drawloom': z.object({
  workbenches: z.array(z.object({ id: z.string().min(1), title: z.string().min(1) })).min(1),
}) }) }).parse(JSON.parse(await readFile(join(packageRoot, 'plugin.json'), 'utf8')));
const placement = manifest.extensions['io.github.mafifi.drawloom'].workbenches[0];
const data = join(runtime, 'data');
const project = join(runtime, 'project');
await mkdir(project, { recursive: true, mode: 0o700 });
const installations = await createInstallationStore(createNodeJsonStore(join(data, 'state')));
const id = await installations.add(packageRoot);
const inventory = await installations.inspect(packageRoot);
await installations.configure(id, { enabled: true, trustedBackend: true, servers: inventory.servers.filter(server => server.config.type !== 'sse').map(server => server.name), configuration: {} });
const app = await createDesktopApplication(data);
let server;
try {
  await app.restore();
  let state = await app.snapshot();
  // The fixture owns only this isolated project's synthetic conversation.
  if (!state.conversations.some(conversation => conversation.workbenchId === placement.id)) {
    await app.command({ kind: 'add_project', directory: project, name: 'Evaluation proof' });
    state = await app.command({ kind: 'create_conversation', workbenchId: placement.id, provider: 'synthetic' });
  }
  server = serveDesktop(app, resolve('apps/desktop/build'));
  const metadata = { root: runtime, origin: server.origin, url: server.url, pid: process.pid, title: placement.title, conversationId: state.selectedId, packageRoot };
  await writeFile(join(runtime, 'desktop.json'), JSON.stringify(metadata, null, 2), { mode: 0o600 });
  // Token is only in the restricted local receipt, never evidence or stdout.
  console.log(JSON.stringify({ root: runtime, origin: server.origin, pid: process.pid, title: placement.title }));
  let stopping;
  const stop = () => stopping ??= server.close();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop().finally(() => process.exit(0)); });
} catch (error) {
  if (server) await server.close(); else await app.close();
  throw error;
}

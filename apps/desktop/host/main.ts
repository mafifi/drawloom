import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { z } from 'zod';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';
import type { DesktopExtensionFactory } from './composition.js';
import { selectDataDirectory } from './data-directory.js';
async function main() {
const root = await selectDataDirectory({ home: homedir(), ...(process.env.DRAWLOOM_DATA_DIR !== undefined ? { override: process.env.DRAWLOOM_DATA_DIR } : {}) });
console.error(`Drawloom data: ${root}`);
const web = resolve(process.env.DRAWLOOM_WEB_ROOT ?? resolve(import.meta.dir, '../build'));
let extension: DesktopExtensionFactory | undefined;
if (process.env.DRAWLOOM_COMPOSITION) {
  // Only a trusted operator startup setting can choose executable code.
  const module: unknown = await import(pathToFileURL(resolve(process.env.DRAWLOOM_COMPOSITION)).href);
  const parsed = z.object({ default: z.custom<DesktopExtensionFactory>(value => typeof value === 'function') }).parse(module);
  extension = parsed.default;
}
const app = await createDesktopApplication(root, extension, { experimentalPluginDiscovery: process.env.DRAWLOOM_EXPERIMENTAL_PLUGIN_DISCOVERY === '1' });
await app.restore();
const server = serveDesktop(app, web, Number(process.env.DRAWLOOM_PORT ?? 0));
console.log(server.url);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
if (process.env.DRAWLOOM_MANAGED === '1') {
  process.stdin.resume();
  process.stdin.once('end', () => { void server.close().finally(() => process.exit(0)); });
}
}
await main().catch(() => { console.error('Drawloom could not start. Check the data directory and trusted configuration. If both default data locations exist, select one with DRAWLOOM_DATA_DIR. No data was moved.'); process.exit(1); });

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { z } from 'zod';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';
import type { DesktopExtensionFactory } from './composition.js';
async function main() {
const root = resolve(process.env.DRAWLOOM_DATA_DIR ?? resolve(homedir(), 'Library/Application Support/Drawloom'));
const web = resolve(process.env.DRAWLOOM_WEB_ROOT ?? resolve(import.meta.dir, '../build'));
let extension: DesktopExtensionFactory | undefined;
if (process.env.DRAWLOOM_COMPOSITION) {
  // Only a trusted operator startup setting can choose executable code.
  const module: unknown = await import(pathToFileURL(resolve(process.env.DRAWLOOM_COMPOSITION)).href);
  const parsed = z.object({ default: z.custom<DesktopExtensionFactory>(value => typeof value === 'function') }).parse(module);
  extension = parsed.default;
}
const app = await createDesktopApplication(root, extension);
await app.restore();
const server = serveDesktop(app, web, Number(process.env.DRAWLOOM_PORT ?? 0));
console.log(server.url);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void server.close().finally(() => process.exit(0)); });
if (process.env.DRAWLOOM_MANAGED === '1') {
  process.stdin.resume();
  process.stdin.once('end', () => { void server.close().finally(() => process.exit(0)); });
}
}
await main().catch(() => { console.error('Drawloom could not start. Check the local data directory and trusted startup configuration.'); process.exit(1); });

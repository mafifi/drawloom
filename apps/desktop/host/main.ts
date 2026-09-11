import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';
import { selectDataDirectory } from './data-directory.js';
import { initializeObservability } from '@drawloom/otel-host';
import { createTelemetryRelay } from './telemetry-relay.js';
import { pickMacProjectDirectory } from './folder-picker.js';
async function main() {
const selectedMode = process.env.DRAWLOOM_TELEMETRY ?? 'disabled';
if (!['disabled', 'recording', 'export'].includes(selectedMode)) throw Error('Invalid telemetry mode');
const mode = selectedMode as 'disabled' | 'recording' | 'export';
const telemetry = initializeObservability({ mode, serviceName: 'drawloom.desktop', safeSpanNames: (process.env.DRAWLOOM_TELEMETRY_SPANS ?? '').split(',').filter(Boolean), ...(process.env.DRAWLOOM_OTLP_ENDPOINT ? { endpoint: process.env.DRAWLOOM_OTLP_ENDPOINT } : {}) });
const relay = createTelemetryRelay(mode, process.env.DRAWLOOM_OTLP_ENDPOINT);
const root = await selectDataDirectory({ home: homedir(), ...(process.env.DRAWLOOM_DATA_DIR !== undefined ? { override: process.env.DRAWLOOM_DATA_DIR } : {}) });
console.error(`Drawloom data: ${root}`);
const web = resolve(process.env.DRAWLOOM_WEB_ROOT ?? resolve(import.meta.dir, '../build'));
const app = await createDesktopApplication(root, { experimentalPluginDiscovery: process.env.DRAWLOOM_EXPERIMENTAL_PLUGIN_DISCOVERY === '1', mediaOrigins: (process.env.DRAWLOOM_MEDIA_ORIGINS ?? '').split(',').map(s=>s.trim()).filter(Boolean) });
await app.restore();
const server = serveDesktop(app, web, Number(process.env.DRAWLOOM_PORT ?? 0), relay, process.platform==='darwin'?{pickDirectory:pickMacProjectDirectory}:{});
console.log(server.url);
let stopping: Promise<void> | undefined;
const stop = () => stopping ??= server.close().finally(() => telemetry.shutdown());
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void stop().finally(() => process.exit(0)); });
if (process.env.DRAWLOOM_MANAGED === '1') {
  process.stdin.resume();
  process.stdin.once('end', () => { void stop().finally(() => process.exit(0)); });
}
}
await main().catch(() => { console.error('Drawloom could not start. Check the data directory and trusted configuration. If both default data locations exist, select one with DRAWLOOM_DATA_DIR. No data was moved.'); process.exit(1); });

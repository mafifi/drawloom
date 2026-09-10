/** Opt-in public synthetic benchmark. Results are measurements, not acceptance. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeObservability } from '../../packages/observability/otel-host/src/index.ts';
import { createDesktopApplication } from '../../apps/desktop/host/application.ts';
import { observed } from '../../apps/desktop/host/telemetry.ts';

const mode = process.argv[2];
if (mode !== 'disabled' && mode !== 'recording' && mode !== 'export') throw Error('Choose disabled, recording or export');
const target = process.env.DRAWLOOM_OTLP_ENDPOINT;
if (mode === 'export' && !target) throw Error('Explicit local viewer endpoint required');
if (target && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(target)) throw Error('Loopback only');
let bytes = 0, batches = 0, failures = 0;
const proxy = mode === 'export' ? Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const body = await request.arrayBuffer(); bytes += body.byteLength; batches++;
  const response = await fetch(new URL(new URL(request.url).pathname, target), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(1000) });
  if (!response.ok) failures++; await response.body?.cancel();
  return Response.json({}, { status: response.status });
} }) : undefined;
const cpu = process.cpuUsage(); const setupStart = performance.now();
const sdk = initializeObservability({ mode, serviceName: 'drawloom.benchmark', ...(proxy ? { endpoint: proxy.url.href } : {}) });
const sdkSetupMs = performance.now() - setupStart;
const runtime = await mkdtemp(join(tmpdir(), 'drawloom-otel-benchmark-'));
const start = performance.now();
const app = await createDesktopApplication(runtime);
const coldMs = performance.now() - start;
const durations: number[] = []; const stages: { discovery: number; command: number; history: number }[] = [];
try {
  const id = (await app.snapshot()).selectedId;
  for (let i = 0; i < 31; i++) {
    const started = performance.now();
    const discoveryStart = performance.now(); await app.discover(id);
    const discovery = performance.now() - discoveryStart;
    const commandStart = performance.now();
    await observed('http.request', { 'http.route': '/api/command' }, () => app.command({ kind: 'send', conversationId: id, text: `Synthetic text ${i}`, attachmentKeys: [], contextArtifactIds: [] }));
    // Wait for terminal display, not just submission acknowledgement.
    for (let j = 0; j < 200 && (await app.snapshot()).activeOperation; j++) await Bun.sleep(1);
    const command = performance.now() - commandStart;
    const historyStart = performance.now(); await app.historyPage(id); await app.historyPage(id);
    if (i > 0) { stages.push({ discovery, command, history: performance.now() - historyStart }); durations.push(performance.now() - started); }
  }
  await sdk.flush();
  const sorted = [...durations].sort((a, b) => a - b), usage = process.cpuUsage(cpu);
  // Bun 1.2.23 on macOS reports bytes here (verified against /usr/bin/time -l), unlike Node's KB API.
  const peakRssBytes = process.resourceUsage().maxRSS * (process.platform === 'darwin' ? 1 : 1024);
  const result = { mode, repetitions: durations.length, sdkSetupMs, coldMs, medianMs: (sorted[14]! + sorted[15]!) / 2, p95Ms: sorted[28], cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000, peakRssBytes, bytes, batches, failures, diagnostics: sdk.diagnostics(), durations, stages, limitations: ['Public synthetic provider; no live Codex performance claim', 'Peak RSS is whole-process high-water mark', 'Initial warm-up excluded; CPU includes setup and flush; module loading excluded from startup timing', 'UI is measured separately in browser proof'] };
  await writeFile(join(runtime, 'measurements.json'), JSON.stringify(result, null, 2));
  const { durations: _samples, stages: _stages, ...summary } = result;
  console.log(JSON.stringify({ runtime, ...summary }, null, 2));
} finally { await app.close(); await sdk.shutdown(); proxy?.stop(true); }

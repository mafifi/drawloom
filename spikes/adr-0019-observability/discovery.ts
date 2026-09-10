/** Native discovery only: no prompt submission, tool execution or provider content export. */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { initializeObservability } from '../../packages/observability/otel-host/src/index.ts';
import { createDesktopApplication } from '../../apps/desktop/host/application.ts';
const root = await mkdtemp(join(tmpdir(), 'drawloom-discovery-diagnostic-'));
const spans = new InMemorySpanExporter();
const endpoint = process.env.DRAWLOOM_OTLP_ENDPOINT;
if (endpoint && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(endpoint)) throw Error('Loopback only');
const network = endpoint ? new OTLPTraceExporter({ url: new URL('/v1/traces', endpoint).href, timeoutMillis: 1000 }) : undefined;
const sdk = initializeObservability({ mode: 'recording', serviceName: 'drawloom.discovery-proof', exporters: { traces: network ? { export(data, callback) { spans.export(data, () => {}); network.export(data, callback); }, async shutdown() { await network.shutdown(); } } : spans } });
const app = await createDesktopApplication(root);
try {
  const initial = await app.snapshot();
  await app.command({ kind: 'create_conversation', workbenchId: initial.conversations[0]!.workbenchId, provider: 'codex' });
  const id = (await app.snapshot()).selectedId;
  const results = [];
  for (const refresh of [false, true]) {
    const start = performance.now(); const catalogue = await app.discover(id, refresh);
    results.push({ refresh, ms: performance.now() - start, entryCount: catalogue.entries.length, categories: catalogue.categories.map(c => ({ kind: c.kind, status: c.status })) });
  }
  await app.close(); await sdk.flush();
  const calls = spans.getFinishedSpans().map(s => ({ name: s.name, method: s.attributes['rpc.method'], outcome: s.attributes['drawloom.outcome'], traceId: s.spanContext().traceId, parent: s.parentSpanContext?.spanId, spanId: s.spanContext().spanId, startMs: s.startTime[0] * 1000 + s.startTime[1] / 1e6, durationMs: s.duration[0] * 1000 + s.duration[1] / 1e6, error: s.status.code === 2 }));
  const result = { results, calls, diagnostics: sdk.diagnostics(), limitations: ['Inventory only; zero model submissions', 'No contribution names, provider contents or paths retained', 'Calls still running after display deadline may end only during close'] };
  await writeFile(join(root, 'discovery.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ root, ...result }, null, 2));
} finally { await app.close(); await sdk.shutdown(); }

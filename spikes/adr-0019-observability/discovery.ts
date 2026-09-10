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
if (endpoint && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(endpoint))
  throw Error('Loopback only');
const network = endpoint
  ? new OTLPTraceExporter({
      url: new URL('/v1/traces', endpoint).href,
      timeoutMillis: 1000,
    })
  : undefined;
const sdk = initializeObservability({
  mode: 'recording',
  serviceName: 'drawloom.discovery-proof',
  exporters: {
    traces: network
      ? {
          export(data, callback) {
            spans.export(data, () => {});
            network.export(data, callback);
          },
          async shutdown() {
            await network.shutdown();
          },
        }
      : spans,
  },
});
const app = await createDesktopApplication(root);
try {
  const initial = await app.snapshot();
  await app.command({
    kind: 'create_conversation',
    workbenchId: initial.conversations[0]!.workbenchId,
    provider: 'codex',
  });
  const id = (await app.snapshot()).selectedId;
  const start = performance.now();
  let catalogue = await app.discover(id);
  const initialMs = performance.now() - start;
  const readiness: Record<string, number> = {};
  let polls = 0,
    refreshMs = 0;
  while (
    catalogue.categories.some((c) => c.status === 'loading') &&
    performance.now() - start < 40_000
  ) {
    for (const category of catalogue.categories)
      if (
        category.status === 'available' &&
        readiness[category.kind] === undefined
      )
        readiness[category.kind] = performance.now() - start;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const pollStart = performance.now();
    catalogue = await app.discover(id, polls === 2);
    if (polls === 2) refreshMs = performance.now() - pollStart;
    polls++;
  }
  for (const category of catalogue.categories)
    if (
      category.status === 'available' &&
      readiness[category.kind] === undefined
    )
      readiness[category.kind] = performance.now() - start;
  const completeMs = performance.now() - start;
  await sdk.flush();
  const before = spans
    .getFinishedSpans()
    .filter((s) => s.name === 'agent.request').length;
  const warmStart = performance.now();
  await app.discover(id);
  const warmMs = performance.now() - warmStart;
  await sdk.flush();
  const warmProviderCalls =
    spans.getFinishedSpans().filter((s) => s.name === 'agent.request').length -
    before;
  const firstPageEntries = catalogue.entries.filter(
    (e) => e.kind === 'app',
  ).length;
  let nextPageMs: number | undefined;
  if (catalogue.nextCursor) {
    const pageStart = performance.now();
    catalogue = await app.discover(id, false, catalogue.nextCursor);
    while (
      catalogue.categories.some((c) => c.status === 'loading') &&
      performance.now() - pageStart < 5000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      catalogue = await app.discover(id);
    }
    nextPageMs = performance.now() - pageStart;
  }
  const results = {
    initialMs,
    refreshMs,
    readiness,
    completeMs,
    polls,
    warmMs,
    warmProviderCalls,
    firstPageEntries,
    nextPageMs,
    secondPageEntries: catalogue.entries.filter((e) => e.kind === 'app').length,
    categories: catalogue.categories,
  };
  await app.close();
  await sdk.flush();
  const calls = spans
    .getFinishedSpans()
    .map((s) => ({
      name: s.name,
      method: s.attributes['rpc.method'],
      outcome: s.attributes['drawloom.outcome'],
      traceId: s.spanContext().traceId,
      parent: s.parentSpanContext?.spanId,
      spanId: s.spanContext().spanId,
      startMs: s.startTime[0] * 1000 + s.startTime[1] / 1e6,
      durationMs: s.duration[0] * 1000 + s.duration[1] / 1e6,
      error: s.status.code === 2,
    }));
  const result = {
    results,
    calls,
    diagnostics: sdk.diagnostics(),
    limitations: [
      'Inventory only; zero model submissions',
      'No contribution names, provider contents or paths retained',
      'Readiness sampled at 200ms intervals; provider-internal cold latency is not fixed',
    ],
  };
  await writeFile(
    join(root, 'discovery.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify({ root, ...result }, null, 2));
} finally {
  await app.close();
  await sdk.shutdown();
}

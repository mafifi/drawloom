import { SpanKind, SpanStatusCode, type Tracer } from '@opentelemetry/api';
let tracer: Tracer | undefined;
let initialized: Promise<void> | undefined;
const paths = new Set(['/api/command', '/api/discovery', '/api/import', '/api/packages', '/api/resource/read', '/api/resource/open', '/api/view-request', '/api/view-interaction']);
export function initializeUiTelemetry(): Promise<void> {
  return initialized ??= (async () => {
    try {
      const response = await globalThis.fetch('/api/telemetry', { signal: AbortSignal.timeout(1000) });
      const configuration: unknown = await response.json();
      if (!configuration || typeof configuration !== 'object' || !('enabled' in configuration) || configuration.enabled !== true) return;
      const [{ BasicTracerProvider, BatchSpanProcessor }, { OTLPTraceExporter }] = await Promise.all([import('@opentelemetry/sdk-trace-base'), import('@opentelemetry/exporter-trace-otlp-http')]);
      const provider = new BasicTracerProvider({ spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: '/api/telemetry/v1/traces', timeoutMillis: 1000 }), { maxQueueSize: 128, maxExportBatchSize: 32, scheduledDelayMillis: 500, exportTimeoutMillis: 1000 })] });
      // Local provider only. No zone patching, page capture, global fetch patch or iframe SDK.
      tracer = provider.getTracer('drawloom.ui');
      globalThis.addEventListener?.('pagehide', () => { void provider.forceFlush().catch(() => {}); });
    } catch { /* Telemetry setup cannot prevent opening a cached workspace. */ }
  })();
}
/** Explicit meaningful requests only; never snapshot polling or arbitrary URLs. */
export async function telemetryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = typeof input === 'string' ? input.split('?')[0]! : '';
  if (!tracer || !paths.has(path)) return globalThis.fetch(input, init);
  const span = tracer.startSpan('ui.request', { kind: SpanKind.CLIENT, attributes: { 'http.route': path } });
  const identity = span.spanContext();
  const headers = new Headers(init?.headers);
  headers.set('traceparent', `00-${identity.traceId}-${identity.spanId}-01`);
  try {
    const response = await globalThis.fetch(input, { ...init, headers });
    span.setAttribute('http.response.status_code', response.status);
    if (!response.ok) span.setStatus({ code: SpanStatusCode.ERROR });
    return response;
  } catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
  finally { span.end(); }
}

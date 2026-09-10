import { z } from 'zod';
import { metrics } from '@opentelemetry/api';
// Narrow validation of standard OTLP JSON, not a new browser telemetry protocol.
const route = z.enum(['/api/command', '/api/discovery', '/api/import', '/api/packages', '/api/resource/read', '/api/resource/open', '/api/view-request', '/api/view-interaction']);
const attribute = z.discriminatedUnion('key', [
  z.object({ key: z.literal('http.route'), value: z.object({ stringValue: route }) }),
  z.object({ key: z.literal('http.response.status_code'), value: z.object({ intValue: z.union([z.number().int(), z.string().regex(/^\d{3}$/)]).transform(Number).pipe(z.number().min(100).max(599)) }) }),
]);
const time = z.string().regex(/^\d{16,20}$/);
const span = z.object({
  name: z.literal('ui.request'), traceId: z.string().regex(/^[a-f0-9]{32}$/).refine(v => /[1-9a-f]/.test(v)), spanId: z.string().regex(/^[a-f0-9]{16}$/).refine(v => /[1-9a-f]/.test(v)),
  startTimeUnixNano: time, endTimeUnixNano: time,
  attributes: z.array(attribute).max(2).default([]),
  status: z.object({ code: z.number().int().min(0).max(2) }).optional(),
}).refine(s => {
  const start = BigInt(s.startTimeUnixNano), end = BigInt(s.endTimeUnixNano), now = BigInt(Date.now()) * 1_000_000n;
  return end >= start && start >= now - 300_000_000_000n && end <= now + 60_000_000_000n;
});
const envelope = z.object({ resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(span).min(1).max(32) })).length(1) })).length(1) });
export function createTelemetryRelay(mode: 'disabled' | 'recording' | 'export', endpoint?: string) {
  let target: URL | undefined;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw Error('Invalid local telemetry endpoint');
    target = new URL('v1/traces', url);
  }
  if (mode === 'export' && !target) throw Error('Explicit local endpoint required');
  let inFlight = 0, requests = 0, windowStart = Date.now(), dropped = 0;
  const drop = (count = 1) => { dropped += count; metrics.getMeter('drawloom.desktop').createCounter('telemetry.dropped').add(count); };
  return {
    enabled: mode !== 'disabled', diagnostics: () => ({ dropped }),
    /** The HTTP host authenticates and checks origin before reaching this handler. */
    async handle(request: Request): Promise<Response> {
      if (mode === 'disabled') return new Response(null, { status: 404 });
      if (Date.now() - windowStart > 60_000) { requests = 0; windowStart = Date.now(); }
      if (++requests > 120 || inFlight >= 4) { drop(); return new Response(null, { status: 429 }); }
      inFlight++;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Stream bound applies even when Content-Length is absent or false.
        const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400 });
        timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 65_536) { await reader.cancel(); drop(); return new Response(null, { status: 413 }); }
          chunks.push(chunk.value);
        }
        const input = envelope.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const spans = input.resourceSpans[0]!.scopeSpans[0]!.spans.map(s => ({ ...s, kind: 3, flags: 1 }));
        const output = { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'drawloom.ui' } }] }, scopeSpans: [{ scope: { name: 'drawloom.ui' }, spans }] }] };
        if (mode === 'export' && target) {
          const response = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(output), signal: AbortSignal.timeout(1000), redirect: 'error' });
          await response.body?.cancel(); if (!response.ok) { drop(spans.length); return new Response(null, { status: 503 }); }
        }
        return new Response(null, { status: 204 });
      } catch { drop(); return new Response(null, { status: 400 }); }
      finally { clearTimeout(timer); inFlight--; }
    },
  };
}

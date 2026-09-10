import { test, expect } from 'bun:test';
import { createTelemetryRelay } from './telemetry-relay.js';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function payload() {
  const start = String(BigInt(Date.now()) * 1_000_000n);
  return { resourceSpans: [{ resource: { attributes: [{ key: 'secret', value: { stringValue: 'SECRET' } }] }, scopeSpans: [{ scope: { name: 'SECRET' }, spans: [{ name: 'ui.request', traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), startTimeUnixNano: start, endTimeUnixNano: start, kind: 3, attributes: [{ key: 'http.route', value: { stringValue: '/api/discovery' } }], events: [{ name: 'SECRET' }] }] }] }] };
}
test('UI relay forwards bounded standard traces with fixed resource and no user content', async () => {
  const received: unknown[] = [];
  const sink = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) { received.push(await req.json()); return Response.json({}); } });
  try {
    const relay = createTelemetryRelay('export', sink.url.href);
    expect((await relay.handle(new Request('http://localhost/', { method: 'POST', body: JSON.stringify(payload()) }))).status).toBe(204);
    expect(received).toHaveLength(1);
    expect(JSON.stringify(received)).not.toContain('SECRET');
    expect(JSON.stringify(received)).toContain('drawloom.ui');
    expect((await relay.handle(new Request('http://localhost/', { method: 'POST', body: 'x'.repeat(65_537) }))).status).toBe(413);
  } finally { sink.stop(true); }
});
test('disabled UI relay is closed and invalid endpoints cannot become an export proxy', async () => {
  expect((await createTelemetryRelay('disabled').handle(new Request('http://localhost/'))).status).toBe(404);
  expect(() => createTelemetryRelay('export', 'https://example.com')).toThrow();
  const value = payload(); value.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.name = 'SECRET';
  expect((await createTelemetryRelay('recording').handle(new Request('http://localhost/', { method: 'POST', body: JSON.stringify(value) }))).status).toBe(400);
});

test('the desktop authenticates and checks origin before accepting UI OTLP', async () => {
  const app = await createDesktopApplication(await mkdtemp(join(tmpdir(), 'drawloom-relay-auth-')));
  const relay = createTelemetryRelay('recording');
  const server = serveDesktop(app, '/unused', 0, relay);
  const url = server.origin + '/api/telemetry/v1/traces', body = JSON.stringify(payload());
  try {
    expect((await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', origin: server.origin } })).status).toBe(401);
    const bootstrap = await fetch(server.url, { redirect: 'manual' });
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
    expect((await fetch(url, { method: 'POST', body, headers: { cookie, 'Content-Type': 'application/json', origin: 'http://evil.invalid' } })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', body, headers: { cookie, 'Content-Type': 'application/json', origin: server.origin } })).status).toBe(204);
  } finally { await server.close(); }
});

test('a stalled body and overloaded UI relay are bounded', async () => {
  const relay = createTelemetryRelay('recording');
  const start = performance.now();
  const hung = new Request('http://localhost/', { method: 'POST', body: new ReadableStream({ start() {} }) });
  expect((await relay.handle(hung)).status).toBe(400);
  expect(performance.now() - start).toBeLessThan(1500);
  for (let i = 0; i < 119; i++) await relay.handle(new Request('http://localhost/', { method: 'POST', body: JSON.stringify(payload()) }));
  expect((await relay.handle(new Request('http://localhost/', { method: 'POST', body: '{}' }))).status).toBe(429);
  expect(relay.diagnostics().dropped).toBe(2);
});

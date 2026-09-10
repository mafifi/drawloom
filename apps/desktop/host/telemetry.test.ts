import { test, expect, afterAll } from 'bun:test';
import { context, propagation, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { observed, observedRpc, observedToolGateway, instrumentApplication, observedHttp, createOperationTelemetry } from './telemetry.js';
import { createLocalToolGateway } from '@drawloom/local-tools';
import { defineTool } from '@drawloom/tools';
import { z } from 'zod';
import { createDesktopApplication } from './application.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activatePackage } from '@drawloom/local-plugin-packages';
import { connectMcpApp } from './mcp-app.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

test('direct MCP App calls receive host trace context in standard metadata, never arguments', async () => {
  exporter.reset();
  const [host, transport] = InMemoryTransport.createLinkedPair();
  const server = new McpServer({ name: 'synthetic-editor', version: '1' });
  const uri = 'ui://synthetic/editor.html'; let incoming: unknown;
  server.registerResource('editor', uri, {}, async () => ({ contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: '<p>Editor</p>' }] }));
  server.registerTool('edit', { inputSchema: { text: z.string() }, _meta: { ui: { resourceUri: uri } } }, async (args, extra) => {
    incoming = { args, metadata: extra._meta }; return { content: [{ type: 'text', text: 'saved' }] };
  });
  await server.connect(transport);
  const app = await connectMcpApp({ transport: host, toolName: 'edit' }, uri);
  try {
    await observed('host.command', {}, () => app.callTool({ name: 'edit', arguments: { text: 'SECRET' }, _meta: { traceparent: 'untrusted-app-parent' } }));
    const span = exporter.getFinishedSpans().find(s => s.name === 'mcp.request')!;
    expect(incoming).toEqual({ args: { text: 'SECRET' }, metadata: { traceparent: `00-${span.spanContext().traceId}-${span.spanContext().spanId}-01` } });
    expect(span.parentSpanContext?.spanId).toBe(exporter.getFinishedSpans().find(s => s.name === 'host.command')!.spanContext().spanId);
  } finally { await app.close(); await server.close(); }
});

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
provider.register();
afterAll(async () => { await provider.shutdown(); trace.disable(); context.disable(); propagation.disable(); });

test('concurrent observed calls retain their own child spans and never capture argument or error content', async () => {
  exporter.reset();
  const rpc = observedRpc({ request: async () => { await Bun.sleep(2); throw Error('SECRET_PROMPT'); }, notify() {}, respond() {}, subscribe: () => () => {}, close: async () => {} });
  await Promise.all([1, 2].map(n => observed('host.command', {}, async () => {
    await rpc.request('skills/list', { text: 'SECRET_PROMPT', n }).catch(() => {});
  })));
  const spans = exporter.getFinishedSpans();
  const roots = spans.filter(s => s.name === 'host.command');
  const calls = spans.filter(s => s.name === 'agent.request');
  expect(roots).toHaveLength(2); expect(calls).toHaveLength(2);
  expect(new Set(roots.map(s => s.spanContext().traceId)).size).toBe(2);
  for (const call of calls) expect(roots.some(s => s.spanContext().spanId === call.parentSpanContext?.spanId && s.spanContext().traceId === call.spanContext().traceId)).toBe(true);
  expect(JSON.stringify(spans.map(s => [s.attributes, s.events, s.status]))).not.toContain('SECRET_PROMPT');
});

test('a denied gateway call creates no execution span and never invokes its handler', async () => {
  exporter.reset(); let calls = 0;
  const tool = defineTool({ name: 'synthetic.echo', description: 'Synthetic', input: z.object({ text: z.string() }), output: z.object({ ok: z.boolean() }), execute: () => { calls++; return { ok: true }; } });
  const gateway = observedToolGateway(createLocalToolGateway({ tools: [tool], policy: () => false, evidence: { record: async () => {} }, nextInvocationId: () => crypto.randomUUID() }));
  const result = await gateway.invoke(gateway.bind('operation'), tool.name, { text: 'SECRET_DOCUMENT' }, new AbortController().signal);
  expect(result.outcome.status).toBe('failed'); expect(calls).toBe(0);
  const spans = exporter.getFinishedSpans();
  expect(spans.filter(s => s.name === 'tool.invoke')).toHaveLength(1);
  expect(spans.find(s => s.name === 'tool.invoke')?.attributes['drawloom.outcome']).toBe('denied');
  expect(JSON.stringify(spans.map(s => s.attributes))).not.toContain('SECRET_DOCUMENT');
});

test('application instrumentation preserves method receiver and returned state', async () => {
  exporter.reset();
  const app = { value: 3, async discover() { return this.value; }, async snapshot() { return this.value; }, async historyChanges() { return []; }, viewSession() { return { mountId: 'synchronous' }; } };
  const wrapped = instrumentApplication(app);
  expect(await wrapped.discover()).toBe(3); expect(await wrapped.snapshot()).toBe(3);
  expect(wrapped.viewSession()).toEqual({ mountId: 'synchronous' });
  await observedHttp(new Request('http://localhost/api/history/changes'), async () => { await wrapped.historyChanges(); return new Response(null, { status: 204 }); });
  expect(exporter.getFinishedSpans().map(s => s.name)).toEqual(['host.discovery']);
});

test('the real synthetic desktop exposes discovery and history boundaries without content', async () => {
  exporter.reset();
  const app = await createDesktopApplication(await mkdtemp(join(tmpdir(), 'drawloom-otel-host-')));
  try {
    const id = (await app.snapshot()).selectedId;
    await app.discover(id); await app.historyPage(id);
    const names = exporter.getFinishedSpans().map(s => s.name);
    expect(names).toContain('host.discovery'); expect(names).toContain('host.history.page');
  } finally { await app.close(); }
});

test('HTTP propagation keeps only W3C trace identity and sanitizes routes', async () => {
  exporter.reset();
  const traceId = 'a'.repeat(32), parentId = 'b'.repeat(16);
  const response = await observedHttp(new Request('http://localhost/api/discovery?conversationId=SECRET', { headers: { traceparent: `00-${traceId}-${parentId}-01`, baggage: 'secret=SECRET' } }), () => observed('host.discovery', {}, async () => new Response(null, { status: 204 })));
  expect(response.status).toBe(204);
  const spans = exporter.getFinishedSpans();
  const http = spans.find(s => s.name === 'http.request')!;
  expect(http.spanContext().traceId).toBe(traceId);
  expect(http.parentSpanContext?.spanId).toBe(parentId);
  expect(spans.find(s => s.name === 'host.discovery')?.parentSpanContext?.spanId).toBe(http.spanContext().spanId);
  expect(http.attributes['http.route']).toBe('/api/discovery');
  expect(JSON.stringify(spans.map(s => s.attributes))).not.toContain('SECRET');
});

test('standard MCP metadata continues the invocation without changing tool arguments', async () => {
  exporter.reset();
  const seen: { method: string; params?: { _meta?: Record<string, unknown>; arguments?: unknown } }[] = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = await request.json(); seen.push(message);
    if (message.id === undefined) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } }
      : { content: [{ type: 'text', text: 'ok' }] } });
  } });
  const active = await activatePackage({ root: '/unused', name: 'synthetic', skills: [], servers: [{ name: 'remote', config: { type: 'streamable-http', url: server.url.href } }], diagnostics: [], extensions: {} }, { dataRoot: '/unused', installationId: 'test', selectedServers: ['remote'] });
  try {
    await observed('tool.execute', {}, async () => { await active.servers.get('remote')!.client.callTool({ name: 'plain', arguments: { text: 'SECRET' } }); });
    const message = seen.find(m => m.method === 'tools/call')!;
    expect(message.params?.arguments).toEqual({ text: 'SECRET' });
    const call = exporter.getFinishedSpans().find(s => s.name === 'mcp.request' && s.attributes['rpc.method'] === 'tools/call')!;
    expect(call).toBeDefined();
    expect(message.params?._meta?.traceparent).toContain(call.spanContext().spanId);
    expect(message.params?._meta?.baggage).toBeUndefined();
  } finally { await active.close(); server.stop(true); }
});

test('approval waits and detached gateway work retain operation ownership and close explicitly', async () => {
  exporter.reset();
  const operations = createOperationTelemetry();
  const op = crypto.randomUUID(); operations.begin(op);
  operations.signal({ kind: 'approval.requested', request: { operationId: op, approvalId: 'one', summary: 'SECRET', options: [{ optionId: 'yes', label: 'SECRET' }] } });
  await operations.run(op, () => observed('tool.execute', {}, async () => {}));
  operations.signal({ kind: 'approval.resolved', approvalId: 'one' });
  operations.end(op, 'ok'); operations.close();
  const spans = exporter.getFinishedSpans();
  const operation = spans.find(s => s.name === 'agent.operation')!;
  expect(operation).toBeDefined();
  for (const name of ['tool.execute', 'agent.approval.wait']) expect(spans.find(s => s.name === name)?.parentSpanContext?.spanId).toBe(operation.spanContext().spanId);
  expect(spans.filter(s => s.name === 'agent.approval.wait')).toHaveLength(1);
  expect(JSON.stringify(spans.map(s => s.attributes))).not.toContain('SECRET');
});

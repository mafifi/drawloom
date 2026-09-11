import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA } from '@drawloom/plugins';
import type { ToolElicitationHandler, ToolElicitationRequest, ToolElicitationResult } from '@drawloom/tools';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { activatePackage, inspectPackage } from './src/index.ts';

// Public synthetic stationery choice, using only standard MCP messages.
const script = `import { writeFileSync, appendFileSync } from 'node:fs'; let buffer = '', next = 0, active = 0; const pending = new Map();
const send = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\\n');
process.stdin.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\\n')) >= 0) {
 const m = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
 if (m.method === 'initialize') { writeFileSync(process.env.PLUGIN_DATA + '/capabilities.json', JSON.stringify(m.params.capabilities)); send({ id: m.id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'stationery', version: '1' } } }); }
 else if (m.method === 'tools/list') send({ id: m.id, result: { tools: [{ name: 'choose', description: 'Choose paper', inputSchema: { type: 'object' } }] } });
 else if (m.method === 'tools/call' && m.params.arguments?.parallel) {
   active++; appendFileSync(process.env.PLUGIN_DATA + '/calls.jsonl', JSON.stringify({ event: 'start', id: m.params.arguments.id, traceparent: m.params._meta?.traceparent }) + '\\n');
   setTimeout(() => { send({ id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ id: m.params.arguments.id, active, traceparent: m.params._meta?.traceparent }) }] } }); active--; appendFileSync(process.env.PLUGIN_DATA + '/calls.jsonl', JSON.stringify({ event: 'end', id: m.params.arguments.id }) + '\\n'); }, m.params.arguments.delay ?? 40);
 } else if (m.method === 'tools/call' || m.method === 'resources/read') {
   const id = 'form-' + (++next); pending.set(id, m.id);
   send({ id, method: 'elicitation/create', params: m.params.arguments?.url ? { mode: 'url', message: 'Open choice', url: 'https://example.com', elicitationId: 'url' } : { mode: 'form', message: 'Choose paper', requestedSchema: { type: 'object', properties: { paper: { type: 'string', enum: ['plain', 'lined'] } }, required: ['paper'] } } });
 } else if (pending.has(m.id)) { send({ id: pending.get(m.id), result: { content: [{ type: 'text', text: JSON.stringify(m.result ?? m.error) }] } }); pending.delete(m.id); }
}}); process.stdin.on('end', () => process.exit(0));`;

export async function fixture(handler?: ToolElicitationHandler, elicitationDisabledServers?: readonly string[]) {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-elicitation-'));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'stationery' }));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: { stationery: { type: 'stdio', command: 'bun', args: ['./server.mjs'] } } }));
  await writeFile(join(root, 'server.mjs'), script);
  const active = await activatePackage(await inspectPackage(root), { dataRoot: join(root, 'data'), installationId: 'one', selectedServers: ['stationery'], ...(handler ? { elicitation: handler } : {}), ...(elicitationDisabledServers ? { elicitationDisabledServers } : {}) });
  return { root, active, server: active.servers.get('stationery')!, async close() { await active.close(); await rm(root, { recursive: true, force: true }); } };
}
const context = (id: string, signal = new AbortController().signal) => ({ operationId: 'operation-' + id, invocationId: id, signal });

test('package-owned invocation retains accept, decline and cancel with source-bound standard forms', async () => {
  const requests: ToolElicitationRequest[] = [];
  let answer: ToolElicitationResult = { action: 'accept', content: { paper: 'lined' } };
  const f = await fixture(async request => { requests.push(request); return answer; });
  try {
    for (const action of ['accept', 'decline', 'cancel'] as const) {
      answer = action === 'accept' ? { action, content: { paper: 'lined' } } : { action };
      const result = await f.server.callTool({ name: 'choose', arguments: {} }, context(action));
      expect(JSON.parse(result.content[0]!.type === 'text' ? result.content[0]!.text : '')).toEqual(answer);
    }
    expect(requests.map(r => [r.invocationId, r.operationId, r.source])).toEqual([
      ['accept', 'operation-accept', 'package:one:stationery'], ['decline', 'operation-decline', 'package:one:stationery'], ['cancel', 'operation-cancel', 'package:one:stationery'],
    ]);
    expect(new Set(requests.map(r => r.requestId)).size).toBe(3);
  } finally { await f.close(); }
});

test('package form validates accepted data and rejects URL and unbound client requests', async () => {
  let presentations = 0;
  const f = await fixture(async () => { presentations++; return { action: 'accept', content: { paper: 'invalid' } }; });
  try {
    const invalid = await f.server.callTool({ name: 'choose', arguments: {} }, context('invalid'));
    expect(invalid.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Invalid') });
    const url = await f.server.callTool({ name: 'choose', arguments: { url: true } }, context('url'));
    expect(url.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('URL') });
    const unbound = CallToolResultSchema.parse(await f.server.client.callTool({ name: 'choose', arguments: {} }));
    expect(unbound.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('bound') });
    expect(presentations).toBe(1);
  } finally { await f.close(); }
});

test('form capability is advertised only with an available presenter', async () => {
  for (const enabled of [false, true]) {
    const f = await fixture(enabled ? async () => ({ action: 'cancel' }) : undefined);
    try {
      const capabilities = await Bun.file(join(f.root, 'data/one/capabilities.json')).json();
      expect(capabilities.elicitation).toEqual(enabled ? { form: {} } : undefined);
    } finally { await f.close(); }
  }
});

test('concurrent calls serialize by connection and retain their original invocation owners', async () => {
  const firstShown = Promise.withResolvers<void>(), release = Promise.withResolvers<ToolElicitationResult>();
  const owners: string[] = [];
  const f = await fixture(async request => {
    owners.push(request.invocationId);
    if (request.invocationId === 'first') { firstShown.resolve(); return release.promise; }
    return { action: 'decline' };
  });
  try {
    const first = f.server.callTool({ name: 'choose', arguments: {} }, context('first'));
    await firstShown.promise;
    const second = f.server.callTool({ name: 'choose', arguments: {} }, context('second'));
    expect(owners).toEqual(['first']);
    release.resolve({ action: 'accept', content: { paper: 'plain' } });
    const results = await Promise.all([first, second]);
    expect(owners).toEqual(['first', 'second']);
    expect(results.map(result => result.content[0])).toEqual([{ type: 'text', text: '{"action":"accept","content":{"paper":"plain"}}' }, { type: 'text', text: '{"action":"decline"}' }]);
  } finally { release.resolve({ action: 'cancel' }); await f.close(); }
});

test('disconnect invalidates pending form and prevents subsequent calls', async () => {
  const shown = Promise.withResolvers<void>();
  let signal: AbortSignal | undefined;
  const f = await fixture(async (_request, current) => { signal = current; shown.resolve(); return new Promise(() => {}); });
  try {
    const pending = f.server.callTool({ name: 'choose', arguments: {} }, context('one')).then(() => undefined, error => error);
    await shown.promise;
    await f.server.close();
    expect(signal?.aborted).toBe(true);
    expect(f.active.statuses[0]).toMatchObject({ status: 'failed', code: 'connection-closed' });
    expect(await pending).toBeInstanceOf(Error);
    await expect(f.server.callTool({ name: 'choose', arguments: {} }, context('two'))).rejects.toThrow();
  } finally { await f.close(); }
});

test('queued cancellation sends zero call and active cancellation retires connection and pending form', async () => {
  const shown = Promise.withResolvers<void>();
  const responses = Promise.withResolvers<ToolElicitationResult>();
  let presentations = 0, formSignal: AbortSignal | undefined;
  const f = await fixture(async (_request, signal) => { presentations++; formSignal = signal; shown.resolve(); return responses.promise; });
  try {
    const firstAbort = new AbortController(), queuedAbort = new AbortController();
    const first = f.server.callTool({ name: 'choose', arguments: {} }, context('first', firstAbort.signal));
    const failedFirst = first.then(() => undefined, error => error);
    await shown.promise;
    const second = f.server.callTool({ name: 'choose', arguments: {} }, context('second', queuedAbort.signal));
    const failedSecond = second.then(() => undefined, error => error);
    queuedAbort.abort();
    const queuedResult = await Promise.race([failedSecond, new Promise(resolve => setTimeout(() => resolve('still queued'), 100))]);
    firstAbort.abort();
    expect(queuedResult).toBeInstanceOf(Error);
    expect(await failedFirst).toBeInstanceOf(Error);
    expect(await failedSecond).toBeInstanceOf(Error);
    expect(formSignal?.aborted).toBe(true);
    responses.resolve({ action: 'accept', content: { paper: 'lined' } });
    await expect(f.server.callTool({ name: 'choose', arguments: {} }, context('third'))).rejects.toThrow();
    expect(presentations).toBe(1);
  } finally { await f.close(); }
});

test('explicit elicitation opt-out overlaps requests without presenting or advertising forms', async () => {
  let presentations = 0;
  const f = await fixture(async () => { presentations++; return { action: 'cancel' }; }, ['stationery']);
  try {
    const capabilities = await Bun.file(join(f.root, 'data/one/capabilities.json')).json();
    expect(capabilities.elicitation).toBeUndefined();
    const results = await Promise.all([
      f.server.callTool({ name: 'choose', arguments: { parallel: true, id: 'first', delay: 80 } }, context('first')),
      f.server.callTool({ name: 'choose', arguments: { parallel: true, id: 'second', delay: 20 } }, context('second')),
    ]);
    expect(results.map(result => JSON.parse(result.content[0]!.type === 'text' ? result.content[0]!.text : '').active)).toEqual([1, 2]);
    const unsolicited = await f.server.callTool({ name: 'choose', arguments: {} }, context('form'));
    expect(unsolicited.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Method not found') });
    expect(presentations).toBe(0);
  } finally { await f.close(); }
});

test('invalid elicitation opt-out names fail before any selected server executes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-invalid-opt-out-'));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'stationery' }));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: { stationery: { type: 'stdio', command: 'bun', args: ['./server.mjs'] } } }));
  await writeFile(join(root, 'server.mjs'), script);
  try {
    await expect(activatePackage(await inspectPackage(root), { dataRoot: join(root, 'data'), installationId: 'one', selectedServers: ['stationery'], elicitationDisabledServers: ['missing'] })).rejects.toThrow();
    await expect(activatePackage(await inspectPackage(root), { dataRoot: join(root, 'data'), installationId: 'one', selectedServers: ['stationery'], elicitationDisabledServers: [42] as unknown as readonly string[] })).rejects.toThrow();
    expect(await Bun.file(join(root, 'data/one/capabilities.json')).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('parallel cancellation never duplicates tool work', async () => {
  const f = await fixture(undefined, ['stationery']);
  try {
    const abort = new AbortController();
    const pending = f.server.callTool({ name: 'choose', arguments: { parallel: true, id: 'cancelled', delay: 200 } }, context('cancelled', abort.signal)).catch(error => error);
    await new Promise(resolve => setTimeout(resolve, 30));
    abort.abort();
    expect(await pending).toBeInstanceOf(Error);
    await new Promise(resolve => setTimeout(resolve, 40));
    const lines = (await Bun.file(join(f.root, 'data/one/calls.jsonl')).text()).trim().split('\n').map(line => JSON.parse(line));
    expect(lines.filter(line => line.event === 'start' && line.id === 'cancelled')).toHaveLength(1);
    await expect(f.server.callTool({ name: 'choose', arguments: { parallel: true, id: 'after' } }, context('after'))).rejects.toThrow();
  } finally { await f.close(); }
});

test('parallel requests retain distinct telemetry parents and propagate their own request spans', async () => {
  const spans = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] });
  provider.register();
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    f = await fixture(undefined, ['stationery']);
    const server = f.server;
    const parentIds = new Map<string, string>();
    const invoke = (id: string, delay: number) => trace.getTracer('test').startActiveSpan(`parent-${id}`, async parent => {
      parentIds.set(id, parent.spanContext().spanId);
      try { return await server.callTool({ name: 'choose', arguments: { parallel: true, id, delay } }, context(id)); }
      finally { parent.end(); }
    });
    const results = await Promise.all([invoke('first', 80), invoke('second', 20)]);
    await provider.forceFlush();
    const requestSpans = spans.getFinishedSpans().filter(span => span.name === 'mcp.request' && span.attributes['rpc.method'] === 'tools/call');
    expect(requestSpans).toHaveLength(2);
    const payloads = results.map(result => JSON.parse(result.content[0]!.type === 'text' ? result.content[0]!.text : '') as { id: string; traceparent: string });
    expect(payloads.map(payload => payload.id)).toEqual(['first', 'second']);
    const requestBySpanId = new Map(requestSpans.map(span => [span.spanContext().spanId, span]));
    for (const payload of payloads) {
      expect(typeof payload.traceparent).toBe('string');
      const [, traceId, spanId] = payload.traceparent.split('-');
      const requestSpan = requestBySpanId.get(spanId!);
      expect(requestSpan?.spanContext().traceId).toBe(traceId);
      expect(requestSpan?.parentSpanContext?.spanId).toBe(parentIds.get(payload.id));
    }
    expect(new Set(requestSpans.map(span => span.parentSpanContext?.spanId)).size).toBe(2);
    const exportedData = JSON.stringify(requestSpans.map(span => ({ name: span.name, attributes: span.attributes, events: span.events })));
    expect(exportedData).not.toContain('first');
    expect(exportedData).not.toContain('second');
  } finally {
    try { await f?.close(); }
    finally {
      try { await provider.shutdown(); }
      finally { trace.disable(); otelContext.disable(); propagation.disable(); }
    }
  }
});

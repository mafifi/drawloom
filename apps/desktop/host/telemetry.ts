import type { RpcTransport } from '@drawloom/host';
import type { ToolGateway, ToolBinding } from '@drawloom/tools';
import type { AgentSessionSignal } from '@drawloom/agent';
import type { ToolDefinition } from '@drawloom/tools';
import { trace, metrics, SpanStatusCode, SpanKind, context, propagation, ROOT_CONTEXT, type Span, type Context } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
const outcomes = new WeakMap<Span, 'ok' | 'error' | 'denied' | 'cancelled' | 'unknown' | 'timeout'>();
export function observeOutcome(outcome: 'ok' | 'error' | 'denied' | 'cancelled' | 'unknown' | 'timeout') {
  const span = trace.getActiveSpan(); if (span) { outcomes.set(span, outcome); span.setAttribute('drawloom.outcome', outcome); }
}
export function observeCache(hit: boolean, count?: number) {
  const span = trace.getActiveSpan(); span?.setAttribute('drawloom.cache.hit', hit);
  if (count !== undefined) span?.setAttribute('drawloom.record.count', count);
}

/** Internal instrumentation convenience, not a plugin or capability contract. */
export async function observed<T>(name: string, attributes: Record<string, string | number | boolean>, run: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer('drawloom.desktop', '0.0.0');
  return tracer.startActiveSpan(name, { attributes }, async span => {
    const start = performance.now(); let outcome = 'ok';
    try { return await run(); }
    catch (error) { outcome = 'error'; span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally {
      outcome = outcomes.get(span) ?? outcome;
      // Never copy arguments, return values or raw exception messages.
      span.setAttribute('drawloom.outcome', outcome);
      const failed = outcome === 'error' || outcome === 'timeout';
      if (failed) span.setStatus({ code: SpanStatusCode.ERROR });
      logs.getLogger('drawloom.desktop').emit({ eventName: failed ? 'operation.failed' : 'operation.completed', severityNumber: failed ? SeverityNumber.ERROR : SeverityNumber.INFO, attributes: { 'drawloom.outcome': outcome } });
      const meter = metrics.getMeter('drawloom.desktop');
      meter.createHistogram('operation.duration', { unit: 'ms' }).record(performance.now() - start, { 'drawloom.operation.name': name, 'drawloom.outcome': outcome });
      meter.createCounter('operation.count').add(1, { 'drawloom.operation.name': name, 'drawloom.outcome': outcome });
      span.end();
    }
  });
}
const rpcMethods = new Set(['initialize', 'thread/start', 'thread/resume', 'thread/read', 'thread/turns/list', 'turn/start', 'turn/steer', 'turn/interrupt', 'skills/list', 'app/list', 'mcpServerStatus/list', 'plugin/list', 'mcpServer/resource/read', 'mcpServer/oauth/login']);
export function observedRpc(rpc: RpcTransport): RpcTransport {
  return { ...rpc, request: (method, params) => observed('agent.request', { 'rpc.method': rpcMethods.has(method) ? method : 'other' }, () => rpc.request(method, params)) };
}
export function observedTools(tools: readonly ToolDefinition[]): ToolDefinition[] {
  return tools.map(tool => ({ ...tool, execute: (input, execution) => observed('tool.execute', { 'drawloom.invocation.id': execution.invocationId, 'drawloom.operation.id': execution.operationId }, async () => tool.execute(input, execution)) }));
}
export function observedToolGateway(gateway: ToolGateway, operations?: ReturnType<typeof createOperationTelemetry>): ToolGateway {
  const owners = new Map<ToolBinding, string>();
  return { ...gateway,
    bind(operationId) { const binding = gateway.bind(operationId); owners.set(binding, operationId); return binding; },
    revoke(binding) { owners.delete(binding); gateway.revoke(binding); },
    invoke: (binding, name, args, signal) => {
      const run = () => trace.getTracer('drawloom.desktop').startActiveSpan('tool.invoke', async span => {
    try {
      const result = await gateway.invoke(binding, name, args, signal);
      span.setAttribute('drawloom.invocation.id', result.invocationId);
      const outcome = result.outcome;
      span.setAttribute('drawloom.outcome', outcome.status === 'ok' ? 'ok' : outcome.code === 'denied' ? 'denied' : outcome.code === 'cancelled' ? 'cancelled' : outcome.execution === 'unknown' ? 'unknown' : 'error');
      if (outcome.status !== 'ok' && outcome.code !== 'denied' && outcome.code !== 'cancelled' && outcome.execution !== 'unknown') span.setStatus({ code: SpanStatusCode.ERROR });
      return result;
    } catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
      });
      return operations ? operations.run(owners.get(binding) ?? '', run) : run();
    } };
}

/** Per-turn observation only. No transcript, retry authority or durable workflow state. */
export function createOperationTelemetry() {
  const running = new Map<string, { span: Span; context: Context }>();
  const approvals = new Map<string, { span: Span; operationId: string }>();
  const end = (id: string, outcome: 'ok' | 'error' | 'unknown' | 'cancelled') => {
    for (const [key, value] of approvals) if (value.operationId === id) { value.span.setAttribute('drawloom.outcome', 'unknown'); value.span.end(); approvals.delete(key); }
    const value = running.get(id); if (!value) return;
    value.span.setAttribute('drawloom.outcome', outcome);
    if (outcome === 'error') value.span.setStatus({ code: SpanStatusCode.ERROR });
    value.span.end(); running.delete(id);
  };
  return {
    begin(id: string) {
      if (running.has(id)) return;
      const span = trace.getTracer('drawloom.desktop').startSpan('agent.operation', { attributes: { 'drawloom.operation.id': id } });
      running.set(id, { span, context: trace.setSpan(context.active(), span) });
    },
    run<T>(id: string, fn: () => T): T { return context.with(running.get(id)?.context ?? context.active(), fn); },
    end,
    signal(signal: AgentSessionSignal) {
      if (signal.kind === 'approval.requested') {
        const owner = running.get(signal.request.operationId);
        if (!owner || approvals.has(signal.request.approvalId)) return;
        const span = trace.getTracer('drawloom.desktop').startSpan('agent.approval.wait', {}, owner.context);
        approvals.set(signal.request.approvalId, { span, operationId: signal.request.operationId });
      } else if (signal.kind === 'approval.resolved') {
        // Native choice identifiers are private: do not infer acceptance from their spelling.
        const pending = approvals.get(signal.approvalId); pending?.span.end(); approvals.delete(signal.approvalId);
      } else if (signal.kind === 'operation.completed') end(signal.operationId, 'ok');
      else if (signal.kind === 'operation.failed') end(signal.operationId, 'error');
      else if (signal.kind === 'operation.interrupted') end(signal.operationId, 'cancelled');
    },
    close() { for (const id of running.keys()) end(id, 'unknown'); },
  };
}
const methods: Record<string, string> = {
  command: 'host.command', discover: 'host.discovery',
  // Polling generated noise in the viewer. Observe explicit pages, not every cursor check.
  historyPage: 'host.history.page',
  readResource: 'host.resource.read', readDiscoveredResource: 'host.resource.read',
  openListedResource: 'host.resource.read', resourcePage: 'host.resource.read',
  // viewSession is synchronous; its authenticated HTTP request is observed without changing that contract.
  viewRequest: 'mcp.request', viewInteraction: 'host.command',
  inspectPackage: 'host.package.inspect', packageAction: 'host.package.activate',
};
/** Explicit finite boundary map; no introspection of arguments or controller data. */
export function instrumentApplication<T extends object>(app: T): T {
  return new Proxy(app, { get(target, key, receiver) {
    const value: unknown = Reflect.get(target, key, receiver);
    if (typeof value !== 'function') return value;
    const name = typeof key === 'string' ? methods[key] : undefined;
    return name ? (...args: unknown[]) => observed(name, {}, async () => Reflect.apply(value, target, args)) : value.bind(target);
  } });
}
export function observedAssets<T extends { read(key: string): Promise<Uint8Array> }>(assets: T): T {
  return { ...assets, read: (key: string) => observed('host.asset.read', {}, () => assets.read(key)) };
}
const routes = new Set(['/api/command', '/api/discovery', '/api/discovery/authenticate', '/api/discovery/resource/read', '/api/resource/read', '/api/resources', '/api/resource/open', '/api/history', '/api/view-session', '/api/view-request', '/api/view-interaction', '/api/import', '/api/packages', '/api/packages/oauth']);
/** Called only after channel authentication. URLs, query strings and baggage are never captured. */
export async function observedHttp(request: Request, run: () => Promise<Response>): Promise<Response> {
  const path = new URL(request.url).pathname;
  const route = routes.has(path) ? path : path.startsWith('/api/assets/') ? '/api/assets/:id' : undefined;
  if (!route) return run();
  const parent = propagation.extract(ROOT_CONTEXT, { traceparent: request.headers.get('traceparent') ?? '' });
  return context.with(parent, () => trace.getTracer('drawloom.desktop').startActiveSpan('http.request', { kind: SpanKind.SERVER, attributes: { 'http.route': route, 'http.request.method': request.method } }, async span => {
    try {
      const response = await run();
      span.setAttribute('http.response.status_code', response.status);
      if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
      return response;
    } catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
  }));
}

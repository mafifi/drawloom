import { PackageServerConfigSchema, type PackageInventory, type PackageServer, type PackageRemoteConfig } from '@drawloom/plugins';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { Transport, FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ElicitRequestSchema, ElicitRequestFormParamsSchema, ElicitResultSchema, CallToolResultSchema, ErrorCode, McpError, type CallToolRequest, type CallToolResult, type ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { ToolElicitationRequestSchema, type ToolContext, type ToolElicitationHandler } from '@drawloom/tools';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { mkdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { containedPath } from './inspection.js';
import { context as otelContext, trace, propagation, SpanKind, SpanStatusCode, type Context } from '@opentelemetry/api';
const telemetryMethods = new Set(['initialize', 'tools/list', 'tools/call', 'resources/list', 'resources/read', 'prompts/list', 'prompts/get', 'ping']);

export interface ActivatePackageOptions {
  dataRoot: string;
  installationId: string;
  selectedServers: readonly string[];
  /** Selected non-SSE servers that must not advertise or present interactive forms. */
  elicitationDisabledServers?: readonly string[];
  handshakeTimeoutMs?: number;
  clientCapabilities?: ClientCapabilities;
  elicitation?: ToolElicitationHandler;
  authProviderFor?: (server: PackageServer & { config: PackageRemoteConfig }) => OAuthClientProvider | undefined;
  /** Host-owned network policy for MCP and OAuth; receives headers already scoped to their origin. */
  fetch?: FetchLike;
}
export interface ActivePackageServer {
  client: Client;
  callTool(params: CallToolRequest['params'], context: ToolContext): Promise<CallToolResult>;
  close(): Promise<void>;
}
export interface PackageServerStatus { name: string; status: 'connected' | 'failed' | 'auth-required'; code?: string }
export interface ActivePackage {
  servers: Map<string, ActivePackageServer>;
  statuses: PackageServerStatus[];
  close(): Promise<void>;
}

/** Adds package headers only at the configured origin, below generated SDK headers. */
export function packageFetch(config: PackageRemoteConfig, hostFetch: FetchLike = fetch, signal?: AbortSignal): FetchLike {
  const origin = new URL(config.url).origin;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (url.origin === origin) {
      for (const [key, value] of Object.entries(config.headers ?? {})) if (!headers.has(key)) headers.set(key, value);
    }
    const signals = [signal, init?.signal].filter((value): value is AbortSignal => value !== undefined && value !== null);
    const response = await hostFetch(input, { ...init, headers, redirect: 'manual', ...(signals.length ? { signal: AbortSignal.any(signals) } : {}) });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      // Never resend an effectful request to a redirect target, even on the same origin.
      throw Error('MCP/OAuth redirect requires host resolution');
    }
    if ((response.status === 401 || response.status === 403) && typeof init?.body === 'string') {
      let message: unknown;
      try { message = JSON.parse(init.body); } catch { /* Other OAuth request bodies are not MCP. */ }
      const calls = Array.isArray(message) ? message : [message];
      if (calls.some(call => call && typeof call === 'object' && 'method' in call && call.method === 'tools/call')) {
        await response.body?.cancel();
        // SDK auth can replay requests; an uncertain tool effect must be decided by the caller.
        throw new UnauthorizedError('Tool authentication requires explicit reconnect; call was not retried');
      }
    }
    return response;
  };
}
export async function activatePackage(inventory: PackageInventory, options: ActivatePackageOptions): Promise<ActivePackage> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(options.installationId)) throw Error('Invalid installation identity');
  const timeout = options.handshakeTimeoutMs ?? 10_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60_000) throw Error('Handshake timeout must be between 1 and 60000ms');
  const disabledNames = options.elicitationDisabledServers ?? [];
  if (!Array.isArray(disabledNames) || disabledNames.length > 100 || new Set(disabledNames).size !== disabledNames.length || disabledNames.some(name => typeof name !== 'string' || name.length < 1 || name.length > 100))
    throw Error('Elicitation-disabled servers must be at most 100 distinct bounded names');
  const selectedNames = new Set(options.selectedServers);
  for (const name of disabledNames) {
    const selected = inventory.servers.find(server => server.name === name);
    if (!selectedNames.has(name) || !selected) throw Error('Elicitation-disabled server must be selected and prepared');
    const config = PackageServerConfigSchema.parse(selected.config);
    if (config.type === 'sse') throw Error('Elicitation-disabled server must use a supported transport');
  }
  const elicitationDisabled = new Set(disabledNames);
  const servers = new Map<string, ActivePackageServer>(), statuses: PackageServerStatus[] = [];
  await Promise.all([...new Set(options.selectedServers)].map(async name => {
    const allowsElicitation = Boolean(options.elicitation) && !elicitationDisabled.has(name);
    const { elicitation: _unsupportedCapability, ...capabilities } = options.clientCapabilities ?? {};
    const client = new Client({ name: 'drawloom-plugin-packages', version: '0.0.0' },
      { capabilities: { ...capabilities, ...(allowsElicitation ? { elicitation: { form: {} } } : {}) } });
    let transport: Transport | undefined;
    const abort = new AbortController();
    const contextStore = new AsyncLocalStorage<ToolContext>();
    let current: { context?: ToolContext; signal: AbortSignal; traceContext: Context } | undefined;
    let queue: Promise<unknown> = Promise.resolve();
    const request = client.request.bind(client);
    // Standard stdio has no parent request identity. Serialize every request on
    // this connection, including MCP App calls and resource reads without context.
    client.request = async (...args) => {
      const context = contextStore.getStore();
      const parent = otelContext.active();
      let started = false;
      const execute = () => otelContext.with(parent, () => trace.getTracer('drawloom.mcp').startActiveSpan('mcp.request', { kind: SpanKind.CLIENT, attributes: { 'drawloom.plugin.id': options.installationId, 'rpc.method': telemetryMethods.has(args[0].method) ? args[0].method : 'other' } }, async span => {
        const lifetime = new AbortController();
        const signal = AbortSignal.any([abort.signal, ...(args[2]?.signal ? [args[2].signal] : [])]);
        if (signal.aborted) { span.setAttribute('drawloom.outcome', 'cancelled'); span.end(); signal.throwIfAborted(); }
        started = true;
        if (allowsElicitation) current = { ...(context ? { context } : {}), signal: AbortSignal.any([signal, lifetime.signal]), traceContext: otelContext.active() };
        const retire = () => { abort.abort(); void client.close().catch(() => {}); };
        signal.addEventListener('abort', retire, { once: true });
        try {
          const carrier: Record<string, string> = {};
          propagation.inject(otelContext.active(), carrier);
          // SEP-414 standard metadata; never change tool arguments or forward baggage.
          const message = carrier.traceparent ? { ...args[0], params: { ...args[0].params, _meta: { ...args[0].params?._meta, traceparent: carrier.traceparent } } } : args[0];
          return await request(message, args[1], { ...args[2], signal });
        }
        catch (error) {
          // A timeout/disconnect/rejected request can leave a server working.
          // Retire instead of letting late requests inherit another invocation.
          span.setStatus({ code: SpanStatusCode.ERROR }); retire(); throw error;
        } finally {
          signal.removeEventListener('abort', retire);
          if (allowsElicitation) current = undefined;
          lifetime.abort();
          span.end();
        }
      }));
      const run = elicitationDisabled.has(name) ? execute() : queue.then(execute);
      if (!elicitationDisabled.has(name)) queue = run.catch(() => {});
      const queuedSignal = args[2]?.signal;
      if (!queuedSignal) return run;
      let cancel: (() => void) | undefined;
      try {
        return await Promise.race([run, new Promise<never>((_, reject) => {
          cancel = () => { if (!started) reject(queuedSignal.reason); };
          if (queuedSignal.aborted) cancel(); else queuedSignal.addEventListener('abort', cancel, { once: true });
        })]);
      } finally { if (cancel) queuedSignal.removeEventListener('abort', cancel); }
    };
    client.onclose = () => {
      abort.abort();
      const status = statuses.find(status => status.name === name);
      if (status?.status === 'connected') { status.status = 'failed'; status.code = 'connection-closed'; }
    };
    if (allowsElicitation) client.setRequestHandler(ElicitRequestSchema, async (request, extra) => {
      const params = ElicitRequestFormParamsSchema.parse(request.params);
      if (params.task || params._meta?.['io.modelcontextprotocol/related-task'])
        throw new McpError(ErrorCode.InvalidRequest, 'Task elicitation is unsupported');
      const owner = current;
      if (!owner?.context || owner.signal.aborted) throw new McpError(ErrorCode.InvalidRequest, 'No bound tool invocation for elicitation');
      const invocation = owner.context;
      return otelContext.with(owner.traceContext, () => trace.getTracer('drawloom.mcp').startActiveSpan('mcp.elicitation.wait', async span => {
      const signal = AbortSignal.any([owner.signal, extra.signal]);
      const envelope = ToolElicitationRequestSchema.parse({ requestId: crypto.randomUUID(), source: `package:${options.installationId}:${name}`,
        invocationId: invocation.invocationId, operationId: invocation.operationId, params });
      let cancel: (() => void) | undefined;
      try {
        const result = ElicitResultSchema.parse(await Promise.race([
          options.elicitation!(envelope, signal),
          new Promise<{ action: 'cancel' }>(resolve => { cancel = () => resolve({ action: 'cancel' }); if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true }); }),
        ]));
        if (signal.aborted) { span.setAttribute('drawloom.outcome', 'cancelled'); return { action: 'cancel' }; }
        const schema = z.record(z.string(), z.json()).parse(params.requestedSchema);
        if (result.action === 'accept' && (!result.content || !new AjvJsonSchemaValidator().getValidator({ ...schema, type: 'object' })(result.content).valid))
          throw new McpError(ErrorCode.InvalidParams, 'Invalid elicitation response content');
        span.setAttribute('drawloom.outcome', result.action === 'accept' ? 'ok' : result.action === 'decline' ? 'denied' : 'cancelled');
        return result.action === 'accept' ? result : { action: result.action };
      } catch (error) { span.setAttribute('drawloom.outcome', 'error'); span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
      finally { if (cancel) signal.removeEventListener('abort', cancel); span.end(); }
      }));
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const selected = inventory.servers.find(server => server.name === name);
      if (!selected) throw Error('Unknown selected server');
      const config = PackageServerConfigSchema.parse(selected.config);
      if (config.type === 'sse') throw Error('Unsupported legacy transport');
      if (config.type === 'stdio') {
        const root = await realpath(inventory.root);
        await mkdir(options.dataRoot, { recursive: true, mode: 0o700 });
        const base = await realpath(options.dataRoot);
        await mkdir(join(base, options.installationId), { recursive: true, mode: 0o700 });
        const data = await containedPath(base, options.installationId);
        const expand = (value: string) => value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (_, key: string) => key === 'ROOT' ? root : data);
        const cwdSpec = config.cwd ?? '${PLUGIN_ROOT}';
        const cwd = await containedPath(cwdSpec.startsWith('${PLUGIN_DATA}') ? data : root, expand(cwdSpec));
        if (!(await stat(cwd)).isDirectory()) throw Error('Expected working directory');
        const command = config.command.startsWith('./') ? await containedPath(root, config.command) : config.command;
        const stdio = new StdioClientTransport({ command, args: (config.args ?? []).map(expand), cwd,
          env: { ...getDefaultEnvironment(), ...Object.fromEntries(Object.entries(config.env ?? {}).map(([key, value]) => [key, expand(value)])), PLUGIN_ROOT: root, PLUGIN_DATA: data }, stderr: 'pipe',
        });
        stdio.stderr?.on('data', () => {});
        transport = stdio;
      } else {
        const authProvider = options.authProviderFor?.({ name, config });
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          ...(authProvider ? { authProvider } : {}), fetch: packageFetch(config, options.fetch, abort.signal),
          reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
        });
      }
      // The SDK may start closing on handshake rejection before our catch runs.
      // Share that close promise so activation waits for subprocess cleanup.
      const closeTransport = transport.close.bind(transport);
      let closing: Promise<void> | undefined;
      transport.close = () => closing ??= closeTransport();
      await Promise.race([
        client.connect(transport, { timeout, signal: abort.signal }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(Error('Handshake timeout')); }, timeout); }),
      ]);
      let serverClosing: Promise<void> | undefined;
      servers.set(name, { client,
        // Form-capable calls include a bounded five-minute human interaction
        // window in their total deadline; outer callers may cancel sooner.
        callTool: (params, context) => contextStore.run(context, async () => CallToolResultSchema.parse(await client.callTool(params, undefined, { signal: context.signal, timeout: options.elicitation ? 300_000 : 60_000 }))),
        close() {
        return serverClosing ??= (async () => { abort.abort(); await client.close(); })();
      } });
      statuses.push({ name, status: 'connected' });
    } catch (error) {
      abort.abort();
      await client.close().catch(() => {});
      await transport?.close().catch(() => {});
      const authRequired = error instanceof UnauthorizedError || error instanceof StreamableHTTPError && (error.code === 401 || error.code === 403);
      statuses.push({ name, status: authRequired ? 'auth-required' : 'failed', code: authRequired ? 'authentication-required' : 'connection-failed' });
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }));
  statuses.sort((a, b) => options.selectedServers.indexOf(a.name) - options.selectedServers.indexOf(b.name));
  return { servers, statuses, async close() { await Promise.allSettled([...servers.values()].map(server => server.close())); } };
}

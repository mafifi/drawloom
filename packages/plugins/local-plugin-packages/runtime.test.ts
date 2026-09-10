import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA } from '@drawloom/plugins';
import { inspectPackage } from './src/index.ts';
import { activatePackage, packageFetch } from './src/runtime.ts';

async function localFixture(servers: object) {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-runtime-test-'));
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'runtime-test' }));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: servers }));
  return { root, async dispose() { await rm(root, { recursive: true, force: true }); } };
}
const serverScript = `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const log = join(process.env.PLUGIN_DATA, 'launch.json');
let count = 0; try { count = JSON.parse(readFileSync(log, 'utf8')).count; } catch {}
writeFileSync(log, JSON.stringify({ count: count + 1, root: process.env.PLUGIN_ROOT, data: process.env.PLUGIN_DATA, secret: process.env.DRAWLOOM_TEST_SECRET, custom: process.env.CUSTOM, args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid }));
let buffer = ''; process.stdin.on('data', chunk => { buffer += chunk; let newline; while ((newline = buffer.indexOf('\\n')) >= 0) {
 const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
 if (message.method === 'tools/call') writeFileSync(join(process.env.PLUGIN_DATA, 'invoked'), 'yes');
 if (message.id !== undefined) { const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } } : { tools: [{ name: 'original.name', inputSchema: { type: 'object' } }] }; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n'); }
}}); process.stdin.on('end', () => process.exit(0));
`;
test('explicit stdio activation preserves data, opaque arguments, wire names and isolated failure', async () => {
  const local = await localFixture({ good: { type: 'stdio', command: 'bun', args: ['./server.mjs', '${PLUGIN_ROOT}/../literal', '${PLUGIN_DATA}'], env: { CUSTOM: '${PLUGIN_ROOT}:${PLUGIN_DATA}:${UNKNOWN}' } }, broken: { type: 'stdio', command: 'does-not-exist-drawloom-test' }, unselected: { type: 'stdio', command: 'bun', args: ['./server.mjs'] } });
  process.env.DRAWLOOM_TEST_SECRET = 'never-inherit';
  try {
    await writeFile(join(local.root, 'server.mjs'), serverScript);
    const inventory = await inspectPackage(local.root), dataRoot = join(local.root, 'data');
    expect(await Bun.file(join(dataRoot, 'first/launch.json')).exists()).toBe(false);
    for (const count of [1, 2]) {
      const active = await activatePackage(inventory, { dataRoot, installationId: 'first', selectedServers: ['good', 'broken'] });
      try {
        expect(active.statuses.map(s => [s.name, s.status])).toEqual([['good', 'connected'], ['broken', 'failed']]);
        const launch = JSON.parse(await readFile(join(dataRoot, 'first/launch.json'), 'utf8'));
        expect(launch.count).toBe(count);
        expect(launch.secret).toBeUndefined();
        expect(launch.args).toEqual([inventory.root + '/../literal', join(inventory.root, 'data/first')]);
        expect(launch.cwd).toBe(inventory.root);
        expect(launch.custom).toBe(inventory.root + ':' + join(inventory.root, 'data/first') + ':${UNKNOWN}');
        expect(await Bun.file(join(dataRoot, 'first/invoked')).exists()).toBe(false);
        expect((await active.servers.get('good')!.client.listTools()).tools[0]?.name).toBe('original.name');
      } finally { await active.close(); }
    }
  } finally { delete process.env.DRAWLOOM_TEST_SECRET; await local.dispose(); }
});
test('handshake timeout closes hung subprocess', async () => {
  const local = await localFixture({ hung: { type: 'stdio', command: 'bun', args: ['./hung.mjs'] } });
  try {
    await writeFile(join(local.root, 'hung.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.PLUGIN_DATA + '/pid', String(process.pid)); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));`);
    const active = await activatePackage(await inspectPackage(local.root), { dataRoot: join(local.root, 'data'), installationId: 'one', selectedServers: ['hung'], handshakeTimeoutMs: 200 });
    expect(active.statuses[0]?.status).toBe('failed');
    const pid = Number(await readFile(join(local.root, 'data/one/pid'), 'utf8'));
    expect(() => process.kill(pid, 0)).toThrow();
    await active.close();
  } finally { await local.dispose(); }
});
test('HTTP handshake performs no tool invocation and never forwards redirect credentials', async () => {
  const methods: string[] = [], seen: string[] = [];
  const target = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch() { seen.push('leaked'); return new Response('unexpected'); } });
  const http = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/redirect') return new Response(null, { status: 307, headers: { location: target.url.href } });
    if (url.pathname === '/auth') return new Response('Authentication required', { status: 401 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    expect(request.headers.get('x-package')).toBe('visible-value');
    const message = await request.json() as { method: string; id?: number };
    methods.push(message.method);
    if (message.id === undefined) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'http-test', version: '1' } } });
  } });
  const local = await localFixture({ remote: { type: 'streamable-http', url: http.url.href, headers: { 'X-Package': 'visible-value' } }, redirect: { type: 'streamable-http', url: new URL('/redirect', http.url).href, headers: { Authorization: 'do-not-forward' } }, auth: { type: 'streamable-http', url: new URL('/auth', http.url).href } });
  try {
    const active = await activatePackage(await inspectPackage(local.root), { dataRoot: join(local.root, 'data'), installationId: 'one', selectedServers: ['remote', 'redirect', 'auth'] });
    try {
      expect(active.statuses.map(s => s.status)).toEqual(['connected', 'failed', 'auth-required']);
      expect(methods).toEqual(['initialize', 'notifications/initialized']);
      expect(seen).toEqual([]);
    } finally { await active.close(); }
  } finally { http.stop(true); target.stop(true); await local.dispose(); }
});
test('package HTTP headers never override generated authentication or reach an OAuth origin', async () => {
  const received: Array<string | null> = [];
  const oauth = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) { received.push(request.headers.get('x-package')); return new Response('ok'); } });
  const endpoint = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) { received.push(request.headers.get('authorization')); return new Response('ok'); } });
  try {
    const scopedFetch = packageFetch({ type: 'streamable-http', url: endpoint.url.href, headers: { Authorization: 'package-value', 'X-Package': 'visible' } });
    await scopedFetch(endpoint.url, { headers: { Authorization: 'Bearer client-token' } });
    await scopedFetch(oauth.url);
    expect(received).toEqual(['Bearer client-token', null]);
  } finally { oauth.stop(true); endpoint.stop(true); }
});
test('failed authenticated tool calls are not retried by SDK auth flow', async () => {
  let calls = 0, tokens = 0;
  const http = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = await request.json() as { method: string; id?: number };
    if (message.method === 'tools/call') { calls++; return new Response('expired', { status: 401 }); }
    if (message.id === undefined) return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } } });
  } });
  const local = await localFixture({ remote: { type: 'streamable-http', url: http.url.href } });
  try {
    const active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, 'data'), installationId: 'one', selectedServers: ['remote'], authProviderFor: () => ({
        get redirectUrl() { return undefined; }, get clientMetadata() { return { redirect_uris: [] }; },
        clientInformation() { return { client_id: 'synthetic' }; },
        tokens() { tokens++; return { access_token: 'synthetic', token_type: 'Bearer' }; },
        saveTokens() {}, redirectToAuthorization() { throw Error('Unexpected authorization'); }, saveCodeVerifier() {}, codeVerifier() { return 'synthetic'; },
      }),
    });
    try {
      expect(active.statuses[0]?.status).toBe('connected');
      await expect(active.servers.get('remote')!.client.callTool({ name: 'original.name', arguments: {} })).rejects.toThrow();
      expect(calls).toBe(1);
      expect(tokens).toBeGreaterThan(0);
    } finally { await active.close(); }
  } finally { http.stop(true); await local.dispose(); }
});
test('data-root cwd escape fails independently and separate installations keep separate data', async () => {
  const local = await localFixture({ good: { type: 'stdio', command: 'bun', args: ['./server.mjs'] }, escape: { type: 'stdio', command: 'bun', cwd: '${PLUGIN_DATA}/escape', args: ['./server.mjs'] } });
  try {
    await writeFile(join(local.root, 'server.mjs'), serverScript);
    await mkdir(join(local.root, 'data/first'), { recursive: true });
    await symlink(local.root, join(local.root, 'data/first/escape'));
    const inventory = await inspectPackage(local.root);
    const first = await activatePackage(inventory, { dataRoot: join(local.root, 'data'), installationId: 'first', selectedServers: ['good', 'escape'] });
    expect(first.statuses.map(s => s.status)).toEqual(['connected', 'failed']);
    await first.close();
    const second = await activatePackage(inventory, { dataRoot: join(local.root, 'data'), installationId: 'second', selectedServers: ['good'] });
    try { expect(JSON.parse(await readFile(join(local.root, 'data/second/launch.json'), 'utf8')).count).toBe(1); }
    finally { await second.close(); }
  } finally { await local.dispose(); }
});
test('overlapping active-server close calls wait for the same delayed subprocess cleanup', async () => {
  const local = await localFixture({ good: { type: 'stdio', command: 'bun', args: ['./server.mjs'] } });
  let active: Awaited<ReturnType<typeof activatePackage>> | undefined;
  try {
    await writeFile(join(local.root, 'server.mjs'), serverScript.replace("process.stdin.on('end', () => process.exit(0));", "process.stdin.on('end', () => setTimeout(() => process.exit(0), 150));"));
    active = await activatePackage(await inspectPackage(local.root), { dataRoot: join(local.root, 'data'), installationId: 'one', selectedServers: ['good'] });
    const pid = JSON.parse(await readFile(join(local.root, 'data/one/launch.json'), 'utf8')).pid;
    const handle = active.servers.get('good')!;
    const first = handle.close(), second = handle.close();
    await second;
    expect(() => process.kill(pid, 0)).toThrow();
    expect(second).toBe(first);
    await first;
  } finally { await active?.close(); await local.dispose(); }
});
test('composition-selected client capabilities are present in MCP initialization', async () => {
  const local = await localFixture({ good: { type: 'stdio', command: 'bun', args: ['./server.mjs'] } });
  let active: Awaited<ReturnType<typeof activatePackage>> | undefined;
  try {
    await writeFile(join(local.root, 'server.mjs'), serverScript.replace("if (message.method === 'tools/call')", "if (message.method === 'initialize') writeFileSync(join(process.env.PLUGIN_DATA, 'capabilities.json'), JSON.stringify(message.params.capabilities)); if (message.method === 'tools/call')"));
    active = await activatePackage(await inspectPackage(local.root), { dataRoot: join(local.root, 'data'), installationId: 'one', selectedServers: ['good'],
      clientCapabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
    });
    const capabilities = JSON.parse(await readFile(join(local.root, 'data/one/capabilities.json'), 'utf8'));
    expect(capabilities.extensions['io.modelcontextprotocol/ui']).toEqual({ mimeTypes: ['text/html;profile=mcp-app'] });
  } finally { await active?.close(); await local.dispose(); }
});

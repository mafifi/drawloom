import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from './plugin-installations.js';
import { loadInstalledPackages } from './plugin-packages.js';
import type { DrawloomPackageExtension } from '@drawloom/plugins';
import type { Installation } from './plugin-installations.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createLocalToolGateway } from '@drawloom/local-tools';
import { createDesktopApplication } from './application.js';
import { createPluginRegistry } from '@drawloom/startup-plugins';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createElicitationPresenter } from './elicitation.js';

function packageServer(label = 'owner', tools: Tool[] = [{ name: 'open', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://owner/view.html' } } }], resource?: { revision: number; text: string }) {
  const events: string[] = [];
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = await request.json() as { method: string; id?: number; params?: { uri?: string; name?: string } };
    events.push(message.method);
    if (message.id === undefined) return new Response(null, { status: 202 });
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: {} }, serverInfo: { name: label, version: '1' } }
      : message.method === 'tools/list' ? { tools }
      : message.method === 'resources/list' ? { resources: resource ? [{ uri: 'doc://reference', name: 'Reference', description: `Revision ${resource.revision}` }] : [{ uri: 'doc://example', name: 'Example', mimeType: 'text/plain' }] }
      : message.method === 'resources/read' ? { contents: [{ uri: message.params!.uri, mimeType: resource ? 'text/plain' : 'text/html;profile=mcp-app', text: resource?.text ?? `<p>${label}</p>` }] }
      : { content: [{ type: 'text', text: `${label}:${message.params?.name}` }] };
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  } });
  return { server, events };
}
async function installedFixture(root: string, name: string, url: string, extension?: DrawloomPackageExtension, ownsView = false) {
  const pkg = join(root, name); await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name,
    ...(extension ? { extensions: { 'io.github.mafifi.drawloom': extension } } : {}) }));
  await writeFile(join(pkg, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { remote: { type: 'streamable-http', url } } }));
  if (extension?.backend) {
    const contribution = ownsView ? { workbenches: [{ id: 'owner', title: 'Owner', description: '', tools: [], skills: [] }],
      views: [{ id: 'owner-view', workbenchId: 'owner', title: 'Owner view', entrypoint: 'ui://owner/view.html' }] } : {};
    await writeFile(join(pkg, 'backend.mjs'), `export default () => ({ contributions: ${JSON.stringify(contribution)}, dispose() {} });`);
  }
  const installation: Installation = { id: crypto.randomUUID(), root: pkg, name, enabled: true, trustedBackend: true, servers: ['remote'], configuration: {} };
  return installation;
}
function packageHost(root: string) {
  return { store: createNodeJsonStore(join(root, 'state')), assets: { read: async () => { throw Error('unused'); }, put: async () => { throw Error('unused'); } } };
}
const ownerPlacement = { id: 'owner', title: 'Owner', openingTool: { server: 'remote', tool: 'open' } };

test('desktop discovery shows friendly standard and app-only tools without executing them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-package-discovery-'));
  const remote = packageServer('documents', [
    { name: 'inspect', title: 'Inspect document', inputSchema: { type: 'object' } },
    { name: 'save', title: 'Save draft', inputSchema: { type: 'object' }, _meta: { ui: { visibility: ['app'] } } },
  ]);
  try {
    const installation = await installedFixture(root, 'documents', remote.server.url.href);
    const store = createNodeJsonStore(join(root, 'state'));
    await store.set('plugin-installations', { version: 1, installations: [installation] });
    const app = await createDesktopApplication(root);
    try {
      const catalogue = await app.discover((await app.snapshot()).selectedId);
      expect(catalogue.entries.find(e => e.name === 'Inspect document')).toMatchObject({ kind: 'tool', availability: 'available' });
      expect(catalogue.entries.find(e => e.name === 'Save draft')).toMatchObject({ kind: 'tool', scope: 'app-only', selectable: false });
      const snapshot = await app.snapshot();
      const grant = snapshot.operator.grants.find(g => g.toolName.startsWith('package_')) ?? snapshot.operator.grants.find(g => g.toolName !== 'text.word_count');
      expect(grant).toBeDefined();
      expect(snapshot.toolLabels).toContainEqual({ toolName: grant!.toolName, title: 'Inspect document', origin: 'documents / remote' });
      expect(remote.events).not.toContain('tools/call');
    } finally { await app.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('backend collision with built-in workbench is isolated without losing standard skills', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reserved-workbench-'));
  const remote = packageServer();
  try {
    const installation = await installedFixture(root, 'collision', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' } });
    await writeFile(join(installation.root, 'backend.mjs'), `export default () => ({ contributions: {workbenches: [{id:'text', title:'Hijack',description:'',tools:[],skills:[]}]},dispose(){}})`);
    await mkdir(join(installation.root, 'skills', 'editing'), { recursive: true });
    await writeFile(join(installation.root, 'skills', 'editing', 'SKILL.md'), '---\nname: editing\ndescription: Edit a document\n---\nCheck clarity.');
    await createNodeJsonStore(join(root, 'state')).set('plugin-installations', { version: 1, installations: [installation] });
    const app = await createDesktopApplication(root);
    try {
      expect(app.packageStatuses()[0]?.codes).toContain('backend:invalid-contribution');
      const catalogue = await app.discover((await app.snapshot()).selectedId);
      expect(catalogue.entries.some(e => e.kind === 'skill' && e.name === 'editing')).toBe(true);
    } finally { await app.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('installed HTTP package tools present standard elicitation only after independent gateway grant', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-package-forms-'));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
  const mcp = new McpServer({ name: 'stationery', version: '1' });
  let calls = 0, presentations = 0;
  mcp.registerTool('choose', { inputSchema: {} }, async (_args, extra) => {
    calls++;
    const answer = await mcp.server.elicitInput({ mode: 'form', message: 'Choose paper', requestedSchema: { type: 'object', properties: { paper: { type: 'string', enum: ['plain', 'lined'] } }, required: ['paper'] } }, { relatedRequestId: extra.requestId });
    return { content: [{ type: 'text', text: JSON.stringify(answer) }] };
  });
  await mcp.connect(transport);
  const http = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: request => transport.handleRequest(request) });
  try {
    const installation = await installedFixture(root, 'stationery', http.url.href);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root),
      elicitation: async request => { presentations++; expect(request.operationId).toBe('operation'); expect(request.source).toBe(`package:${installation.id}:remote`); return { action: 'accept', content: { paper: 'plain' } }; } });
    try {
      const registry = createPluginRegistry(loaded.installs, ['agent', 'host']);
      const tools = registry.tools;
      let allowed = false;
      const gateway = createLocalToolGateway({ tools, policy: () => allowed, nextInvocationId: () => crypto.randomUUID(), evidence: { record: async () => {} } });
      const binding = gateway.bind('operation'), signal = new AbortController().signal;
      const name = [...loaded.toolIds][0]!;
      expect((await gateway.invoke(binding, name, {}, signal)).outcome).toMatchObject({ status: 'failed', code: 'denied' });
      expect(calls).toBe(0); expect(presentations).toBe(0);
      allowed = true;
      expect((await gateway.invoke(binding, name, {}, signal)).outcome).toMatchObject({ status: 'ok', text: '{"action":"accept","content":{"paper":"plain"}}' });
      expect(calls).toBe(1); expect(presentations).toBe(1);
    } finally { await loaded.close(); }
  } finally { await mcp.close(); http.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('reconnected package cancellation removes its form and exposes the replacement connection retirement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-package-reconnect-form-'));
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  const servers: McpServer[] = [];
  const shown = Promise.withResolvers<void>();
  const presenter = createElicitationPresenter(operation => operation === 'operation' ? 'conversation' : undefined);
  const http = Bun.serve({ port: 0, hostname: '127.0.0.1', async fetch(request) {
    let transport = transports.get(request.headers.get('mcp-session-id') ?? '');
    if (!transport) {
      transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
      const mcp = new McpServer({ name: 'stationery', version: '1' });
      mcp.registerTool('choose', { inputSchema: {} }, async (_args, extra) => {
        const answer = await mcp.server.elicitInput({ mode: 'form', message: 'Choose paper', requestedSchema: { type: 'object', properties: { paper: { type: 'string', enum: ['plain', 'lined'] } }, required: ['paper'] } }, { relatedRequestId: extra.requestId, signal: extra.signal });
        return { content: [{ type: 'text', text: JSON.stringify(answer) }] };
      });
      await mcp.connect(transport); servers.push(mcp);
    }
    const response = await transport.handleRequest(request);
    if (transport.sessionId) transports.set(transport.sessionId, transport);
    return response;
  } });
  try {
    const installation = await installedFixture(root, 'stationery', http.url.href);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root),
      elicitation: (request, signal) => { const result = presenter.request(request, signal); shown.resolve(); return result; } });
    try {
      await loaded.disconnect(installation.id, 'remote');
      expect(await loaded.reconnect(installation.id, 'remote')).toEqual({ restartRequired: false });
      expect(loaded.statuses[0]?.servers[0]?.status).toBe('connected');
      const registry = createPluginRegistry(loaded.installs, ['agent', 'host']);
      const gateway = createLocalToolGateway({ tools: registry.tools, policy: () => true, nextInvocationId: () => 'invocation', evidence: { record: async () => {} } });
      const abort = new AbortController();
      const result = gateway.invoke(gateway.bind('operation'), [...loaded.toolIds][0]!, {}, abort.signal);
      await shown.promise;
      expect(presenter.pending('conversation')).toHaveLength(1);
      abort.abort();
      expect((await result).outcome).toMatchObject({ status: 'failed', code: 'cancelled' });
      expect(presenter.pending('conversation')).toEqual([]);
      // StreamableHTTP close includes its asynchronous session DELETE.
      for (let attempts = 0; attempts < 100 && loaded.statuses[0]?.servers[0]?.status === 'connected'; attempts++) await Bun.sleep(5);
      expect(loaded.statuses[0]?.servers[0]).toMatchObject({ name: 'remote', status: 'failed', code: 'connection-closed' });
    } finally { await loaded.close(); }
  } finally { await Promise.all(servers.map(server => server.close())); http.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('standard resource discovery is cached and source-bound without executing tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-package-resources-'));
  const remote = packageServer();
  try {
    const installation = await installedFixture(root, 'resources', remote.server.url.href);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
    try {
      const first = await loaded.discoverResources();
      expect(first.entries).toHaveLength(1);
      expect((await loaded.discoverResources()).entries).toEqual(first.entries);
      expect(remote.events.filter(e => e === 'resources/list')).toHaveLength(1);
      expect(remote.events).not.toContain('tools/call');
      const entry = first.entries[0]!;
      await expect(loaded.readDiscoveredResource({ id: 'invented', revision: entry.revision })).rejects.toThrow();
      expect(remote.events).not.toContain('resources/read');
      expect((await loaded.readDiscoveredResource(entry)).contents).toHaveLength(1);
      await loaded.disconnect(installation.id, 'remote');
      await expect(loaded.readDiscoveredResource(entry)).rejects.toThrow();
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('standard skills activate without extension; a missing sibling stays isolated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-packages-'));
  try {
    const pkg = join(root, 'reference'); await mkdir(join(pkg, 'skills', 'editing'), { recursive: true });
    await writeFile(join(pkg, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference' }));
    await writeFile(join(pkg, 'skills', 'editing', 'SKILL.md'), '---\nname: editing\ndescription: Review a synthetic document\n---\nCheck clarity.');
    const store = createNodeJsonStore(join(root, 'state'));
    const installations = await createInstallationStore(store);
    const id = await installations.add(pkg);
    await installations.configure(id, { enabled: true, trustedBackend: false, servers: [], configuration: {} });
    const entries = (await createInstallationStore(store)).startup;
    const loaded = await loadInstalledPackages({ root, installations: [...entries, { ...entries[0]!, id: crypto.randomUUID(), root: join(root, 'missing') }],
      host: { store, assets: { read: async () => { throw Error('unused'); }, put: async () => { throw Error('unused'); } } } });
    try {
      expect(loaded.installs).toHaveLength(1);
      const skills = loaded.installs[0]!.plugin.prepare({})().skills;
      expect(skills?.[0]?.instructions).toContain('Check clarity.');
      expect(skills?.[0]?.instructions).toContain(join(pkg, 'skills', 'editing', 'SKILL.md'));
      expect(loaded.statuses.map(s => s.status)).toEqual(['ready', 'failed']);
    } finally { await loaded.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid backend contributions do not poison standard package activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-package-'));
  try {
    await writeFile(join(root, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference',
      extensions: { 'io.github.mafifi.drawloom': { version: 1, backend: { entrypoint: './backend.mjs' }, requires: [{ kind: 'capability', id: 'host' }] } } }));
    await writeFile(join(root, 'backend.mjs'), 'export default async () => ({ contributions: { workbenches: [null] }, dispose: async () => {} });');
    const store = createNodeJsonStore(join(root, 'state'));
    const installed = await createInstallationStore(store); const id = await installed.add(root);
    await installed.configure(id, { enabled: true, trustedBackend: true, servers: [], configuration: {} });
    const loaded = await loadInstalledPackages({ root, installations: (await createInstallationStore(store)).startup,
      host: { store, assets: { read: async () => { throw Error('unused'); }, put: async () => { throw Error('unused'); } } } });
    try {
      expect(loaded.installs).toHaveLength(1);
      expect(loaded.statuses[0]?.codes).toContain('backend:invalid-contribution');
      expect(loaded.statuses[0]?.status).toBe('partial');
    } finally { await loaded.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a placement cannot replace another installation owned view', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-placement-owner-'));
  const owner = packageServer('owner'), other = packageServer('other');
  try {
    const first = await installedFixture(root, 'owner-package', owner.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, workbenches: [ownerPlacement] }, true);
    const second = await installedFixture(root, 'other-package', other.server.url.href, { version: 1, workbenches: [ownerPlacement] });
    const loaded = await loadInstalledPackages({ root, installations: [first, second], host: packageHost(root) });
    try {
      expect(loaded.mcpApps.get('owner')?.html).toBe('<p>owner</p>');
      expect(other.events).not.toContain('resources/read');
      expect(loaded.statuses[1]?.codes).toContain('workbench:owner:view-unavailable');
    } finally { await loaded.close(); }
  } finally { owner.server.stop(true); other.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('opening resource must match the owning registered view', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-placement-resource-'));
  const remote = packageServer('wrong', [{ name: 'open', inputSchema: { type: 'object' }, _meta: { ui: { resourceUri: 'ui://wrong/view.html' } } }]);
  try {
    const installation = await installedFixture(root, 'owner-package', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, workbenches: [ownerPlacement] }, true);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
    try {
      expect(loaded.mcpApps.size).toBe(0);
      expect(remote.events).not.toContain('resources/read');
      expect(loaded.statuses[0]?.codes).toContain('workbench:owner:view-unavailable');
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('duplicate placement declarations are rejected before a view connects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-placement-duplicate-'));
  const remote = packageServer();
  try {
    const installation = await installedFixture(root, 'owner-package', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, workbenches: [ownerPlacement, ownerPlacement] }, true);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
    try {
      expect(loaded.mcpApps.size).toBe(0);
      expect(remote.events).not.toContain('resources/read');
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('unresolved extension requirements gate placements even without a backend, not standard tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-placement-requirements-'));
  const remote = packageServer();
  try {
    for (const backend of [false, true]) {
      const installation = await installedFixture(root, backend ? 'with-backend' : 'without-backend', remote.server.url.href,
        { version: 1, ...(backend ? { backend: { entrypoint: './backend.mjs' } } : {}),
          requires: [{ kind: 'tool', id: 'missing-tool' }], workbenches: [ownerPlacement] }, backend);
      const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
      try {
        expect(loaded.toolIds.size).toBe(1);
        expect(loaded.mcpApps.size).toBe(0);
        expect(loaded.statuses[0]?.codes).toContain('extension:unavailable');
        expect(remote.events).not.toContain('resources/read');
      } finally { await loaded.close(); }
    }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('app-only and unsupported-schema tools cannot satisfy backend dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-tool-requirements-'));
  const remote = packageServer('reference', [
    { name: 'echo', inputSchema: { type: 'object' } },
    { name: 'hidden', inputSchema: { type: 'object' }, _meta: { ui: { visibility: ['app'] } } },
    { name: 'invalid', inputSchema: { type: 'object', properties: { text: { type: 'unsupported' } } } },
  ]);
  try {
    for (const dependency of ['hidden', 'invalid']) {
      const installation = await installedFixture(root, dependency, remote.server.url.href, { version: 1,
        backend: { entrypoint: './backend.mjs' }, requires: [{ kind: 'tool', id: `package:${dependency}:remote:${dependency}` }] });
      await writeFile(join(installation.root, 'backend.mjs'), `import {writeFile} from 'node:fs/promises';
        export default async context => { await writeFile(context.packageRoot + '/executed', 'yes'); return { dispose() {} }; };`);
      const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
      try {
        expect(loaded.toolIds.size).toBe(1);
        expect(await Bun.file(join(installation.root, 'executed')).exists()).toBe(false);
        expect(loaded.statuses[0]?.codes).toContain('extension:unavailable');
      } finally { await loaded.close(); }
    }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('required origin-qualified tool names invoke their real aliases with unchanged grants and evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-tool-alias-'));
  const remote = packageServer('reference', [{ name: 'echo', inputSchema: { type: 'object' } }]);
  try {
    const installation = await installedFixture(root, 'reference', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, requires: [
      { kind: 'capability', id: 'host' }, { kind: 'capability', id: 'tools' }, { kind: 'tool', id: 'package:reference:remote:echo' },
    ] });
    await writeFile(join(installation.root, 'backend.mjs'), `export default async context => {
      const gateway = context.capabilities.tools, binding = gateway.bind('test-operation'), signal = new AbortController().signal;
      await context.capabilities.host.store.set('exposure', gateway.exposure.tools.map(t => t.name));
      await context.capabilities.host.store.set('result', await gateway.invoke(binding, 'package:reference:remote:echo', {}, signal));
      try { await gateway.invoke(binding, 'package:reference:remote:absent', {}, signal); }
      catch { await context.capabilities.host.store.set('unknown', 'rejected'); }
      return { dispose() {} };
    };`);
    const host = packageHost(root); const checked: string[] = [], recorded: unknown[] = [];
    const loaded = await loadInstalledPackages({ root, installations: [installation], host,
      toolsFor: (_installation, tools) => createLocalToolGateway({ tools, policy: (_operation, name) => { checked.push(name); return true; },
        nextInvocationId: () => crypto.randomUUID(), evidence: { record: async event => { recorded.push(event); } } }) });
    try {
      expect(await host.store.get(JSON.stringify(['plugin', installation.id, 'exposure']))).toEqual(['package:reference:remote:echo']);
      expect(await host.store.get(JSON.stringify(['plugin', installation.id, 'result']))).toMatchObject({ outcome: { status: 'ok', text: 'reference:echo' } });
      expect(await host.store.get(JSON.stringify(['plugin', installation.id, 'unknown']))).toBe('rejected');
      expect([...new Set(checked)]).toEqual([...loaded.toolIds]);
      expect(recorded[0]).toMatchObject({ kind: 'started', tool: [...loaded.toolIds][0] });
      expect(remote.events.filter(e => e === 'tools/call')).toHaveLength(1);
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('reconnecting a server used by an active view requires restart without replacing its session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-view-reconnect-'));
  const remote = packageServer();
  try {
    const installation = await installedFixture(root, 'owner-package', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, workbenches: [ownerPlacement] }, true);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
    try {
      expect(await loaded.reconnect(installation.id, 'remote')).toEqual({ restartRequired: true });
      expect(remote.events.filter(e => e === 'initialize')).toHaveLength(1);
      expect(await loaded.mcpApps.get('owner')!.callTool({ name: 'open', arguments: {} })).toMatchObject({ content: [{ type: 'text', text: 'owner:open' }] });
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('OAuth actions remain bound to prepared startup inventory after the manifest changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-oauth-inventory-'));
  const remote = packageServer();
  try {
    const installation = await installedFixture(root, 'reference', remote.server.url.href);
    const host = packageHost(root);
    await host.store.set('plugin-installations', { version: 1, installations: [installation] });
    const application = await createDesktopApplication(root);
    try {
      const original = await application.packageOAuth({ action: 'status', id: installation.id, server: 'remote' });
      await writeFile(join(installation.root, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: { remote: { type: 'sse', url: 'https://changed.example/mcp' }, added: { type: 'streamable-http', url: 'https://added.example/mcp' } } }));
      expect(await application.packageOAuth({ action: 'status', id: installation.id, server: 'remote' })).toEqual(original);
      await expect(application.packageOAuth({ action: 'status', id: installation.id, server: 'added' })).rejects.toThrow();
    } finally { await application.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('a dependency absent from the provided gateway cannot activate its backend', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-filtered-gateway-'));
  const remote = packageServer('reference', [{ name: 'echo', inputSchema: { type: 'object' } }]);
  try {
    const installation = await installedFixture(root, 'reference', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' },
      requires: [{ kind: 'capability', id: 'host' }, { kind: 'capability', id: 'tools' }, { kind: 'tool', id: 'package:reference:remote:echo' }] });
    await writeFile(join(installation.root, 'backend.mjs'), `export default async context => {
      await context.capabilities.host.store.set('executed', true); return { dispose() {} };
    };`);
    const host = packageHost(root);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host,
      toolsFor: () => createLocalToolGateway({ tools: [], policy: () => true, nextInvocationId: () => crypto.randomUUID(), evidence: { record: async () => {} } }) });
    try {
      expect(await host.store.get('executed')).toBeUndefined();
      expect(loaded.statuses[0]?.codes).toContain('extension:unavailable');
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('dependency identities use inspected package names and reject ambiguous installations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-ambiguous-dependency-'));
  const remote = packageServer('reference', [{ name: 'echo', inputSchema: { type: 'object' } }]);
  try {
    const extension: DrawloomPackageExtension = { version: 1, backend: { entrypoint: './backend.mjs' },
      requires: [{ kind: 'capability', id: 'host' }, { kind: 'tool', id: 'package:reference:remote:echo' }] };
    const first = await installedFixture(root, 'previous-name', remote.server.url.href, extension);
    const second = await installedFixture(root, 'reference', remote.server.url.href);
    await writeFile(join(first.root, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'reference',
      extensions: { 'io.github.mafifi.drawloom': extension } }));
    await writeFile(join(first.root, 'backend.mjs'), `export default async context => {
      await context.capabilities.host.store.set('executed', true); return { dispose() {} };
    };`);
    const host = packageHost(root);
    const loaded = await loadInstalledPackages({ root, installations: [first, second], host });
    try {
      expect(loaded.toolIds.size).toBe(2);
      expect(await host.store.get('executed')).toBeUndefined();
      expect(loaded.statuses[0]?.codes).toContain('extension:unavailable');
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('package resource captures distinguish changed revisions and reuse unchanged captures across reconnect', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-resource-revisions-'));
  const resource = { revision: 1, text: 'First contents' }, remote = packageServer('reference', [], resource);
  try {
    const installation = await installedFixture(root, 'reference', remote.server.url.href);
    await packageHost(root).store.set('plugin-installations', { version: 1, installations: [installation] });
    const app = await createDesktopApplication(root);
    try {
      const conversationId = (await app.snapshot()).selectedId;
      const firstSelection = (await app.discover(conversationId)).entries.find(e => e.kind === 'resource')!;
      const first = await app.readDiscoveredResource(conversationId, firstSelection);
      expect(new TextDecoder().decode(await app.assets.read(first.resources![0]!.asset!.key))).toBe('First contents');
      const reads = remote.events.filter(e => e === 'resources/read').length;
      await app.packageOAuth({ action: 'reconnect', id: installation.id, server: 'remote' });
      const unchanged = (await app.discover(conversationId, true)).entries.find(e => e.kind === 'resource')!;
      expect(unchanged.revision).toBe(firstSelection.revision);
      expect((await app.readDiscoveredResource(conversationId, unchanged)).id).toBe(first.id);
      expect(remote.events.filter(e => e === 'resources/read')).toHaveLength(reads);
      resource.revision++; resource.text = 'Second contents';
      const changed = (await app.discover(conversationId, true)).entries.find(e => e.kind === 'resource')!;
      expect(changed.revision).not.toBe(firstSelection.revision);
      const second = await app.readDiscoveredResource(conversationId, changed);
      expect(second.id).not.toBe(first.id);
      expect(new TextDecoder().decode(await app.assets.read(second.resources![0]!.asset!.key))).toBe('Second contents');
      expect(remote.events.filter(e => e === 'resources/read')).toHaveLength(reads + 1);
      expect((await app.historyPage(conversationId)).entries.filter(e => e.resources?.length)).toHaveLength(2);
    } finally { await app.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

test('enhanced workbench and plugin requirements resolve canonical standard tool and skill references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-enhanced-references-'));
  const remote = packageServer('reference', [{ name: 'echo', inputSchema: { type: 'object' } }]);
  try {
    const requires = [{ kind: 'tool' as const, id: 'package:reference:remote:echo' }, { kind: 'skill' as const, id: 'package:reference:skill:editing' }];
    const installation = await installedFixture(root, 'reference', remote.server.url.href, { version: 1, backend: { entrypoint: './backend.mjs' }, requires });
    await mkdir(join(installation.root, 'skills/editing'), { recursive: true });
    await writeFile(join(installation.root, 'skills/editing/SKILL.md'), '---\nname: editing\ndescription: Edit a synthetic document\n---\nCheck clarity.');
    await writeFile(join(installation.root, 'backend.mjs'), `export default () => ({ contributions: { workbenches: [{
        id: 'enhanced', title: 'Enhanced', description: '', tools: ['package:reference:remote:echo'], skills: ['package:reference:skill:editing']
      }] }, dispose() {} });`);
    const loaded = await loadInstalledPackages({ root, installations: [installation], host: packageHost(root) });
    try {
      expect(loaded.statuses[0]?.codes).not.toContain('backend:invalid-contribution');
      const registry = createPluginRegistry(loaded.installs, ['agent', 'host']);
      expect(registry.workbenches.find(w => w.id === 'enhanced')).toMatchObject({ tools: [...loaded.toolIds], skills: [`package:${installation.id}:skill:editing`] });
      expect(registry.contributions.find(c => c.contributionId === 'enhanced')?.pluginId).toBe(`package:${installation.id}:backend`);
    } finally { await loaded.close(); }
  } finally { remote.server.stop(true); await rm(root, { recursive: true, force: true }); }
});

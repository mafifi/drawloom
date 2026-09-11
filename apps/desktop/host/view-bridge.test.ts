import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from './plugin-installations.js';
import { createTestDesktopApplication as createDesktopApplication } from './test-project.fixture.js';
import { serveDesktop } from './server.js';

async function openExample(root: string) {
  const installations = await createInstallationStore(createNodeJsonStore(join(root, 'state')));
  if (!installations.startup.length) {
    const pkg = join(root, 'example'); await mkdir(pkg, { recursive: true });
    const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'example-backend.fixture.ts')], target: 'bun', outdir: pkg, naming: 'backend.mjs' });
    if (!build.success) throw Error('Example package build failed');
    await writeFile(join(pkg, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'example',
      extensions: { 'io.github.mafifi.drawloom': { version: 1, backend: { entrypoint: './backend.mjs' }, requires: [{ kind: 'capability', id: 'host' }],
        workbenches: [{ id: 'example', title: 'Example', openingTool: { server: 'editor', tool: 'example.open' } }] } } }));
    const id = await installations.add(pkg);
    await installations.configure(id, { enabled: true, trustedBackend: true, servers: [], configuration: {} });
  }
  return createDesktopApplication(root);
}

test('returned and listed resources stay source-bound and cached across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-resources-'));
  let app = await openExample(root);
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const conversationId = (await app.snapshot()).selectedId, viewId = 'example.view';
  try {
    await expect(app.openListedResource(conversationId, viewId, 'file:///etc/passwd')).rejects.toThrow();
    const returned = await app.viewRequest({ conversationId, viewId, request: { name: 'example.reference', arguments: {} } });
    expect(returned.isError).not.toBe(true);
    const entry = (await app.historyPage(conversationId)).entries[0]!;
    expect(entry.resources?.[0]?.status).toBe('readable');
    await app.close(); app = await openExample(root);
    const ready = await app.readResource(conversationId, entry.id, entry.resources![0]!.id);
    expect(ready.status).toBe('ready');
    expect(new TextDecoder().decode(await app.assets.read(ready.asset!.key))).toBe('Use simple words.');
    await app.close(); app = await openExample(root);
    expect(await app.readResource(conversationId, entry.id, ready.id)).toEqual(ready);
    expect((await app.resourcePage(conversationId, viewId)).resources).toHaveLength(1);
    const listed = await app.openListedResource(conversationId, viewId, 'document://example/guide');
    expect(listed.resources?.[0]?.status).toBe('ready');
    expect((await app.openListedResource(conversationId, viewId, 'document://example/guide')).id).toBe(listed.id);
    const { createNodeJsonStore } = await import('@drawloom/node-host');
    const store = createNodeJsonStore(join(root, 'state'));
    const id = (await createInstallationStore(store)).startup[0]!.id;
    const scoped = createNodeJsonStore(join(root,'projects',(await app.snapshot()).selectedProjectId!,'state'));
    expect(await scoped.get(JSON.stringify(['plugin', id, 'example.reads']))).toBe(2);
    expect((await app.snapshot()).activity).toEqual([]);
  } finally { await app.close(); }
});

test('a returning project directory activates its installed workbenches after offline display',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-returning-project-'));
  let app=await openExample(root);
  const working=(await app.snapshot()).projects[0]!.directory;
  await app.close();await rename(working,working+'-offline');
  app=await openExample(root);
  try {
    const offline=await app.snapshot();expect(offline.projects[0]!.available).toBe(false);
    expect(offline.workbenches.some(w=>w.id==='example')).toBe(false);
    await rename(working+'-offline',working);
    const online=await app.snapshot();expect(online.projects[0]!.available).toBe(true);
    expect(online.workbenches.some(w=>w.id==='example')).toBe(true);
  }finally{await app.close();}
});

test('a stale app-resource read is rejected before contacting the source',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-stale-project-resource-'));
  const app=await openExample(root);
  try{
    const original=await app.command({kind:'create_conversation',workbenchId:'example',provider:'synthetic'});
    await app.viewRequest({conversationId:original.selectedId,viewId:'example.view',request:{name:'example.reference',arguments:{}}});
    const entry=(await app.historyPage(original.selectedId)).entries[0]!;
    await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
    await expect(app.readResource(original.selectedId,entry.id,entry.resources![0]!.id)).rejects.toThrow();
    const installation=(await app.installedPackages())[0]!;
    const store=createNodeJsonStore(join(root,'projects',original.selectedProjectId!,'state'));
    expect(await store.get(JSON.stringify(['plugin',installation.id,'example.reads']))).toBeUndefined();
  }finally{await app.close();}
});

test('MCP view data stays with its active owner and persists without an OperatorController', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-view-'));
  const app = await openExample(root);
  const previous = (await app.snapshot()).selectedId;
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const target = { conversationId: (await app.snapshot()).selectedId, viewId: 'example.view' };
  try {
    expect((await app.viewRequest({ ...target, request: { name: 'example.open', arguments: {} } })).structuredContent).toEqual({ choice: 'first' });
    expect((await app.viewRequest({ ...target, request: { name: 'example.inspect', arguments: { choice: 'second' } } })).structuredContent).toEqual({ choice: 'second' });
    await expect(app.viewRequest({ ...target, viewId: 'other', request: { name: 'example.open' } })).rejects.toThrow();
    await expect(app.viewRequest({ ...target, request: { name: 'review_candidate' } })).rejects.toThrow();
    await app.command({ kind: 'select_conversation', conversationId: previous });
    await expect(app.viewRequest({ ...target, request: { name: 'example.open' } })).rejects.toThrow();
    await app.command({ kind: 'select_conversation', conversationId: target.conversationId });
  } finally { await app.close(); }
  const reopened = await openExample(root);
  try { const reply = await reopened.viewRequest({ ...target, request: { name: 'example.open', arguments: {} } }); expect(reply.structuredContent).toEqual({ choice: 'second' }); }
  finally { await reopened.close(); }
});

test('MCP HTML and calls require authenticated parent channel and retain sandbox restrictions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-http-'));
  const app = await openExample(root);
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const state = await app.snapshot();
  const server = serveDesktop(app, resolve('apps/desktop/build'));
  try {
    const path = '/api/views/example.view?conversationId=' + state.selectedId;
    expect((await fetch(server.origin + path)).status).toBe(401);
    const boot = await fetch(server.url, { redirect: 'manual' });
    const cookie = boot.headers.get('set-cookie')!.split(';')[0]!;
    await app.viewSession({action:'open',conversationId:state.selectedId,viewId:'example.view'});
    const html = await fetch(server.origin + path, { headers: { cookie } });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-security-policy')).toContain('sandbox allow-scripts;');
    expect(html.headers.get('content-security-policy')).not.toContain('allow-same-origin');
    expect(await html.text()).toContain('Public fixture');
    const body = JSON.stringify({ conversationId: state.selectedId, viewId: 'example.view', request: { name: 'example.open', arguments: {} } });
    const endpoint = server.origin + '/api/view-request';
    expect((await fetch(endpoint, { method: 'POST', headers: { cookie, origin: 'null', 'Content-Type': 'application/json' }, body })).status).toBe(403);
    const reply = await fetch(endpoint, { method: 'POST', headers: { cookie, origin: server.origin, 'Content-Type': 'application/json' }, body });
    expect(reply.status).toBe(200);
    expect((await reply.json() as { structuredContent: unknown }).structuredContent).toEqual({ choice: 'first' });
  } finally { await server.close(); }
});

test('context updates do not start an agent and stale views cannot send conversation requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-mcp-context-'));
  const app = await openExample(root);
  const previous = (await app.snapshot()).selectedId;
  await app.command({ kind: 'create_conversation', workbenchId: 'example', provider: 'synthetic' });
  const routing = { conversationId: (await app.snapshot()).selectedId, viewId: 'example.view' };
  const target = { ...routing, mountId:(await app.viewSession({ ...routing, action: 'open' })).mountId };
  try {
    const before = await app.snapshot();
    expect(await app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: { content: [{ type: 'text', text: 'A selected revision' }] } } })).toEqual({});
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    expect((await app.snapshot()).signals).toEqual(before.signals);
    expect(await app.viewInteraction({ ...target, request: { method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Revise it' }] } } })).toEqual({ isError: true });
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    const replacement = { ...routing, mountId:(await app.viewSession({ ...routing, action: 'open' })).mountId };
    await app.viewSession({ ...target, action: 'close' });
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
    expect(await app.viewInteraction({ ...replacement, request: { method: 'ui/update-model-context', params: {} } })).toEqual({});
    await app.command({ kind: 'select_conversation', conversationId: previous });
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
    await expect(app.viewInteraction({ ...target, request: { method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Wrong conversation' }] } } })).rejects.toThrow();
    expect((await app.historyPage(before.selectedId)).entries).toEqual([]);
    await app.command({ kind: 'select_conversation', conversationId: routing.conversationId });
    await expect(app.viewInteraction({ ...replacement, request: { method: 'ui/update-model-context', params: {} } })).rejects.toThrow();
  } finally { await app.close(); }
});

test('opaque MCP frame receives a project-only media URL revoked on navigation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-mcp-files-'));
  const app=await openExample(root);
  const initial=await app.snapshot();
  await writeFile(join(initial.projects[0]!.directory,'sample.txt'),'public project bytes');
  await app.command({kind:'create_conversation',workbenchId:'example',provider:'synthetic'});
  const state=await app.snapshot();const target={conversationId:state.selectedId,viewId:'example.view'};
  await app.viewSession({...target,action:'open'});
  const host=serveDesktop(app,resolve('apps/desktop/build'));
  try{
    const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
    const response=await fetch(host.origin+'/api/views/example.view?conversationId='+state.selectedId,{headers:{cookie}});
    const html=await response.text();const base=/<base href="([^"]+)"/.exec(html)?.[1];
    expect(base).toBeDefined();expect(base).toStartWith(host.origin+'/api/view-files/');
    const file=await fetch(base+'sample.txt',{headers:{origin:'null',range:'bytes=0-5'}});
    expect(file.status).toBe(206);expect(await file.text()).toBe('public');
    expect((await fetch(base+'..%2Foutside.txt',{headers:{origin:'null'}})).status).toBe(403);
    await app.command({kind:'select_conversation',conversationId:initial.selectedId});
    expect((await fetch(base+'sample.txt',{headers:{origin:'null'}})).status).toBe(403);
  }finally{await host.close();}
});

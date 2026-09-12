import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { createLocalTemporalManager } from '@drawloom/temporal-orchestration';
import type { RegisteredTaskHandler } from '@drawloom/orchestration';
import { createDesktopApplication } from './application.js';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from './plugin-installations.js';
import { workflowEvidenceKey } from './workflow-tools.js';

test('desktop attaches installed task handlers, restores both projects and enforces grants without conversations', async () => {
  const base = await mkdtemp(join(tmpdir(), 'drawloom-installed-workflows-'));
  const root = join(base, 'data'), pkg = join(base, 'package');
  await mkdir(root); await mkdir(pkg);
  let calls = 0;
  const remote = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const message = await request.json() as { id?: number; method: string };
    if (message.id === undefined) return new Response(null, { status: 202 });
    const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'documents', version: '1' } }
      : message.method === 'tools/list' ? { tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] }
      : (calls++, { content: [{ type: 'text', text: 'Inspected' }] });
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  } });
  const events: string[] = [], handlers = new Map<string, readonly RegisteredTaskHandler[]>();
  const savedProjects = new Set<string>();
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    async prepare(owner) { await mkdir(join(root, 'orchestration'), { recursive: true }); savedProjects.add(owner.projectId); events.push('prepare:' + owner.projectId); return { registry: { workflows: [], tasks: [] }, readiness: () => ({ status: 'ready' }),
      orchestrator: { start: async () => 'run', get: async () => { throw Error('unused'); }, getSteps: async () => ({ steps: [] }), list: async () => ({ runs: [] }), respond: async () => {}, cancel: async () => {}, result: async () => ({}) },
      attach: async values => { handlers.set(owner.projectId, values); }, close: async () => { events.push('registration-close'); } }; },
    prepareHost: async () => { throw Error('not used'); }, listHostOwners: async () => [],
    listOwners: async () => [...savedProjects].map(projectId => ({ projectId, installationId, packageDirectory: pkg, entrypoint: 'workflows.mjs', bundleFingerprint: 'hash', owner: projectId })), hasUnfinishedInstallation: async () => handlers.size > 0,
    close: async () => { events.push('manager-close'); },
  };
  await writeFile(join(pkg, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'documents', extensions: { 'io.github.mafifi.drawloom': {
    version: 1, backend: { entrypoint: './backend.mjs' }, workflows: { entrypoint: './workflows.mjs' },
    requires: [{ kind: 'capability', id: 'host' }, { kind: 'capability', id: 'tools' }], optional: [{ kind: 'capability', id: 'orchestration' }],
    workbenches: [{ id: 'documents', title: 'Documents', openingTool: { server: 'remote', tool: 'inspect' } }],
  } } }));
  await writeFile(join(pkg, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { remote: { type: 'streamable-http', url: remote.url.href } } }));
  await writeFile(join(pkg, 'workflows.mjs'), 'export default {workflows:[],tasks:[]}');
  await writeFile(join(pkg, 'backend.mjs'), `export default async ({capabilities}) => {
    const snapshot = {artifacts:[],candidates:[],reviews:[],readiness:'ready',summary:'Documents',configuration:[],grants:[]};
    return {contributions:{workbenches:[{id:'documents',title:'Documents',description:'',tools:[],skills:[]}]},
      controllers:new Map([['documents',{snapshot:async()=>{await new Promise(r=>setTimeout(r,5));return snapshot;},dispatch:async()=>({status:'ok',snapshot})}]]),
      taskHandlers:[{id:'inspect',version:'1',run:async(input,context)=>capabilities.tools.invoke(capabilities.tools.bind(context.runId),'package:documents:remote:inspect',{},context.signal)}],
      dispose:async()=>capabilities.host.store.set('disposed',true)};
  }`);
  const installed = await createInstallationStore(createNodeJsonStore(join(root, 'state')));
  const installationId = await installed.add(pkg);
  await installed.configure(installationId, { enabled: true, trustedBackend: true, servers: ['remote'], configuration: {} });
  let created = 0;
  const app = await createDesktopApplication(root, { orchestration: { manager: async () => { created++; return manager; } } });
  try {
    expect(created).toBe(0);
    const projects: string[] = [];
    for (const name of ['first', 'second']) {
      const directory = join(base, name); await mkdir(directory);
      const snapshot = await app.command({ kind: 'add_project', directory });
      projects.push(snapshot.selectedProjectId!);
      expect((await app.workflowOwners(snapshot.selectedProjectId!))[0]).toMatchObject({ installationId, readiness: { status: 'ready' } });
    }
    expect(created).toBe(1); expect(handlers.size).toBe(2);
    const projectId = projects[0]!;
    const context = { runId: 'run', stepId: 'inspect', attemptId: 'attempt', attempt: 1, taskVersion: '1', signal: new AbortController().signal };
    const task = handlers.get(projectId)![0]!;
    expect(await task.run({}, context)).toMatchObject({ outcome: { status: 'failed', code: 'denied' } });
    expect(calls).toBe(0);
    await app.command({ kind: 'select_project', projectId });
    await app.command({ kind: 'create_conversation', workbenchId: 'documents', provider: 'synthetic' });
    const snapshot = await app.snapshot();
    const toolName = snapshot.toolLabels.find(label => label.title === 'inspect')!.toolName;
    await app.command({ kind: 'operator', conversationId: snapshot.selectedId, workbenchId: 'documents', command: { kind: 'set_tool_grant', toolName, allowed: true } });
    await app.command({ kind: 'select_project', projectId: projects[1] });
    expect(await task.run({}, context)).toMatchObject({ outcome: { status: 'ok' }, operationId: 'run' });
    expect(calls).toBe(1);
    const concurrent=await Promise.all(Array.from({length:8},(_,i)=>task.run({}, {...context,stepId:'parallel-'+i,attemptId:'parallel-'+i})));
    expect(concurrent.every(result=>(result as {outcome:{status:string}}).outcome.status==='ok')).toBe(true);
    expect(calls).toBe(9);
    const evidence = await createNodeJsonStore(join(root, 'projects', projectId, 'state')).get('tool-evidence:' + workflowEvidenceKey(installationId, 'run', 'inspect', 'attempt'));
    expect(evidence).toBeArray();
    expect((await app.historyPage(snapshot.selectedId)).entries).toHaveLength(0);
    await expect(app.packageAction({ action: 'configure', id: installationId, settings: { enabled: false, trustedBackend: true, servers: [], configuration: {} } })).rejects.toThrow('unfinished workflows');
    await app.close();
    expect(events.indexOf('manager-close')).toBeLessThan(events.indexOf('registration-close'));
    handlers.clear();
    const reopened = await createDesktopApplication(root, { orchestration: { manager: async () => manager } });
    try {
      await reopened.restore();
      expect([...handlers.keys()].sort()).toEqual([...projects].sort());
      expect((await reopened.snapshot()).selectedProjectId).toBe(projects[1]);
    } finally { await reopened.close(); }
  } finally { await app.close(); remote.stop(true); await rm(base, { recursive: true, force: true }); }
});

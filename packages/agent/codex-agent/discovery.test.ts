import { expect, test } from 'bun:test';
import { createCodexDriver } from './src/index.js';
import { createSyntheticDriver } from '../synthetic-agent/src/index.js';
import type { RpcMessage, RpcTransport } from '@drawloom/host';
import { agentDiscoveryConformance } from '../agent/src/conformance.js';

function fixture(experimentalPluginDiscovery = false, imageInput?: () => Promise<string>) {
  const calls: { method: string; params: unknown }[] = [];
  let notify = (_message: RpcMessage) => {};
  const responses: Record<string, unknown> = {
    'initialize': { userAgent: 'codex/0.153.4' },
    'thread/start': { thread: { id: 'native-thread' }, approvalsReviewer: 'user' },
    'thread/memoryMode/set': {},
    'skills/list': { data: [{ cwd: '/synthetic', skills: [
      { name: 'inspect', description: 'Inspect text', path: '/synthetic/SKILL.md', scope: 'repo', enabled: true, pluginId: null },
      { name: 'inspect', description: 'Other origin', path: '/other/SKILL.md', scope: 'user', enabled: true, pluginId: 'other' },
    ], errors: [] }] },
    'app/list': { data: [{ id: 'demo', name: 'Demo', description: 'Demo app', logoUrl: null, logoUrlDark: null, iconAssets: null, iconDarkAssets: null, distributionChannel: null, branding: null, appMetadata: null, labels: null, installUrl: null, isAccessible: true, isEnabled: true, pluginDisplayNames: [] }], nextCursor: null },
    'mcpServerStatus/list': { data: [{ name: 'demo', runtimeStatus: null, pluginId: null, serverInfo: null, tools: { inspect: { name: 'inspect', description: 'Inspect tool', inputSchema: {type: 'object'} } }, resources: [], resourceTemplates: [], authStatus: 'unsupported' }], nextCursor: null },
    'plugin/list': { marketplaces: [], marketplaceLoadErrors: [], featuredPluginIds: [] },
    'turn/start': { turn: { id: 'native-turn' } },
  };
  const transport: RpcTransport = { async request(method, params) { calls.push({method, params}); const value = responses[method]; if (value instanceof Error) throw value; if (typeof value === 'function') return value(params); return value; }, notify() {}, respond() {}, subscribe(receive) { notify = receive; return () => {}; }, async close() {} };
  const driver = createCodexDriver({ connect: async () => transport, store: {async get() {return undefined;}, async set() {}}, experimentalPluginDiscovery, ...(imageInput ? {imageInput} : {}) });
  return { driver, calls, responses, notify: (message: RpcMessage) => notify(message) };
}
const input = { sessionId: 'discovery', context: { text: '' }, tools: { id: 'none', tools: [] } };
test('shared discovery conformance: Codex',()=>agentDiscoveryConformance(fixture().driver));
test('shared discovery conformance: unsupported synthetic',()=>agentDiscoveryConformance(createSyntheticDriver(()=>'')));
test('native MCP sign-in stays with Codex and rejects stale or invented selections', async () => {
  const f = fixture();
  f.responses['mcpServerStatus/list'] = { data: [{ name: 'private-native', pluginId: null, tools: {}, resources: [], authStatus: 'notLoggedIn' }], nextCursor: null };
  f.responses['mcpServer/oauth/login'] = { authorizationUrl: 'https://login.example.test/authorize?state=native' };
  const opened = await f.driver.openSession(input); if (opened.status !== 'ok') throw Error();
  try {
    const discovery = opened.value.discovery!;
    const page = await discovery.list(); if (page.status !== 'ok') throw Error();
    const entry = page.value.entries.find(e => e.kind === 'integration'); expect(entry).toBeDefined();
    expect(entry?.authenticationOwner).toBe('provider');
    const selection = { id: entry!.id, revision: page.value.revision };
    expect(await discovery.authenticate!(selection)).toMatchObject({ status: 'ok' });
    expect(f.calls.find(c => c.method === 'mcpServer/oauth/login')?.params).toEqual({ name: 'private-native', threadId: 'native-thread' });
    discovery.invalidate();
    expect(await discovery.authenticate!(selection)).toMatchObject({ status: 'rejected' });
    expect(f.calls.filter(c => c.method === 'mcpServer/oauth/login')).toHaveLength(1);
    expect(f.calls.some(c => c.method === 'turn/start')).toBe(false);
  } finally { await opened.value.close(); }
});
test('native resource reads use the originating server and reject invented identities without a call', async () => {
  const f = fixture();
  f.responses['mcpServerStatus/list'] = { data: [{ name: 'docs', pluginId: null, tools: {}, resources: [{ uri: 'doc://guide', name: 'Guide', mimeType: 'text/plain' }] }], nextCursor: null };
  f.responses['mcpServer/resource/read'] = { contents: [{ uri: 'doc://guide', text: 'A guide', mimeType: 'text/plain' }], originCallId: null };
  const opened = await f.driver.openSession(input); if (opened.status !== 'ok') throw Error(); const session = opened.value;
  try {
    const found = await session.discovery!.list(); if (found.status !== 'ok') throw Error();
    const resource = found.value.entries.find(e => e.kind === 'resource'); expect(resource).toBeDefined();
    expect(await session.discovery!.readResource!({ id: resource!.id, revision: found.value.revision })).toMatchObject({ status: 'ok', value: [{ type: 'resource', resource: { text: 'A guide' } }] });
    expect(f.calls.find(c => c.method === 'mcpServer/resource/read')?.params).toEqual({ threadId: 'native-thread', server: 'docs', uri: 'doc://guide' });
    expect(await session.discovery!.readResource!({ id: 'file:///secret', revision: found.value.revision })).toMatchObject({ status: 'rejected' });
    expect(f.calls.filter(c => c.method === 'mcpServer/resource/read')).toHaveLength(1);
  } finally { await session.close(); }
});
test('origin-qualified identities stay stable across refresh and new sessions', async () => {
  const identities: string[][] = [];
  for (let n = 0; n < 2; n++) {
    const f = fixture(), opened = await f.driver.openSession(input); if (opened.status !== 'ok') throw Error();
    for (const refresh of [false, true]) {
      const found = await opened.value.discovery!.list({ refresh }); if (found.status !== 'ok') throw Error();
      identities.push(found.value.entries.map(e => e.id));
    }
    await opened.value.close();
  }
  for (const ids of identities) expect(ids).toEqual(identities[0]!);
});
test('identical app refresh notifications do not perpetually invalidate discovery', async () => {
  const f = fixture(), apps = f.responses['app/list'];
  f.responses['app/list'] = () => {
    f.notify({method:'app/list/updated',params:apps});
    return apps;
  };
  const opened = await f.driver.openSession(input); if (opened.status !== 'ok') throw Error();
  try {
    const first = await opened.value.discovery!.list();
    expect(first.status).toBe('ok');
    expect((await opened.value.discovery!.list({refresh:true})).status).toBe('ok');
    expect(f.calls.filter(c => c.method === 'app/list').length).toBeLessThanOrEqual(3);
    expect(f.calls.some(c => c.method === 'turn/start')).toBe(false);
  } finally { await opened.value.close(); }
});
test('discovery caches metadata, preserves equal names and resolves only opaque selected identities', async () => {
  const f = fixture(); const opened = await f.driver.openSession(input); if(opened.status !== 'ok') throw Error();
  const s = opened.value; expect(s.discovery).toBeDefined(); if (!s.discovery) return;
  const found = await s.discovery.list(); if (found.status !== 'ok') throw Error();
  expect(found.value.entries.filter(e => e.name === 'inspect')).toHaveLength(3);
  expect(new Set(found.value.entries.map(e => e.id)).size).toBe(4);
  expect(JSON.stringify(found.value)).not.toContain('/synthetic');
  expect(found.value.entries.find(e => e.kind === 'tool')).toMatchObject({ availability: 'unverified', selectable: false });
  await s.discovery.list(); expect(f.calls.filter(c => c.method === 'skills/list')).toHaveLength(1);
  expect(f.calls.some(c => c.method === 'plugin/list' || c.method === 'turn/start')).toBe(false);
  s.signals();
  const selections = found.value.entries.filter(e => e.kind === 'skill' || e.kind === 'app').slice(0,3).map(e => ({id: e.id, revision: found.value.revision}));
  expect(await s.execute({operationId:'go', text:'Use selected', selections})).toMatchObject({status:'ok'});
  expect(f.calls.find(c => c.method === 'turn/start')?.params).toMatchObject({input: [
    {type:'text',text:'Use selected'}, {type:'skill',name:'inspect',path:'/synthetic/SKILL.md'}, {type:'skill',name:'inspect',path:'/other/SKILL.md'}, {type:'mention',name:'Demo',path:'app://demo'},
  ]});
  await s.close();
});
test('upstream invalidation rejects stale selections before executing and refresh isolates failures', async () => {
  const f=fixture(true); const opened=await f.driver.openSession(input); if(opened.status!=='ok') throw Error(); const s=opened.value; expect(s.discovery).toBeDefined(); if(!s.discovery)return;
  const first=await s.discovery.list(); if(first.status!=='ok')throw Error();
  f.notify({method:'skills/changed',params:{}}); s.signals();
  expect(await s.execute({operationId:'stale',text:'', selections:[{id:first.value.entries[0]!.id,revision:first.value.revision}]})).toMatchObject({status:'rejected'});
  f.responses['app/list']=new Error('secret path /private');
  const next=await s.discovery.list(); if(next.status!=='ok')throw Error();
  expect(next.value.revision).not.toBe(first.value.revision);
  expect(next.value.categories.find(c=>c.kind==='app')).toMatchObject({status:'error'});
  expect(next.value.entries.some(e=>e.kind==='skill')).toBe(true);
  expect(JSON.stringify(next)).not.toContain('/private');
  expect(f.calls.some(c=>c.method==='plugin/list')).toBe(true);
  expect(f.calls.some(c=>c.method==='turn/start')).toBe(false);
  await s.close();
});
test('unsupported provider rejects selections without invoking responder', async () => {
  let ran=false; const opened=await createSyntheticDriver(()=>{ran=true;return '';}).openSession(input); if(opened.status!=='ok')throw Error(); const s=opened.value;s.signals();
  expect(await s.execute({operationId:'no',text:'',selections:[{id:'invented',revision:'old'}]})).toMatchObject({status:'rejected'});
  expect(ran).toBe(false);await s.close();
});
test('experimental installed plugin selections use native mentions without leaking marketplace paths', async()=>{
  const f=fixture(true);
  f.responses['plugin/list']={marketplaces:[{name:'public',path:'/private/marketplace.json',interface:null,plugins:[{id:'demo@public',name:'Demo plugin',installed:true,enabled:true,availability:'AVAILABLE',interface:{displayName:null,shortDescription:null,longDescription:'Public plugin'}}]}],marketplaceLoadErrors:[],featuredPluginIds:[]};
  const opened=await f.driver.openSession(input);if(opened.status!=='ok')throw Error();const s=opened.value;
  const result=await s.discovery!.list();if(result.status!=='ok')throw Error();
  const selected=result.value.entries.find(e=>e.kind==='plugin');expect(selected?.selectable).toBe(true);if(!selected)throw Error();
  expect(JSON.stringify(result)).not.toContain('/private');s.signals();
  expect(await s.execute({operationId:'plugin',text:'',selections:[{id:selected.id,revision:result.value.revision}]})).toMatchObject({status:'ok'});
  expect(f.calls.find(c=>c.method==='turn/start')?.params).toMatchObject({input:[{type:'text'},{type:'mention',name:'Demo plugin',path:'plugin://demo@public'}]});await s.close();
});
test('pagination cycle fails one category and stale in-flight discovery cannot republish', async()=>{
  const f=fixture();f.responses['app/list']={data:[],nextCursor:'repeat'};
  const opened=await f.driver.openSession(input);if(opened.status!=='ok')throw Error();const s=opened.value;
  const result=await s.discovery!.list();if(result.status!=='ok')throw Error();expect(result.value.categories.find(c=>c.kind==='app')?.status).toBe('error');
  expect(f.calls.filter(c=>c.method==='app/list')).toHaveLength(2);
  let release:(value:unknown)=>void=()=>{};f.responses['skills/list']=()=>new Promise(resolve=>{release=resolve;});
  const old=s.discovery!.list({refresh:true});await Promise.resolve();s.discovery!.invalidate();release({data:[]});
  expect(await old).toMatchObject({status:'rejected'});await s.close();expect(await s.discovery!.list()).toMatchObject({status:'rejected'});
});
test('unknown native discovery method is honestly unsupported without exposing provider errors',async()=>{
  const f=fixture();f.responses['app/list']=Object.assign(new Error('secret'),{code:-32601});
  const opened=await f.driver.openSession(input);if(opened.status!=='ok')throw Error();const s=opened.value;
  const result=await s.discovery!.list();if(result.status!=='ok')throw Error();expect(result.value.categories.find(c=>c.kind==='app')?.status).toBe('unsupported');await s.close();
});
for (const method of ['execute', 'steer'] as const) test(`${method} rejects selections invalidated during image preparation before dispatch`, async () => {
  let ready = () => {};
  const preparing = new Promise<void>(resolve => { ready = resolve; });
  let release = (_path: string) => {};
  const image = new Promise<string>(resolve => { release = resolve; });
  const f = fixture(false, () => { ready(); return image; });
  const opened = await f.driver.openSession(input);
  if (opened.status !== 'ok') throw Error();
  const session = opened.value;
  session.signals();
  const catalogue = await session.discovery!.list();
  if (catalogue.status !== 'ok') throw Error();
  if (method === 'steer') expect(await session.execute({operationId:'operation',text:'Begin'})).toMatchObject({status:'ok'});
  const operation = {
    operationId: 'operation', text: 'Use selection',
    selections: [{id: catalogue.value.entries[0]!.id, revision: catalogue.value.revision}],
    attachments: [{key:'test-image',mediaType:'image/png',size:1}],
  };
  const pending = method === 'execute' ? session.execute(operation) : session.steer!(operation);
  await preparing;
  session.discovery!.invalidate();
  release('/synthetic/image.png');
  expect(await pending).toMatchObject({status:'rejected',failure:{code:'invalid_state'}});
  expect(f.calls.filter(call => call.method === (method === 'execute' ? 'turn/start' : 'turn/steer'))).toHaveLength(0);
  await session.close();
});

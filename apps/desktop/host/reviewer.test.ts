import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createTestDesktopApplication as createDesktopApplication, addTestProject } from './test-project.fixture.js';
import { ConversationSchema } from '../src/lib/protocol.js';
import * as composition from './composition.js';
import * as synthetic from '@drawloom/synthetic-agent';

test('legacy conversations default to human review without changing identity or provider', () => {
  expect(ConversationSchema.parse({ id: 'old', title: 'Existing', workbenchId: 'text', provider: 'codex' })).toMatchObject({ id: 'old', provider: 'codex', reviewer: 'human' });
});
test('native MCP configuration reviews every mutating or unclassified invocation', () => {
  const config = composition.mcpReviewConfiguration({ id: 'exposure', tools: [
    { name: 'text.read', description: '', inputSchema: {}, outputSchema: {}, annotations: { readOnlyHint: true } },
    { name: 'text.edit', description: '', inputSchema: {}, outputSchema: {}, annotations: { readOnlyHint: false } },
    { name: 'text.unknown', description: '', inputSchema: {}, outputSchema: {} },
  ] });
  expect(config).toEqual({ default_tools_approval_mode: 'prompt', tools: { 'text.read': { approval_mode: 'approve' }, 'text.edit': { approval_mode: 'prompt' }, 'text.unknown': { approval_mode: 'prompt' } } });
});
test('conversation review mode persists separately and unsupported delegated selection does not change it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-'));
  const store = createNodeJsonStore(join(root, 'state'));
  await store.set('project', { version: 1, selectedId: 'local', assets: [], conversations: [
    { id: 'local', title: 'Synthetic', workbenchId: 'text', provider: 'synthetic' },
    { id: 'native', title: 'Codex', workbenchId: 'text', provider: 'codex', reviewer: 'delegated' },
  ] });
  let app = await createDesktopApplication(root);
  try {
    const selected=await addTestProject(app);
    await app.command({kind:'assign_project',conversationId:'local',projectId:selected.selectedProjectId!});
    await expect(app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'delegated' })).rejects.toThrow('review');
    expect((await app.snapshot()).conversations.find(c => c.id === 'local')?.reviewer).toBe('human');
    await app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'human' });
    await app.close(); app = await createDesktopApplication(root);
    const saved = await app.snapshot();
    expect(saved.conversations.map(c => c.reviewer)).toEqual(['human', 'delegated']);
    expect(saved.controls.reviewerModes).toEqual(['human']);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('accepted execution locks reviewer selection before delayed started delivery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-start-'));
  let deliver!: () => void, finish!: () => void;
  const delivery = new Promise<void>(resolve => { deliver = resolve; });
  const completion = new Promise<void>(resolve => { finish = resolve; });
  const original = synthetic.createSyntheticDriver;
  // Keep the real synthetic session; delay its public signal boundary like a
  // host pump awaiting previous-turn history ingestion. Commands remain sequential.
  const replacement = spyOn(synthetic, 'createSyntheticDriver').mockImplementation(respond => {
    const driver = original(async (text, context) => { await completion; return respond(text, context); });
    const open = driver.openSession.bind(driver);
    driver.openSession = async input => {
      const result = await open(input);
      if (result.status === 'ok') {
        const signals = result.value.signals.bind(result.value);
        result.value.signals = () => ({ async *[Symbol.asyncIterator]() {
          for await (const signal of signals()) { await delivery; yield signal; }
        } });
      }
      return result;
    };
    return driver;
  });
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  try {
    app = await createDesktopApplication(root);
    const conversationId = (await app.snapshot()).selectedId;
    const accepted = await app.command({ kind: 'send', conversationId, text: 'Independent synthetic fixture', attachmentKeys: [], contextArtifactIds: [] });
    expect(accepted.activeOperation).toBeTruthy();
    await expect(app.command({ kind: 'set_reviewer', conversationId, reviewer: 'human' })).rejects.toThrow('idle');
    deliver(); finish();
    for (let attempt = 0; attempt < 100 && (await app.snapshot()).activeOperation; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    await app.command({ kind: 'set_reviewer', conversationId, reviewer: 'human' });
  } finally { deliver(); finish(); await app?.close(); replacement.mockRestore(); await rm(root, { recursive: true, force: true }); }
});

test('rejected execute releases the startup lock for reviewer correction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-rejected-'));
  const store = createNodeJsonStore(join(root, 'state'));
  await store.set('project', { version: 1, selectedId: 'local', assets: [], conversations: [
    { id: 'local', title: 'Synthetic', workbenchId: 'text', provider: 'synthetic', reviewer: 'delegated' },
  ] });
  const app = await createDesktopApplication(root);
  try {
    const selected=await addTestProject(app);
    await app.command({kind:'assign_project',conversationId:'local',projectId:selected.selectedProjectId!});
    await expect(app.command({ kind: 'send', conversationId: 'local', text: 'Rejected mode', attachmentKeys: [], contextArtifactIds: [] })).rejects.toThrow('provider rejected');
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    await app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'human' });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('a missing project directory blocks new work but not stopping an existing operation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-missing-project-stop-'));
  let finish!:()=>void;const completion=new Promise<void>(resolve=>{finish=resolve;});
  const original=synthetic.createSyntheticDriver;
  let interrupted=0;
  const replacement=spyOn(synthetic,'createSyntheticDriver').mockImplementation(respond=>{
    const driver=original(async(text,context)=>{await completion;return respond(text,context);});
    const open=driver.openSession.bind(driver);
    driver.openSession=async input=>{const result=await open(input);return result.status==='ok'?{...result,value:{...result.value,interrupt:async()=>{interrupted++;finish();return {status:'ok' as const,value:undefined};}}}:result;};
    return driver;
  });
  let app:Awaited<ReturnType<typeof createDesktopApplication>>|undefined;
  let working='';
  try{
    app=await createDesktopApplication(root);
    const state=await app.snapshot();working=state.projects[0]!.directory;
    const started=await app.command({kind:'send',conversationId:state.selectedId,text:'Synthetic delayed task',attachmentKeys:[],contextArtifactIds:[]});
    expect(started.activeOperation).toBeTruthy();
    await rename(working,working+'-offline');
    await expect(app.command({kind:'send',conversationId:state.selectedId,text:'Do not run',attachmentKeys:[],contextArtifactIds:[]})).rejects.toThrow();
    await app.command({kind:'stop',conversationId:state.selectedId});
    expect(interrupted).toBe(1);
    finish();
    for(let i=0;i<100&&(await app.snapshot()).activeOperation;i++)await Bun.sleep(5);
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    expect((await app.historyPage(state.selectedId)).entries.length).toBeGreaterThan(0);
  }finally{finish();await app?.close();replacement.mockRestore();if(working)await rename(working+'-offline',working).catch(()=>{});await rm(root,{recursive:true,force:true});}
});

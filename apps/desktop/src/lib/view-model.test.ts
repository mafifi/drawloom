import { afterEach, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import type { DesktopCommand, DesktopSnapshot } from './protocol.js';

// Compile the real rune module, leaving only HTTP/storage as controlled test IO.
Bun.plugin({ name: 'desktop-view-model-tests', setup(build) {
  build.onLoad({ filter: /view-model\.svelte\.ts$/ }, async ({ path }) => ({
    contents: compileModule(new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text()), { filename: path, generate: 'client' }).js.code,
    loader: 'js',
  }));
} });
const { createDesktopViewModel } = await import('./view-model.svelte.js');
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function snapshot(): DesktopSnapshot {
  return {
    views: [],
    pendingTools: [],
    workspace: 'Test workspace', selectedId: 'conversation-a',
    conversations: [{ id: 'conversation-a', title: 'A', workbenchId: 'text', provider: 'synthetic' }],
    workbenches: [{ id: 'text', title: 'Text', description: '', tools: [], skills: [] }],
    signals: [], activity: [], controls: { steer: false, interrupt: false }, plugins: [], notice: '',
    operator: { artifacts: [{ id: 'artifact-a', editable: true, title: 'A', content: { kind: 'text', text: 'Original A' } }], candidates: [{ id: 'candidate-a', comparisonKey: 'document-a', label: 'A', artifactIds: ['artifact-a'], status: 'draft' }], reviews: [], readiness: 'ready', summary: '', configuration: [], grants: [] },
  };
}
async function harness() {
  let current = snapshot();
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  } });
  const commands: DesktopCommand[] = [];
  const imports: unknown[] = [];
  let commandResponse: (() => Promise<Response>) | undefined;
  let importResponse: (() => Promise<Response>) | undefined;
  let stateResponse: (() => Promise<Response>) | undefined;
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).startsWith('/api/history')) return Response.json({ entries: [], hasOlder: false, changeCursor: 'c1', status: { revision: 0, sync: 'idle', hasOlder: false } });
    if (url === '/api/command') {
      commands.push(JSON.parse(String(options?.body)) as DesktopCommand);
      return commandResponse ? commandResponse() : Response.json(current);
    }
    if (url === '/api/import') {
      imports.push(JSON.parse(String(options?.body)));
      return importResponse ? importResponse() : Response.json({ key: 'new-image', mediaType: 'image/png', size: 1 });
    }
    const state = stateResponse ? await stateResponse() : Response.json(current);
    return Response.json({ kind: 'snapshot', token: 'host:1', sections: await state.json(), removed: [] });
  }) as typeof fetch;
  const vm = createDesktopViewModel();
  await vm.start(); vm.stopPolling();
  return { vm, commands, imports, stored, setState(value: DesktopSnapshot) { current = value; },
    deferCommand() { let resolve!: (response: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); commandResponse = () => promise; return (response = Response.json(current)) => resolve(response); },
    deferImport() { let resolve!: (response: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); importResponse = () => promise; return (response = Response.json({ key: 'new-image', mediaType: 'image/png', size: 1 })) => resolve(response); },
    deferState() {
      let resolve!: (response: Response) => void, requested!: () => void;
      const promise = new Promise<Response>(r => { resolve = r; });
      const request = new Promise<void>(r => { requested = r; });
      stateResponse = () => { requested(); return promise; };
      return { request, resolve: () => resolve(Response.json(current)) };
    },
  };
}

test('pending feedback identifies the active command rather than every disabled sibling', async () => {
  const h = await harness();
  const resolve = h.deferCommand();
  h.vm.draft = 'A draft';
  const sending = h.vm.send();
  expect(h.vm.pendingCommand?.kind).toBe('send');
  expect(h.vm.busy).toBe(true);
  resolve();
  await sending;
  expect(h.vm.pendingCommand).toBeUndefined();
  expect(h.vm.busy).toBe(false);
});

test('a pending command rejects overlapping navigation without clearing its feedback', async () => {
  const h = await harness(); const resolve = h.deferCommand();
  h.vm.draft = 'Keep this operation'; const sending = h.vm.send();
  const creating = h.vm.create('text');
  expect(await creating).toBe(false);
  expect(h.vm.creationSource).toBeUndefined();
  expect(h.commands).toHaveLength(1);
  expect(h.vm.pendingCommand?.kind).toBe('send');
  resolve(); await Promise.all([sending, creating]);
});

test('creation feedback identifies its origin and rejects competing creation without replacing it', async () => {
  const h = await harness();
  for (const source of ['new', 'workbench', 'provider'] as const) {
    const resolve = h.deferCommand();
    const creating = h.vm.create('text', 'synthetic', source);
    expect(h.vm.creationSource).toBe(source);
    expect(h.vm.pendingCommand?.kind).toBe('create_conversation');
    expect(await h.vm.create('other', 'synthetic', 'new')).toBe(false);
    expect(h.vm.creationSource).toBe(source);
    resolve();
    expect(await creating).toBe(true);
    expect(h.vm.creationSource).toBeUndefined();
    expect(h.vm.busy).toBe(false);
  }
  expect(h.commands).toHaveLength(3);
});

test('failed creation resets feedback and preserves the unsent draft', async () => {
  const h = await harness(); const resolve = h.deferCommand(); h.vm.draft = 'Unsent draft';
  const creating = h.vm.create();
  resolve(Response.json({ error: 'Creation refused' }, { status: 500 }));
  expect(await creating).toBe(false);
  expect(h.vm.error).toBe('Creation refused');
  expect(h.vm.creationSource).toBeUndefined();
  expect(h.vm.pendingCommand).toBeUndefined();
  expect(h.vm.busy).toBe(false);
  expect(h.vm.draft).toBe('Unsent draft');
});

test('selection returns success only when the command succeeds', async () => {
  const h = await harness();
  expect(await h.vm.select('conversation-a')).toBe(true);
  const resolve = h.deferCommand(); h.vm.draft = 'Unsent draft';
  const selecting = h.vm.select('conversation-a');
  expect(await h.vm.select('conversation-b')).toBe(false);
  resolve(Response.json({ error: 'Selection refused' }, { status: 500 }));
  expect(await selecting).toBe(false);
  expect(h.vm.draft).toBe('Unsent draft');
  expect(h.vm.pendingCommand).toBeUndefined();
});

test('import feedback spans file reading, upload and refresh while duplicate imports are rejected', async () => {
  const h = await harness(); const resolveImport = h.deferImport();
  const refresh = h.deferState();
  let resolveRead!: (data: ArrayBuffer) => void;
  const file = new File(['image'], 'next.png', { type: 'image/png' });
  file.arrayBuffer = () => new Promise<ArrayBuffer>(resolve => { resolveRead = resolve; });
  const files = [file] as unknown as FileList;
  const importing = h.vm.importFiles(files);
  expect(h.vm.importing).toBe(true);
  expect(h.imports).toHaveLength(0);
  await h.vm.importFiles(files);
  resolveRead(new Uint8Array([1]).buffer);
  await Promise.resolve();
  expect(h.imports).toHaveLength(1);
  expect(h.vm.importing).toBe(true);
  resolveImport(); await refresh.request;
  expect(h.vm.importing).toBe(true);
  refresh.resolve(); await importing;
  expect(h.vm.importing).toBe(false);
  expect(h.vm.attachmentKeys).toEqual(['new-image']);
});

test('failed file reads and uploads report errors and always clear import feedback', async () => {
  const h = await harness();
  const unreadable = new File(['image'], 'unreadable.png');
  unreadable.arrayBuffer = async () => { throw Error('File unreadable'); };
  await h.vm.importFiles([unreadable] as unknown as FileList);
  expect(h.vm.importing).toBe(false);
  expect(h.vm.error).toBe('File unreadable');
  expect(h.imports).toHaveLength(0);
  const resolve = h.deferImport();
  const importing = h.vm.importFiles([new File(['image'], 'next.png')] as unknown as FileList);
  resolve(Response.json({ error: 'Upload refused' }, { status: 500 }));
  await importing;
  expect(h.vm.importing).toBe(false);
  expect(h.vm.error).toBe('Upload refused');
  expect(h.vm.attachmentKeys).toEqual([]);
});

test('editing A is not retargeted when polling discovers document B', async () => {
  const h = await harness();
  h.vm.editing = true; h.vm.editText = 'Edited A';
  const next = snapshot();
  next.operator.artifacts.push({ id: 'artifact-b', title: 'B', content: { kind: 'text', text: 'Original B' } });
  next.operator.candidates.push({ id: 'candidate-b', label: 'B', artifactIds: ['artifact-b'], status: 'draft' });
  h.setState(next);
  await h.vm.start(); h.vm.stopPolling();
  await h.vm.saveRevision();
  expect(h.commands.at(-1)).toEqual({ kind: 'operator', workbenchId: 'text', command: { kind: 'revise_document', candidateId: 'candidate-a', artifactId: 'artifact-a', text: 'Edited A' } });
});

test('conversation navigation cancels the previous document editing session', async () => {
  const h = await harness();
  h.vm.editing = true; h.vm.editText = 'Do not apply to B';
  const next = snapshot();
  next.selectedId = 'conversation-b';
  next.conversations = [{ id: 'conversation-b', title: 'B', workbenchId: 'other', provider: 'synthetic' }];
  h.setState(next);
  await h.vm.select('conversation-b');
  expect(h.vm.editing).toBe(false);
  await h.vm.saveRevision();
  expect(h.commands.filter(c => c.kind === 'operator')).toEqual([]);
});

test('creating another workbench cancels the old editor before any later save', async () => {
  const h = await harness();
  h.vm.editing = true;
  h.vm.editText = 'Do not carry into a new workbench';
  await h.vm.create('other');
  expect(h.vm.editing).toBe(false);
  expect(h.vm.editText).toBe('');
  await h.vm.saveRevision();
  expect(h.commands.filter(c => c.kind === 'operator')).toEqual([]);
});

test('conversation display is separate from the application snapshot', async () => {
  const h = await harness();
  const next = snapshot();
  h.setState(next); await h.vm.start(); h.vm.stopPolling();
  expect(h.vm.state).not.toHaveProperty('messages');
  expect(h.vm.history.entries).toEqual([]);
});

test('accepted send preserves later draft, attachment and context edits', async () => {
  const h = await harness();
  h.vm.draft = 'Submitted draft'; h.vm.toggleContext('artifact-a');
  const release = h.deferCommand();
  const sending = h.vm.send();
  h.vm.draft = 'Next unsent correction'; h.vm.toggleContext('artifact-b');
  await h.vm.importFiles([new File([new Uint8Array([1])], 'next.png', { type: 'image/png' })] as unknown as FileList);
  release(); await sending;
  expect(h.vm.draft).toBe('Next unsent correction');
  expect(h.stored.get('drawloom-composer')).toBe('Next unsent correction');
  expect(h.vm.attachmentKeys).toEqual(['new-image']);
  expect(h.vm.contextIds).toEqual(['artifact-a', 'artifact-b']);
  expect(h.commands[0]).toMatchObject({ kind: 'send', text: 'Submitted draft', attachmentKeys: [], contextArtifactIds: ['artifact-a'] });
});

test('accepted send clears an unchanged submitted composer', async () => {
  const h = await harness();
  h.vm.draft = 'Submitted draft'; h.vm.toggleContext('artifact-a');
  await h.vm.send();
  expect(h.vm.draft).toBe('');
  expect(h.vm.contextIds).toEqual([]);
  expect(h.stored.has('drawloom-composer')).toBe(false);
});

test('group navigation discovers unattached documents and comparison excludes unrelated outputs', async () => {
  const h = await harness(); const next = snapshot();
  next.operator.artifacts.push({ id: 'overview', title: 'Overview', content: { kind: 'text', text: 'Read only' } });
  next.operator.candidates.push({ id: 'revision-a', comparisonKey: 'document-a', label: 'A revision', artifactIds: ['artifact-a'], status: 'draft' }, { id: 'unrelated', comparisonKey: 'document-b', label: 'B', artifactIds: [], status: 'draft' });
  next.operator.groups = [{ id: 'writing', title: 'Writing', artifactIds: ['overview'], candidateIds: ['candidate-a', 'revision-a', 'unrelated'] }];
  h.setState(next); await h.vm.start(); h.vm.stopPolling();
  h.vm.groupId = 'writing'; h.vm.candidateId = 'candidate-a';
  expect(h.vm.comparableCandidates.map(c => c.id)).toEqual(['revision-a']);
  h.vm.artifactId = 'overview';
  expect(h.vm.artifact?.id).toBe('overview'); expect(h.vm.candidate).toBeUndefined();
  h.vm.editing = true; expect(h.vm.editing).toBe(false);
});

test('unsupported synthetic workbench keeps draft and sends no request', async () => {
  const h = await harness(); const next = snapshot(); next.conversations[0]!.workbenchId = 'media';
  h.setState(next); await h.vm.start(); h.vm.stopPolling(); h.vm.draft = 'Keep this';
  expect(h.vm.canSend).toBe(false); await h.vm.send(); expect(h.commands).toEqual([]); expect(h.vm.draft).toBe('Keep this');
});

test('review notes remain local to the inspected candidate', async () => {
  const h = await harness(); h.vm.reviewSummary = 'Exact recovery acknowledgement';
  h.vm.candidateId = 'another-candidate'; expect(h.vm.reviewSummary).toBe('');
  h.vm.reviewSummary = 'Document notes'; h.vm.groupId = 'another-group'; expect(h.vm.reviewSummary).toBe('');
  h.vm.reviewSummary = 'Notes for A'; const next = snapshot(); next.operator.candidates.push({ id: 'newest', label: 'New result', artifactIds: [], status: 'draft' });
  h.setState(next); await h.vm.start(); h.vm.stopPolling(); expect(h.vm.reviewSummary).toBe('');
});

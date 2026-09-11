import { afterEach, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import type { DesktopCatalogue, DesktopCommand, DesktopSnapshot } from './protocol.js';
import type { HistoryEntry } from '@drawloom/conversation-history';

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
test('a fresh desktop opens the conversation rather than replacing it with narrow artifact details', () => {
  const vm = createDesktopViewModel();
  expect(vm.primaryView).toBe('conversation');
  expect(vm.detailsOpen).toBe(false);
});
test('attachment labels recover from existing artifact metadata after reconnect', async () => {
  const initial = snapshot();
  initial.operator.artifacts.push({ id: 'imported', title: 'research-notes.txt', content: { kind: 'asset', asset: { key: 'research-key', size: 24, mediaType: 'text/plain' } } });
  const h = await harness(initial);
  expect(h.vm.attachmentName('research-key')).toBe('research-notes.txt');
  expect(h.vm.attachmentName('missing')).toBe('Attachment');
});
test('an empty app requires a project and does not request history or discovery', async () => {
  const h = await harness({ ...snapshot(), projects: [], selectedProjectId: undefined, conversations: [], selectedId: '' });
  expect(h.vm.canSend).toBe(false);
  expect(h.vm.canCreate).toBe(false);
  expect(await h.vm.create()).toBe(false);
  h.vm.draft = 'No project'; await h.vm.send();
  await h.vm.importFiles([new File(['x'], 'file.txt')]);
  expect(h.vm.primaryView).toBe('projects');
  expect(h.commands).toHaveLength(0);
  expect(h.imports).toHaveLength(0);
  expect(h.discoveryRequests).toHaveLength(0);
  expect(h.historyRequests).toHaveLength(0);
});

test('project actions retain exact identities and missing directories block only new execution', async () => {
  const initial = snapshot(); initial.projects[0]!.available = false;
  initial.projects.push({ id: 'project-b', name: 'B', directory: '/work/b', available: true });
  initial.selectedProjectId = 'project-b';
  const h = await harness(initial);
  expect(h.vm.canCreate).toBe(true);
  expect(h.vm.canSend).toBe(false);
  expect(h.historyRequests.length).toBeGreaterThan(0);
  h.vm.draft = 'Do not run in B'; await h.vm.send();
  expect(h.commands).toHaveLength(0);
  await h.vm.addProject(' /work/new ', ' New project ');
  expect(h.commands.at(-1)).toEqual({ kind: 'add_project', directory: '/work/new', name: 'New project' });
  await h.vm.selectProject('project-b');
  expect(h.commands.at(-1)).toEqual({ kind: 'select_project', projectId: 'project-b' });
});

test('native folder selection fills only the form and exposes pending feedback', async () => {
  const h = await harness();
  const requests: RequestInit[] = [];
  let release!: (value: Response) => void;
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    if (url === '/api/project-directory') { requests.push(init!); return new Promise<Response>(resolve => { release = resolve; }); }
    return previous(url, init);
  }) as typeof fetch;
  expect(h.vm.projectDirectoryPending).toBe(false);
  const selection = h.vm.chooseProjectDirectory();
  expect(h.vm.projectDirectoryPending).toBe(true);
  expect(requests[0]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(await h.vm.chooseProjectDirectory()).toBeUndefined();
  expect(requests).toHaveLength(1);
  release(Response.json({ directory: '/work/chosen' }));
  expect(await selection).toBe('/work/chosen');
  expect(h.vm.projectDirectoryPending).toBe(false);
  expect(h.commands).toHaveLength(0);
  expect(h.vm.selectedProject?.directory).toBe('/work/a');
});

test('cancelled or unavailable native selection leaves path entry available', async () => {
  const h = await harness(); const previous = globalThis.fetch;
  let result = Response.json({});
  globalThis.fetch = (async (url, init) => url === '/api/project-directory' ? result : previous(url, init)) as typeof fetch;
  expect(h.vm.projectDirectoryNote).toBe('');
  expect(await h.vm.chooseProjectDirectory()).toBeUndefined();
  expect(h.vm.projectDirectoryNote).toBe('');
  result = Response.json({ error: 'Native chooser unavailable' }, { status: 501 });
  expect(await h.vm.chooseProjectDirectory()).toBeUndefined();
  expect(h.vm.projectDirectoryNote).toContain('Enter the project folder path');
  expect(h.vm.projectDirectoryPending).toBe(false);
  expect(h.commands).toHaveLength(0);
});

test('navigation and unmount abort the native chooser and discard a late selection', async () => {
  const h = await harness(); const previous = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  let release!: (value: Response) => void;
  globalThis.fetch = (async (url, init) => {
    if (url === '/api/project-directory') { signal = init?.signal; return new Promise<Response>(resolve => { release = resolve; }); }
    return previous(url, init);
  }) as typeof fetch;
  expect(h.vm.projectDirectoryPending).toBe(false);
  for (const close of [() => { h.vm.primaryView = 'conversation'; }, () => h.vm.stopPolling()]) {
    h.vm.primaryView = 'projects';
    const selection = h.vm.chooseProjectDirectory();
    close();
    expect(signal?.aborted).toBe(true);
    release(Response.json({ directory: '/work/late' }));
    expect(await selection).toBeUndefined();
    expect(h.vm.projectDirectoryPending).toBe(false);
  }
});

test('legacy history stays readable and project assignment binds the displayed conversation', async () => {
  const initial = snapshot(); delete initial.conversations[0]!.projectId;
  const h = await harness(initial);
  expect(h.vm.canSend).toBe(false);
  expect(h.historyRequests.length).toBeGreaterThan(0);
  await h.vm.assignProject('project-a');
  expect(h.commands.at(-1)).toEqual({ kind: 'assign_project', conversationId: 'conversation-a', projectId: 'project-a' });
});

test('working-file presentation binds to the conversation project, not the selected project', async () => {
  const initial = snapshot(); initial.projects.push({ id: 'project-b', name: 'B', directory: '/work/b', available: true }); initial.selectedProjectId = 'project-b';
  const h = await harness(initial);
  const reference = { id: 'file', title: 'Clip', source: 'native', status: 'unavailable' as const, uri: 'file:///work/a/clip.mp4', mimeType: 'video/mp4' };
  expect(h.vm.workingFile(reference)?.url).toBe('/api/files?conversationId=conversation-a&path=clip.mp4');
  expect(h.vm.workingFile({ ...reference, uri: 'file:///work/b/clip.mp4' })).toBeUndefined();
  const unavailable = snapshot(); unavailable.projects[0]!.available = false;
  h.setState(unavailable); await h.vm.select('conversation-a');
  expect(h.vm.workingFile(reference)).toBeUndefined();
});

test('assigning a legacy conversation refreshes project discovery and retains its draft', async () => {
  const initial = snapshot(); delete initial.conversations[0]!.projectId;
  const h = await harness(initial); h.vm.draft = 'Saved draft';
  const before = h.discoveryRequests.length;
  h.setState(snapshot()); await h.vm.assignProject('project-a');
  expect(h.discoveryRequests.length).toBeGreaterThan(before);
  expect(h.vm.draft).toBe('Saved draft');
  expect(h.vm.canSend).toBe(true);
});

test('leaving the conversation view cancels pending imports and never starts queued files', async () => {
  const h = await harness(); const release = h.deferImport();
  const uploading = h.vm.importFiles([new File(['a'], 'a.png'), new File(['b'], 'b.png')]);
  h.vm.primaryView = 'projects';
  await Promise.resolve();
  expect(h.imports[0]?.signal?.aborted).toBe(true);
  release(); await uploading;
  expect(h.imports).toHaveLength(1);
  expect(h.vm.attachments.every(item => item.status === 'failed')).toBe(true);
});

test('unmount cancels upload without registering a late completion', async () => {
  const h = await harness(); const release = h.deferImport();
  const uploading = h.vm.importFiles([new File(['a'], 'a.png', { type: 'image/png' })]);
  h.vm.stopPolling();
  await Promise.resolve();
  expect(h.imports[0]?.signal?.aborted).toBe(true);
  release(); await uploading;
  expect(h.vm.attachmentKeys).toEqual([]);
});

test('browser media admission allows files above the separate model-input limit', async () => {
  const h = await harness(); const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: 256 * 1024 * 1024 });
  await h.vm.importFiles([file]);
  expect(h.imports).toHaveLength(1);
  expect(h.imports[0]!.body).toBe(file);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

test('provider sign-in uses a catalogue identity and discards a late URL after navigation', async () => {
  const h = await harness();
  h.setCatalogue({ entries: [{ id: 'codex:integration:a', origin: 'codex', kind: 'integration', name: 'Remote', description: '', scope: 'server', availability: 'unavailable', selectable: false, authenticationOwner: 'provider', revision: 'r1' }], categories: [], experimentalPluginDiscovery: false });
  await h.vm.refreshCatalogue(true);
  const previous = globalThis.fetch; const requests: unknown[] = [];
  let release!: (value: Response) => void;
  globalThis.fetch = (async (url, init) => {
    if (url === '/api/discovery/authenticate') { requests.push(JSON.parse(String(init?.body))); return new Promise<Response>(r => { release = r; }); }
    return previous(url, init);
  }) as typeof fetch;
  await h.vm.authenticateIntegration('invented'); expect(requests).toHaveLength(0);
  const pending = h.vm.authenticateIntegration('codex:integration:a');
  expect(requests).toEqual([{ conversationId: 'conversation-a', id: 'codex:integration:a', revision: 'r1' }]);
  h.setState({ ...snapshot(), selectedId: 'conversation-b', conversations: [...snapshot().conversations, { ...snapshot().conversations[0]!, id: 'conversation-b' }] });
  await h.vm.select('conversation-b');
  release(Response.json({ authorizationUrl: 'https://auth.example/authorize' })); await pending;
  expect(h.vm.integrationAuthorizationUrl('codex:integration:a')).toBe('');
});

function snapshot(): DesktopSnapshot {
  return {
    mediaPolicy: { revision: 'initial', sources: [] },
    toolLabels: [],
    elicitations: [],
    views: [],
    activeContext: '',
    pendingTools: [],
    workspace: 'Test workspace', selectedId: 'conversation-a',
    projects: [{ id: 'project-a', name: 'Project A', directory: '/work/a', available: true }], selectedProjectId: 'project-a',
    conversations: [{ id: 'conversation-a', title: 'A', projectId: 'project-a', workbenchId: 'text', provider: 'synthetic', reviewer: 'human' }],
    workbenches: [{ id: 'text', title: 'Text', description: '', tools: [], skills: [] }],
    signals: [], activity: [], controls: { steer: false, interrupt: false, reviewerModes: ['human'] }, plugins: [], notice: '',
    operator: { artifacts: [{ id: 'artifact-a', editable: true, title: 'A', content: { kind: 'text', text: 'Original A' } }], candidates: [{ id: 'candidate-a', comparisonKey: 'document-a', label: 'A', artifactIds: ['artifact-a'], status: 'draft' }], reviews: [], readiness: 'ready', summary: '', configuration: [], grants: [] },
  };
}
async function harness(initial = snapshot()) {
  let current = initial;
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  } });
  const commands: DesktopCommand[] = [];
  const imports: { conversationId: string | null; body: RequestInit['body']; signal: RequestInit['signal']; contentType: string | null; name: string | null; mediaType: string | null }[] = [];
  const historyRequests: string[] = [];
  let commandResponse: (() => Promise<Response>) | undefined;
  let importResponse: (() => Promise<Response>) | undefined;
  let stateResponse: (() => Promise<Response>) | undefined;
  let catalogue: DesktopCatalogue = { entries: [], categories: [], experimentalPluginDiscovery: false };
  let discoveryResponse: (() => Promise<Response>) | undefined;
  const discoveryRequests: string[] = [];
  let historyEntries: HistoryEntry[] = [];
  const resourceRequests: unknown[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).startsWith('/api/discovery?')) { discoveryRequests.push(String(url)); return discoveryResponse ? discoveryResponse() : Response.json(catalogue); }
    if (String(url).startsWith('/api/history')) { historyRequests.push(String(url)); return Response.json({ entries: historyEntries, hasOlder: false, changeCursor: 'c1', status: { revision: 0, sync: 'idle', hasOlder: false } }); }
    if (url === '/api/resource/read') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'r1', source: 'source-a', title: 'Document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }); }
    if (String(url).startsWith('/api/resources')) { resourceRequests.push(String(url)); return Response.json({ resources: [{ uri: 'doc://one', name: 'One' }], nextCursor: 'next' }); }
    if (url === '/api/resource/open') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'opened', position: [1, 0], role: 'assistant', text: '', assets: [], state: 'complete', resources: [{ id: 'r1', source: 'source-a', title: 'Document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }] }); }
    if (url === '/api/discovery/resource/read') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'native-opened', position: [2, 0], role: 'assistant', text: '', assets: [], state: 'complete', resources: [{ id: 'native-r1', source: 'codex', title: 'Native document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }] }); }
    if (url === '/api/command') {
      commands.push(JSON.parse(String(options?.body)) as DesktopCommand);
      return commandResponse ? commandResponse() : Response.json(current);
    }
    if (String(url).startsWith('/api/import')) {
      const params = new URL(String(url), 'http://localhost').searchParams;
      imports.push({ conversationId: params.get('conversationId'), body: options?.body, signal: options?.signal, contentType: new Headers(options?.headers).get('Content-Type'), name: params.get('name'), mediaType: params.get('mediaType') });
      return importResponse ? importResponse() : Response.json({ key: 'new-image', mediaType: 'image/png', size: 1 });
    }
    const state = stateResponse ? await stateResponse() : Response.json(current);
    return Response.json({ kind: 'snapshot', token: 'host:1', sections: await state.json(), removed: [] });
  }) as typeof fetch;
  const vm = createDesktopViewModel();
  await vm.start(); vm.stopPolling();
  return { vm, commands, imports, stored, discoveryRequests, historyRequests, resourceRequests, setHistory(value: HistoryEntry[]) { historyEntries = value; }, setCatalogue(value: DesktopCatalogue) { catalogue = value; },
    deferDiscovery() { let resolve!: (response: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); discoveryResponse = () => { discoveryResponse = undefined; return promise; }; return (response = Response.json(catalogue)) => resolve(response); },
    setState(value: DesktopSnapshot) { current = value; },
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

test('package form submission binds to the displayed request and exposes pending feedback', async () => {
  const h = await harness();
  const next = snapshot();
  next.elicitations = [{ requestId: 'paper-form', source: 'package:one:stationery', operationId: 'op', invocationId: 'call', params: { message: 'Choose paper', requestedSchema: { type: 'object', properties: { paper: { type: 'string', enum: ['plain', 'lined'] } }, required: ['paper'] } } }];
  h.setState(next); await h.vm.start(); h.vm.stopPolling();
  const form = new FormData(); form.set('paper', 'lined');
  expect(await h.vm.submitElicitation('stale', form)).toBe(false);
  expect(h.commands).toHaveLength(0);
  const release = h.deferCommand();
  const submitted = h.vm.submitElicitation('paper-form', form);
  expect(h.vm.pendingCommand).toEqual({ kind: 'elicitation', conversationId: 'conversation-a', requestId: 'paper-form', result: { action: 'accept', content: { paper: 'lined' } } });
  release(); expect(await submitted).toBe(true);
  expect(h.vm.pendingCommand).toBeUndefined();
});

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

test('imports stream the original File with scoped metadata and retain feedback through refresh', async () => {
  const h = await harness(); const resolveImport = h.deferImport();
  const refresh = h.deferState();
  const file = new File(['image'], 'next.png', { type: 'image/png' });
  file.arrayBuffer = async () => { throw Error('Must not buffer the upload'); };
  const files = [file] as unknown as FileList;
  const importing = h.vm.importFiles(files);
  expect(h.vm.importing).toBe(true);
  expect(h.imports).toHaveLength(1);
  expect(h.imports[0]).toMatchObject({ conversationId: 'conversation-a', name: 'next.png', mediaType: 'image/png', contentType: 'application/octet-stream' });
  expect(h.imports[0]!.body).toBe(file);
  await h.vm.importFiles(files);
  expect(h.imports).toHaveLength(1);
  expect(h.vm.importing).toBe(true);
  resolveImport(); await refresh.request;
  expect(h.vm.importing).toBe(true);
  refresh.resolve(); await importing;
  expect(h.vm.importing).toBe(false);
  expect(h.vm.attachmentKeys).toEqual(['new-image']);
});

test('oversize files and failed uploads report errors and clear import feedback', async () => {
  const h = await harness();
  const oversized = new File(['image'], 'oversized.png');
  Object.defineProperty(oversized, 'size', { value: 256 * 1024 * 1024 + 1 });
  await h.vm.importFiles([oversized]);
  expect(h.vm.importing).toBe(false);
  expect(h.vm.error).toContain('256 MiB');
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
  expect(h.commands.at(-1)).toEqual({ kind: 'operator', conversationId: 'conversation-a', workbenchId: 'text', command: { kind: 'revise_document', candidateId: 'candidate-a', artifactId: 'artifact-a', text: 'Edited A' } });
});

test('conversation navigation cancels the previous document editing session', async () => {
  const h = await harness();
  h.vm.editing = true; h.vm.editText = 'Do not apply to B';
  const next = snapshot();
  next.selectedId = 'conversation-b';
  next.conversations = [{ id: 'conversation-b', title: 'B', workbenchId: 'other', provider: 'synthetic', reviewer: 'human' }];
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
  expect(h.stored.get('drawloom-composer:conversation-a')).toBe('Next unsent correction');
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
  expect(h.stored.has('drawloom-composer:conversation-a')).toBe(false);
});

test('reloading untouched conversation B never restores conversation A draft', async () => {
  const h = await harness(); h.vm.draft = 'Draft belonging to A';
  const next = snapshot(); next.selectedId = 'conversation-b';
  next.conversations.push({ id: 'conversation-b', title: 'B', workbenchId: 'text', provider: 'synthetic', reviewer: 'human' });
  h.setState(next); await h.vm.select('conversation-b');
  expect(h.vm.draft).toBe('');
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.draft).toBe('');
  h.setState(snapshot()); await reloaded.select('conversation-a');
  expect(reloaded.draft).toBe('Draft belonging to A');
});

test('first snapshot restores the selected scoped draft even when the legacy draft differs', async () => {
  const h = await harness(); h.vm.draft = 'Saved draft for A';
  h.stored.set('drawloom-composer', 'Unscoped older draft');
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.draft).toBe('Saved draft for A');
  expect(h.stored.get('drawloom-composer')).toBe('Unscoped older draft');
});

test('unowned legacy draft is retained without assigning it to the selected conversation', async () => {
  const h = await harness(); h.stored.set('drawloom-composer', 'Unscoped older draft');
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.draft).toBe('');
  expect(h.stored.has('drawloom-composer:conversation-a')).toBe(false);
  reloaded.draft = 'New scoped draft'; await reloaded.send();
  expect(h.stored.get('drawloom-composer')).toBe('Unscoped older draft');
});

test('reload restores explicit selections and uploaded attachment references without persisting file bytes', async () => {
  const h = await harness(); h.setCatalogue(skillCatalogue); await h.vm.refreshCatalogue(true);
  h.vm.selectDiscovery('native:skill:a'); h.vm.toggleContext('artifact-a');
  h.vm.toggleResource('entry-a', { id: 'r1', source: 'source-a', title: 'Document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } });
  await h.vm.importFiles([new File(['never-persist-these-bytes'], 'reference.png', { type: 'image/png' })]);
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.selectedDiscoveries[0]?.id).toBe('native:skill:a');
  expect(reloaded.contextIds).toEqual(['artifact-a']);
  expect(reloaded.selectedResources[0]?.resourceId).toBe('r1');
  expect(reloaded.attachmentKeys).toEqual(['new-image']);
  expect(reloaded.attachments[0]?.name).toBe('reference.png');
  const saved = [...h.stored.values()].join('');
  expect(saved).not.toContain('never-persist-these-bytes'); expect(saved).not.toContain(btoa('never-persist-these-bytes'));
  reloaded.draft = 'Use references'; await reloaded.send();
  const afterSend = createDesktopViewModel(); await afterSend.start(); afterSend.stopPolling();
  expect(afterSend.selectedDiscoveries).toEqual([]); expect(afterSend.selectedResources).toEqual([]); expect(afterSend.attachments).toEqual([]);
});

test('restored unavailable selections stay removable and never leak into another conversation', async () => {
  const h = await harness(); h.setCatalogue(skillCatalogue); await h.vm.refreshCatalogue(true); h.vm.selectDiscovery('native:skill:a');
  h.setCatalogue({ ...skillCatalogue, entries: [] });
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling(); await reloaded.refreshCatalogue(true);
  expect(reloaded.selectedDiscoveries[0]?.unavailable).toBe(true);
  const next = snapshot(); next.selectedId = 'conversation-b'; h.setState(next); await reloaded.select('conversation-b');
  const bReload = createDesktopViewModel(); await bReload.start(); bReload.stopPolling(); expect(bReload.selectedDiscoveries).toEqual([]);
  h.setState(snapshot()); await bReload.select('conversation-a'); expect(bReload.selectedDiscoveries[0]?.id).toBe('native:skill:a');
  bReload.removeDiscovery('native:skill:a');
  const removed = createDesktopViewModel(); await removed.start(); removed.stopPolling(); expect(removed.selectedDiscoveries).toEqual([]);
});

test('reload of an interrupted upload retains a removable failure instead of pretending its local File survived', async () => {
  const h = await harness(); const release = h.deferImport(); const uploading = h.vm.importFiles([new File(['a'], 'pending.png', { type: 'image/png' })]);
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.attachments[0]?.status).toBe('failed'); expect(reloaded.attachmentKeys).toEqual([]);
  expect(reloaded.canRetryAttachment(reloaded.attachments[0]!.id)).toBe(false);
  reloaded.removeAttachment(reloaded.attachments[0]!.id); expect(reloaded.attachments).toEqual([]);
  release(); await uploading;
});

test('invalid saved reference data cannot replace the scoped text draft or become a selection', async () => {
  const h = await harness(); h.vm.draft = 'Keep text';
  h.stored.set('drawloom-composer-references:conversation-a', '{"version":1,"attachments":[{"asset":{"key":"bad"}}]}');
  const reloaded = createDesktopViewModel(); await reloaded.start(); reloaded.stopPolling();
  expect(reloaded.draft).toBe('Keep text'); expect(reloaded.attachments).toEqual([]); expect(reloaded.selectedDiscoveries).toEqual([]);
  expect(reloaded.error).toContain('could not be restored');
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

const skillCatalogue: DesktopCatalogue = { entries: [
  { id: 'native:skill:a', origin: 'codex', kind: 'skill', name: 'Write', description: 'Write clearly', scope: 'workspace', availability: 'available', selectable: true, revision: 'r1' },
  { id: 'registry:skill:a', origin: 'drawloom', kind: 'skill', name: 'Write', description: 'Write a document', scope: 'optional', availability: 'available', selectable: true, revision: 'r1' },
], categories: [], experimentalPluginDiscovery: false };

test('large catalogue exposes bounded pages but searches every entry and resets expanded pages', async () => {
  const h = await harness();
  h.setCatalogue({ ...skillCatalogue, entries: Array.from({ length: 4301 }, (_, index) => ({ ...skillCatalogue.entries[0]!, id: 'app:' + index, name: index === 4300 ? 'Last searchable integration' : 'Integration ' + index, kind: 'app' as const })) });
  await h.vm.refreshCatalogue(true);
  expect(h.vm.filteredCatalogue).toHaveLength(100); expect(h.vm.catalogueMatchCount).toBe(4301);
  h.vm.showMoreCatalogue(); expect(h.vm.filteredCatalogue).toHaveLength(200);
  h.vm.catalogueQuery = 'Last searchable'; expect(h.vm.filteredCatalogue.map(item => item.id)).toEqual(['app:4300']);
  h.vm.catalogueQuery = ''; expect(h.vm.filteredCatalogue).toHaveLength(100);
  h.vm.openPicker('context'); expect(h.vm.pickerEntries).toHaveLength(100); expect(h.vm.pickerMatchCount).toBe(4301);
  h.vm.showMorePicker(); expect(h.vm.pickerEntries).toHaveLength(200);
  h.vm.pickerQuery = 'Last searchable'; expect(h.vm.pickerEntries.map(item => item.id)).toEqual(['app:4300']);
  h.vm.pickerQuery = ''; expect(h.vm.pickerEntries).toHaveLength(100);
  h.vm.showMoreCatalogue(); h.vm.showMorePicker(); await h.vm.refreshCatalogue(true);
  expect(h.vm.filteredCatalogue).toHaveLength(100); expect(h.vm.pickerEntries).toHaveLength(100);
});

test('resource results and contribution details have explicit bounded expansion', async () => {
  const h = await harness();
  const owner = { ...skillCatalogue.entries[0]!, id: 'owner', kind: 'plugin' as const };
  h.setCatalogue({ ...skillCatalogue, entries: [owner, ...Array.from({ length: 225 }, (_, index) => ({ ...skillCatalogue.entries[0]!, id: 'resource:' + index, name: 'Resource ' + index, kind: 'resource' as const, ownerId: 'owner' }))] });
  await h.vm.refreshCatalogue(true); h.vm.openPicker('context');
  expect(h.vm.nativeResources).toHaveLength(100); expect(h.vm.nativeResourceMatchCount).toBe(225);
  h.vm.showMoreNativeResources(); expect(h.vm.nativeResources).toHaveLength(200);
  h.vm.pickerQuery = 'Resource 224'; expect(h.vm.nativeResources.map(item => item.id)).toEqual(['resource:224']);
  expect(h.vm.contributionOwner('owner')?.name).toBe('Write');
  expect(h.vm.contributionsFor('owner')).toHaveLength(100); expect(h.vm.contributionCount('owner')).toBe(225);
  h.vm.showMoreContributions('owner'); expect(h.vm.contributionsFor('owner')).toHaveLength(200);
  await h.vm.refreshCatalogue(true); expect(h.vm.contributionsFor('owner')).toHaveLength(100);
});

test('picker sends distinct origin identities once and consumes the typed token', async () => {
  const h = await harness(); h.setCatalogue(skillCatalogue); await h.vm.refreshCatalogue(true);
  h.vm.draft = 'Please $Wri'; h.vm.openPicker('skill', { start: 7, end: 11 });
  h.vm.selectDiscovery('native:skill:a'); h.vm.selectDiscovery('native:skill:a'); h.vm.selectDiscovery('registry:skill:a');
  expect(h.vm.draft).toBe('Please ');
  h.vm.draft = 'Please write'; await h.vm.send();
  expect(h.commands.at(-1)).toMatchObject({ selections: [{ id: 'native:skill:a', revision: 'r1' }, { id: 'registry:skill:a', revision: 'r1' }] });
  expect(h.vm.selectedDiscoveries).toEqual([]);
});

test('keyboard discovery follows one rendered selectable identity list', async () => {
  const h = await harness();
  h.setCatalogue({ ...skillCatalogue, entries: [
    { ...skillCatalogue.entries[0]!, id: 'required', scope: 'required' },
    ...skillCatalogue.entries,
  ] });
  await h.vm.refreshCatalogue(true);
  h.vm.draft = 'Please $'; h.vm.openPicker('skill', { start: 7, end: 8 });
  h.vm.movePicker(1);
  expect(h.vm.pickerActiveId).toBe('discovery:native:skill:a');
  h.vm.selectActivePicker();
  expect(h.vm.selectedDiscoveries.map(item => item.id)).toEqual(['native:skill:a']);
  expect(h.vm.draft).toBe('Please ');
});

test('keyboard context navigation can choose a rendered document', async () => {
  const h = await harness(); h.setCatalogue({ ...skillCatalogue, entries: [] }); await h.vm.refreshCatalogue(true);
  h.vm.draft = 'Read @A'; h.vm.openPicker('context', { start: 5, end: 7 });
  h.vm.movePicker(1);
  expect(h.vm.pickerActiveId).toBe('document:artifact-a');
  h.vm.selectActivePicker();
  expect(h.vm.contextIds).toEqual(['artifact-a']);
  expect(h.vm.draft).toBe('Read ');
});

test('refresh preserves stale selection identity and draft when a same-name replacement appears', async () => {
  const h = await harness(); h.setCatalogue(skillCatalogue); await h.vm.refreshCatalogue(true);
  h.vm.selectDiscovery('native:skill:a'); h.vm.draft = 'Keep draft';
  h.setCatalogue({ ...skillCatalogue, entries: [{ ...skillCatalogue.entries[0]!, id: 'native:skill:b', revision: 'r2' }] });
  await h.vm.refreshCatalogue(true);
  expect(h.vm.selectedDiscoveries[0]).toMatchObject({ id: 'native:skill:a', unavailable: true });
  expect(h.vm.draft).toBe('Keep draft');
  h.vm.removeDiscovery('native:skill:a'); expect(h.vm.selectedDiscoveries).toEqual([]);
});

test('catalogue discards a response from the previous conversation', async () => {
  const h = await harness(); const release = h.deferDiscovery(); const pending = h.vm.refreshCatalogue(true);
  const next = snapshot(); next.selectedId = 'conversation-b'; h.setState(next); await h.vm.select('conversation-b');
  release(Response.json(skillCatalogue)); await pending;
  expect(h.vm.catalogue?.entries ?? []).toEqual([]);
});
test('concurrent catalogue reads coalesce and loading updates preserve expanded pages and selections',async()=>{
  const h=await harness();
  h.setCatalogue({...skillCatalogue,entries:Array.from({length:220},(_,n)=>({...skillCatalogue.entries[0]!,id:'skill:'+n})),categories:[{kind:'app',status:'loading'}]});
  await h.vm.refreshCatalogue(true);h.vm.showMoreCatalogue();h.vm.selectDiscovery('skill:0');
  const before=h.discoveryRequests.length,release=h.deferDiscovery();
  const read=h.vm.refreshCatalogue(false,undefined,true);
  await h.vm.refreshCatalogue(true);expect(h.discoveryRequests.length).toBe(before+1);
  release();await read;
  expect(h.vm.filteredCatalogue).toHaveLength(200);
  expect(h.vm.selectedDiscoveries[0]).toMatchObject({id:'skill:0',unavailable:false});
});
test('explicit native page forwards only its opaque cursor and does not force refresh',async()=>{
  const h=await harness();h.setCatalogue({...skillCatalogue,nextCursor:'opaque+next'});
  await h.vm.refreshCatalogue(true);
  await h.vm.refreshCatalogue(false,h.vm.catalogue!.nextCursor);
  expect(h.discoveryRequests.at(-1)).toBe('/api/discovery?conversationId=conversation-a&cursor=opaque%2Bnext');
});

test('temporary discovery failure keeps cached references and draft, while opening the picker reuses cache', async () => {
  const h = await harness(); h.setCatalogue(skillCatalogue); await h.vm.refreshCatalogue(true);
  h.vm.selectDiscovery('native:skill:a'); h.vm.draft = 'Keep this';
  const requests = h.discoveryRequests.length; h.vm.openPicker('skill');
  expect(h.discoveryRequests).toHaveLength(requests);
  const release = h.deferDiscovery(); const refresh = h.vm.refreshCatalogue(true);
  release(Response.json({ error: 'Discovery offline' }, { status: 503 })); await refresh;
  expect(h.vm.catalogueError).toBe('Discovery offline'); expect(h.vm.cataloguePending).toBe(false);
  expect(h.vm.selectedDiscoveries[0]?.id).toBe('native:skill:a'); expect(h.vm.draft).toBe('Keep this');
});

test('navigation aborts upload and preserves a retryable cancelled reference in its original draft', async () => {
  const h = await harness(); h.vm.draft = 'Draft A';
  const release = h.deferImport(); const uploading = h.vm.importFiles([new File(['a'], 'a.png', { type: 'image/png' })]);
  const next = snapshot(); next.selectedId = 'conversation-b'; h.setState(next);
  const previous=globalThis.fetch;
  globalThis.fetch=(async (url,init)=>{if(url==='/api/command')expect(h.imports[0]?.signal?.aborted).toBe(true);return previous(url,init);}) as typeof fetch;
  await h.vm.select('conversation-b');globalThis.fetch=previous;
  expect(h.vm.draft).toBe('');
  expect(h.imports[0]?.signal?.aborted).toBe(true);
  release(); await uploading;
  expect(h.imports[0]).toMatchObject({ conversationId: 'conversation-a' });
  expect(h.vm.attachments).toEqual([]);
  h.setState(snapshot()); await h.vm.select('conversation-a');
  expect(h.vm.draft).toBe('Draft A'); expect(h.vm.attachments[0]).toMatchObject({ name: 'a.png', status: 'failed', error: 'Import cancelled. Retry to attach this file.' });
  const retryRelease = h.deferImport(); const retrying = h.vm.retryAttachment(h.vm.attachments[0]!.id);
  retryRelease(); await retrying;
  expect(h.vm.attachments).toHaveLength(1); expect(h.vm.attachmentKeys).toEqual(['new-image']);
});

test('successful attachment retry clears its error without navigating away from the composer', async () => {
  const h = await harness();
  const fail = h.deferImport();
  const first = h.vm.importFiles([new File(['a'],'a.txt',{type:'text/plain'})]);
  fail(Response.json({error:'Upload failed'},{status:400})); await first;
  expect(h.vm.error).toBe('Upload failed');
  const succeed = h.deferImport();
  const retry = h.vm.retryAttachment(h.vm.attachments[0]!.id);
  succeed(); await retry;
  expect(h.vm.error).toBe('');
  expect(h.vm.attachments[0]?.status).toBe('ready');
  expect(h.vm.detailsOpen).toBe(false);
});

test('native resource opening submits its catalogue identity and displays the captured reference without selecting it', async () => {
  const h = await harness(); h.setCatalogue({ ...skillCatalogue, entries: [{ id: 'codex:resource:one', origin: 'codex', kind: 'resource', name: 'Native document', description: '', scope: 'server', availability: 'available', selectable: false, readable: true, revision: 'r1' }] });
  await h.vm.refreshCatalogue(true); await h.vm.openNativeResource('codex:resource:one');
  expect(h.resourceRequests).toEqual([{ conversationId: 'conversation-a', id: 'codex:resource:one', revision: 'r1' }]);
  expect(h.vm.openedResources[0]?.id).toBe('native-opened'); expect(h.vm.selectedResources).toEqual([]);
});

test('removing a pending attachment prevents its eventual upload from entering the draft', async () => {
  const h = await harness(); const release = h.deferImport();
  const uploading = h.vm.importFiles([new File(['a'], 'a.png', { type: 'image/png' })]);
  h.vm.removeAttachment(h.vm.attachments[0]!.id);
  await Promise.resolve();
  expect(h.imports[0]?.signal?.aborted).toBe(true);
  release(); await uploading;
  expect(h.vm.attachments).toEqual([]); expect(h.vm.attachmentKeys).toEqual([]);
});

test('resource reads use history identity and only ready text becomes explicit draft context', async () => {
  const h = await harness();
  const resource = { id: 'r1', source: 'source-a', title: 'Document', status: 'readable' as const, uri: 'doc://one' };
  h.setHistory([{ id: 'entry-a', position: [1, 0], role: 'assistant', text: '', assets: [], state: 'complete', resources: [resource] }]); await h.vm.loadLatest();
  h.vm.toggleResource('entry-a', resource); expect(h.vm.selectedResources).toEqual([]);
  await h.vm.readResource('entry-a', resource);
  expect(h.resourceRequests).toEqual([{ conversationId: 'conversation-a', entryId: 'entry-a', resourceId: 'r1' }]);
  h.vm.draft = 'Read @'; h.vm.openPicker('context', { start: 5, end: 6 });
  h.vm.toggleResource('entry-a', h.vm.resource('entry-a', resource));
  expect(h.vm.draft).toBe('Read '); expect(h.vm.pickerOpen).toBe(false);
  h.vm.draft = 'Read document'; await h.vm.send();
  expect(h.commands.at(-1)).toMatchObject({ resourceSelections: [{ entryId: 'entry-a', resourceId: 'r1' }] });
  expect(h.vm.selectedResources).toEqual([]);
});

test('resource browsing uses its view and cursor, while opening sends only the listed source identity', async () => {
  const h = await harness();
  await h.vm.browseResources('view-a'); await h.vm.browseResources('view-a', true);
  expect(h.resourceRequests).toEqual(['/api/resources?conversationId=conversation-a&viewId=view-a', '/api/resources?conversationId=conversation-a&viewId=view-a&cursor=next']);
  await h.vm.openResource('view-a', 'doc://one');
  expect(h.resourceRequests.at(-1)).toEqual({ conversationId: 'conversation-a', viewId: 'view-a', uri: 'doc://one' });
  expect(h.vm.openedResources[0]?.id).toBe('opened');
  expect(h.vm.openedResources[0]?.resources?.[0]?.status).toBe('ready');
  expect(h.vm.selectedResources).toEqual([]);
});

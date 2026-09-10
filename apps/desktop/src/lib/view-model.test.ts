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
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function snapshot(): DesktopSnapshot {
  return {
    views: [],
    activeContext: '',
    pendingTools: [],
    workspace: 'Test workspace', selectedId: 'conversation-a',
    conversations: [{ id: 'conversation-a', title: 'A', workbenchId: 'text', provider: 'synthetic', reviewer: 'human' }],
    workbenches: [{ id: 'text', title: 'Text', description: '', tools: [], skills: [] }],
    signals: [], activity: [], controls: { steer: false, interrupt: false, reviewerModes: ['human'] }, plugins: [], notice: '',
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
  let catalogue: DesktopCatalogue = { entries: [], categories: [], experimentalPluginDiscovery: false };
  let discoveryResponse: (() => Promise<Response>) | undefined;
  const discoveryRequests: string[] = [];
  let historyEntries: HistoryEntry[] = [];
  const resourceRequests: unknown[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).startsWith('/api/discovery?')) { discoveryRequests.push(String(url)); return discoveryResponse ? discoveryResponse() : Response.json(catalogue); }
    if (String(url).startsWith('/api/history')) return Response.json({ entries: historyEntries, hasOlder: false, changeCursor: 'c1', status: { revision: 0, sync: 'idle', hasOlder: false } });
    if (url === '/api/resource/read') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'r1', source: 'source-a', title: 'Document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }); }
    if (String(url).startsWith('/api/resources')) { resourceRequests.push(String(url)); return Response.json({ resources: [{ uri: 'doc://one', name: 'One' }], nextCursor: 'next' }); }
    if (url === '/api/resource/open') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'opened', position: [1, 0], role: 'assistant', text: '', assets: [], state: 'complete', resources: [{ id: 'r1', source: 'source-a', title: 'Document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }] }); }
    if (url === '/api/discovery/resource/read') { resourceRequests.push(JSON.parse(String(options?.body))); return Response.json({ id: 'native-opened', position: [2, 0], role: 'assistant', text: '', assets: [], state: 'complete', resources: [{ id: 'native-r1', source: 'codex', title: 'Native document', status: 'ready', asset: { key: 'text-asset', mediaType: 'text/plain', size: 1 } }] }); }
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
  return { vm, commands, imports, stored, discoveryRequests, resourceRequests, setHistory(value: HistoryEntry[]) { historyEntries = value; }, setCatalogue(value: DesktopCatalogue) { catalogue = value; },
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

test('upload completion stays with its draft across navigation and failure can retry in place', async () => {
  const h = await harness(); h.vm.draft = 'Draft A';
  const release = h.deferImport(); const uploading = h.vm.importFiles([new File(['a'], 'a.png', { type: 'image/png' })]);
  const next = snapshot(); next.selectedId = 'conversation-b'; h.setState(next); await h.vm.select('conversation-b');
  expect(h.vm.draft).toBe('');
  release(Response.json({ error: 'Try again' }, { status: 500 })); await uploading;
  expect(h.imports[0]).toMatchObject({ conversationId: 'conversation-a' });
  expect(h.vm.attachments).toEqual([]);
  h.setState(snapshot()); await h.vm.select('conversation-a');
  expect(h.vm.draft).toBe('Draft A'); expect(h.vm.attachments[0]).toMatchObject({ name: 'a.png', status: 'failed' });
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
  h.vm.removeAttachment(h.vm.attachments[0]!.id); release(); await uploading;
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

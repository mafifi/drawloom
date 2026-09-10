import { DesktopCatalogueSchema, DesktopSnapshotSchema, DesktopStateUpdateSchema, type DesktopCatalogue, type DesktopSnapshot, type DesktopCommand } from './protocol.js';
import { createHistoryPager, type HistoryPresentation } from './history-pager.js';
import { AssetSchema, JsonValueSchema, ResourceReferenceSchema, type ResourceReference, type Asset } from '@drawloom/host';
import { HistoryEntrySchema, type HistoryEntry } from '@drawloom/conversation-history';
import { ListResourcesResultSchema, type ListResourcesResult } from '@modelcontextprotocol/sdk/types.js';
import type { OperatorCommand } from '@drawloom/workbench';
import { z } from 'zod';
type Discovery = DesktopCatalogue['entries'][number];
type Attachment = { id: string; name: string; size: number; mediaType: string; status: 'pending' | 'ready' | 'failed'; error: string; asset?: Asset };
type SelectedResource = { entryId: string; resourceId: string; title: string; source: string };
type SavedDraft = { text: string; attachments: Attachment[]; contextIds: string[]; selections: Discovery[]; resources: SelectedResource[] };
// Local draft metadata is untrusted and contains references only, never File data.
const DraftReferencesSchema = z.strictObject({
  version: z.literal(1),
  attachments: z.array(z.strictObject({ id: z.string(), name: z.string(), size: z.number().nonnegative(), mediaType: z.string(), asset: AssetSchema.optional() })).max(64),
  contextIds: z.array(z.string()).max(64),
  selections: z.array(DesktopCatalogueSchema.shape.entries.element.pick({ id: true, revision: true, name: true, origin: true, kind: true, scope: true })).max(64),
  resources: z.array(z.strictObject({ entryId: z.string(), resourceId: z.string(), title: z.string(), source: z.string() })).max(64),
});
export function createDesktopViewModel() {
  let state = $state<DesktopSnapshot>();
  let history = $state<HistoryPresentation>({ entries: [], loading: false, error: '', hasOlder: false, atLatest: true });
  const pager = createHistoryPager((url, init) => fetch(url, init), value => { history = value; });
  let stateToken: string | undefined, requestEpoch = 0, refreshingEpoch: number | undefined;
  let stateRead = new AbortController();
  let draft = $state(''), error = $state(''), busy = $state(false);
  let pendingCommand = $state<DesktopCommand>();
  // Feedback belongs to the initiating control; rejected overlapping work must
  // not replace it. Imports are independent so the next draft remains editable.
  let creationSource = $state<'new' | 'workbench' | 'provider'>();
  let importing = $state(false);
  let detailsOpen = $state(false), contextOpen = $state(false);
  let pane = $state<'preview' | 'details'>('preview');
  let primaryView = $state<'conversation' | 'plugins' | 'settings'>('conversation');
  let attachmentKeys = $state<string[]>([]), contextIds = $state<string[]>([]);
  let attachmentNames = $state<Record<string, string>>({});
  let attachments = $state<Attachment[]>([]), selections = $state<Discovery[]>([]);
  const drafts = new Map<string, SavedDraft>(), files = new Map<string, File>();
  let selectionVersion = 0;
  let catalogue = $state<DesktopCatalogue>(), cataloguePending = $state(false), catalogueError = $state('');
  let catalogueQuery = $state('');
  const catalogueCache = new Map<string, DesktopCatalogue>();
  let catalogueEpoch = 0;
  let pickerOpen = $state(false), pickerKind = $state<'skill' | 'context'>('skill'), pickerQuery = $state(''), pickerActiveId = $state('');
  const discoveryPageSize = 100;
  let catalogueLimit = $state(discoveryPageSize), pickerLimit = $state(discoveryPageSize), nativeResourceLimit = $state(discoveryPageSize);
  let contributionLimits = $state<Record<string, number>>({});
  const catalogueMatches = $derived(catalogue?.entries.filter(entry => [entry.name, entry.description, entry.origin, entry.kind, entry.scope, entry.ownerId].join(' ').toLowerCase().includes(catalogueQuery.toLowerCase())) ?? []);
  const pickerMatches = $derived(catalogue?.entries.filter(entry => (pickerKind === 'skill' ? entry.kind === 'skill' : entry.kind === 'app' || entry.kind === 'plugin') && [entry.name, entry.description, entry.origin].join(' ').toLowerCase().includes(pickerQuery.toLowerCase())) ?? []);
  const pickerDocuments = $derived(pickerKind === 'context' ? state?.operator.artifacts.filter(item => item.content.kind === 'text' && contextLabel(item.id).toLowerCase().includes(pickerQuery.toLowerCase())) ?? [] : []);
  const pickerOptions = $derived([
    ...pickerMatches.slice(0, pickerLimit).map(entry => ({ id: 'discovery:' + entry.id, kind: 'discovery' as const, targetId: entry.id, selectable: entry.selectable && entry.availability === 'available' && entry.scope !== 'required' })),
    ...pickerDocuments.map(artifact => ({ id: 'document:' + artifact.id, kind: 'document' as const, targetId: artifact.id, selectable: true })),
  ]);
  const nativeResourceMatches = $derived(catalogue?.entries.filter(entry => entry.kind === 'resource' && [entry.name, entry.description, entry.origin].join(' ').toLowerCase().includes(pickerQuery.toLowerCase())) ?? []);
  const contributionOwners = $derived(new Map(catalogue?.entries.map(entry => [entry.id, entry]) ?? []));
  const contributions = $derived.by(() => {
    const byOwner = new Map<string, Discovery[]>();
    for (const entry of catalogue?.entries ?? []) if (entry.ownerId) { const children = byOwner.get(entry.ownerId); if (children) children.push(entry); else byOwner.set(entry.ownerId, [entry]); }
    return byOwner;
  });
  function resetDiscoveryPages() { catalogueLimit = discoveryPageSize; pickerLimit = discoveryPageSize; nativeResourceLimit = discoveryPageSize; contributionLimits = {}; }
  let pickerToken: { start: number; end: number; text: string } | undefined;
  let selectedResources = $state<SelectedResource[]>([]), resourceVersion = 0, resourceEpoch = 0;
  let resourceOverrides = $state<Record<string, ResourceReference>>({}), resourcePending = $state<Record<string, boolean>>({}), resourceErrors = $state<Record<string, string>>({});
  let resourceListings = $state<Record<string, ListResourcesResult>>({}), openedResources = $state<HistoryEntry[]>([]);
  const resourceKey = (entryId: string, resourceId: string) => JSON.stringify([entryId, resourceId]);
  const selectedDiscoveries = $derived(selections.map(entry => ({ ...entry, unavailable: !catalogue?.entries.some(current => current.id === entry.id && current.revision === entry.revision && current.availability === 'available' && current.selectable) })));
  let candidateId = $state(''), artifactId = $state(''), groupId = $state(''), compare = $state(false), editing = $state(false), editText = $state('');
  let editTarget: Readonly<{ conversationId: string; workbenchId: string; candidateId: string; artifactId: string }> | undefined;
  let reviewSummary = $state('');
  let reviewTarget = $state<string>();
  let draftVersion = 0, attachmentVersion = 0, contextVersion = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const conversation = $derived(state?.conversations.find(c => c.id === state?.selectedId));
  const group = $derived(state?.operator.groups?.find(g => g.id === groupId));
  const candidates = $derived(state?.operator.candidates.filter(c => !group || group.candidateIds.includes(c.id)) ?? []);
  const artifacts = $derived(state?.operator.artifacts.filter(a => !group || group.artifactIds.includes(a.id) || candidates.some(c => c.artifactIds.includes(a.id))) ?? []);
  const candidate = $derived(artifactId ? candidates.find(c => c.id === candidateId && c.artifactIds.includes(artifactId)) : candidates.find(c => c.id === candidateId) ?? candidates.find(c => c.id === state?.operator.selectedCandidateId) ?? candidates.at(-1));
  const artifact = $derived(artifacts.find(a => a.id === artifactId) ?? artifacts.find(a => candidate?.artifactIds.includes(a.id)) ?? artifacts[0]);
  const comparableCandidates = $derived(candidate?.comparisonKey ? candidates.filter(c => c.id !== candidate.id && c.comparisonKey === candidate.comparisonKey && !c.reviewAction) : []);
  async function response(res: Response) { const data: unknown = await res.json(); if (!res.ok) throw Error(typeof data === 'object' && data && 'error' in data ? String(data.error) : 'Local host unavailable'); return data; }
  function cancelEdit() { editing = false; editText = ''; editTarget = undefined; reviewSummary = ''; }
  function persistReferences(id: string, saved: SavedDraft) {
    try {
      const key = 'drawloom-composer-references:' + id;
      if (!saved.attachments.length && !saved.contextIds.length && !saved.selections.length && !saved.resources.length) { localStorage.removeItem(key); return; }
      localStorage.setItem(key, JSON.stringify({ version: 1,
        attachments: saved.attachments.map(({ id, name, size, mediaType, asset }) => ({ id, name, size, mediaType, ...(asset ? { asset } : {}) })),
        contextIds: saved.contextIds,
        selections: saved.selections.map(({ id, revision, name, origin, kind, scope }) => ({ id, revision, name, origin, kind, scope })), resources: saved.resources,
      }));
    } catch { error = 'Draft references could not be saved on this device.'; }
  }
  function restoreDraft(id: string): SavedDraft | undefined {
    try {
      const raw = localStorage.getItem('drawloom-composer-references:' + id); if (!raw) return;
      const saved = DraftReferencesSchema.parse(JSON.parse(raw));
      return { text: localStorage.getItem('drawloom-composer:' + id) ?? '', contextIds: saved.contextIds, resources: saved.resources,
        selections: saved.selections.map(entry => ({ ...entry, description: '', availability: 'unverified', selectable: false })),
        attachments: saved.attachments.map(item => ({ ...item, status: item.asset ? 'ready' : 'failed', error: item.asset ? '' : 'The original file is no longer attached. Remove this item and choose the file again.' })),
      };
    } catch { error = 'Saved draft references could not be restored. The message text is retained.'; return; }
  }
  function saveDraft(id: string) { const saved = { text: draft, attachments, contextIds, selections, resources: selectedResources }; drafts.set(id, saved); persistReferences(id, saved); }
  function saveCurrentReferences() { if (state) saveDraft(state.selectedId); }
  function setDraft(text: string) { draftVersion++; draft = text; if (state) localStorage.setItem('drawloom-composer:' + state.selectedId, text); }
  async function refreshCatalogue(force = false) {
    const id = state?.selectedId;
    if (!id) return;
    if (!force && catalogueCache.has(id)) { catalogue = catalogueCache.get(id); return; }
    const epoch = ++catalogueEpoch; cataloguePending = true; catalogueError = '';
    try {
      const value = DesktopCatalogueSchema.parse(await response(await fetch('/api/discovery?conversationId=' + encodeURIComponent(id) + (force ? '&refresh=1' : ''))));
      if (epoch !== catalogueEpoch || state?.selectedId !== id) return;
      catalogueCache.set(id, value); catalogue = value; resetDiscoveryPages();
    } catch (e) { if (epoch === catalogueEpoch) catalogueError = e instanceof Error ? e.message : 'Discovery unavailable'; }
    finally { if (epoch === catalogueEpoch) cataloguePending = false; }
  }
  function openPicker(kind: 'skill' | 'context', token?: { start: number; end: number }) {
    pickerLimit = discoveryPageSize; nativeResourceLimit = discoveryPageSize;
    pickerKind = kind; pickerQuery = token ? draft.slice(token.start + 1, token.end) : ''; pickerToken = token ? { ...token, text: draft.slice(token.start, token.end) } : undefined;
    pickerActiveId = ''; pickerOpen = true; void refreshCatalogue();
  }
  function consumePickerToken() {
    if (pickerToken && draft.slice(pickerToken.start, pickerToken.end) === pickerToken.text) setDraft(draft.slice(0, pickerToken.start) + draft.slice(pickerToken.end));
    pickerToken = undefined; pickerOpen = false;
  }
  function contextLabel(id: string) { const a = state?.operator.artifacts.find(a => a.id === id); const c = state?.operator.candidates.find(c => c.artifactIds.includes(id)); return [a?.title ?? 'Document', c?.label, c?.status.replace('_', ' '), c?.id === state?.operator.selectedCandidateId ? 'selected' : undefined].filter(Boolean).join(' · '); }
  function selectDiscovery(id: string) {
    const entry = catalogue?.entries.find(item => item.id === id);
    if (!entry || !entry.selectable || entry.availability !== 'available' || entry.scope === 'required') return;
    if (!selections.some(item => item.id === id)) { selections = [...selections, entry]; selectionVersion++; }
    consumePickerToken(); saveCurrentReferences();
  }
  function selectPickerContext(id: string) {
    if (!contextIds.includes(id)) { contextIds = [...contextIds, id]; contextVersion++; }
    consumePickerToken(); saveCurrentReferences();
  }
  function project(raw: unknown) {
    const next = DesktopSnapshotSchema.parse(raw);
    if (editTarget && (editTarget.conversationId !== next.selectedId || next.conversations.find(c => c.id === next.selectedId)?.workbenchId !== editTarget.workbenchId)) cancelEdit();
    const navigation = state?.selectedId !== next.selectedId;
    const previousId = state?.selectedId;
    if (navigation && previousId) saveDraft(previousId);
    state = next;
    if (navigation) {
      const saved = drafts.get(next.selectedId) ?? restoreDraft(next.selectedId);
      // The legacy unqualified key has no conversation owner. Preserve it in
      // storage, but never infer ownership from whichever snapshot loads first.
      draft = saved?.text ?? localStorage.getItem('drawloom-composer:' + next.selectedId) ?? '';
      attachments = saved?.attachments ?? []; attachmentKeys = attachments.flatMap(item => item.asset ? [item.asset.key] : []);
      contextIds = saved?.contextIds ?? []; selections = saved?.selections ?? []; selectedResources = saved?.resources ?? [];
      draftVersion++; attachmentVersion++; contextVersion++; selectionVersion++;
      resourceEpoch++; resourceVersion++; resourceOverrides = {}; resourcePending = {}; resourceErrors = {}; resourceListings = {}; openedResources = [];
      catalogueEpoch++; cataloguePending = false; catalogueError = ''; catalogue = catalogueCache.get(next.selectedId); pickerOpen = false;
      catalogueQuery = ''; pickerQuery = ''; resetDiscoveryPages();
      void pager.open(next.selectedId); void refreshCatalogue();
    }
  }
  async function refresh() {
    if (refreshingEpoch === requestEpoch || busy) return;
    const captured = requestEpoch;
    refreshingEpoch = captured;
    try {
      const res = await fetch('/api/state' + (stateToken ? '?since=' + encodeURIComponent(stateToken) : ''), { signal: stateRead.signal });
      if (res.status !== 204) {
        const update = DesktopStateUpdateSchema.parse(await response(res));
        if (captured !== requestEpoch) return;
        const merged: Record<string, unknown> = update.kind === 'snapshot' ? { ...update.sections } : { ...state, ...update.sections };
        for (const key of update.removed) delete merged[key];
        project(merged); stateToken = update.token;
      }
      if (captured === requestEpoch) await pager.poll();
    } catch (e) { if (captured === requestEpoch) { error = e instanceof Error ? e.message : 'Local host unavailable'; stateToken = undefined; } }
    finally { if (refreshingEpoch === captured) refreshingEpoch = undefined; }
  }
  async function command(value: DesktopCommand) {
    if (busy) return false;
    busy = true; pendingCommand = value; error = '';
    stateRead.abort(); stateRead = new AbortController(); requestEpoch++; pager.invalidate();
    try { project(await response(await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }))); return true; }
    catch (e) { error = e instanceof Error ? e.message : 'Operation failed'; return false; }
    finally { busy = false; pendingCommand = undefined; }
  }
  async function operator(commandValue: OperatorCommand) { if (!conversation) return false; return command({ kind: 'operator', workbenchId: conversation.workbenchId, command: commandValue }); }
  function changeAttachments(id: string, change: (items: Attachment[]) => Attachment[]) {
    if (state?.selectedId === id) { attachments = change(attachments); attachmentKeys = [...new Set(attachments.flatMap(item => item.status === 'ready' && item.asset ? [item.asset.key] : []))]; attachmentVersion++; saveCurrentReferences(); }
    else { const saved = drafts.get(id); if (saved) { saved.attachments = change(saved.attachments); persistReferences(id, saved); } }
  }
  async function upload(id: string, item: Attachment) {
    const file = files.get(item.id); if (!file) return;
    if (state?.selectedId === id && error === item.error) error = '';
    changeAttachments(id, items => items.map(a => a.id === item.id ? { ...a, status: 'pending', error: '' } : a));
    try {
      if (file.size > 16 * 1024 * 1024) throw Error('Files must be smaller than 16 MB.');
      const data = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of data) binary += String.fromCharCode(byte);
      const asset = AssetSchema.parse(await response(await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: id, name: file.name, mediaType: item.mediaType, base64: btoa(binary) }) })));
      changeAttachments(id, items => items.map(a => a.id === item.id ? { ...a, status: 'ready', asset, error: '' } : a));
      attachmentNames[asset.key] = file.name;
      if (state?.selectedId === id) { await refresh(); if (!editing) candidateId = ''; }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Import failed';
      changeAttachments(id, items => items.map(a => a.id === item.id ? { ...a, status: 'failed', error: message } : a));
      if (state?.selectedId === id) error = message;
    }
  }
  return {
    get catalogueQuery() { return catalogueQuery; }, set catalogueQuery(v: string) { catalogueQuery = v; catalogueLimit = discoveryPageSize; contributionLimits = {}; },
    get filteredCatalogue() { return catalogueMatches.slice(0, catalogueLimit); }, get catalogueMatchCount() { return catalogueMatches.length; },
    showMoreCatalogue() { catalogueLimit += discoveryPageSize; },
    get pickerEntries() { return pickerMatches.slice(0, pickerLimit); }, get pickerMatchCount() { return pickerMatches.length; },
    showMorePicker() { pickerLimit += discoveryPageSize; },
    get nativeResources() { return nativeResourceMatches.slice(0, nativeResourceLimit); }, get nativeResourceMatchCount() { return nativeResourceMatches.length; },
    showMoreNativeResources() { nativeResourceLimit += discoveryPageSize; },
    contributionOwner(id: string) { return contributionOwners.get(id); },
    contributionsFor(id: string) { return contributions.get(id)?.slice(0, contributionLimits[id] ?? discoveryPageSize) ?? []; },
    contributionCount(id: string) { return contributions.get(id)?.length ?? 0; },
    showMoreContributions(id: string) { contributionLimits[id] = (contributionLimits[id] ?? discoveryPageSize) + discoveryPageSize; },
    async openNativeResource(id: string) {
      const entry = catalogue?.entries.find(item => item.id === id), conversationId = state?.selectedId, key = resourceKey('native', id), epoch = resourceEpoch;
      if (!conversationId || !entry?.readable || entry.kind !== 'resource' || entry.availability !== 'available' || resourcePending[key]) return;
      resourcePending[key] = true; resourceErrors[key] = '';
      try {
        const opened = HistoryEntrySchema.parse(await response(await fetch('/api/discovery/resource/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId, id, revision: entry.revision }) })));
        if (epoch === resourceEpoch) openedResources = [...openedResources.filter(item => item.id !== opened.id), opened];
      } catch (e) { if (epoch === resourceEpoch) resourceErrors[key] = e instanceof Error ? e.message : 'Resource unavailable'; }
      finally { if (epoch === resourceEpoch) resourcePending[key] = false; }
    },
    get selectedResources() { return selectedResources; }, get resourceListings() { return resourceListings; }, get openedResources() { return openedResources; },
    resource(entryId: string, value: ResourceReference) { return resourceOverrides[resourceKey(entryId, value.id)] ?? value; },
    resourceIsPending(entryId: string, id: string) { return resourcePending[resourceKey(entryId, id)] ?? false; },
    resourceError(entryId: string, id: string) { return resourceErrors[resourceKey(entryId, id)] ?? ''; },
    toggleResource(entryId: string, value: ResourceReference) {
      const existing = selectedResources.some(item => item.entryId === entryId && item.resourceId === value.id);
      if (existing) selectedResources = selectedResources.filter(item => item.entryId !== entryId || item.resourceId !== value.id);
      else if (value.status === 'ready' && value.asset?.mediaType.startsWith('text/')) { selectedResources = [...selectedResources, { entryId, resourceId: value.id, title: value.title, source: value.source }]; consumePickerToken(); }
      resourceVersion++;
      saveCurrentReferences();
    },
    removeResource(entryId: string, id: string) { selectedResources = selectedResources.filter(item => item.entryId !== entryId || item.resourceId !== id); resourceVersion++; saveCurrentReferences(); },
    async readResource(entryId: string, value: ResourceReference) {
      const key = resourceKey(entryId, value.id), id = state?.selectedId, epoch = resourceEpoch;
      if (!id || value.status !== 'readable' || resourcePending[key]) return;
      resourcePending[key] = true; resourceErrors[key] = '';
      try {
        const result = ResourceReferenceSchema.parse(await response(await fetch('/api/resource/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: id, entryId, resourceId: value.id }) })));
        if (epoch !== resourceEpoch) return;
        if (result.id !== value.id || result.source !== value.source) throw Error('Resource identity changed. Refresh history to inspect it.');
        resourceOverrides[key] = result;
      } catch (e) { if (epoch === resourceEpoch) resourceErrors[key] = e instanceof Error ? e.message : 'Resource unavailable'; }
      finally { if (epoch === resourceEpoch) resourcePending[key] = false; }
    },
    async browseResources(viewId: string, more = false) {
      const key = resourceKey(viewId, 'list'), id = state?.selectedId, epoch = resourceEpoch;
      if (!id || resourcePending[key]) return;
      resourcePending[key] = true; resourceErrors[key] = '';
      const previous = resourceListings[viewId];
      try {
        const params = new URLSearchParams({ conversationId: id, viewId }); if (more && previous?.nextCursor) params.set('cursor', previous.nextCursor);
        const result = ListResourcesResultSchema.parse(await response(await fetch('/api/resources?' + params)));
        if (epoch === resourceEpoch) resourceListings[viewId] = { ...result, resources: [...new Map([...(more ? previous?.resources ?? [] : []), ...result.resources].map(item => [item.uri, item])).values()] };
      } catch (e) { if (epoch === resourceEpoch) resourceErrors[key] = e instanceof Error ? e.message : 'Resources unavailable'; }
      finally { if (epoch === resourceEpoch) resourcePending[key] = false; }
    },
    async openResource(viewId: string, uri: string) {
      const key = resourceKey(viewId, uri), id = state?.selectedId, epoch = resourceEpoch;
      if (!id || resourcePending[key] || !resourceListings[viewId]?.resources.some(item => item.uri === uri)) return;
      resourcePending[key] = true; resourceErrors[key] = '';
      try {
        const entry = HistoryEntrySchema.parse(await response(await fetch('/api/resource/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: id, viewId, uri }) })));
        if (epoch === resourceEpoch) openedResources = [...openedResources.filter(item => item.id !== entry.id), entry];
      } catch (e) { if (epoch === resourceEpoch) resourceErrors[key] = e instanceof Error ? e.message : 'Resource unavailable'; }
      finally { if (epoch === resourceEpoch) resourcePending[key] = false; }
    },
    get catalogue() { return catalogue; }, get cataloguePending() { return cataloguePending; }, get catalogueError() { return catalogueError; }, refreshCatalogue,
    get selectedDiscoveries() { return selectedDiscoveries; },
    get pickerOpen() { return pickerOpen; }, set pickerOpen(v: boolean) { pickerOpen = v; if (!v) pickerToken = undefined; },
    get pickerKind() { return pickerKind; }, get pickerQuery() { return pickerQuery; }, set pickerQuery(v: string) { pickerQuery = v; pickerActiveId = ''; pickerLimit = discoveryPageSize; nativeResourceLimit = discoveryPageSize; }, openPicker,
    get pickerActiveId() { return pickerActiveId; }, set pickerActiveId(v: string) { if (!v || pickerOptions.some(option => option.id === v && option.selectable)) pickerActiveId = v; },
    movePicker(delta: number) {
      const available = pickerOptions.filter(option => option.selectable);
      if (!available.length) return;
      const current = available.findIndex(option => option.id === pickerActiveId);
      pickerActiveId = available[(current < 0 ? (delta > 0 ? 0 : available.length - 1) : (current + delta + available.length) % available.length)]!.id;
    },
    selectActivePicker() {
      const option = pickerOptions.find(item => item.id === pickerActiveId && item.selectable);
      if (option?.kind === 'discovery') selectDiscovery(option.targetId);
      else if (option?.kind === 'document') selectPickerContext(option.targetId);
    },
    selectDiscovery,
    removeDiscovery(id: string) { selections = selections.filter(item => item.id !== id); selectionVersion++; saveCurrentReferences(); },
    selectPickerContext,
    get attachments() { return attachments; },
    get history() { return history; },
    loadEarlier: () => pager.earlier(), loadLatest: () => pager.latest(),
    get state() { return state; }, get conversation() { return conversation; }, get candidate() { return candidate; }, get artifact() { return artifact; },
    get candidates() { return candidates; }, get artifacts() { return artifacts; }, get comparableCandidates() { return comparableCandidates; },
    get groupId() { return groupId; }, set groupId(v: string) { cancelEdit(); groupId = v; candidateId = ''; artifactId = ''; compare = false; },
    get canSend() { return conversation?.provider !== 'synthetic' || conversation.workbenchId === 'text'; },
    get draft() { return draft; }, set draft(v: string) { setDraft(v); },
    get error() { return error; }, get busy() { return busy; },
    get pendingCommand() { return pendingCommand; },
    get creationSource() { return creationSource; }, get importing() { return importing; },
    get detailsOpen() { return detailsOpen; }, set detailsOpen(v: boolean) { detailsOpen = v; },
    get pane() { return pane; }, set pane(v: typeof pane) { pane = v; detailsOpen = true; },
    get primaryView() { return primaryView; }, set primaryView(v: typeof primaryView) { primaryView = v; pickerOpen = false; if (v === 'plugins') void refreshCatalogue(); },
    get contextOpen() { return contextOpen; }, set contextOpen(v: boolean) { contextOpen = v; },
    get attachmentKeys() { return attachmentKeys; }, get contextIds() { return contextIds; },
    attachmentName(key: string) { return attachmentNames[key] ?? 'Attachment'; },
    get candidateId() { return candidateId; }, set candidateId(v: string) { cancelEdit(); candidateId = v; artifactId = ''; },
    get artifactId() { return artifact?.id ?? ''; }, set artifactId(v: string) { cancelEdit(); artifactId = v; const owners = candidates.filter(c => c.artifactIds.includes(v)); candidateId = owners.find(c => c.selectedForOutput)?.id ?? owners.at(-1)?.id ?? ''; },
    contextLabel,
    get compare() { return compare; }, set compare(v: boolean) { compare = v; },
    get editing() { return editing; },
    set editing(v: boolean) {
      if (!v) { cancelEdit(); return; }
      if (!conversation || !candidate || artifact?.content.kind !== 'text' || !artifact.editable) return;
      editTarget = Object.freeze({ conversationId: conversation.id, workbenchId: conversation.workbenchId, candidateId: candidate.id, artifactId: artifact.id });
      candidateId = candidate.id; artifactId = artifact.id;
      editText = artifact.content.text; editing = true;
    },
    get editText() { return editText; }, set editText(v: string) { editText = v; },
    get reviewSummary() { return reviewTarget === candidate?.id ? reviewSummary : ''; }, set reviewSummary(v: string) { reviewTarget = candidate?.id; reviewSummary = v; },
    async start() { await refresh(); timer = setInterval(() => { if (!busy) void refresh(); }, 600); },
    stopPolling() { clearInterval(timer); stateRead.abort(); stateRead = new AbortController(); requestEpoch++; pager.invalidate(); },
    command, operator,
    async submitInput(requestId: string, raw: string) {
      try { const value = JsonValueSchema.parse(JSON.parse(raw)); if (state) await command({ kind: 'input', conversationId: state.selectedId, resolution: { requestId, action: 'submit', value } }); }
      catch { error = 'Enter valid JSON matching the requested response format.'; }
    },
    async send() {
      if (!state || !draft.trim() || (conversation?.provider === 'synthetic' && conversation.workbenchId !== 'text')) return;
      if (attachments.some(item => item.status !== 'ready') || pickerOpen) return;
      const submitted = { draftVersion, attachmentVersion, contextVersion, selectionVersion, resourceVersion, conversationId: state.selectedId };
      if (await command({ kind: 'send', conversationId: submitted.conversationId, text: draft, attachmentKeys: [...attachmentKeys], contextArtifactIds: [...contextIds], selections: selections.map(({ id, revision }) => ({ id, revision })), resourceSelections: selectedResources.map(({ entryId, resourceId }) => ({ entryId, resourceId })) })) {
        if (draftVersion === submitted.draftVersion) { draft = ''; localStorage.removeItem('drawloom-composer:' + submitted.conversationId); }
        if (attachmentVersion === submitted.attachmentVersion) { attachmentKeys = []; for (const item of attachments) files.delete(item.id); attachments = []; }
        if (contextVersion === submitted.contextVersion) contextIds = [];
        if (selectionVersion === submitted.selectionVersion) selections = [];
        if (resourceVersion === submitted.resourceVersion) selectedResources = [];
        saveCurrentReferences();
        if (state.selectedId === submitted.conversationId && !editing) { candidateId = ''; detailsOpen = true; }
      }
    },
    async create(workbenchId = conversation?.workbenchId ?? 'text', provider = conversation?.provider ?? 'synthetic', source: 'new' | 'workbench' | 'provider' = 'new') {
      if (busy) return false;
      creationSource = source;
      try {
        const succeeded = await command({ kind: 'create_conversation', workbenchId, provider });
        if (succeeded) { cancelEdit(); candidateId = ''; artifactId = ''; groupId = ''; }
        return succeeded;
      } finally { creationSource = undefined; }
    },
    async select(id: string) {
      const succeeded = await command({ kind: 'select_conversation', conversationId: id });
      if (succeeded) { cancelEdit(); candidateId = ''; artifactId = ''; groupId = ''; }
      return succeeded;
    },
    toggleContext(id: string) { contextVersion++; contextIds = contextIds.includes(id) ? contextIds.filter(k => k !== id) : [...contextIds, id]; saveCurrentReferences(); },
    canRetryAttachment(id: string) { return files.has(id); },
    removeAttachment(key: string) { const item = attachments.find(a => a.id === key || a.asset?.key === key); if (item) files.delete(item.id); if (state) changeAttachments(state.selectedId, items => items.filter(a => a.id !== key && a.asset?.key !== key)); },
    async retryAttachment(id: string) { const item = attachments.find(a => a.id === id); if (!state || !item || importing) return; importing = true; try { await upload(state.selectedId, item); } finally { importing = false; } },
    async importFiles(input: FileList | File[] | null) {
      if (importing) return;
      const selected = Array.from(input ?? []);
      if (!selected.length || !state) return;
      const id = state.selectedId;
      const items = selected.map(file => { const item: Attachment = { id: 'attachment-' + crypto.randomUUID(), name: file.name, size: file.size, mediaType: file.type || (file.name.endsWith('.md') ? 'text/markdown' : 'application/octet-stream'), status: 'pending', error: '' }; files.set(item.id, file); return item; });
      changeAttachments(id, current => [...current, ...items]);
      importing = true;
      try {
        for (const item of items) await upload(id, item);
      } finally { importing = false; }
    },
    async saveRevision() {
      const target = editTarget, text = editText;
      if (!target || !editing || state?.selectedId !== target.conversationId) return;
      if (await command({ kind: 'operator', workbenchId: target.workbenchId, command: { kind: 'revise_document', candidateId: target.candidateId, artifactId: target.artifactId, text } })) {
        if (editTarget === target && editText === text) { cancelEdit(); candidateId = ''; artifactId = ''; }
      }
    },
  };
}
export type DesktopViewModel = ReturnType<typeof createDesktopViewModel>;

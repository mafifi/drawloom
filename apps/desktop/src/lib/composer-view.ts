import type { MentionOption } from '@drawloom/ui';
import type { DesktopSnapshot } from './protocol.js';
import type { DesktopViewModel } from './view-model.svelte.js';
import { discoveryName } from './screen-language.js';

type ComposerState = Pick<DesktopSnapshot, 'activeContext' | 'activeOperation' | 'controls' | 'selectedId' | 'conversations'>;
type ComposerReadFields = Pick<DesktopViewModel,
  'draft' | 'canExecute' | 'canSend' | 'busy' | 'error' | 'pendingCommand' |
  'attachments' | 'importing' | 'delegationReferences' | 'conversation' |
  'conversationContextIds' | 'selectedDiscoveries' | 'contextIds' | 'selectedResources' |
  'pickerOpen' | 'pickerActiveId' | 'contextOpen' | 'forkRequested'>;
export type ResourceRow = Readonly<{ id: string; title: string; uri: string; pending: boolean; error: string }>;
export type ComposerResourcesPresentation = Readonly<{
  native: ReadonlyArray<DesktopViewModel['nativeResources'][number] & { pending: boolean; error: string }>;
  nativeMatchCount: number;
  views: ReadonlyArray<{ id: string; title: string; pending: boolean; error: string; resources: ReadonlyArray<ResourceRow>; nextCursor?: string }>;
  cards: ReadonlyArray<{ presentation: ReturnType<DesktopViewModel['resourceCardPresentation']>; actions: { openWorkspace(): void; read(): void; toggleContext(): void } }>;
}>;
export type DiscoveryPickerPresentation = Readonly<{
  open: boolean; kind: DesktopViewModel['pickerKind']; query: string; activeId: string;
  draftLength: number; options: ReadonlyArray<MentionOption>; status: string;
}>;
export type ComposerPresentation = Readonly<ComposerReadFields & { state?: ComposerState;
  contextLabels: ReadonlyArray<{ id: string; label: string }>;
  conversationLabels: ReadonlyArray<{ id: string; label: string }>;
  resources: ComposerResourcesPresentation;
  picker: DiscoveryPickerPresentation;
}>;

type ComposerCommands = Pick<DesktopViewModel,
  'importFiles' | 'send' | 'removeDelegationReference' | 'removeAttachment' |
  'canRetryAttachment' | 'retryAttachment' | 'removeConversationContext' |
  'removeDiscovery' | 'toggleContext' | 'removeResource' | 'setMode' | 'forkConversation'>;
export type ComposerResourcesActions = Readonly<Pick<DesktopViewModel,
  'openNativeResource' | 'showMoreNativeResources' | 'browseResources' | 'openResource'>>;
export type DiscoveryPickerActions = Readonly<Pick<DesktopViewModel,
  'showMorePicker' | 'loadMoreApps' | 'beginContextPicker' | 'consumePickerToken' |
  'setMode' | 'beginFork' | 'openBrowser' | 'selectDiscovery' |
  'selectPickerContext' | 'selectConversationContext'> & {
    setOpen(open: boolean): void; setActiveId(id: string): void;
  }>;
export type ComposerActions = Readonly<ComposerCommands & {
  setDraft(value: string): void; setContextOpen(open: boolean): void;
  setForkRequested(open: boolean): void;
  openPicker: DesktopViewModel['openPicker'];
  setPickerOpen(open: boolean): void;
  setReviewer(reviewer: 'human' | 'delegated'): Promise<boolean>;
  setModel(selection: NonNullable<DesktopViewModel['conversation']>['modelSelection'] | undefined): Promise<boolean>;
  stop(): Promise<boolean>;
  resources: ComposerResourcesActions;
  picker: DiscoveryPickerActions;
}>;

export function discoveryPickerPresentation(vm: DesktopViewModel): DiscoveryPickerPresentation {
  const options: MentionOption[] = vm.pickerEntries.map(entry => ({
    id: 'discovery:' + entry.id, title: discoveryName(entry), icon: entry.presentation?.icon,
    description: entry.description, scope: entry.scope === 'required' ? 'Active' : entry.availability !== 'available' ? entry.availability : undefined,
    group: entry.kind === 'skill' ? 'Skills' : 'Plugins', kind: entry.kind === 'skill' ? 'skill' : 'plugin',
    disabled: !entry.selectable || entry.availability !== 'available' || entry.scope === 'required',
  }));
  options.push(...vm.composerActions);
  if (vm.pickerKind === 'add') {
    if (!vm.pickerQuery || 'files attach'.includes(vm.pickerQuery.toLowerCase()))
      options.unshift({ id: 'action:attach', title: 'Choose files', description: 'From your computer', group: 'Add', kind: 'attachment' });
    options.push({ id: 'action:context', title: 'Type to search files or chats', group: 'Files and chats', kind: 'hint' });
  }
  options.push(...vm.pickerContextOptions);
  if (vm.pickerEntries.length < vm.pickerMatchCount) options.push({ id: 'action:more', title: 'Load more results', group: '', kind: 'browse' });
  if (vm.pickerKind === 'add' && vm.catalogue?.nextCursor)
    options.push({ id: 'action:apps', title: 'Load more integrations', group: '', kind: 'browse', disabled: vm.cataloguePending });
  const order = ['Add', 'Actions', 'Plugins', 'Skills', 'Files', 'Chats', '', 'Files and chats'];
  options.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return { open: vm.pickerOpen, kind: vm.pickerKind, query: vm.pickerQuery, activeId: vm.pickerActiveId,
    draftLength: vm.draft.length, options,
    status: vm.pickerKind === 'context' ? (!vm.pickerQuery.trim() ? 'Type to search files or chats' : '') :
      vm.cataloguePending ? 'Loading…' : vm.catalogueError ? 'Discovery unavailable. Refresh in Plugins.' : '' };
}

export function composerResourcesPresentation(vm: DesktopViewModel): ComposerResourcesPresentation {
  return {
    native: vm.nativeResources.map(resource => ({ ...resource, pending: vm.resourceIsPending('native', resource.id), error: vm.resourceError('native', resource.id) })),
    nativeMatchCount: vm.nativeResourceMatchCount,
    views: (vm.state?.views ?? []).filter(view => view.workbenchId === vm.conversation?.workbenchId).map(view => ({
      id: view.id, title: view.title, pending: vm.resourceIsPending(view.id, 'list'), error: vm.resourceError(view.id, 'list'),
      resources: (vm.resourceListings[view.id]?.resources ?? []).map(resource => ({ id: resource.uri, uri: resource.uri,
        title: resource.title ?? resource.name, pending: vm.resourceIsPending(view.id, resource.uri), error: vm.resourceError(view.id, resource.uri) })),
      nextCursor: vm.resourceListings[view.id]?.nextCursor,
    })),
    cards: vm.openedResources.flatMap(entry => (entry.resources ?? []).map(resource => ({
      presentation: vm.resourceCardPresentation(entry.id, resource),
      actions: { openWorkspace: () => vm.openResourceWorkspace(entry.id, resource),
        read: () => { void vm.readResource(entry.id, resource); }, toggleContext: () => vm.toggleResource(entry.id, resource) },
    }))),
  };
}

export function composerPresentation(vm: DesktopViewModel): ComposerPresentation {
  const state = vm.state;
  return {
    draft: vm.draft, canExecute: vm.canExecute, canSend: vm.canSend, busy: vm.busy, error: vm.error,
    pendingCommand: vm.pendingCommand, attachments: vm.attachments, importing: vm.importing,
    delegationReferences: vm.delegationReferences, conversation: vm.conversation,
    conversationContextIds: vm.conversationContextIds, selectedDiscoveries: vm.selectedDiscoveries,
    contextIds: vm.contextIds, selectedResources: vm.selectedResources, pickerOpen: vm.pickerOpen,
    pickerActiveId: vm.pickerActiveId, contextOpen: vm.contextOpen, forkRequested: vm.forkRequested,
    state: state ? { activeContext: state.activeContext, activeOperation: state.activeOperation,
      controls: state.controls, selectedId: state.selectedId, conversations: state.conversations } : undefined,
    contextLabels: vm.contextIds.map(id => ({ id, label: vm.contextLabel(id) })),
    conversationLabels: vm.conversationContextIds.map(id => ({ id, label: state?.conversations.find(c => c.id === id)?.title ?? 'Unavailable conversation' })),
    resources: composerResourcesPresentation(vm), picker: discoveryPickerPresentation(vm),
  };
}

export function composerActions(vm: DesktopViewModel): ComposerActions {
  return {
    importFiles: vm.importFiles, send: vm.send, removeDelegationReference: vm.removeDelegationReference,
    removeAttachment: vm.removeAttachment, canRetryAttachment: vm.canRetryAttachment,
    retryAttachment: vm.retryAttachment, removeConversationContext: vm.removeConversationContext,
    removeDiscovery: vm.removeDiscovery, toggleContext: vm.toggleContext,
    removeResource: vm.removeResource, setMode: vm.setMode, forkConversation: vm.forkConversation,
    setDraft: value => { vm.draft = value; }, setContextOpen: open => { vm.contextOpen = open; },
    setForkRequested: open => { vm.forkRequested = open; }, openPicker: vm.openPicker,
    setPickerOpen: open => { vm.pickerOpen = open; },
    setReviewer: reviewer => vm.command({ kind: 'set_reviewer', conversationId: vm.conversation!.id, reviewer }),
    setModel: selection => vm.command({ kind: 'set_model', conversationId: vm.conversation!.id, ...(selection ? { selection } : {}) }),
    stop: () => vm.command({ kind: 'stop', conversationId: vm.state!.selectedId }),
    resources: { openNativeResource: vm.openNativeResource, showMoreNativeResources: vm.showMoreNativeResources,
      browseResources: vm.browseResources, openResource: vm.openResource },
    picker: { showMorePicker: vm.showMorePicker, loadMoreApps: vm.loadMoreApps,
      beginContextPicker: vm.beginContextPicker, consumePickerToken: vm.consumePickerToken,
      setMode: vm.setMode, beginFork: vm.beginFork, openBrowser: vm.openBrowser,
      selectDiscovery: vm.selectDiscovery, selectPickerContext: vm.selectPickerContext,
      selectConversationContext: vm.selectConversationContext,
      setOpen: open => { vm.pickerOpen = open; }, setActiveId: id => { vm.pickerActiveId = id; } },
  };
}

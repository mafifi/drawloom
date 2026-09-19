<script lang="ts">
  import { Alert, Button, Dialog, Input, Select, StatefulButton, Command, Collapsible, PlusIcon, FolderIcon } from '@drawloom/ui';
  import type { ConversationSearchItem, DesktopCommand } from './protocol.js';

  export interface ConversationSearchPresentation {
    recent: ConversationSearchItem[];
    open: boolean; query: string; projectId: string; archived: 'active' | 'archived' | 'all';
    results: ConversationSearchItem[]; loading: boolean; searchError: string; commandError: string; hasMore: boolean;
    projects: { id: string; name: string }[]; workbenches: { id: string; title: string }[];
    busy: boolean; pending?: DesktopCommand; renameOpen: boolean; renameDraft: string; managementError: string;
  }
  export interface ConversationSearchActions {
    newConversation(): void; openProjects(): void;
    setOpen(value: boolean): void; setQuery(value: string): void; setProject(value: string): void;
    setArchived(value: ConversationSearchPresentation['archived']): void; more(): void;
    openResult(value: ConversationSearchItem): void; restore(id: string): void;
    setRenameOpen(value: boolean): void; setRenameDraft(value: string): void; saveRename(): void;
  }
  let { presentation, actions }: { presentation: ConversationSearchPresentation; actions: ConversationSearchActions } = $props();
  const visibleResults = $derived(presentation.query.trim() ? presentation.results : presentation.recent.filter(item => (!presentation.projectId || item.projectId === presentation.projectId) && (presentation.archived === 'all' || item.archived === (presentation.archived === 'archived'))).slice(0,9));
</script>

<Dialog.Root open={presentation.open} onOpenChange={actions.setOpen}>
  <Dialog.Content class="sm:max-w-xl search-dialog overflow-hidden gap-0 p-1" showCloseButton={false}>
    <Dialog.Header class="sr-only"><Dialog.Title>Search conversations</Dialog.Title><Dialog.Description>Search saved titles and cached messages, or choose a recent conversation.</Dialog.Description></Dialog.Header>
    <Command.Root shouldFilter={false} class="h-auto [&_.cn-command-item-indicator]:hidden">
      <Command.Input aria-label="Search conversations" placeholder="Search chats" bind:value={() => presentation.query, actions.setQuery} />
      <Command.List class="search-results" aria-label="Conversation search results">
        <Command.Group heading={presentation.query.trim() ? 'Search results' : 'Chats'}>
          {#each visibleResults as result (result.conversationId + ':' + (result.entryId ?? 'title'))}
            <Command.Item value={result.conversationId + ':' + (result.entryId ?? 'title')} onSelect={() => actions.openResult(result)} class="data-selected:bg-accent">
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-3"><span class="min-w-0 flex-1 truncate">{result.title}</span><span class="search-context truncate text-muted-foreground">{result.projectName ?? 'Unassigned'}{result.archived ? ' · Archived' : ''}</span></span>
                {#if result.match === 'message' && result.snippet}<span class="line-clamp-2 text-xs text-muted-foreground">{result.snippet}</span>{/if}
              </span>
            </Command.Item>
            {#if result.archived}<Command.Item value={'restore:' + result.conversationId} disabled={presentation.busy} onSelect={() => actions.restore(result.conversationId)}>Restore {result.title}</Command.Item>{/if}
          {/each}
          {#if presentation.loading}<p role="status" class="p-3 text-sm text-muted-foreground">Searching cached conversations…</p>{:else if !visibleResults.length}<p class="p-3 text-sm text-muted-foreground">{presentation.query.trim() ? 'No cached conversations match.' : 'No recent conversations.'}</p>{/if}
          {#if presentation.hasMore && presentation.query.trim()}<Command.Item value="more-results" disabled={presentation.loading} onSelect={actions.more}>More results</Command.Item>{/if}
        </Command.Group>
        <Command.Group heading="Quick actions">
          <Command.Item value="new-conversation" disabled={presentation.busy} onSelect={actions.newConversation}><PlusIcon aria-hidden="true" />New conversation</Command.Item>
          <Command.Item value="open-projects" onSelect={actions.openProjects}><FolderIcon aria-hidden="true" />Open or add project</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Root>
    {#if presentation.searchError || presentation.commandError}<Alert.Root variant="destructive"><Alert.Description>{presentation.searchError || presentation.commandError}</Alert.Description></Alert.Root>{/if}
    <Collapsible.Root class="px-2 pb-1">
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm" class="text-muted-foreground">Search filters</Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select.Root type="single" value={presentation.projectId || 'all-projects'} onValueChange={value => actions.setProject(value === 'all-projects' ? '' : value)}>
          <Select.Trigger aria-label="Project filter">{presentation.projectId ? presentation.projects.find(project => project.id === presentation.projectId)?.name ?? 'All projects' : 'All projects'}</Select.Trigger>
          <Select.Content><Select.Item value="all-projects" label="All projects" />{#each presentation.projects as project}<Select.Item value={project.id} label={project.name} />{/each}</Select.Content>
        </Select.Root>
        <Select.Root type="single" value={presentation.archived} onValueChange={value => actions.setArchived(value as ConversationSearchPresentation['archived'])}>
          <Select.Trigger aria-label="Conversation status filter">{presentation.archived === 'active' ? 'Active conversations' : presentation.archived === 'archived' ? 'Archived conversations' : 'All conversations'}</Select.Trigger>
          <Select.Content><Select.Item value="active" label="Active conversations" /><Select.Item value="archived" label="Archived conversations" /><Select.Item value="all" label="All conversations" /></Select.Content>
        </Select.Root>
      </div>

        <p class="pb-2 text-xs text-muted-foreground">Cached history only. Search does not import older provider history or contact a model.</p>
      </Collapsible.Content>
    </Collapsible.Root>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root open={presentation.renameOpen} onOpenChange={actions.setRenameOpen}>
  <Dialog.Content><Dialog.Header><Dialog.Title>Rename conversation</Dialog.Title><Dialog.Description>Change the local display title. This does not rename the provider-native conversation.</Dialog.Description></Dialog.Header>
    <form class="flex flex-col gap-3" onsubmit={event => { event.preventDefault(); actions.saveRename(); }}><Input aria-label="Conversation title" maxlength={120} required value={presentation.renameDraft} oninput={event => actions.setRenameDraft(event.currentTarget.value)} />{#if presentation.managementError}<p role="alert" class="text-sm text-destructive">{presentation.managementError}</p>{/if}<Dialog.Footer><Button type="button" variant="ghost" onclick={() => actions.setRenameOpen(false)}>Cancel</Button><StatefulButton type="submit" disabled={presentation.busy || !presentation.renameDraft.trim()} pending={presentation.pending?.kind === 'rename_conversation'} pendingLabel="Saving">Save</StatefulButton></Dialog.Footer></form>
  </Dialog.Content>
</Dialog.Root>

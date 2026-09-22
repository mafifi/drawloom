<script lang="ts">
  import { Sidebar, Collapsible, ChevronRightIcon, StatefulButton, Button, DropdownMenu, Dialog, Input, Field, Alert, Marker, Spinner, toast } from '@drawloom/ui';
  import { ActivityIcon, KnowledgeIcon, CloseIcon, PlusIcon, FolderIcon, FolderOpenIcon, SearchIcon, DocumentIcon, PlugIcon, SettingsIcon, MoreIcon, RenameIcon, ArchiveIcon } from "@drawloom/ui";
  import { settingsSections } from './settings-navigation.js';
  import ConversationNavItem from './ConversationNavItem.svelte';
  import type { SidebarActions, SidebarPresentation } from './sidebar.js';
  let { presentation, actions }: { presentation: SidebarPresentation; actions: SidebarActions } = $props();
  const sidebar = Sidebar.useSidebar();
  let collapsedProjects = $state<Record<string, boolean>>({});
  let creatingProject = $state('');
  let renamingProject = $state('');
  let projectName = $state('');
  async function newInProject(id: string) {
    if (presentation.busy || creatingProject) return;
    creatingProject = id;
    try {
      if (await actions.newConversationInProject(id)) {
        collapsedProjects[id] = false;
        sidebar.setOpenMobile(false);
      }
    } finally { creatingProject = ''; }
  }
  function showPane(pane: 'settings' | 'plugins' | 'projects' | 'knowledge' | 'activity' | 'archived') { actions.setPrimaryView(pane); sidebar.setOpenMobile(false); }
  async function archive(id: string) { if (await actions.archiveConversation(id)) toast.success('Conversation archived'); }
  function archiveBlocked(id: string) { return presentation.archiveBlockedConversationIds.includes(id); }
</script>

<Dialog.Root open={!!renamingProject} onOpenChange={(open) => { if (!open && !presentation.busy) renamingProject = ''; }}>
  <Dialog.Content>
    <Dialog.Header><Dialog.Title>Rename project</Dialog.Title><Dialog.Description>Changes the display name only. Files and conversation bindings stay where they are.</Dialog.Description></Dialog.Header>
    <form class="space-y-4" onsubmit={async event => { event.preventDefault(); if (await actions.renameProject(renamingProject, projectName.trim())) { renamingProject = ''; toast.success('Project renamed'); } }}>
      <Field.Field><Field.Label for="rename-project-name">Project name</Field.Label><Input id="rename-project-name" bind:value={projectName} maxlength={120} required /></Field.Field>
      {#if presentation.error}<Alert.Root variant="destructive"><Alert.Description>{presentation.error}</Alert.Description></Alert.Root>{/if}
      <Dialog.Footer><Button type="button" variant="ghost" disabled={presentation.busy} onclick={() => renamingProject = ''}>Cancel</Button><StatefulButton type="submit" pending={presentation.pendingCommand?.kind === 'rename_project'} disabled={presentation.busy || !projectName.trim()} pendingLabel="Renaming">Save name</StatefulButton></Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

{#snippet navigation()}
  <Sidebar.Header class="p-3">
    <div class="flex items-center justify-between gap-2 px-2 py-1">
      <span class="text-base font-medium">Drawloom</span>
      <div class="flex items-center">
        <Button variant="ghost" size="icon" class="size-7" aria-label="Search conversations" title="Search conversations (⌘K)" onclick={() => { actions.openSearch(); sidebar.setOpenMobile(false); }}><SearchIcon aria-hidden="true" /></Button>
      {#if sidebar.isMobile}<Button variant="ghost" size="icon" aria-label="Close navigation" onclick={() => sidebar.setOpenMobile(false)}><CloseIcon aria-hidden="true" /></Button>{/if}
      </div>
    </div>
    <Button variant="ghost" class="justify-start" onclick={() => { if (presentation.conversation) actions.openWorkbench(presentation.conversation.workbenchId); else actions.setPrimaryView('project'); sidebar.setOpenMobile(false); }} disabled={presentation.busy}><PlusIcon aria-hidden="true" /><span>New conversation</span></Button>
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workbenches</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each presentation.workbenches as workbench}<Sidebar.MenuItem><Sidebar.MenuButton class="justify-start" aria-current={workbench.id === presentation.conversation?.workbenchId ? 'true' : undefined}>
        {#snippet child({ props })}<Button {...props} variant="ghost" disabled={presentation.busy} onclick={() => { actions.openWorkbench(workbench.id); sidebar.setOpenMobile(false); }}><DocumentIcon aria-hidden="true" /><span>{workbench.title}</span></Button>{/snippet}
      </Sidebar.MenuButton></Sidebar.MenuItem>{/each}</Sidebar.Menu>
    </Sidebar.Group>
    <Sidebar.Group><Sidebar.Menu>
    <Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('activity')}><ActivityIcon aria-hidden="true" /><span>Activity</span></Sidebar.MenuButton></Sidebar.MenuItem>
    <Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('plugins')}><PlugIcon aria-hidden="true" /><span>Plugins</span></Sidebar.MenuButton></Sidebar.MenuItem>
    <Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('knowledge')}><KnowledgeIcon aria-hidden="true" /><span>Knowledge</span></Sidebar.MenuButton></Sidebar.MenuItem>
    </Sidebar.Menu></Sidebar.Group>
    <Sidebar.Group class="sidebar-projects-group">
      <div class="flex items-center justify-between">
        <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
        <Button variant="ghost" size="icon" class="sidebar-reveal size-7" aria-label="Add project" title="Add project" onclick={() => showPane('projects')}><PlusIcon aria-hidden="true" /></Button>
      </div>
      <Sidebar.Menu>
        {#each presentation.projects as project (project.id)}
          <Sidebar.MenuItem>
            <Collapsible.Root open={!collapsedProjects[project.id]} onOpenChange={(open) => { collapsedProjects[project.id] = !open; }}>
              <div class="sidebar-project-row flex items-center">
                <Collapsible.Trigger>
                  {#snippet child({ props })}
                    <Sidebar.MenuButton {...props} class="min-w-0 flex-1 justify-start" title={project.directory} aria-label={'Toggle conversations in ' + project.name}>
                      {#if collapsedProjects[project.id]}<FolderIcon aria-hidden="true" />{:else}<FolderOpenIcon aria-hidden="true" />{/if}
                      <span class="min-w-0 flex-1 truncate">{project.name}{project.available ? '' : ' · unavailable'}</span>
                      <ChevronRightIcon class="sidebar-reveal size-3.5 shrink-0 transition-transform [[data-state=open]_&]:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    </Sidebar.MenuButton>
                  {/snippet}
                </Collapsible.Trigger>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon" class="sidebar-reveal size-7 shrink-0" aria-label={'Project actions for ' + project.name}><MoreIcon aria-hidden="true" /></Button>{/snippet}</DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item disabled={presentation.busy} onclick={async () => { if (await actions.selectProject(project.id)) sidebar.setOpenMobile(false); }}><FolderOpenIcon aria-hidden="true" />Open project</DropdownMenu.Item>
                    <DropdownMenu.Item disabled={presentation.busy} onclick={() => { projectName = project.name; renamingProject = project.id; }}><RenameIcon aria-hidden="true" />Rename project</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                <StatefulButton variant="ghost" size="icon" class="sidebar-reveal size-7 shrink-0" aria-label={'New conversation in ' + project.name} disabled={presentation.busy || !project.available} pending={creatingProject === project.id} pendingLabel="Creating conversation" onclick={() => newInProject(project.id)}><PlusIcon aria-hidden="true" /></StatefulButton>
              </div>
              <Collapsible.Content>
                <Sidebar.MenuSub class="mx-0 translate-x-0 border-0 px-0">
                  {#each presentation.conversations.filter(item => !item.archived && item.projectId === project.id).toSorted((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))) as conversation (conversation.id)}
                    <ConversationNavItem presentation={{
                      title:conversation.title, projectName:presentation.projects.find(p=>p.id===conversation.projectId)?.name ?? 'Unassigned',
                      active:conversation.id===presentation.selectedId, pinned:conversation.pinned ?? false,
                      busy:presentation.busy, archiveBlocked:archiveBlocked(conversation.id),
                      pending: presentation.pendingCommand?.kind === 'select_conversation' && presentation.pendingCommand.conversationId === conversation.id ? 'open' : presentation.pendingCommand?.kind === 'set_conversation_pinned' && presentation.pendingCommand.conversationId === conversation.id ? 'pin' : presentation.pendingCommand?.kind === 'archive_conversation' && presentation.pendingCommand.conversationId === conversation.id ? 'archive' : undefined
                    }} actions={{
                      open:async()=>{if(await actions.selectConversation(conversation.id))sidebar.setOpenMobile(false);},
                      rename:()=>actions.beginRename(conversation),
                      pin:async()=>{if(await actions.setConversationPinned(conversation.id,!conversation.pinned))toast.success(conversation.pinned?'Conversation unpinned':'Conversation pinned');},
                      archive:()=>void archive(conversation.id)
                    }} />
                  {/each}
                </Sidebar.MenuSub>
              </Collapsible.Content>
            </Collapsible.Root>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>

    {#if presentation.conversations.some(item => !item.archived && !item.projectId)}
    <Sidebar.Group>
      <Sidebar.GroupLabel>Unassigned conversations</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each presentation.conversations.filter(item => !item.archived && !item.projectId).toSorted((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))) as conversation (conversation.id)}
        <ConversationNavItem presentation={{
                      title:conversation.title, projectName:presentation.projects.find(p=>p.id===conversation.projectId)?.name ?? 'Unassigned',
                      active:conversation.id===presentation.selectedId, pinned:conversation.pinned ?? false,
                      busy:presentation.busy, archiveBlocked:archiveBlocked(conversation.id),
                      pending: presentation.pendingCommand?.kind === 'select_conversation' && presentation.pendingCommand.conversationId === conversation.id ? 'open' : presentation.pendingCommand?.kind === 'set_conversation_pinned' && presentation.pendingCommand.conversationId === conversation.id ? 'pin' : presentation.pendingCommand?.kind === 'archive_conversation' && presentation.pendingCommand.conversationId === conversation.id ? 'archive' : undefined
                    }} actions={{
                      open:async()=>{if(await actions.selectConversation(conversation.id))sidebar.setOpenMobile(false);},
                      rename:()=>actions.beginRename(conversation),
                      pin:async()=>{if(await actions.setConversationPinned(conversation.id,!conversation.pinned))toast.success(conversation.pinned?'Conversation unpinned':'Conversation pinned');},
                      archive:()=>void archive(conversation.id)
                    }} />
      {/each}</Sidebar.Menu>
    </Sidebar.Group>
    {/if}
  </Sidebar.Content>
  <Sidebar.Footer><Sidebar.Menu>
    {#if presentation.error}<li class="px-2"><Alert.Root variant="destructive"><Alert.Description>{presentation.error}</Alert.Description></Alert.Root></li>{/if}
    <Sidebar.MenuItem>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>{#snippet child({ props })}<Sidebar.MenuButton {...props} class="h-11" aria-label="Settings and more"><SettingsIcon aria-hidden="true" /><span>Settings &amp; more</span></Sidebar.MenuButton>{/snippet}</DropdownMenu.Trigger>
        <DropdownMenu.Content side="top" align="start" class="w-56">
          <DropdownMenu.Label>Settings &amp; more</DropdownMenu.Label>
          <DropdownMenu.Item onclick={() => showPane('archived')}><ArchiveIcon aria-hidden="true" />Archived conversations</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => showPane('settings')}><SettingsIcon aria-hidden="true" />Settings</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Sidebar.MenuItem>
  </Sidebar.Menu></Sidebar.Footer>
{/snippet}

  <Sidebar.Root id="workspace-navigation" aria-label="Workspace navigation">
    {#if presentation.primaryView === 'settings'}
      <Sidebar.Header class="p-3"><Button variant="ghost" class="justify-start" onclick={() => { actions.closeSettings(); sidebar.setOpenMobile(false); }}>← Back to app</Button></Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group><Sidebar.GroupLabel>Settings</Sidebar.GroupLabel><Sidebar.Menu>
          {#each settingsSections as section}
            <Sidebar.MenuItem><Sidebar.MenuButton isActive={presentation.settingsSection === section.id} aria-current={presentation.settingsSection === section.id ? 'page' : undefined} onclick={() => { actions.setSettingsSection(section.id); sidebar.setOpenMobile(false); }}>{section.title}</Sidebar.MenuButton></Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu></Sidebar.Group>
        {#if presentation.pluginSettingsLoading}<div class="px-4"><Marker.Root role="status"><Marker.Icon><Spinner /></Marker.Icon><Marker.Content>Loading plugin settings…</Marker.Content></Marker.Root></div>{/if}
        {#if presentation.pluginSettingsError}<div class="px-4"><Alert.Root variant="destructive"><Alert.Description>{presentation.pluginSettingsError}</Alert.Description></Alert.Root></div>{/if}
        {#each presentation.pluginSettingsGroups as group}
          <Sidebar.Group><Sidebar.GroupLabel>{group.title}</Sidebar.GroupLabel><Sidebar.Menu>
            {#each group.entries as entry}
            <Sidebar.MenuItem><Sidebar.MenuButton isActive={presentation.settingsSection === entry.key} aria-current={presentation.settingsSection === entry.key ? 'page' : undefined} onclick={() => { actions.setSettingsSection(entry.key); sidebar.setOpenMobile(false); }}>{entry.label}{entry.page.status !== 'available' ? ` · ${entry.page.status}` : ''}</Sidebar.MenuButton></Sidebar.MenuItem>
            {/each}
          </Sidebar.Menu></Sidebar.Group>
        {/each}
      </Sidebar.Content>
    {:else}
      {@render navigation()}
    {/if}
  </Sidebar.Root>

<style>
  /* Keep hover chrome reachable by keyboard and permanently available on touch. */
  @media (hover: hover) and (pointer: fine) {
    :global(.sidebar-reveal) { opacity: 0; }
    :global(.sidebar-reveal:focus-visible),
    :global(.sidebar-reveal[aria-haspopup="menu"][data-state="open"]),
    :global(.sidebar-projects-group > div:hover .sidebar-reveal),
    :global(.sidebar-projects-group > div:focus-within .sidebar-reveal),
    :global(.sidebar-project-row:hover .sidebar-reveal),
    :global(.sidebar-project-row:focus-within .sidebar-reveal),
    :global(.sidebar-conversation-row:hover .sidebar-reveal),
    :global(.sidebar-conversation-row:focus-within .sidebar-reveal) { opacity: 1; }
  }
</style>

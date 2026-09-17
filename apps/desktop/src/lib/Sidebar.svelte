<script lang="ts">
  import { Avatar, UserIcon, Sidebar, Collapsible, ChevronRightIcon, StatefulButton, Button, DropdownMenu, toast } from '@drawloom/ui';
  import { ActivityIcon, KnowledgeIcon, CloseIcon, PlusIcon, FolderIcon, FolderOpenIcon, SearchIcon, DocumentIcon, PlugIcon, SettingsIcon, MoreIcon, RenameIcon, ArchiveIcon } from "@drawloom/ui";
  import { settingsSections } from './settings-navigation.js';
  import ConversationNavItem from './ConversationNavItem.svelte';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm }: { vm: DesktopViewModel } = $props();
  const sidebar = Sidebar.useSidebar();
  let collapsedProjects = $state<Record<string, boolean>>({});
  let creatingProject = $state('');
  async function newInProject(id: string) {
    if (vm.busy || creatingProject) return;
    creatingProject = id;
    try {
      if (await vm.newConversationInProject(id)) {
        collapsedProjects[id] = false;
        sidebar.setOpenMobile(false);
      }
    } finally { creatingProject = ''; }
  }
  function showPane(pane: 'settings' | 'plugins' | 'projects' | 'knowledge' | 'activity' | 'archived') { vm.primaryView = pane; sidebar.setOpenMobile(false); }
  async function archive(id: string) { if (await vm.command({ kind: 'archive_conversation', conversationId: id })) toast.success('Conversation archived'); }
  function archiveBlocked(id: string) { return vm.state?.archiveBlockedConversationIds.includes(id) ?? false; }
</script>

{#snippet navigation()}
  <Sidebar.Header class="p-3">
    <div class="flex items-center justify-between gap-2 px-2 py-1">
      <span class="text-base font-medium">Drawloom</span>
      <div class="flex items-center">
        <Button variant="ghost" size="icon" class="size-7" aria-label="Search conversations" title="Search conversations (⌘K)" onclick={() => { vm.navigation.openSearch(); sidebar.setOpenMobile(false); }}><SearchIcon aria-hidden="true" /></Button>
      {#if sidebar.isMobile}<Button variant="ghost" size="icon" aria-label="Close navigation" onclick={() => sidebar.setOpenMobile(false)}><CloseIcon aria-hidden="true" /></Button>{/if}
      </div>
    </div>
    <Button variant="ghost" class="justify-start" onclick={() => { if (vm.conversation) vm.openWorkbench(vm.conversation.workbenchId); else vm.primaryView = 'project'; sidebar.setOpenMobile(false); }} disabled={vm.busy}><PlusIcon aria-hidden="true" /><span>New conversation</span></Button>
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workbenches</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each vm.state?.workbenches ?? [] as workbench}<Sidebar.MenuItem><Sidebar.MenuButton class="justify-start" aria-current={workbench.id === vm.conversation?.workbenchId ? 'true' : undefined}>
        {#snippet child({ props })}<Button {...props} variant="ghost" disabled={vm.busy} onclick={() => { vm.openWorkbench(workbench.id); sidebar.setOpenMobile(false); }}><DocumentIcon aria-hidden="true" /><span>{workbench.title}</span></Button>{/snippet}
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
        {#each vm.state?.projects ?? [] as project (project.id)}
          <Sidebar.MenuItem>
            <Collapsible.Root open={!collapsedProjects[project.id]} onOpenChange={(open) => { collapsedProjects[project.id] = !open; }}>
              <div class="sidebar-project-row flex items-center">
                <Collapsible.Trigger>
                  {#snippet child({ props })}
                    <Sidebar.MenuButton {...props} class="min-w-0 flex-1 justify-start" title={project.directory} aria-label={'Toggle conversations in ' + project.name}>
                      {#if collapsedProjects[project.id]}<FolderIcon aria-hidden="true" />{:else}<FolderOpenIcon aria-hidden="true" />{/if}
                      <span class="max-w-[calc(100%-3rem)] truncate">{project.name}{project.available ? '' : ' · unavailable'}</span>
                      <ChevronRightIcon class="sidebar-reveal size-3.5 shrink-0 transition-transform [[data-state=open]_&]:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                    </Sidebar.MenuButton>
                  {/snippet}
                </Collapsible.Trigger>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="icon" class="sidebar-reveal size-7 shrink-0" aria-label={'Project actions for ' + project.name}><MoreIcon aria-hidden="true" /></Button>{/snippet}</DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item disabled={vm.busy} onclick={async () => { if (await vm.selectProject(project.id)) sidebar.setOpenMobile(false); }}><FolderOpenIcon aria-hidden="true" />Open project</DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
                <StatefulButton variant="ghost" size="icon" class="sidebar-reveal size-7 shrink-0" aria-label={'New conversation in ' + project.name} disabled={vm.busy || !project.available} pending={creatingProject === project.id} pendingLabel="Creating conversation" onclick={() => newInProject(project.id)}><PlusIcon aria-hidden="true" /></StatefulButton>
              </div>
              <Collapsible.Content>
                <Sidebar.MenuSub class="mx-0 translate-x-0 border-0 px-0">
                  {#each vm.state?.conversations.filter(item => !item.archived && item.projectId === project.id).toSorted((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))) ?? [] as conversation (conversation.id)}
                    <ConversationNavItem presentation={{
                      title:conversation.title, projectName:vm.state?.projects.find(p=>p.id===conversation.projectId)?.name ?? 'Unassigned',
                      active:conversation.id===vm.state?.selectedId, pinned:conversation.pinned ?? false,
                      busy:vm.busy, archiveBlocked:archiveBlocked(conversation.id),
                      pending: vm.pendingCommand?.kind === 'select_conversation' && vm.pendingCommand.conversationId === conversation.id ? 'open' : vm.pendingCommand?.kind === 'set_conversation_pinned' && vm.pendingCommand.conversationId === conversation.id ? 'pin' : vm.pendingCommand?.kind === 'archive_conversation' && vm.pendingCommand.conversationId === conversation.id ? 'archive' : undefined
                    }} actions={{
                      open:async()=>{if(await vm.select(conversation.id))sidebar.setOpenMobile(false);},
                      rename:()=>vm.navigation.beginRename(conversation),
                      pin:async()=>{if(await vm.command({kind:'set_conversation_pinned',conversationId:conversation.id,pinned:!conversation.pinned}))toast.success(conversation.pinned?'Conversation unpinned':'Conversation pinned');},
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

    {#if vm.state?.conversations.some(item => !item.archived && !item.projectId)}
    <Sidebar.Group>
      <Sidebar.GroupLabel>Unassigned conversations</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each vm.state?.conversations.filter(item => !item.archived && !item.projectId).toSorted((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))) ?? [] as conversation (conversation.id)}
        <ConversationNavItem presentation={{
                      title:conversation.title, projectName:vm.state?.projects.find(p=>p.id===conversation.projectId)?.name ?? 'Unassigned',
                      active:conversation.id===vm.state?.selectedId, pinned:conversation.pinned ?? false,
                      busy:vm.busy, archiveBlocked:archiveBlocked(conversation.id),
                      pending: vm.pendingCommand?.kind === 'select_conversation' && vm.pendingCommand.conversationId === conversation.id ? 'open' : vm.pendingCommand?.kind === 'set_conversation_pinned' && vm.pendingCommand.conversationId === conversation.id ? 'pin' : vm.pendingCommand?.kind === 'archive_conversation' && vm.pendingCommand.conversationId === conversation.id ? 'archive' : undefined
                    }} actions={{
                      open:async()=>{if(await vm.select(conversation.id))sidebar.setOpenMobile(false);},
                      rename:()=>vm.navigation.beginRename(conversation),
                      pin:async()=>{if(await vm.command({kind:'set_conversation_pinned',conversationId:conversation.id,pinned:!conversation.pinned}))toast.success(conversation.pinned?'Conversation unpinned':'Conversation pinned');},
                      archive:()=>void archive(conversation.id)
                    }} />
      {/each}</Sidebar.Menu>
    </Sidebar.Group>
    {/if}
  </Sidebar.Content>
  <Sidebar.Footer><Sidebar.Menu>
    {#if vm.error}<li class="px-2 text-sm text-destructive" role="alert">{vm.error}</li>{/if}
    <Sidebar.MenuItem>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>{#snippet child({ props })}<Sidebar.MenuButton {...props} class="h-11" aria-label="Local profile menu"><Avatar.Root class="size-7"><Avatar.Fallback><UserIcon class="size-4" aria-hidden="true" /></Avatar.Fallback></Avatar.Root><span>Local profile</span></Sidebar.MenuButton>{/snippet}</DropdownMenu.Trigger>
        <DropdownMenu.Content side="top" align="start" class="w-56">
          <DropdownMenu.Label>Local profile</DropdownMenu.Label>
          <DropdownMenu.Item onclick={() => showPane('archived')}><ArchiveIcon aria-hidden="true" />Archived conversations</DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={() => showPane('settings')}><SettingsIcon aria-hidden="true" />Settings</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Sidebar.MenuItem>
  </Sidebar.Menu></Sidebar.Footer>
{/snippet}

  <Sidebar.Root id="workspace-navigation" aria-label="Workspace navigation">
    {#if vm.primaryView === 'settings'}
      <Sidebar.Header class="p-3"><Button variant="ghost" class="justify-start" onclick={() => { vm.closeSettings(); sidebar.setOpenMobile(false); }}>← Back to app</Button></Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group><Sidebar.GroupLabel>Settings</Sidebar.GroupLabel><Sidebar.Menu>
          {#each settingsSections as section}
            <Sidebar.MenuItem><Sidebar.MenuButton isActive={vm.settingsSection === section.id} aria-current={vm.settingsSection === section.id ? 'page' : undefined} onclick={() => { vm.settingsSection = section.id; sidebar.setOpenMobile(false); }}>{section.title}</Sidebar.MenuButton></Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu></Sidebar.Group>
        {#if vm.pluginSettingsLoading}<p class="px-4 text-sm text-muted-foreground" role="status">Loading plugin settings…</p>{/if}
        {#if vm.pluginSettingsError}<p class="px-4 text-sm" role="alert">{vm.pluginSettingsError}</p>{/if}
        {#each vm.pluginSettingsGroups as group}
          <Sidebar.Group><Sidebar.GroupLabel>{group.title}</Sidebar.GroupLabel><Sidebar.Menu>
            {#each group.entries as entry}
            <Sidebar.MenuItem><Sidebar.MenuButton isActive={vm.settingsSection === entry.key} aria-current={vm.settingsSection === entry.key ? 'page' : undefined} onclick={() => { vm.settingsSection = entry.key; sidebar.setOpenMobile(false); }}>{entry.label}{entry.page.status !== 'available' ? ` · ${entry.page.status}` : ''}</Sidebar.MenuButton></Sidebar.MenuItem>
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

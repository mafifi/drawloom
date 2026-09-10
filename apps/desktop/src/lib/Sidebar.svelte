<script lang="ts">
  import { Sidebar, StatefulButton, Button } from '@drawloom/ui';
  import { CloseIcon, PlusIcon, FolderIcon, DocumentIcon, ChatIcon, PlugIcon, SettingsIcon } from "@drawloom/ui";
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm }: { vm: DesktopViewModel } = $props();
  const sidebar = Sidebar.useSidebar();
  function showPane(pane: 'settings' | 'plugins') { vm.primaryView = pane; sidebar.setOpenMobile(false); }
</script>

{#snippet navigation()}
  <Sidebar.Header class="p-3">
    <div class="flex items-center justify-between gap-2 px-2 py-1">
      <span class="text-base font-medium">Drawloom</span>
      {#if sidebar.isMobile}<Button variant="ghost" size="icon" aria-label="Close navigation" onclick={() => sidebar.setOpenMobile(false)}><CloseIcon aria-hidden="true" /></Button>{/if}
    </div>
    <StatefulButton variant="ghost" class="justify-start" onclick={async () => { if (await vm.create()) sidebar.setOpenMobile(false); }} disabled={vm.busy} pending={vm.creationSource === 'new'}><PlusIcon aria-hidden="true" /><span>New conversation</span></StatefulButton>
  </Sidebar.Header>
  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workspaces</Sidebar.GroupLabel>
      <Sidebar.Menu><Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('settings')}><FolderIcon aria-hidden="true" /><span>{vm.state?.workspace ?? 'Local workspace'}</span></Sidebar.MenuButton></Sidebar.MenuItem></Sidebar.Menu>
    </Sidebar.Group>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Workbenches</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each vm.state?.workbenches ?? [] as workbench}<Sidebar.MenuItem><Sidebar.MenuButton class="justify-start" aria-current={workbench.id === vm.conversation?.workbenchId ? 'true' : undefined}>
        {#snippet child({ props })}<StatefulButton {...props} variant="ghost" disabled={vm.busy} pending={vm.creationSource === 'workbench' && vm.pendingCommand?.kind === 'create_conversation' && vm.pendingCommand.workbenchId === workbench.id} pendingLabel="Opening" onclick={async () => { if (await vm.create(workbench.id, undefined, 'workbench')) sidebar.setOpenMobile(false); }}><DocumentIcon aria-hidden="true" /><span>{workbench.title}</span></StatefulButton>{/snippet}
      </Sidebar.MenuButton></Sidebar.MenuItem>{/each}</Sidebar.Menu>
    </Sidebar.Group>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Conversations</Sidebar.GroupLabel>
      <Sidebar.Menu>{#each vm.state?.conversations ?? [] as conversation}<Sidebar.MenuItem><Sidebar.MenuButton class="justify-start" isActive={conversation.id === vm.state?.selectedId} title={conversation.title}>
        {#snippet child({ props })}<StatefulButton {...props} variant="ghost" disabled={vm.busy} pending={vm.pendingCommand?.kind === 'select_conversation' && vm.pendingCommand.conversationId === conversation.id} pendingLabel="Opening" onclick={async () => { if (await vm.select(conversation.id)) sidebar.setOpenMobile(false); }}><ChatIcon aria-hidden="true" /><span>{conversation.title}</span></StatefulButton>{/snippet}
      </Sidebar.MenuButton></Sidebar.MenuItem>{/each}</Sidebar.Menu>
    </Sidebar.Group>
  </Sidebar.Content>
  <Sidebar.Footer><Sidebar.Menu>
    <Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('plugins')}><PlugIcon aria-hidden="true" /><span>Plugins</span></Sidebar.MenuButton></Sidebar.MenuItem>
    <Sidebar.MenuItem><Sidebar.MenuButton onclick={() => showPane('settings')}><SettingsIcon aria-hidden="true" /><span>Settings</span></Sidebar.MenuButton></Sidebar.MenuItem>
  </Sidebar.Menu></Sidebar.Footer>
{/snippet}

  <Sidebar.Root id="workspace-navigation" aria-label="Workspace navigation">
    {@render navigation()}
  </Sidebar.Root>

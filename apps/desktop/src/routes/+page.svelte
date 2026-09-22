<script lang="ts">
  import drawloomIcon from '../../../../publishing/site/public/artwork/drawloom/mark.png';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { workspaceNeedsFullWidth } from '$lib/workspace-layout.js';
  import { Sidebar as SidebarUI, Toaster, toast, Tabs, Button, StatefulButton, DropdownMenu, DocumentIcon, PlusIcon, ExpandIcon, RestoreIcon, CloseIcon } from '@drawloom/ui';
  import BrowserPanel from '$lib/BrowserPanel.svelte';
  import type { BrowserTabCommand } from '$lib/browser-controller.js';
  import BrowserPermissionPrompt from '$lib/BrowserPermissionPrompt.svelte';
  import { createDesktopViewModel } from '$lib/view-model.svelte.js';
  import Sidebar from '$lib/Sidebar.svelte';
  import Conversation from '$lib/Conversation.svelte';
  import DetailsPane from '$lib/DetailsPane.svelte';
  import PrimaryView from '$lib/PrimaryView.svelte';
  import ConversationSearch from '$lib/ConversationSearch.svelte';
  import { detailsPaneActions, detailsPanePresentation } from '$lib/details-pane.js';
  import { primaryViewActions, primaryViewPresentation } from '$lib/primary-view.js';
  import { sidebarActions, sidebarPresentation } from '$lib/sidebar.js';
  import './app.css';
  const vm = createDesktopViewModel();
  const compactNavigation = new MediaQuery('(max-width: 1024px)');
  let navigationOpen = $state(true);
  let availableWidth = $state(0);
  $effect(() => { navigationOpen = !compactNavigation.current; });
  const drawer = $derived(workspaceNeedsFullWidth(availableWidth));
  const workspacePresentation = $derived(detailsPanePresentation(vm, vm.primaryView === 'conversation', drawer));
  const workspaceActions = detailsPaneActions(vm);
  const primaryPresentation = $derived(primaryViewPresentation(vm));
  const primaryActions = primaryViewActions(vm);
  const sidebarViewPresentation = $derived(sidebarPresentation(vm));
  const sidebarViewActions = sidebarActions(vm);
  const browserTabs = $derived(vm.browser.snapshot.tabs.filter(tab=>tab.conversationId===vm.state?.selectedId));
  const browserTab = $derived(browserTabs.find(tab=>tab.id===vm.browser.selectedId));
  let documentVisible = $state(true);
  $effect(()=>{if(vm.detailsOpen&&!vm.browserOpen)documentVisible=true;});
  async function closeBrowserTab(id:string){
    if(await vm.browser.close(id)){
      if(!vm.browser.selectedId){vm.browserOpen=false;if(!documentVisible)workspaceActions.close();}
      else if(vm.browserOpen)selectWorkspace(vm.browser.selectedId);
    }
  }
  function closeDocument(){documentVisible=false;if(!vm.browserOpen){const tab=browserTabs[0];if(tab)selectWorkspace(tab.id);else workspaceActions.close();}}
  function showDocument(){documentVisible=true;vm.browserOpen=false;}
  const browserPresentation = $derived({tab:browserTab,available:vm.browser.snapshot.available,reason:vm.browser.snapshot.reason,error:vm.browser.error,pending:vm.browser.pending,visible:vm.browserOpen&&vm.detailsOpen&&vm.primaryView==='conversation'});
  const browserActions = {
    navigate:(url:string)=>vm.browser.navigate(url),
    command:(kind:BrowserTabCommand)=>vm.browser.command({kind,tabId:vm.browser.selectedId}),
    close:()=>{void closeBrowserTab(vm.browser.selectedId);},
    place:(tabId:string,bounds:{x:number;y:number;width:number;height:number},visible:boolean)=>vm.browser.place(tabId,bounds,visible),
  };
  let browserConversation='';
  $effect(()=>{const id=vm.state?.selectedId??'';if(id!==browserConversation){browserConversation=id;vm.browserOpen=false;}});
  function selectWorkspace(value:string){
    vm.browserOpen=value!=='document';
    if(value==='document')return;
    vm.browser.select(value);
    const tab=browserTabs.find(tab=>tab.id===value);
    if(tab?.status==='unloaded'&&tab.url)void vm.browser.navigate(tab.url);
  }
  const searchPresentation = $derived({ recent: (vm.state?.conversations ?? []).toReversed().map(c => ({ conversationId:c.id, title:c.title, projectId:c.projectId, projectName:vm.state?.projects.find(p=>p.id===c.projectId)?.name, workbenchId:c.workbenchId, provider:c.provider, archived:c.archived ?? false, match:"title" as const })), open:vm.navigation.searchOpen, query:vm.navigation.query, projectId:vm.navigation.projectId, archived:vm.navigation.archived, results:vm.navigation.results, loading:vm.navigation.loading, searchError:vm.navigation.searchError, commandError:vm.error, hasMore:vm.navigation.hasMore, projects:vm.state?.projects.map(({id,name})=>({id,name}))??[], workbenches:vm.state?.workbenches.map(({id,title})=>({id,title}))??[], busy:vm.busy, pending:vm.pendingCommand, renameOpen:vm.navigation.renameOpen, renameDraft:vm.navigation.renameDraft, managementError:vm.navigation.managementError });
  const searchActions = { newConversation:()=>{vm.navigation.closeSearch(); if(vm.state?.selectedProjectId) void vm.newConversationInProject(vm.state.selectedProjectId); else vm.primaryView="projects";}, openProjects:()=>{vm.navigation.closeSearch();vm.primaryView="projects";}, setOpen:(v:boolean)=>v?vm.navigation.openSearch():vm.navigation.closeSearch(), setQuery:(v:string)=>vm.navigation.query=v, setProject:(v:string)=>vm.navigation.projectId=v, setArchived:(v:'active'|'archived'|'all')=>vm.navigation.archived=v, more:()=>void vm.navigation.more(), openResult:(v:Parameters<typeof vm.navigation.openResult>[0])=>void vm.navigation.openResult(v), restore:async(id:string)=>{if(await vm.command({kind:'restore_conversation',conversationId:id})){toast.success('Conversation restored');vm.navigation.archived='active'}}, setRenameOpen:(v:boolean)=>vm.navigation.renameOpen=v, setRenameDraft:(v:string)=>vm.navigation.renameDraft=v, saveRename:async()=>{if(await vm.navigation.saveRename())toast.success('Conversation renamed')} };
  onMount(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); vm.navigation.openSearch(); } };
    addEventListener('keydown', shortcut); void vm.start();
    return () => { removeEventListener('keydown', shortcut); vm.stopPolling(); };
  });
</script>

<svelte:head>
  <title>Drawloom — Local workbench</title>
  <link rel="icon" type="image/png" href={drawloomIcon} />
  <link rel="apple-touch-icon" href={drawloomIcon} />
</svelte:head>
<Toaster />
<ConversationSearch presentation={searchPresentation} actions={searchActions} />
<BrowserPermissionPrompt request={vm.browser.snapshot.requests[0]} pending={vm.browser.pending==='decide'?vm.browser.pendingKey:''} error={vm.browser.error} decide={(requestId,choice)=>vm.browser.command({kind:'decide',requestId,choice})}/>
<SidebarUI.Provider bind:open={navigationOpen} class="h-dvh min-h-0" style="--sidebar-width: 240px">
  <Sidebar presentation={sidebarViewPresentation} actions={sidebarViewActions}/>
  <div
    class="app-shell"
    bind:clientWidth={availableWidth}
    class:with-details={vm.primaryView === 'conversation' && vm.detailsOpen && !drawer && !vm.detailsExpanded}
    class:workspace-expanded={vm.primaryView === 'conversation' && vm.detailsOpen && vm.detailsExpanded}
    style:--workspace-width={vm.detailsWidth + 'px'}
  >
    <div class="workspace-conversation" class:workspace-conversation-hidden={vm.primaryView !== 'conversation' || vm.detailsOpen && (drawer || vm.detailsExpanded)}>
      <Conversation {vm}/>
    </div>
    <div class="workspace-pane" class:workspace-pane-hidden={vm.primaryView !== 'conversation' || !vm.detailsOpen} class:workspace-pane-full={drawer || vm.detailsExpanded}>
      <div class="flex h-full min-h-0 flex-col">
          <div class="action-row flex-nowrap border-b p-2">
            <Tabs.Root value={vm.browserOpen?(browserTab?.id??'browser'):'document'} onValueChange={selectWorkspace} class="min-w-0 flex-1">
              <Tabs.List variant="line" class="w-full max-w-full justify-start overflow-x-auto scroll-fade" aria-label="Workspace tabs">
                {#if documentVisible}<div class="flex shrink-0 items-center"><Tabs.Trigger value="document">Workbench</Tabs.Trigger><Button variant="ghost" size="icon" aria-label="Close Workbench tab" title="Close Workbench tab" onclick={closeDocument}><CloseIcon/></Button></div>{/if}
                {#each browserTabs as tab(tab.id)}<div class="flex min-w-24 max-w-56 flex-1 items-center"><Tabs.Trigger value={tab.id} class="min-w-0 flex-1 truncate">{tab.title||'New tab'}</Tabs.Trigger><StatefulButton variant="ghost" size="icon" aria-label={'Close '+(tab.title||'New tab')} title={'Close '+(tab.title||'New tab')} pending={vm.browser.pendingKey==='close:'+tab.id} disabled={!!vm.browser.pending} onclick={()=>closeBrowserTab(tab.id)}><CloseIcon/></StatefulButton></div>{/each}
                {#if !browserTabs.length&&vm.browserOpen}<Tabs.Trigger value="browser">Browser</Tabs.Trigger>{/if}
              </Tabs.List>
            </Tabs.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="icon" aria-label="Add workspace tab" title="Add workspace tab"><PlusIcon/></Button>{/snippet}</DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" preventScroll={false}>
                <DropdownMenu.Item disabled={!!vm.browser.pending} onSelect={()=>{void vm.openBrowser();}}>Browser</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={showDocument}><DocumentIcon/>Workbench</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            {#if vm.browserOpen}
              <Button variant="ghost" size="icon" aria-label={vm.detailsExpanded?'Restore workspace':'Expand workspace'} title={vm.detailsExpanded?'Restore workspace':'Expand workspace'} aria-pressed={vm.detailsExpanded} onclick={()=>workspaceActions.setExpanded(!vm.detailsExpanded)}>{#if vm.detailsExpanded}<RestoreIcon/>{:else}<ExpandIcon/>{/if}</Button>
              <Button variant="ghost" size="icon" aria-label="Close browser pane" title="Close browser pane" onclick={workspaceActions.close}><CloseIcon/></Button>
            {/if}
          </div>
        <div class="min-h-0 flex-1" class:workspace-content-hidden={vm.browserOpen}>
          {#key vm.state?.selectedId}<DetailsPane presentation={{...workspacePresentation,detailsOpen:workspacePresentation.detailsOpen&&!vm.browserOpen}} actions={workspaceActions}/>{/key}
        </div>
        {#if vm.browserOpen}<div class="min-h-0 flex-1"><BrowserPanel presentation={browserPresentation} actions={browserActions}/></div>{/if}
      </div>
    </div>
    {#if vm.primaryView !== 'conversation'}<PrimaryView presentation={primaryPresentation} actions={primaryActions}/>{/if}
  </div>
</SidebarUI.Provider>

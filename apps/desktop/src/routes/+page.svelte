<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { Sidebar as SidebarUI, Toaster, toast } from '@drawloom/ui';
  import { createDesktopViewModel } from '$lib/view-model.svelte.js';
  import Sidebar from '$lib/Sidebar.svelte';
  import Conversation from '$lib/Conversation.svelte';
  import DetailsPane from '$lib/DetailsPane.svelte';
  import PrimaryView from '$lib/PrimaryView.svelte';
  import ConversationSearch from '$lib/ConversationSearch.svelte';
  import { detailsPaneActions, detailsPanePresentation } from '$lib/details-pane.js';
  import './app.css';
  const vm = createDesktopViewModel();
  const drawer = new MediaQuery('(max-width: 1050px)');
  const workspacePresentation = $derived(detailsPanePresentation(vm, vm.primaryView === 'conversation', drawer.current));
  const workspaceActions = detailsPaneActions(vm);
  const searchPresentation = $derived({ recent: (vm.state?.conversations ?? []).toReversed().map(c => ({ conversationId:c.id, title:c.title, projectId:c.projectId, projectName:vm.state?.projects.find(p=>p.id===c.projectId)?.name, workbenchId:c.workbenchId, provider:c.provider, archived:c.archived ?? false, match:"title" as const })), open:vm.navigation.searchOpen, query:vm.navigation.query, projectId:vm.navigation.projectId, archived:vm.navigation.archived, results:vm.navigation.results, loading:vm.navigation.loading, searchError:vm.navigation.searchError, commandError:vm.error, hasMore:vm.navigation.hasMore, projects:vm.state?.projects.map(({id,name})=>({id,name}))??[], workbenches:vm.state?.workbenches.map(({id,title})=>({id,title}))??[], busy:vm.busy, pending:vm.pendingCommand, renameOpen:vm.navigation.renameOpen, renameDraft:vm.navigation.renameDraft, managementError:vm.navigation.managementError });
  const searchActions = { newConversation:()=>{vm.navigation.closeSearch(); if(vm.state?.selectedProjectId) void vm.newConversationInProject(vm.state.selectedProjectId); else vm.primaryView="projects";}, openProjects:()=>{vm.navigation.closeSearch();vm.primaryView="projects";}, setOpen:(v:boolean)=>v?vm.navigation.openSearch():vm.navigation.closeSearch(), setQuery:(v:string)=>vm.navigation.query=v, setProject:(v:string)=>vm.navigation.projectId=v, setArchived:(v:'active'|'archived'|'all')=>vm.navigation.archived=v, more:()=>void vm.navigation.more(), openResult:(v:Parameters<typeof vm.navigation.openResult>[0])=>void vm.navigation.openResult(v), restore:async(id:string)=>{if(await vm.command({kind:'restore_conversation',conversationId:id})){toast.success('Conversation restored');vm.navigation.archived='active'}}, setRenameOpen:(v:boolean)=>vm.navigation.renameOpen=v, setRenameDraft:(v:string)=>vm.navigation.renameDraft=v, saveRename:async()=>{if(await vm.navigation.saveRename())toast.success('Conversation renamed')} };
  onMount(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); vm.navigation.openSearch(); } };
    addEventListener('keydown', shortcut); void vm.start();
    return () => { removeEventListener('keydown', shortcut); vm.stopPolling(); };
  });
</script>

<svelte:head><title>Drawloom — Local workbench</title></svelte:head>
<Toaster />
<ConversationSearch presentation={searchPresentation} actions={searchActions} />
<SidebarUI.Provider class="h-dvh min-h-0" style="--sidebar-width: 240px">
  <Sidebar {vm}/>
  <div
    class="app-shell"
    class:with-details={vm.primaryView === 'conversation' && vm.detailsOpen && !drawer.current && !vm.detailsExpanded}
    class:workspace-expanded={vm.primaryView === 'conversation' && vm.detailsOpen && vm.detailsExpanded}
    style:--workspace-width={vm.detailsWidth + 'px'}
  >
    <div class="workspace-conversation" class:workspace-conversation-hidden={vm.primaryView !== 'conversation' || vm.detailsOpen && (drawer.current || vm.detailsExpanded)}>
      <Conversation {vm}/>
    </div>
    <div class="workspace-pane" class:workspace-pane-hidden={vm.primaryView !== 'conversation' || !vm.detailsOpen} class:workspace-pane-full={drawer.current || vm.detailsExpanded}>
      {#key vm.state?.selectedId}<DetailsPane presentation={workspacePresentation} actions={workspaceActions}/>{/key}
    </div>
    {#if vm.primaryView !== 'conversation'}<PrimaryView {vm}/>{/if}
  </div>
</SidebarUI.Provider>

<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { Sidebar as SidebarUI } from '@drawloom/ui';
  import { createDesktopViewModel } from '$lib/view-model.svelte.js';
  import Sidebar from '$lib/Sidebar.svelte';
  import Conversation from '$lib/Conversation.svelte';
  import DetailsPane from '$lib/DetailsPane.svelte';
  import PrimaryView from '$lib/PrimaryView.svelte';
  import './app.css';
  const vm = createDesktopViewModel();
  const drawer = new MediaQuery('(max-width: 1050px)');
  onMount(() => { void vm.start(); return () => vm.stopPolling(); });
</script>

<svelte:head><title>Drawloom — Local workbench</title></svelte:head>
<SidebarUI.Provider class="h-dvh min-h-0" style="--sidebar-width: 240px">
  <Sidebar {vm}/>
  <div class="app-shell" class:with-details={vm.primaryView === 'conversation' && vm.detailsOpen && !drawer.current}>
    {#if vm.primaryView === 'conversation'}
      {#if drawer.current && vm.detailsOpen}<PrimaryView {vm} artifact />{:else}<Conversation {vm}/>{/if}
      {#if !drawer.current && vm.detailsOpen}<DetailsPane {vm}/>{/if}
    {:else}<PrimaryView {vm}/>{/if}
  </div>
</SidebarUI.Provider>

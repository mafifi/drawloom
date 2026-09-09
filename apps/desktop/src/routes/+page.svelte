<script lang="ts">
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { Sidebar as SidebarUI, Sheet } from '@drawloom/ui';
  import { createDesktopViewModel } from '$lib/view-model.svelte.js';
  import Sidebar from '$lib/Sidebar.svelte';
  import Conversation from '$lib/Conversation.svelte';
  import DetailsPane from '$lib/DetailsPane.svelte';
  import './app.css';
  const vm = createDesktopViewModel();
  const drawer = new MediaQuery('(max-width: 1050px)');
  onMount(() => { void vm.start(); return () => vm.stopPolling(); });
</script>

<svelte:head><title>Drawloom — Local workbench</title></svelte:head>
<SidebarUI.Provider class="h-dvh min-h-0" style="--sidebar-width: 240px">
  <Sidebar {vm}/>
  <div class="app-shell" class:with-details={vm.detailsOpen && !drawer.current}>
    <Conversation {vm}/>
    {#if drawer.current}
      <Sheet.Root bind:open={vm.detailsOpen}>
        <Sheet.Content side="right" showCloseButton={false} class="w-full gap-0 p-0 sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById('artifact-toggle')?.focus(); }}>
          <Sheet.Header class="sr-only"><Sheet.Title>Artifact and details</Sheet.Title><Sheet.Description>Inspect artifacts, reviews, tools and settings.</Sheet.Description></Sheet.Header>
          <DetailsPane {vm}/>
        </Sheet.Content>
      </Sheet.Root>
    {:else if vm.detailsOpen}<DetailsPane {vm}/>{/if}
  </div>
</SidebarUI.Provider>

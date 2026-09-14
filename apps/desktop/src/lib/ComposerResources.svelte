<script lang="ts">
import { Button, StatefulButton } from '@drawloom/ui';
import ResourceCard from './ResourceCard.svelte';
import type { DesktopViewModel } from './view-model.svelte.js';
let {vm}:{vm:DesktopViewModel}=$props();
</script>
<section class="flex flex-col gap-3 p-3" aria-label="Browse context resources">
      {#if vm.nativeResources.length}<section class="flex flex-col gap-2"><h3>Native resources</h3>
        {#each vm.nativeResources as resource}
          <div class="flex items-center justify-between gap-2"><span>{resource.name}<span class="block text-xs text-muted-foreground">{resource.origin} · {resource.availability}</span></span><StatefulButton variant="ghost" size="sm" disabled={!resource.readable || resource.availability !== 'available'} pending={vm.resourceIsPending('native', resource.id)} pendingLabel="Opening resource" onclick={() => vm.openNativeResource(resource.id)}>Open</StatefulButton></div>
          {#if vm.resourceError('native', resource.id)}<p role="status" class="text-sm text-muted-foreground">{vm.resourceError('native', resource.id)}</p>{/if}
        {/each}
        <p class="text-sm text-muted-foreground" role="status">Showing {vm.nativeResources.length} of {vm.nativeResourceMatchCount} matching resources.</p>
        {#if vm.nativeResources.length < vm.nativeResourceMatchCount}<Button variant="outline" onclick={() => vm.showMoreNativeResources()}>Load more native resources</Button>{/if}
      </section>{/if}
      {#each vm.state?.views.filter(view => view.workbenchId === vm.conversation?.workbenchId) ?? [] as view}
        <section class="flex flex-col gap-2">
          <h3>Resources · {view.title}</h3>
          <StatefulButton variant="outline" size="sm" pending={vm.resourceIsPending(view.id, 'list')} pendingLabel="Loading resources" onclick={() => vm.browseResources(view.id)}>Browse resources</StatefulButton>
          {#if vm.resourceError(view.id, 'list')}<p role="status" class="text-sm text-muted-foreground">{vm.resourceError(view.id, 'list')}</p>{/if}
          {#each vm.resourceListings[view.id]?.resources ?? [] as resource}
            <div class="flex items-center justify-between gap-2"><span class="min-w-0 break-words">{resource.title ?? resource.name}</span><StatefulButton variant="ghost" size="sm" pending={vm.resourceIsPending(view.id, resource.uri)} pendingLabel="Opening resource" onclick={() => vm.openResource(view.id, resource.uri)}>Open</StatefulButton></div>
            {#if vm.resourceError(view.id, resource.uri)}<p role="status" class="text-sm text-muted-foreground">{vm.resourceError(view.id, resource.uri)}</p>{/if}
          {/each}
          {#if vm.resourceListings[view.id]?.nextCursor}<StatefulButton variant="ghost" size="sm" pending={vm.resourceIsPending(view.id, 'list')} pendingLabel="Loading resources" onclick={() => vm.browseResources(view.id, true)}>Load more resources</StatefulButton>{/if}
        </section>
      {/each}
      {#each vm.openedResources as entry}{#each entry.resources ?? [] as resource}<ResourceCard presentation={vm.resourceCardPresentation(entry.id, resource)} actions={{ openWorkspace: () => vm.openResourceWorkspace(entry.id, resource), read: () => void vm.readResource(entry.id, resource), toggleContext: () => vm.toggleResource(entry.id, resource) }} />{/each}{/each}

</section>

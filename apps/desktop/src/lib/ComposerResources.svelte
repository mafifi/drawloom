<script lang="ts">
import { Button, StatefulButton } from '@drawloom/ui';
import ResourceCard from './ResourceCard.svelte';
import type { ComposerResourcesPresentation, ComposerResourcesActions } from './composer-view.js';
let { presentation, actions }: { presentation: ComposerResourcesPresentation; actions: ComposerResourcesActions } = $props();
</script>
<section class="flex flex-col gap-3 p-3" aria-label="Browse context resources">
  {#if presentation.native.length}<section class="flex flex-col gap-2"><h3>Native resources</h3>
    {#each presentation.native as resource}
      <div class="flex items-center justify-between gap-2"><span>{resource.name}<span class="block text-xs text-muted-foreground">{resource.origin} · {resource.availability}</span></span><StatefulButton variant="ghost" size="sm" disabled={!resource.readable || resource.availability !== 'available'} pending={resource.pending} pendingLabel="Opening resource" onclick={() => actions.openNativeResource(resource.id)}>Open</StatefulButton></div>
      {#if resource.error}<p role="status" class="text-sm text-muted-foreground">{resource.error}</p>{/if}
    {/each}
    <p class="text-sm text-muted-foreground" role="status">Showing {presentation.native.length} of {presentation.nativeMatchCount} matching resources.</p>
    {#if presentation.native.length < presentation.nativeMatchCount}<Button variant="outline" onclick={() => actions.showMoreNativeResources()}>Load more native resources</Button>{/if}
  </section>{/if}
  {#each presentation.views as view}
    <section class="flex flex-col gap-2">
      <h3>Resources · {view.title}</h3>
      <StatefulButton variant="outline" size="sm" pending={view.pending} pendingLabel="Loading resources" onclick={() => actions.browseResources(view.id)}>Browse resources</StatefulButton>
      {#if view.error}<p role="status" class="text-sm text-muted-foreground">{view.error}</p>{/if}
      {#each view.resources as resource}
        <div class="flex items-center justify-between gap-2"><span class="min-w-0 break-words">{resource.title}</span><StatefulButton variant="ghost" size="sm" pending={resource.pending} pendingLabel="Opening resource" onclick={() => actions.openResource(view.id, resource.uri)}>Open</StatefulButton></div>
        {#if resource.error}<p role="status" class="text-sm text-muted-foreground">{resource.error}</p>{/if}
      {/each}
      {#if view.nextCursor}<StatefulButton variant="ghost" size="sm" pending={view.pending} pendingLabel="Loading resources" onclick={() => actions.browseResources(view.id, true)}>Load more resources</StatefulButton>{/if}
    </section>
  {/each}
  {#each presentation.cards as card}<ResourceCard presentation={card.presentation} actions={card.actions} />{/each}
</section>

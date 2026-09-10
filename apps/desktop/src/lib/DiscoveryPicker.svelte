<script lang="ts">
  import { Alert, Button, Command, StatefulButton } from '@drawloom/ui';
  import ResourceCard from './ResourceCard.svelte';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm }: { vm: DesktopViewModel } = $props();
</script>

{#if vm.pickerOpen}
  <section class="discovery-suggestions" aria-label={vm.pickerKind === 'skill' ? 'Skill suggestions' : 'Integration and context suggestions'}>
    <header class="flex items-start justify-between gap-3 px-3 pt-3"><div><h2>{vm.pickerKind === 'skill' ? 'Skills' : 'Integrations and context'}</h2><p class="text-xs text-muted-foreground">Type to filter, use ↑/↓ and Enter to choose, or Escape to close.</p></div><Button variant="ghost" size="sm" onclick={() => vm.pickerOpen = false}>Close</Button></header>
    <Command.Root shouldFilter={false} bind:value={vm.pickerActiveId}>
      <Command.List role="listbox" aria-label={vm.pickerKind === 'skill' ? 'Skill results' : 'Integration and context results'}>
        <Command.Empty>{vm.cataloguePending ? 'Loading…' : 'No matching items.'}</Command.Empty>
        <Command.Group heading={vm.pickerKind === 'skill' ? 'Skills' : 'Integrations'}>
          {#each vm.pickerEntries as entry (entry.id)}
            <Command.Item value={'discovery:' + entry.id} disabled={!entry.selectable || entry.availability !== 'available' || entry.scope === 'required'} onSelect={() => vm.selectDiscovery(entry.id)}>
              <div class="flex min-w-0 flex-col gap-1"><span>{entry.name}</span><span class="text-xs text-muted-foreground">{entry.origin} · {entry.scope} · {entry.availability}{entry.scope === 'required' ? ' · already active' : ''}</span><span class="text-xs text-muted-foreground">{entry.description}</span></div>
            </Command.Item>
          {/each}
        </Command.Group>
        {#if vm.pickerKind === 'context'}<Command.Group heading="Documents">
          {#each vm.state?.operator.artifacts.filter(item => item.content.kind === 'text' && vm.contextLabel(item.id).toLowerCase().includes(vm.pickerQuery.toLowerCase())) ?? [] as artifact}
            <Command.Item value={'document:' + artifact.id} onSelect={() => vm.selectPickerContext(artifact.id)}>{vm.contextLabel(artifact.id)}{vm.contextIds.includes(artifact.id) ? ' · selected' : ''}</Command.Item>
          {/each}
        </Command.Group>{/if}
      </Command.List>
    </Command.Root>
    <p class="text-sm text-muted-foreground" role="status">Showing {vm.pickerEntries.length} of {vm.pickerMatchCount} matching {vm.pickerKind === 'skill' ? 'skills' : 'integrations'}. Search includes all results.</p>
    {#if vm.pickerEntries.length < vm.pickerMatchCount}<Button variant="outline" onclick={() => vm.showMorePicker()}>Load more {vm.pickerKind === 'skill' ? 'skills' : 'integrations'}</Button>{/if}
    {#if vm.catalogueError}<Alert.Root variant="destructive"><Alert.Description>{vm.catalogueError}</Alert.Description></Alert.Root>{/if}
    {#each vm.catalogue?.categories.filter(category => category.status !== 'available') ?? [] as category}<p class="text-sm text-muted-foreground">{category.kind}: {category.message ?? category.status}</p>{/each}
    <StatefulButton variant="ghost" pending={vm.cataloguePending} pendingLabel="Refreshing discovery" onclick={() => vm.refreshCatalogue(true)}>Refresh discovery</StatefulButton>
    {#if vm.pickerKind === 'context'}
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
      {#each vm.openedResources as entry}{#each entry.resources ?? [] as resource}<ResourceCard {vm} entryId={entry.id} reference={resource} />{/each}{/each}
    {/if}
  </section>
{/if}

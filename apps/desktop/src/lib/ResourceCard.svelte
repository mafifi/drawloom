<script lang="ts">
  import { Alert, Badge, Button, Collapsible, StatefulButton } from '@drawloom/ui';
  import type { ResourceReference } from '@drawloom/host';
  import ArtifactViewer from './ArtifactViewer.svelte';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm, entryId, reference }: { vm: DesktopViewModel; entryId: string; reference: ResourceReference } = $props();
  const resource = $derived(vm.resource(entryId, reference));
  const selected = $derived(vm.selectedResources.some(item => item.entryId === entryId && item.resourceId === resource.id));
</script>

<section class="flex flex-col gap-2 py-3" aria-label={resource.title || 'Resource'}>
  <div class="flex flex-wrap items-center gap-2"><span>{resource.title || 'Resource'}</span><Badge variant="outline">{resource.status}</Badge></div>
  <p class="text-sm text-muted-foreground">{resource.source}{resource.mimeType ? ` · ${resource.mimeType}` : ''}</p>
  {#if resource.uri}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Source reference</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="break-all text-sm text-muted-foreground">{resource.uri}</p></Collapsible.Content></Collapsible.Root>{/if}
  {#if resource.asset}
    {#if resource.asset.mediaType.startsWith('image/')}
      <ArtifactViewer artifact={{ id: resource.id, title: resource.title, content: { kind: 'asset', asset: resource.asset } }} />
    {:else}
      <Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview resource</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><ArtifactViewer artifact={{ id: resource.id, title: resource.title, content: { kind: 'asset', asset: resource.asset } }} /></Collapsible.Content></Collapsible.Root>
    {/if}
  {/if}
  {#if resource.status === 'readable'}<StatefulButton variant="outline" size="sm" pending={vm.resourceIsPending(entryId, resource.id)} pendingLabel="Reading resource" onclick={() => vm.readResource(entryId, resource)}>Read resource</StatefulButton>{/if}
  {#if resource.status === 'ready' && resource.asset?.mediaType.startsWith('text/')}<Button variant="outline" size="sm" aria-pressed={selected} onclick={() => vm.toggleResource(entryId, resource)}>{selected ? 'Remove from context' : 'Use as context'}</Button>{/if}
  {#if resource.status === 'unavailable'}<p class="text-sm text-muted-foreground">This source cannot provide the resource here. Its reference is retained.</p>{/if}
  {#if vm.resourceError(entryId, resource.id)}<Alert.Root variant="destructive"><Alert.Description>{vm.resourceError(entryId, resource.id)}</Alert.Description></Alert.Root>{/if}
</section>

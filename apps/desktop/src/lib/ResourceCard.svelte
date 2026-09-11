<script lang="ts">
  import { Alert, Badge, Button, Collapsible, StatefulButton } from '@drawloom/ui';
  import type { ResourceReference } from '@drawloom/host';
  import ArtifactViewer from './ArtifactViewer.svelte';
  import FileViewer from './FileViewer.svelte';
  import { remoteMediaPreviewUrl } from './media-ui.js';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm, entryId, reference }: { vm: DesktopViewModel; entryId: string; reference: ResourceReference } = $props();
  const resource = $derived(vm.resource(entryId, reference));
  const workingFile = $derived(vm.workingFile(resource));
  let openedWorkingFileUrl = $state('');
  const workingFileOpen = $derived(Boolean(workingFile && workingFile.url === openedWorkingFileUrl));
  const remotePreviewUrl = $derived(remoteMediaPreviewUrl(vm.state?.selectedId ?? '', entryId, resource));
  let remotePreviewOpen = $state(false);
  let remotePreviewLoading = $state(false);
  let remotePreviewError = $state('');
  const selected = $derived(vm.selectedResources.some(item => item.entryId === entryId && item.resourceId === resource.id));
</script>

<section class="flex flex-col gap-2 py-3" aria-label={resource.title || 'Resource'}>
  <div class="flex flex-wrap items-center gap-2"><span>{resource.title || 'Resource'}</span><Badge variant="outline">{workingFile ? 'working file' : resource.status}</Badge></div>
  <p class="text-sm text-muted-foreground">{resource.source}{resource.mimeType ? ` · ${resource.mimeType}` : ''}</p>
  {#if resource.uri}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Source reference</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="break-all text-sm text-muted-foreground">{resource.uri}</p></Collapsible.Content></Collapsible.Root>{/if}
  {#if resource.asset}
    {#if resource.asset.mediaType.startsWith('image/')}
      <ArtifactViewer artifact={{ id: resource.id, title: resource.title, content: { kind: 'asset', asset: resource.asset } }} />
    {:else}
      <Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview resource</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><ArtifactViewer artifact={{ id: resource.id, title: resource.title, content: { kind: 'asset', asset: resource.asset } }} /></Collapsible.Content></Collapsible.Root>
    {/if}
  {:else if workingFile}
    <p class="text-sm text-muted-foreground">Current project file; viewing does not import it or make it model context.</p>
    <Collapsible.Root open={workingFileOpen} onOpenChange={open => { openedWorkingFileUrl = open ? workingFile.url : ''; }}><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview working file</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content>{#if workingFileOpen}<FileViewer url={workingFile.url} downloadUrl={workingFile.downloadUrl} title={resource.title} mediaType={workingFile.mediaType} />{/if}</Collapsible.Content></Collapsible.Root>
  {:else if remotePreviewUrl}
    <p class="text-sm text-muted-foreground">Shared media preview only; viewing does not make this resource model context.</p>
    <Collapsible.Root open={remotePreviewOpen} onOpenChange={open => { remotePreviewOpen = open; remotePreviewLoading = open; remotePreviewError = ''; }}>
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">{remotePreviewOpen ? 'Close remote preview' : 'Preview remote media'}</Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content>
        {#if remotePreviewOpen}
          {#if remotePreviewLoading}<p class="text-sm text-muted-foreground" role="status">Loading remote preview…</p>{/if}
          {#if remotePreviewError}<Alert.Root variant="destructive"><Alert.Description>{remotePreviewError}</Alert.Description></Alert.Root>{/if}
          <iframe src={remotePreviewUrl} title={`Remote preview: ${resource.title || 'Resource'}`} sandbox="allow-scripts" referrerpolicy="no-referrer" class="min-h-80 w-full border-0" onload={() => { remotePreviewLoading = false; }} onerror={() => { remotePreviewLoading = false; remotePreviewError = 'The remote preview could not load. Close and reopen it to try again.'; }}></iframe>
        {/if}
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
  {#if resource.status === 'readable'}<StatefulButton variant="outline" size="sm" pending={vm.resourceIsPending(entryId, resource.id)} pendingLabel="Reading resource" onclick={() => vm.readResource(entryId, resource)}>Read resource</StatefulButton>{/if}
  {#if resource.status === 'ready' && resource.asset?.mediaType.startsWith('text/')}<Button variant="outline" size="sm" aria-pressed={selected} onclick={() => vm.toggleResource(entryId, resource)}>{selected ? 'Remove from context' : 'Use as context'}</Button>{/if}
  {#if resource.status === 'unavailable' && !workingFile && !remotePreviewUrl}<p class="text-sm text-muted-foreground">This source cannot provide the resource here. Its reference is retained.</p>{/if}
  {#if vm.resourceError(entryId, resource.id)}<Alert.Root variant="destructive"><Alert.Description>{vm.resourceError(entryId, resource.id)}</Alert.Description></Alert.Root>{/if}
</section>

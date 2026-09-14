<script lang="ts">
  import { Alert, Marker } from '@drawloom/ui';
  import type { ResourceReference } from '@drawloom/host';
  import ArtifactViewer from './ArtifactViewer.svelte';
  import FileViewer from './FileViewer.svelte';

  type WorkingFile = Readonly<{
    url: string;
    downloadUrl: string;
    mediaType: string;
  }>;

  type Presentation = Readonly<{
    resource: ResourceReference;
    workingFile?: WorkingFile;
    remotePreviewUrl?: string;
  }>;

  let { presentation }: { presentation: Presentation } = $props();
  let remoteLoading = $state(true);
  let remoteError = $state('');
</script>

<section class="preview workspace-resource" aria-label={presentation.resource.title || 'Resource preview'}>
  <p class="text-sm text-muted-foreground">
    {presentation.resource.source}{presentation.resource.mimeType ? ` · ${presentation.resource.mimeType}` : ''}
  </p>
  <p class="text-sm text-muted-foreground">
    Viewing preserves the original source reference. It does not import this resource or add it to model context.
  </p>
  {#if presentation.resource.asset}
    <ArtifactViewer artifact={{ id: presentation.resource.id, title: presentation.resource.title, content: { kind: 'asset', asset: presentation.resource.asset } }} />
  {:else if presentation.workingFile}
    <FileViewer
      url={presentation.workingFile.url}
      downloadUrl={presentation.workingFile.downloadUrl}
      title={presentation.resource.title}
      mediaType={presentation.workingFile.mediaType}
    />
  {:else if presentation.remotePreviewUrl}
    {#if remoteLoading}<Marker.Root role="status"><Marker.Content class="shimmer">Loading remote preview…</Marker.Content></Marker.Root>{/if}
    {#if remoteError}<Alert.Root variant="destructive"><Alert.Description>{remoteError}</Alert.Description></Alert.Root>{/if}
    <iframe
      src={presentation.remotePreviewUrl}
      title={`Remote preview: ${presentation.resource.title || 'Resource'}`}
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      class="min-h-80 w-full border-0"
      onload={() => { remoteLoading = false; }}
      onerror={() => { remoteLoading = false; remoteError = 'The remote preview could not load. Close and reopen the workspace to try again.'; }}
    ></iframe>
  {:else}
    <Alert.Root><Alert.Description>This source cannot provide a preview here. Its reference is retained.</Alert.Description></Alert.Root>
  {/if}
</section>

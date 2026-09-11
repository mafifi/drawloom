<script lang="ts">
  import { Attachment, Button, Collapsible, DocumentIcon } from '@drawloom/ui';
  import type { Asset } from '@drawloom/host';
  import ArtifactViewer from './ArtifactViewer.svelte';
  let { asset, title = 'Attachment' }: { asset: Asset; title?: string } = $props();
  const image = $derived(asset.mediaType.startsWith('image/'));
</script>

<section class="conversation-attachment flex w-full min-w-0 flex-col gap-2" aria-label={title}>
  <Attachment.Root class="w-full">
    <Attachment.Media><DocumentIcon /></Attachment.Media>
    <Attachment.Content><Attachment.Title>{title}</Attachment.Title><Attachment.Description>{asset.mediaType} · {(asset.size / 1024).toFixed(1)} KB</Attachment.Description></Attachment.Content>
  </Attachment.Root>
  {#if image}
    <ArtifactViewer artifact={{ id: asset.key, title, content: { kind: 'asset', asset } }} />
  {:else}
    <Collapsible.Root>
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview attachment</Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content><ArtifactViewer artifact={{ id: asset.key, title, content: { kind: 'asset', asset } }} /></Collapsible.Content>
    </Collapsible.Root>
  {/if}
</section>

<script lang="ts">
  import { Badge, Button, Collapsible } from '@drawloom/ui';
  import type { Asset } from '@drawloom/host';
  import ArtifactViewer from './ArtifactViewer.svelte';
  export let asset: Asset;
  export let title = 'Attachment';
  $: image = asset.mediaType.startsWith('image/');
</script>

<section class="reference-card" aria-label={title}>
  <div class="flex flex-wrap items-center gap-2"><span>{title}</span><Badge variant="outline" class="text-inherit">{asset.mediaType}</Badge><span class="text-xs opacity-85">{asset.size.toLocaleString()} bytes</span></div>
  {#if image}
    <ArtifactViewer artifact={{ id: asset.key, title, content: { kind: 'asset', asset } }} />
  {:else}
    <Collapsible.Root>
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview attachment</Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content><ArtifactViewer artifact={{ id: asset.key, title, content: { kind: 'asset', asset } }} /></Collapsible.Content>
    </Collapsible.Root>
  {/if}
</section>

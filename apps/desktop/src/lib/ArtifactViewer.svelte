<script lang="ts">
  import type { Artifact } from "@drawloom/workbench";
  import FileViewer from './FileViewer.svelte';
  let { artifact }: { artifact: Artifact } = $props();
  const asset = $derived(artifact.content.kind === "asset" ? artifact.content.asset : undefined);
  const url = $derived(asset ? "/api/assets/" + encodeURIComponent(asset.key) : "");
</script>

{#if artifact.content.kind === "text"}<div class="artifact-viewer"><div class="document-content">
      {artifact.content.text}
    </div></div>
{:else if asset}<FileViewer {url} downloadUrl={url + '?download=1'} title={artifact.title} mediaType={asset.mediaType} downloadName={asset.mediaType === 'video/quicktime' ? asset.key + '.mov' : artifact.title} />{/if}

<script lang="ts">
  import { Alert, Empty } from '@drawloom/ui';
  import { releaseMedia, releaseSource } from './native-viewer.js';
  let { url, downloadUrl, title, mediaType, downloadName = title }: { url: string; downloadUrl: string; title: string; mediaType: string; downloadName?: string } = $props();
  let failedUrl = $state('');
  function failed() { failedUrl = url; }
</script>

<div class="artifact-viewer">
  {#key url}
    {#if failedUrl === url}<Alert.Root variant="destructive"><Alert.Description>This file could not be loaded. It may be unavailable or use an unsupported encoding. Close and reopen the preview to retry, or save the file for a local viewer.</Alert.Description></Alert.Root>{/if}
    {#if mediaType.startsWith('image/')}<img use:releaseSource src={url} alt={title} onerror={failed} />
    {:else if mediaType.startsWith('audio/')}<audio use:releaseMedia src={url} controls preload="metadata" onerror={failed}>Audio playback is unavailable.</audio>
    {:else if mediaType === 'video/quicktime'}
      <Alert.Root><Alert.Description>MOV export. Browser playback is not available here. Download and open this file in a compatible local player.</Alert.Description></Alert.Root>
    {:else if mediaType.startsWith('video/')}
      <!-- svelte-ignore a11y_media_has_caption (User-provided media has no supplied caption track; the viewer never invents one.) -->
      <video use:releaseMedia src={url} controls preload="metadata" onerror={failed}>Video playback is unavailable.</video>
    {:else if mediaType === 'application/pdf'}<iframe use:releaseSource title={title} src={url} sandbox="" class="document-frame"></iframe>
    {:else if mediaType.startsWith('text/')}<iframe use:releaseSource title={title} src={url} sandbox="" class="document-frame"></iframe>
    {:else}<Empty.Root><Empty.Description>No inline viewer is available for this file.</Empty.Description></Empty.Root>{/if}
    <a href={downloadUrl} class="text-primary underline underline-offset-4" download={downloadName}>{mediaType === 'video/quicktime' ? 'Download MOV' : 'Save file'}</a>
  {/key}
</div>

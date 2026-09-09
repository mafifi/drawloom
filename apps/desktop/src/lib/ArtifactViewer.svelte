<script lang="ts">
  import type { Artifact } from "@drawloom/workbench";
  import { Alert, Empty } from "@drawloom/ui";
  export let artifact: Artifact;
  $: asset =
    artifact.content.kind === "asset" ? artifact.content.asset : undefined;
  $: url = asset ? "/api/assets/" + encodeURIComponent(asset.key) : "";
</script>

<div class="artifact-viewer">
  {#if artifact.content.kind === "text"}<div class="document-content">
      {artifact.content.text}
    </div>
  {:else if asset?.mediaType.startsWith("image/")}<img
      src={url}
      alt={artifact.title}
    />
  {:else if asset?.mediaType.startsWith("audio/")}<audio
      src={url}
      controls
      preload="metadata">Audio playback is unavailable.</audio
    >
  {:else if asset?.mediaType === "video/quicktime"}
    <Alert.Root
      ><Alert.Description>
        MOV export. Browser playback is not available here. Download and open
        this file in a compatible local player.
      </Alert.Description></Alert.Root
    >
  {:else if asset?.mediaType.startsWith("video/")}
    <!-- svelte-ignore a11y_media_has_caption (User-imported media has no supplied caption track; the viewer never invents one.) -->
    <video src={url} controls preload="metadata"
      >Video playback is unavailable.</video
    >
  {:else if asset?.mediaType === "application/pdf"}<iframe
      title={artifact.title}
      src={url}
      sandbox=""
      class="document-frame"
    ></iframe>
  {:else if asset?.mediaType.startsWith("text/")}<iframe
      title={artifact.title}
      src={url}
      sandbox=""
      class="document-frame"
    ></iframe>
  {:else}<Empty.Root
      ><Empty.Description
        >No inline viewer is available for this file.</Empty.Description
      ></Empty.Root
    >{/if}
  {#if asset}<a
      href={url + "?download=1"}
      class="text-primary underline underline-offset-4"
      download={asset.mediaType === "video/quicktime"
        ? asset.key + ".mov"
        : artifact.title}
      >{asset.mediaType === "video/quicktime" ? "Download MOV" : "Save file"}</a
    >{/if}
</div>

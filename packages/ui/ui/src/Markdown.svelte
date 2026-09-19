<script lang="ts">
  import Markdown from "./components/prompt-kit/markdown/markdown.svelte";
  let { text, resolveFile, streaming = false }: { text: string; streaming?: boolean; resolveFile?: ((url: string) => string | undefined) | undefined } = $props();
</script>

<Markdown content={text} {resolveFile} {streaming} class="markdown-content wrap-anywhere" />

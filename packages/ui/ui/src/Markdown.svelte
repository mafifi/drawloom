<script lang="ts">
  import Markdown from "./components/prompt-kit/markdown/markdown.svelte";
  let { text, resolveFile }: { text: string; resolveFile?: ((url: string) => string | undefined) | undefined } = $props();
</script>

<Markdown content={text} {resolveFile} class="markdown-content wrap-anywhere" />

<script lang="ts">
  import type { Snippet } from "svelte";
  let { label, pending = false, children }: { label: string; pending?: boolean; children: Snippet } = $props();
</script>

<section class="composer-attached-strip" aria-label={label} aria-busy={pending}>
  {@render children()}
</section>

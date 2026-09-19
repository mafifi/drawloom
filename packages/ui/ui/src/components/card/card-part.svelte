<script lang="ts">
  import { cn, type WithElementRef } from "../../utils.js";
  import type { HTMLAttributes } from "svelte/elements";
  let { ref = $bindable(null), class: className, children, kind, ...restProps }:
    WithElementRef<HTMLAttributes<HTMLDivElement>> & { kind: "header" | "content" | "footer" | "action" | "title" | "description" } = $props();
  const classes = $derived({
    header: "grid auto-rows-min items-start gap-1 px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
    content: "px-4", footer: "flex items-center border-t bg-muted-surface px-4 pt-4",
    action: "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
    title: "text-heading font-medium leading-snug", description: "text-chrome text-muted-foreground",
  }[kind]);
</script>
{#if kind === "description"}<p bind:this={ref} data-slot="card-description" class={cn(classes, className)} {...restProps}>{@render children?.()}</p>
{:else}<div bind:this={ref} data-slot={`card-${kind}`} class={cn(classes, className)} {...restProps}>{@render children?.()}</div>{/if}

<script lang="ts">
  import { cn, type WithElementRef } from "../../utils.js";
  import type { HTMLAttributes } from "svelte/elements";
  let { ref = $bindable(null), class: className, children, size = "default", ...restProps }:
    WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: "default" | "sm" } = $props();
</script>
<div bind:this={ref} data-slot="card" data-size={size} class={cn("group/card flex flex-col gap-4 overflow-hidden rounded-xl border bg-card py-4 text-sm text-card-foreground data-[size=sm]:gap-3 data-[size=sm]:py-3", className)} {...restProps}>{@render children?.()}</div>

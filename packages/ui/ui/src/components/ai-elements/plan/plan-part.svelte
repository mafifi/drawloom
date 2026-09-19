<script lang="ts">
  import { Part } from "../../card/index.js";
  import { cn } from "../../../utils.js";
  import { getPlanContext } from "./plan-context.svelte.js";
  import type { PlanPartProps } from "./types.js";
  let { class: className, children, kind, ...restProps }: PlanPartProps = $props();
  const context = getPlanContext();
</script>
<Part {kind} data-slot={`plan-${kind}`} class={cn(kind === "header" && "flex items-start justify-between", (kind === "title" || kind === "description") && context.isStreaming && "shimmer", className)} {...restProps}>{@render children?.()}</Part>

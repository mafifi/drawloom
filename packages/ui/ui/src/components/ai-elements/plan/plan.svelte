<script lang="ts">
  import { Collapsible } from "../../collapsible/index.js";
  import { Card } from "../../card/index.js";
  import { cn } from "../../../utils.js";
  import { setPlanContext } from "./plan-context.svelte.js";
  import type { PlanProps } from "./types.js";
  let { class: className, isStreaming = false, children, ...restProps }: PlanProps = $props();
  setPlanContext({ get isStreaming() { return isStreaming; } });
</script>
<Collapsible data-slot="plan" {...restProps}><Card class={cn("shadow-none", className)}>{@render children?.()}</Card></Collapsible>

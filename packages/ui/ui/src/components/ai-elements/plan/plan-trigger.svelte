<script lang="ts">
  import * as Collapsible from "../../collapsible/index.js";
  import { Button } from "../../button/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import type { PlanTriggerProps } from "./types.js";
  let { children, ...restProps }: PlanTriggerProps = $props();
</script>
<Collapsible.Trigger {...restProps}>{#snippet child({ props })}<Button {...props} size="icon" variant="ghost">{#if children}{@render children()}{:else}<ChevronsUpDownIcon /><span class="sr-only">Toggle plan</span>{/if}</Button>{/snippet}</Collapsible.Trigger>

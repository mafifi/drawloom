<script lang="ts">
  import * as Collapsible from "../../collapsible/index.js";
  import { Part } from "../../card/index.js";
  import type { PlanContentProps } from "./types.js";
  let { children, ...restProps }: PlanContentProps = $props();
</script>
<Collapsible.Content><Part kind="content" data-slot="plan-content" {...restProps}>{@render children?.()}</Part></Collapsible.Content>

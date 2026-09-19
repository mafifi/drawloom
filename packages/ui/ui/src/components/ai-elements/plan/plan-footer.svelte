<script lang="ts">import Part from "./plan-part.svelte"; import type { Snippet } from "svelte"; import type { HTMLAttributes } from "svelte/elements"; let { children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();</script>
<Part kind="footer" {...props}>{@render children?.()}</Part>

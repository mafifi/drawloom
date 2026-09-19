<script lang="ts">
	import { cn } from "../../../utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children: import("svelte").Snippet;
	} = $props();
</script>

<div class={cn("flex min-w-0 flex-wrap items-center gap-2", className)} {...restProps}>
	{@render children()}
</div>

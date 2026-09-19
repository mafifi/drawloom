<script lang="ts">
	import { Collapsible } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";

	let {
		defaultOpen = true,
		open = $bindable(defaultOpen),
		class: className,
		children
	}: {
		defaultOpen?: boolean;
		open?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<Collapsible bind:open class={cn(className)}>
	{#if children}
		{@render children()}
	{/if}
</Collapsible>

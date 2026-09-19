<script lang="ts">
	import { Collapsible } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import { Collapsible as CollapsiblePrimitive } from "bits-ui";
	import type { Snippet } from "svelte";

	export interface TaskProps extends CollapsiblePrimitive.RootProps {
		class?: string;
		children?: Snippet;
	}
	// indexing

	let { open = $bindable(true), class: className, children, ...restProps }: TaskProps = $props();
</script>

<Collapsible
	class={cn(
		"data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in",
		className
	)}
	bind:open
	{...restProps}
>
	{@render children?.()}
</Collapsible>

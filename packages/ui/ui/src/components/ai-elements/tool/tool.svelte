<script lang="ts">
	import { Collapsible } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";

	// indexing

	interface ToolProps {
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	let { class: className = "", children, ...restProps }: ToolProps = $props();

	const id = $props.id();
</script>

<Collapsible {id} class={cn("not-prose mb-4 w-full rounded-md border", className)} {...restProps}>
	{@render children?.()}
</Collapsible>

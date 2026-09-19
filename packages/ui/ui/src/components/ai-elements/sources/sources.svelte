<script lang="ts">
	import { Collapsible } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";

	interface Props {
		class?: string;
		children?: Snippet;
		[key: string]: any;
	}

	// indexing

	let { class: className = "", children, ...restProps }: Props = $props();

	const id = $props.id();
</script>

<Collapsible {id} class={cn("not-prose text-primary mb-4 text-xs", className)} {...restProps}>
	{@render children?.()}
</Collapsible>

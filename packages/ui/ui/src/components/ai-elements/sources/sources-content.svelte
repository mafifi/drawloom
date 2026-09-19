<script lang="ts">
	import { CollapsibleContent } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";

	interface Props {
		class?: string;
		[key: string]: any;
		children?: Snippet;
	}

	let { class: className = "", children, ...restProps }: Props = $props();

	const id = $props.id();
</script>

<CollapsibleContent
	{id}
	class={cn(
		"mt-3 flex w-fit flex-col gap-2",
		"data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=open]:animate-in outline-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</CollapsibleContent>

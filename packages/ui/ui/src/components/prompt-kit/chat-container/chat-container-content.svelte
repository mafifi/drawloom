<script lang="ts">
	import { cn } from "../../../utils.js";
	import { getChatContainerContext } from "./context.svelte.js";

	let {
		children,
		ref = $bindable<HTMLDivElement | null>(null),
		class: className,
		...restProps
	}: {
		children?: import("svelte").Snippet;
		ref?: HTMLDivElement | null;
		class?: string;
		[key: string]: any;
	} = $props();

	const context = getChatContainerContext();

	function bindContentElement(node: HTMLDivElement) {
		ref = node;
		context.setContentElement(node);

		return () => {
			ref = null;
			context.setContentElement(null);
		};
	}
</script>

<div
	{@attach bindContentElement}
	class={cn("flex w-full flex-col", className)}
	{...restProps}
>
	{@render children?.()}
</div>

<script lang="ts">
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		class: className,
		speaker = "assistant",
		children,
		...restProps
	}: {
		class?: string;
		speaker?: "user" | "assistant";
		children: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn("conversation-message", className)} data-speaker={speaker} {...restProps}>
	{@render children()}
</div>

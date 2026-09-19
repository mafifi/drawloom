<script lang="ts">
	import { cn } from "../../../utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import Markdown from "../../../Markdown.svelte";

	let {
		markdown = false,
		class: className,
		content,
		children,
		...restProps
	}: {
		content?: string;
		markdown?: boolean;
		class?: string;
		children?: Snippet;
	} & HTMLAttributes<HTMLDivElement> = $props();
</script>

{#if markdown && content}
	<div
		class={cn(
			"message-content",
			className
		)}
		{...restProps}
	><Markdown text={content} /></div>
{:else}
	<div
		class={cn(
			"message-content",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</div>
{/if}

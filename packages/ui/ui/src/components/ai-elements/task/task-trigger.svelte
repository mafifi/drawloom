<script lang="ts">
	import { CollapsibleTrigger } from "../../collapsible/index.js";
	import { cn } from "../../../utils.js";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import Search from "@lucide/svelte/icons/search";
	import { Collapsible as CollapsiblePrimitive } from "bits-ui";
	import type { Snippet } from "svelte";

	export interface TaskTriggerProps extends CollapsiblePrimitive.TriggerProps {
		title: string;
		class?: string;
		children?: Snippet;
	}

	let { children, class: className, title, ...restProps }: TaskTriggerProps = $props();

</script>

{#if children}
	<CollapsibleTrigger class={cn("group", className)} {...restProps}>
		{@render children?.()}
	</CollapsibleTrigger>
{:else}
	<CollapsibleTrigger class={cn("group", className)} {...restProps}>
		<div
			class="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center gap-2 text-sm transition-colors"
		>
			<Search class="size-4" />
			<p class="text-sm">{title}</p>
			<ChevronDown class="size-4 motion-safe:transition-transform group-data-[state=open]:rotate-180" />
		</div>
	</CollapsibleTrigger>
{/if}

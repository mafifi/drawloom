<script lang="ts">
	import { cn } from "../../../utils.js";
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import {
		PromptInputClass,
		setPromptInputContext,
		type PromptInputSchema
	} from "./context.svelte.js";
	import { untrack } from "svelte";
	import { watch } from "runed";

	let {
		class: className,
		isLoading = false,
		disabled = false,
		ref = $bindable<HTMLDivElement | null>(null),
		value,
		onValueChange,
		maxHeight = 240,
		onSubmit,
		children,
		...restProps
	}: PromptInputSchema & {
		class?: string;
		ref?: HTMLDivElement | null;
		children: import("svelte").Snippet;
	} & import("svelte/elements").HTMLAttributes<HTMLDivElement> = $props();

	const contextInstance = new PromptInputClass({
		isLoading: untrack(() => isLoading),
		value: untrack(() => value),
		onValueChange: untrack(() => onValueChange),
		maxHeight: untrack(() => maxHeight),
		onSubmit: untrack(() => onSubmit),
		disabled: untrack(() => disabled)
	});

	setPromptInputContext(contextInstance);

	// Sync props with context
	// $effect(() => {
	// 	contextInstance.isLoading = isLoading;
	// 	contextInstance.disabled = isLoading;
	// });
	watch(
		[() => isLoading, () => disabled],
		() => {
			contextInstance.isLoading = isLoading;
			contextInstance.disabled = disabled;
		}
	);

	watch(
		() => value,
		(newValue) => {
			if (newValue !== undefined) {
				contextInstance.value = newValue;
			}
		}
	);

	watch(
		() => onValueChange,
		(newValue) => {
			contextInstance.onValueChange = newValue;
		}
	);

	watch(
		() => maxHeight,
		() => {
			contextInstance.maxHeight = maxHeight;
		}
	);

	watch(
		() => onSubmit,
		() => {
			contextInstance.onSubmit = onSubmit;
		}
	);

	function handleClick(event: MouseEvent) {
		// Do not steal focus from toolbar actions, links or a selected file.
		if (event.target === event.currentTarget) contextInstance.textareaRef?.focus();
	}

</script>

<TooltipPrimitive.Provider>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		bind:this={ref}
		class={cn(
			"cursor-text rounded-3xl border border-input bg-background p-2 shadow-xs",
			className
		)}
		{...restProps}
		onclick={handleClick}
	>
		<!-- onkeydown={handleKeyDown} -->
		{@render children()}
	</div>
</TooltipPrimitive.Provider>

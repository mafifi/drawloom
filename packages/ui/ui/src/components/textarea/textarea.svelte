<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "../../utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-ring disabled:bg-control-hover aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-invalid-ring md:text-sm dark:bg-control-background dark:disabled:bg-control-active dark:aria-invalid:border-destructive-border dark:aria-invalid:ring-invalid-ring flex field-sizing-content min-h-16 w-full outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:value
	{...restProps}></textarea>

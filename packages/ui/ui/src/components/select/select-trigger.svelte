<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithoutChild } from "../../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = "default",
		variant = "outline",
		...restProps
	}: WithoutChild<SelectPrimitive.TriggerProps> & {
		size?: "sm" | "default";
		variant?: "outline" | "ghost";
	} = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-invalid-ring data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-md *:data-[slot=select-value]:flex *:data-[slot=select-value]:gap-1.5 dark:bg-control-background dark:hover:bg-control-hover dark:aria-invalid:border-destructive-border dark:aria-invalid:ring-invalid-ring [&_svg:not([class*='size-'])]:size-4 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variant === "ghost" && "border-transparent bg-transparent shadow-none dark:bg-transparent dark:hover:bg-accent hover:bg-accent focus-visible:ring-1",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ChevronDownIcon class="size-4 text-muted-foreground pointer-events-none" />
</SelectPrimitive.Trigger>

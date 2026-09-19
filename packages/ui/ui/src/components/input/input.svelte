<script lang="ts">
	import { cn, type WithElementRef } from "../../utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-ring disabled:bg-control-hover aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-invalid-ring md:text-sm dark:bg-control-background dark:disabled:bg-control-active dark:aria-invalid:border-destructive-border dark:aria-invalid:ring-invalid-ring w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		type="file"
		bind:files
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors file:h-6 file:text-sm file:font-medium focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-focus-ring disabled:bg-control-hover aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-invalid-ring md:text-sm dark:bg-control-background dark:disabled:bg-control-active dark:aria-invalid:border-destructive-border dark:aria-invalid:ring-invalid-ring w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}

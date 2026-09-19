<script lang="ts">
	import { cn } from "../../../utils.js";
	import Textarea from "../../textarea/textarea.svelte";
	import { getPromptInputContext } from "./context.svelte.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { watch } from "runed";

	let {
		class: className,
		onkeydown,
		oninput,
		ref = $bindable<HTMLTextAreaElement | null>(null),
		disableAutosize = false,
		...restProps
	}: HTMLTextareaAttributes & {
		disableAutosize?: boolean;
		ref?: HTMLTextAreaElement | null;
	} = $props();

	const context = getPromptInputContext();
	$effect(() => { context.textareaRef = ref; });

	// Auto-resize functionality using watch from runed
	watch(
		[() => context.value, () => context.maxHeight, () => disableAutosize],
		() => {
			if (disableAutosize) return;
			if (!context.textareaRef) return;

			if (context.textareaRef.scrollTop === 0) {
				context.textareaRef.style.height = "auto";
			}

			context.textareaRef.style.height =
				typeof context.maxHeight === "number"
					? `${Math.min(context.textareaRef.scrollHeight, context.maxHeight)}px`
					: `min(${context.textareaRef.scrollHeight}px, ${context.maxHeight})`;
		}
	);

	function handleKeyDown(
		e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }
	) {
		onkeydown?.(e);
		if (e.defaultPrevented || e.isComposing || context.disabled) return;
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			context.onSubmit?.();
		}
	}

	function handleInput(e: Event & { currentTarget: HTMLTextAreaElement }) {
		context.setValue(e.currentTarget.value);
		oninput?.(e);
	}
</script>

<Textarea
	bind:ref
	value={context.value}
	oninput={handleInput}
	onkeydown={handleKeyDown}
	class={cn(
		"min-h-11 w-full resize-none border-none !bg-transparent text-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
		className
	)}
	rows={1}
	disabled={context.disabled}
	{...restProps}
></Textarea>

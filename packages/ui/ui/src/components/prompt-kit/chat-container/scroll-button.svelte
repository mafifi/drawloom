<script lang="ts" module>
	import { cn } from "../../../utils.js";
	import {
		type ButtonSize,
		type ButtonVariant
	} from "../../button/index.js";

	export type ScrollButtonProps = {
		class?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		ref?: HTMLElement | null;
		onclick?: (event: MouseEvent) => void;
	};
</script>

<script lang="ts">
	import { Button } from "../../button/index.js";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import { getChatContainerContext } from "./context.svelte.js";

	let {
		class: className,
		variant = "outline",
		size = "sm",
		ref = $bindable(null),
		onclick
	}: ScrollButtonProps = $props();

	const context = getChatContainerContext();
	const isAtBottom = $derived(context.isAtBottom);

	const handleClick = (event: MouseEvent) => {
		void context.scrollToBottom("instant");
		onclick?.(event);
	};
</script>

<Button
	bind:ref
	{variant}
	{size}
	aria-label="Scroll to bottom"
 tabindex={isAtBottom ? -1 : 0}
 aria-hidden={isAtBottom}
 disabled={isAtBottom}
	class={cn(
		"h-10 w-10 rounded-full transition-all duration-150 ease-out motion-reduce:transition-none",
		!isAtBottom
			? "translate-y-0 scale-100 opacity-100"
			: "invisible pointer-events-none translate-y-4 scale-95 opacity-0",
		className
	)}
	onclick={handleClick}
>
	<ChevronDown class="h-5 w-5" />
</Button>

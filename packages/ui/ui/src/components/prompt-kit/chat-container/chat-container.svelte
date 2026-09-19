<script lang="ts">
	import { watch } from "runed";
	import { untrack } from "svelte";
	import { cn } from "../../../utils.js";
	import {
		setChatContainerContext,
		type ChatContainerAnimation,
		type ChatContainerInitialAnimation
	} from "./context.svelte.js";

	let {
		ref = $bindable<HTMLDivElement | null>(null),
		children,
		class: className,
		resize = "smooth",
		initial = "instant",
		...restProps
	}: {
		ref?: HTMLDivElement | null;
		children?: import("svelte").Snippet;
		class?: string;
		resize?: ChatContainerAnimation;
		initial?: ChatContainerInitialAnimation;
		[key: string]: any;
	} = $props();

	const context = setChatContainerContext(untrack(() => resize), untrack(() => initial));
	export const stopScroll = context.stopScroll;
	export const scrollToBottom = context.scrollToBottom;

	function bindScrollElement(node: HTMLDivElement) {
		ref = node;
		context.setScrollElement(node);
		// Upward wheel events normally originate on message descendants. The
		// underlying follower only handles a wheel targeted at the scrollport.
		const leaveTail = (event: WheelEvent) => {
			if (event.deltaY < 0) context.stopScroll();
		};
		node.addEventListener("wheel", leaveTail, { passive: true });

		return () => {
			node.removeEventListener("wheel", leaveTail);
			ref = null;
			context.setScrollElement(null);
		};
	}

	watch(
		() => resize,
		() => {
			context.updateResize(resize);
		}
	);

	watch(
		() => initial,
		() => {
			context.updateInitial(initial);
		}
	);
</script>

<div
	{@attach bindScrollElement}
	class={cn("flex overflow-y-auto", className)}
	role="log"
	{...restProps}
>
	{@render children?.()}
</div>

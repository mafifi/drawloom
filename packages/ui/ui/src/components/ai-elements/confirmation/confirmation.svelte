<script lang="ts" module>
	import { cn, type WithElementRef } from "../../../utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";
	import type { ToolUIPartApproval, ToolUIPartState } from "./confirmation-context.svelte.js";

	export interface ConfirmationProps extends WithElementRef<HTMLAttributes<HTMLDivElement>> {
		approval?: ToolUIPartApproval;
		state: ToolUIPartState;
		children?: Snippet;
	}
	// indexing
</script>

<script lang="ts">
	import { Alert } from "../../alert/index.js";
	import { setConfirmationContext } from "./confirmation-context.svelte.js";

	let {
		class: className,
		approval,
		state,
		children,
		ref = $bindable(null),
		...restProps
	}: ConfirmationProps = $props();

	// Only render if approval exists and not in input states
	let shouldRender = $derived(
		approval && state !== "input-streaming" && state !== "input-available"
	);

	// Context is installed once; getters retain live consumer-owned state.
	setConfirmationContext({ get approval() { return approval; }, get state() { return state; } });
</script>

{#if shouldRender}
	<Alert bind:ref class={cn("flex min-w-0 max-w-full flex-col gap-3 wrap-anywhere", className)} {...restProps}>
		{@render children?.()}
	</Alert>
{/if}

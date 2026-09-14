<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		onkeydown,
		...restProps
	}: ContextMenuPrimitive.TriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger
	bind:ref
	data-slot="context-menu-trigger"
	class={cn("select-none", className)}
	{...restProps}
	onkeydown={(event) => {
		onkeydown?.(event);
		if (event.defaultPrevented || restProps.disabled || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return;
		event.preventDefault();
		const target = event.currentTarget;
		const bounds = target.getBoundingClientRect();
		// WebKit does not synthesize a contextmenu event for these keyboard keys.
		target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: bounds.left + 12, clientY: bounds.bottom }));
	}}
/>

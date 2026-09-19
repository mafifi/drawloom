<script lang="ts">
	import { CollapsibleTrigger } from "../../collapsible/index.js";
	import { Badge } from "../../badge/index.js";
	import { cn } from "../../../utils.js";

	import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import CircleIcon from "@lucide/svelte/icons/circle";
	import ClockIcon from "@lucide/svelte/icons/clock";
	import WrenchIcon from "@lucide/svelte/icons/wrench";
	import XCircleIcon from "@lucide/svelte/icons/x-circle";

	type ToolUIPartType = string;
	type ToolUIPartState =
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";

	interface ToolHeaderProps {
		statusLabel?: string;
		type: ToolUIPartType;
		state: ToolUIPartState;
		class?: string;
		[key: string]: any;
	}

	let { type, state, statusLabel, class: className = "", ...restProps }: ToolHeaderProps = $props();

	let getStatusBadge = $derived.by(() => {
		let labels = {
			"input-streaming": "Pending",
			"input-available": "Running",
			"output-available": "Completed",
			"output-error": "Error",
		} as const;

		let icons = {
			"input-streaming": CircleIcon,
			"input-available": ClockIcon,
			"output-available": CheckCircleIcon,
			"output-error": XCircleIcon,
		} as const;

		let IconComponent = icons[state];
		let label = labels[state];

		return { IconComponent, label };
	});
	let IconComponent = $derived(getStatusBadge.IconComponent);

	let id = $props.id();
</script>

<CollapsibleTrigger
	{id}
	class={cn("group flex w-full min-w-0 items-center justify-between gap-3 p-3 text-left", className)}
	{...restProps}
>
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		<WrenchIcon class="text-muted-foreground size-4" />
		<span class="text-chrome wrap-anywhere">{type}</span>
		<Badge class="gap-1.5 rounded-full text-xs" variant="secondary">
			<!-- <svelte:component
        this={getStatusBadge.IconComponent}
        class={cn(
          "size-4",
          state === "input-available" && "motion-safe:animate-pulse",
          state === "output-available" && "text-foreground",
          state === "output-error" && "text-destructive"
        )}
      /> -->
			<IconComponent
				class={cn(
					"size-4",
					state === "input-available" && "motion-safe:animate-pulse",
					state === "output-available" && "text-foreground",
					state === "output-error" && "text-destructive"
				)}
			/>

			{statusLabel ?? getStatusBadge.label}
		</Badge>
	</div>
	<ChevronDownIcon
		class="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180"
	/>
</CollapsibleTrigger>

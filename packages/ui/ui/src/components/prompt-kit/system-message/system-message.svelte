<script lang="ts">
	import { tv, type VariantProps } from "tailwind-variants";
	import AlertCircle from "@lucide/svelte/icons/alert-circle";
	import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
	import Info from "@lucide/svelte/icons/info";

	import { Button } from "../../button/index.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "../../../utils.js";
	import type { Component } from "svelte";

	const systemMessageVariants = tv({
		base: "flex min-w-0 flex-wrap items-center gap-3 rounded-xl border py-2 pr-2 pl-3",
		variants: {
			variant: {
				action: "text-muted-foreground",
				error: "text-destructive",
				warning: "text-foreground"
			},
			fill: {
				true: "bg-background",
				false: ""
			}
		},
		compoundVariants: [
			{
				variant: "action",
				fill: true,
				class: "border-transparent bg-muted"
			},
			{
				variant: "error",
				fill: true,
				class: "border-transparent bg-destructive-subtle"
			},
			{
				variant: "warning",
				fill: true,
				class: "border-transparent bg-muted"
			},
			{
				variant: "action",
				fill: false,
				class: "border-border"
			},
			{
				variant: "error",
				fill: false,
				class: "border-destructive"
			},
			{
				variant: "warning",
				fill: false,
				class: "border-border"
			}
		],
		defaultVariants: {
			variant: "action",
			fill: false
		}
	});

	type Props = HTMLAttributes<HTMLDivElement> &
		VariantProps<typeof systemMessageVariants> & {
			icon?: Snippet;
			isIconHidden?: boolean;
			cta?: {
				label: string;
				onClick?: () => void;
				variant?:
					| "default"
					| "destructive"
					| "outline"
					| "secondary"
					| "ghost"
					| "link";
			};
			children: Snippet;
		};

	let {
		children,
		variant = "action",
		fill = false,
		icon,
		isIconHidden = false,
		cta,
		class: className,
		...props
	}: Props = $props();

	let getDefaultIcon = (): Component | null => {
		if (isIconHidden) return null;

		switch (variant) {
			case "error":
				return AlertCircle;
			case "warning":
				return AlertTriangle;
			default:
				return Info;
		}
	};

	let IconComponent = $derived(icon ? null : getDefaultIcon());
	let shouldShowIcon = $derived(
		!isIconHidden && (icon !== undefined || IconComponent !== null)
	);
</script>

<div class={cn(systemMessageVariants({ variant, fill }), className)} {...props}>
	<div class="flex min-w-0 flex-1 items-center gap-3 leading-normal">
		{#if shouldShowIcon}
			<div
				class="flex h-[1lh] shrink-0 items-center justify-center self-start"
			>
				{#if icon}
					{@render icon()}
				{:else if IconComponent}
					<IconComponent class="size-4" />
				{/if}
			</div>
		{/if}

		<div
			class="flex min-w-0 flex-1 items-center {shouldShowIcon
				? 'gap-3'
				: 'gap-0'}"
		>
			<div class="text-sm">
				{@render children()}
			</div>
		</div>
	</div>

	{#if cta}
		<Button
			variant={cta.variant || "default"}
			size="sm"
			onclick={cta.onClick}
		>
			{cta.label}
		</Button>
	{/if}
</div>

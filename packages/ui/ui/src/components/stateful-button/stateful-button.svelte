<script lang="ts" module>
  import type { ButtonProps } from "../button/index.js";

  export type StatefulButtonProps = ButtonProps & {
    pending?: boolean;
    pendingLabel?: string;
    iconOnly?: boolean;
  };
</script>

<script lang="ts">
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import { Button } from "../button/index.js";

  let {
    pending = false,
    pendingLabel = "Working",
    iconOnly = false,
    disabled,
    ref = $bindable(null),
    children,
    onclick,
    "aria-label": ariaLabel,
    "aria-busy": ariaBusy,
    ...restProps
  }: StatefulButtonProps = $props();
</script>

<Button
  {...restProps}
  bind:ref
  disabled={pending || disabled}
  aria-busy={pending ? true : ariaBusy}
  aria-label={pending ? pendingLabel : ariaLabel}
  onclick={pending || disabled
    ? (event) => {
      event.preventDefault();
      event.stopPropagation();
    }
    : onclick}
>
  {#if pending}
    <LoaderCircle aria-hidden="true" class="animate-spin motion-reduce:animate-none" />
    <span class={iconOnly ? "sr-only" : undefined}>{pendingLabel}</span>
  {:else}
    {@render children?.()}
  {/if}
</Button>

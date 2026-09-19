<script lang="ts">
  import { tick } from "svelte";
  import { Button, Collapsible, Confirmation, StatefulButton } from "@drawloom/ui";
  import type { ApprovalCardActions, ApprovalCardPresentation } from "./approval-presentation.js";
  let { presentation: p, actions: a }: { presentation: ApprovalCardPresentation; actions: ApprovalCardActions } = $props();
  let surface: HTMLDivElement;
  async function changeSurface(action: () => Promise<unknown>) {
    const before = document.activeElement;
    const ownedFocus = before instanceof HTMLElement && surface.contains(before);
    await action();
    await tick();
    if (ownedFocus && surface.isConnected && (document.activeElement === before || document.activeElement === document.body))
      surface.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }
</script>

<div bind:this={surface} class="min-w-0 max-w-full">
<Confirmation.Root class="interaction" approval={{ id: p.approvalId }} state="approval-requested">
  <h2 class="text-chrome">{p.title}</h2>
  <Confirmation.Title>{p.summary}</Confirmation.Title>
    {#if p.details}
      <Collapsible.Root>
        <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost">{p.detailsLabel}</Button>{/snippet}</Collapsible.Trigger>
        <Collapsible.Content><pre class="max-w-full whitespace-pre-wrap wrap-anywhere">{p.details}</pre></Collapsible.Content>
      </Collapsible.Root>
    {/if}
    {#if p.message}<p role="status" aria-live="polite">{p.message}</p>{/if}
    <Confirmation.Actions>
      {#each p.options as option (option.optionId)}
        <StatefulButton class="h-auto min-h-8 max-w-full whitespace-normal wrap-anywhere" variant="outline" disabled={p.disabled} pending={option.pending} onclick={() => a.choose(option.optionId)}>{option.label}</StatefulButton>
      {/each}
    </Confirmation.Actions>
    <div class="flex flex-wrap items-center gap-2 border-t pt-3">
      {#if p.reopen}<StatefulButton variant="outline" disabled={p.disabled} pending={p.reopenPending} onclick={() => changeSurface(a.reopen)}>{p.reopenLabel}</StatefulButton>{/if}
      {#if p.dismiss}<Button variant="ghost" disabled={p.disabled} onclick={() => changeSurface(a.dismiss)}>{p.dismissLabel}</Button>{/if}
      <StatefulButton variant="ghost" pending={p.stopping} pendingLabel={p.stopPendingLabel} disabled={p.stopping} onclick={a.stop}>{p.stopLabel}</StatefulButton>
    </div>
</Confirmation.Root>
</div>

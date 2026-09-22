<script lang="ts" module>
  export type GoalBarStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete";
  export interface GoalBarLabels { objective: string; create: string; edit: string; save: string; cancel: string; pause: string; resume: string; clear: string }
  export type GoalBarPresentation = {
    mode: "create"; editing: boolean; draft: string; pendingAction?: "create"; error?: string; labels: GoalBarLabels;
  } | {
    mode: "goal"; objective: string; status: GoalBarStatus; statusLabel: string; timeUsedLabel?: string; accountingLabel?: string;
    clock?: { seconds: number; running: boolean };
    editing: boolean; draft: string; pendingAction?: "edit" | "pause" | "resume" | "clear"; error?: string;
    canPause: boolean; canResume: boolean; disabled?: boolean; labels: GoalBarLabels;
  };
  export interface GoalBarActions { setDraft(value: string): void; beginEdit(): void; cancelEdit(): void; save(): Promise<void>; pause(): Promise<void>; resume(): Promise<void>; clear(): Promise<void> }
  export interface GoalBarProps { presentation: GoalBarPresentation; actions: GoalBarActions }
</script>
<script lang="ts">
  import { Button } from "../button/index.js";
  import { StatefulButton } from "../stateful-button/index.js";
  import { Input } from "../input/index.js";
  import * as Tooltip from "../tooltip/index.js";
  import GoalIcon from "@lucide/svelte/icons/target";
  import EditIcon from "@lucide/svelte/icons/pencil";
  import PauseIcon from "@lucide/svelte/icons/pause";
  import ResumeIcon from "@lucide/svelte/icons/play";
  import ClearIcon from "@lucide/svelte/icons/trash-2";
  import SaveIcon from "@lucide/svelte/icons/check";
  import CancelIcon from "@lucide/svelte/icons/x";
  import { tick } from "svelte";
  import GoalClock from "./goal-clock.svelte";
  import ComposerStrip from "../composer-strip.svelte";
  let { presentation, actions }: GoalBarProps = $props();
  const pending = $derived(presentation.pendingAction !== undefined);
  let editTrigger = $state<HTMLButtonElement | null>(null);
  let editor = $state<HTMLInputElement | null>(null);
  $effect(() => { if (presentation.editing) void tick().then(() => editor?.focus()); });
  async function save() { await actions.save(); await tick(); if (!presentation.editing) editTrigger?.focus(); }
  async function cancel() { actions.cancelEdit(); await tick(); editTrigger?.focus(); }
</script>
{#if presentation.mode === "goal" || presentation.editing}
<ComposerStrip label="Goal" {pending}>
  <Tooltip.Provider delayDuration={250}>
    <div class="flex min-w-0 items-center gap-2">
      <GoalIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {#if presentation.editing}
        <Input bind:ref={editor} class="h-7 min-w-0 flex-1" aria-label={presentation.labels.objective} value={presentation.draft} disabled={presentation.mode === "goal" && presentation.disabled} oninput={(event) => actions.setDraft(event.currentTarget.value)} onkeydown={(event) => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void save(); } if (event.key === "Escape") { event.preventDefault(); void cancel(); } }} />
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<StatefulButton {...props} size="icon-sm" iconOnly pending={presentation.pendingAction === "create" || presentation.pendingAction === "edit"} pendingLabel={presentation.mode === "create" ? presentation.labels.create : presentation.labels.save} disabled={!presentation.draft.trim() || (presentation.mode === "goal" && presentation.disabled)} aria-label={presentation.mode === "create" ? presentation.labels.create : presentation.labels.save} onclick={save}><SaveIcon /></StatefulButton>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.mode === "create" ? presentation.labels.create : presentation.labels.save}</Tooltip.Content></Tooltip.Root>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} size="icon-sm" variant="ghost" disabled={pending} aria-label={presentation.labels.cancel} onclick={cancel}><CancelIcon /></Button>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.labels.cancel}</Tooltip.Content></Tooltip.Root>
      {:else if presentation.mode === "goal"}
        <span class="shrink-0 font-medium">{presentation.statusLabel}</span>
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" class="h-7 min-w-0 flex-1 justify-start px-1 font-normal" aria-label={`${presentation.labels.objective}: ${presentation.objective}`}><span class="truncate">{presentation.objective}</span></Button>{/snippet}</Tooltip.Trigger><Tooltip.Content class="max-w-sm whitespace-normal">{presentation.objective}</Tooltip.Content></Tooltip.Root>
        {#if presentation.timeUsedLabel}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" class="h-7 shrink-0 px-1 text-muted-foreground" aria-label={presentation.accountingLabel ?? presentation.timeUsedLabel}>{#if presentation.clock}<GoalClock seconds={presentation.clock.seconds} running={presentation.clock.running} fallback={presentation.timeUsedLabel} />{:else}{presentation.timeUsedLabel}{/if}</Button>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.accountingLabel ?? presentation.timeUsedLabel}</Tooltip.Content></Tooltip.Root>{/if}
        {#if presentation.canPause}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<StatefulButton {...props} size="icon-sm" variant="ghost" iconOnly pending={presentation.pendingAction === "pause"} pendingLabel={presentation.labels.pause} disabled={pending || presentation.disabled} aria-label={presentation.labels.pause} onclick={() => actions.pause()}><PauseIcon /></StatefulButton>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.labels.pause}</Tooltip.Content></Tooltip.Root>{/if}
        {#if presentation.canResume}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<StatefulButton {...props} size="icon-sm" variant="ghost" iconOnly pending={presentation.pendingAction === "resume"} pendingLabel={presentation.labels.resume} disabled={pending || presentation.disabled} aria-label={presentation.labels.resume} onclick={() => actions.resume()}><ResumeIcon /></StatefulButton>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.labels.resume}</Tooltip.Content></Tooltip.Root>{/if}
        {#if presentation.status !== "complete"}<Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<Button {...props} bind:ref={editTrigger} size="icon-sm" variant="ghost" disabled={pending || presentation.disabled} aria-label={presentation.labels.edit} onclick={actions.beginEdit}><EditIcon /></Button>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.labels.edit}</Tooltip.Content></Tooltip.Root>{/if}
        <Tooltip.Root><Tooltip.Trigger>{#snippet child({ props })}<StatefulButton {...props} size="icon-sm" variant="ghost" iconOnly pending={presentation.pendingAction === "clear"} pendingLabel={presentation.labels.clear} disabled={pending || presentation.disabled} aria-label={presentation.labels.clear} onclick={() => actions.clear()}><ClearIcon /></StatefulButton>{/snippet}</Tooltip.Trigger><Tooltip.Content>{presentation.labels.clear}</Tooltip.Content></Tooltip.Root>
      {/if}
    </div>
  </Tooltip.Provider>
  {#if presentation.error}<p class="w-full break-words text-destructive" role="alert">{presentation.error}</p>{/if}
</ComposerStrip>
{/if}

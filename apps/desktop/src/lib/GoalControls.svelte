<script lang="ts">
  import { untrack } from "svelte";
  import { Alert, GoalBar, Marker, Spinner, StatefulButton } from "@drawloom/ui";
  import { createGoalViewModel, type GoalViewModelAction } from "./goal-view-model.svelte.js";
  import type { GoalControlsActions, GoalControlsPresentation } from "./goal-controls.js";

  let { presentation, actions, onDismiss }: { presentation: GoalControlsPresentation; actions: GoalControlsActions; onDismiss(): void } = $props();
  let reading = $state(false);
  let requested = $state(false);
  let visible = $state(true);
  function visibilityChanged() {
    visible = document.visibilityState === 'visible';
    if (visible && presentation.supported) void readGoal();
  }

  // Only the initial snapshot/readiness seed the goal view model; every later
  // change reaches it through the $effect below, which explicitly syncs it.
  const goal = createGoalViewModel(untrack(() => presentation.snapshot), untrack(() => presentation.readiness), async (action: GoalViewModelAction) => {
    const accepted = await actions.goalCommand(action.kind === "create"
      ? { action: "create", objective: action.objective }
      : action.kind === "edit"
        ? { action: "edit", revision: action.revision, objective: action.objective }
        : { action: action.kind, revision: action.revision });
    if (!accepted) throw Error("Goal action is unavailable. Refresh the conversation and try again.");
  });
  $effect(() => {
    goal.actions.sync(presentation.conversationId, presentation.snapshot, presentation.readiness);
  });
  async function readGoal() {
    if (reading) return;
    reading = true;
    try {
      await actions.goalCommand({ action: "read" });
    } finally {
      reading = false;
    }
  }
  export async function createGoal() {
    if (reading) return;
    requested = true;
    if (presentation.snapshot === undefined || presentation.error) await readGoal();
    goal.actions.sync(presentation.conversationId, presentation.snapshot, presentation.readiness);
    if (presentation.readiness === "ready" && !presentation.error) goal.actions.beginEdit();
  }
</script>

<svelte:document onvisibilitychange={visibilityChanged} />

{#if presentation.supported && presentation.error && (requested || presentation.snapshot)}
  <div class="composer-feedback">
    <Alert.Root variant="destructive">
      <Alert.Title>Goal unavailable</Alert.Title>
      <Alert.Description>{presentation.error}</Alert.Description>
      <Alert.Action><StatefulButton variant="outline" pending={reading} pendingLabel="Refreshing goal" onclick={readGoal}>Refresh goal</StatefulButton></Alert.Action>
    </Alert.Root>
  </div>
{:else if requested && reading}
  <div class="composer-feedback">
    <Marker.Root role="status"><Marker.Icon><Spinner /></Marker.Icon><Marker.Content>Loading goal…</Marker.Content></Marker.Root>
  </div>
{/if}
{#if goal.presentation && (goal.presentation.mode === 'goal' || goal.presentation.editing) && !presentation.error}
    <GoalBar presentation={goal.presentation.mode === 'goal' && goal.presentation.clock ? {...goal.presentation, clock: {...goal.presentation.clock, running: goal.presentation.clock.running && visible && !presentation.appErrored}} : goal.presentation} actions={{...goal.actions, cancelEdit() { goal.actions.cancelEdit(); if (goal.presentation?.mode === 'create' && !goal.presentation.editing) { requested = false; onDismiss(); } }}} />
{/if}

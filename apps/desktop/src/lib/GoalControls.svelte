<script lang="ts">
  import { Alert, GoalBar, StatefulButton } from "@drawloom/ui";
  import type { AgentGoalSnapshot } from "@drawloom/agent";
  import type { DesktopViewModel } from "./view-model.svelte.js";
  import { createGoalViewModel, type GoalReadiness, type GoalViewModelAction } from "./goal-view-model.svelte.js";

  let { vm, onDismiss }: { vm: DesktopViewModel; onDismiss(): void } = $props();
  let reading = $state(false);
  let requested = $state(false);
  let visible = $state(true);
  function visibilityChanged() {
    visible = document.visibilityState === 'visible';
    if (visible && vm.state?.goal?.supported) void readGoal();
  }

  function source(): { snapshot: AgentGoalSnapshot | null | undefined; readiness: GoalReadiness } {
    const goal = vm.state?.goal;
    if (!vm.state || (goal?.supported && goal.snapshot === undefined)) return { snapshot: undefined, readiness: "loading" };
    if (!goal?.supported) return { snapshot: undefined, readiness: "unavailable" };
    return { snapshot: goal.snapshot ?? null, readiness: "ready" };
  }
  const initial = source();
  const goal = createGoalViewModel(initial.snapshot, initial.readiness, async (action: GoalViewModelAction) => {
    const accepted = await vm.goalCommand(action.kind === "create"
      ? { action: "create", objective: action.objective }
      : action.kind === "edit"
        ? { action: "edit", revision: action.revision, objective: action.objective }
        : { action: action.kind, revision: action.revision });
    if (!accepted) throw Error("Goal action is unavailable. Refresh the conversation and try again.");
  });
  $effect(() => {
    const next = source();
    goal.actions.sync(vm.conversation?.id ?? "", next.snapshot, next.readiness);
  });
  async function readGoal() {
    if (reading) return;
    reading = true;
    try {
      await vm.goalCommand({ action: "read" });
    } finally {
      reading = false;
    }
  }
  export async function createGoal() {
    if (reading) return;
    requested = true;
    if (vm.state?.goal?.snapshot === undefined || vm.state?.goal?.error) await readGoal();
    const next = source();
    goal.actions.sync(vm.conversation?.id ?? "", next.snapshot, next.readiness);
    if (next.readiness === "ready" && !vm.state?.goal?.error) goal.actions.beginEdit();
  }
</script>

<svelte:document onvisibilitychange={visibilityChanged} />

{#if vm.state?.goal?.supported && vm.state.goal.error && (requested || vm.state.goal.snapshot)}
  <div class="composer-feedback">
    <Alert.Root variant="destructive">
      <Alert.Title>Goal unavailable</Alert.Title>
      <Alert.Description>{vm.state.goal.error}</Alert.Description>
      <Alert.Action><StatefulButton variant="outline" pending={reading} pendingLabel="Refreshing goal" onclick={readGoal}>Refresh goal</StatefulButton></Alert.Action>
    </Alert.Root>
  </div>
{:else if requested && reading}
  <div class="composer-feedback">
    <p role="status">Loading goal…</p>
  </div>
{/if}
{#if goal.presentation && (goal.presentation.mode === 'goal' || goal.presentation.editing) && !vm.state?.goal?.error}
    <GoalBar presentation={goal.presentation.mode === 'goal' && goal.presentation.clock ? {...goal.presentation, clock: {...goal.presentation.clock, running: goal.presentation.clock.running && visible && !vm.error}} : goal.presentation} actions={{...goal.actions, cancelEdit() { goal.actions.cancelEdit(); if (goal.presentation?.mode === 'create' && !goal.presentation.editing) { requested = false; onDismiss(); } }}} />
{/if}

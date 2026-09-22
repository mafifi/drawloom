import type { AgentGoalSnapshot } from "@drawloom/agent";
import type { GoalReadiness } from "./goal-view-model.svelte.js";
import type { DesktopViewModel } from "./view-model.svelte.js";

export type GoalControlsPresentation = Readonly<{
  conversationId: string;
  supported: boolean;
  error?: string;
  snapshot: AgentGoalSnapshot | null | undefined;
  readiness: GoalReadiness;
  /** True while the app has an unrelated top-level error; pauses the goal clock display. */
  appErrored: boolean;
}>;

export type GoalControlsActions = Readonly<{
  goalCommand(action: Parameters<DesktopViewModel["goalCommand"]>[0]): Promise<boolean>;
}>;

/**
 * A conversation's goal is "loading" until its snapshot has been read at least
 * once, "unavailable" when the agent does not support goals, and "ready"
 * otherwise. This used to be computed inside GoalControls.svelte; it moved
 * here so the derivation is testable without mounting a component.
 */
export function goalControlsPresentation(vm: DesktopViewModel): GoalControlsPresentation {
  const goal = vm.state?.goal;
  const readiness: GoalReadiness =
    !vm.state || (goal?.supported && goal.snapshot === undefined)
      ? "loading"
      : !goal?.supported
        ? "unavailable"
        : "ready";
  return {
    conversationId: vm.conversation?.id ?? "",
    supported: goal?.supported ?? false,
    error: goal?.supported ? goal.error : undefined,
    snapshot: goal?.supported ? (goal.snapshot ?? null) : undefined,
    readiness,
    appErrored: Boolean(vm.error),
  };
}

export function goalControlsActions(vm: DesktopViewModel): GoalControlsActions {
  return {
    goalCommand: (action) => vm.goalCommand(action),
  };
}

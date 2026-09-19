import type { AgentMode, AgentGoalSnapshot } from "@drawloom/agent";

export function assertPlanningIdle(
  active: string | undefined,
  goal: Pick<AgentGoalSnapshot, "status"> | null | undefined,
) {
  if (active) throw Error("Wait for outstanding work to settle before entering Plan mode.");
  if (goal === undefined) throw Error("Refresh native goal state before entering Plan mode.");
  if (goal?.status === "active") throw Error("Pause the active goal before entering Plan mode.");
}

export function assertGoalActivation(conversation: {
  mode?: AgentMode | undefined;
  defaultModeRequired?: boolean | undefined;
}) {
  if (conversation.mode === "plan" || conversation.defaultModeRequired)
    throw Error(
      "Leave Plan mode and submit a default-mode turn before starting or resuming a goal.",
    );
}

import type { AgentGoals, AgentGoalSnapshot } from "@drawloom/agent";
export type GoalAction =
  | { action: "read" }
  | { action: "create"; objective: string }
  | { action: "edit"; revision: string; objective: string }
  | { action: "pause" | "resume" | "clear"; revision: string };
export async function controlGoal(
  goals: AgentGoals | undefined,
  command: GoalAction,
): Promise<AgentGoalSnapshot | null> {
  if (!goals) throw Error("This provider does not support goal controls");
  const result =
    command.action === "read"
      ? await goals.read()
      : command.action === "create"
        ? await goals.create(command.objective)
        : command.action === "edit"
          ? await goals.edit({ revision: command.revision, objective: command.objective })
          : await goals[command.action]({ revision: command.revision });
  if (result.status !== "ok") throw Error(result.failure.message);
  return result.value;
}

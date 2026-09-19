import type { AgentGoalSnapshot } from "@drawloom/agent";
import type { GoalBarActions, GoalBarLabels, GoalBarPresentation } from "@drawloom/ui";

export type GoalReadiness = "loading" | "ready" | "unavailable";
export type GoalViewModelAction =
  | { kind: "create"; objective: string }
  | { kind: "edit"; revision: string; objective: string }
  | { kind: "pause" | "resume" | "clear"; revision: string };

const labels: GoalBarLabels = {
  objective: "Goal objective",
  create: "Create goal",
  edit: "Edit goal",
  save: "Save goal",
  cancel: "Cancel edit",
  pause: "Pause goal",
  resume: "Resume goal",
  clear: "Clear goal",
};
const statusLabels: Record<AgentGoalSnapshot["status"], string> = {
  active: "Active",
  paused: "Paused",
  blocked: "Blocked",
  usage_limited: "Usage limited",
  budget_limited: "Budget limited",
  complete: "Complete",
};
function timeUsedLabel(seconds?: number) {
  if (seconds === undefined) return undefined;
  const minutes = Math.floor(seconds / 60),
    remainder = seconds % 60;
  return minutes ? `${minutes}m${remainder ? ` ${remainder}s` : ""} used` : `${remainder}s used`;
}

export function createGoalViewModel(
  initialSnapshot: AgentGoalSnapshot | null | undefined,
  initialReadiness: GoalReadiness,
  dispatch: (action: GoalViewModelAction) => Promise<void>,
  initialOwnerId = "",
) {
  let snapshot = $state(initialSnapshot),
    readiness = $state(initialReadiness);
  let editing = $state(false),
    draft = $state(initialSnapshot?.objective ?? "");
  let pendingAction = $state<"create" | "edit" | "pause" | "resume" | "clear">();
  let error = $state("");
  let revision = initialSnapshot?.revision;
  let ownerId = initialOwnerId;

  function sync(
    nextOwnerId: string,
    next: AgentGoalSnapshot | null | undefined,
    nextReadiness: GoalReadiness,
  ) {
    if (nextOwnerId !== ownerId || next?.revision !== revision) {
      editing = false;
      draft = next?.objective ?? "";
      error = "";
    }
    revision = next?.revision;
    ownerId = nextOwnerId;
    snapshot = next;
    readiness = nextReadiness;
  }
  async function run(action: GoalViewModelAction, kind: NonNullable<typeof pendingAction>) {
    if (pendingAction) return;
    pendingAction = kind;
    error = "";
    try {
      await dispatch(action);
      if (kind === "create" || kind === "edit") editing = false;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Goal action unavailable";
    } finally {
      pendingAction = undefined;
    }
  }
  const actions: GoalBarActions & {
    sync(
      ownerId: string,
      snapshot: AgentGoalSnapshot | null | undefined,
      readiness: GoalReadiness,
    ): void;
  } = {
    sync,
    setDraft(value) {
      if (!pendingAction) draft = value;
    },
    beginEdit() {
      if (!pendingAction) {
        editing = true;
        draft = snapshot?.objective ?? "";
        error = "";
      }
    },
    cancelEdit() {
      if (!pendingAction) {
        editing = false;
        draft = snapshot?.objective ?? "";
        error = "";
      }
    },
    async save() {
      const objective = draft.trim();
      if (!objective || pendingAction || readiness !== "ready") return;
      await run(
        snapshot
          ? { kind: "edit", revision: snapshot.revision, objective }
          : { kind: "create", objective },
        snapshot ? "edit" : "create",
      );
    },
    async pause() {
      if (snapshot?.status === "active")
        await run({ kind: "pause", revision: snapshot.revision }, "pause");
    },
    async resume() {
      if (snapshot?.status === "paused")
        await run({ kind: "resume", revision: snapshot.revision }, "resume");
    },
    async clear() {
      if (snapshot) await run({ kind: "clear", revision: snapshot.revision }, "clear");
    },
  };
  return {
    get presentation(): GoalBarPresentation | undefined {
      if (readiness !== "ready" || snapshot === undefined) return undefined;
      if (snapshot === null)
        return {
          mode: "create",
          editing,
          draft,
          pendingAction: pendingAction === "create" ? pendingAction : undefined,
          ...(error ? { error } : {}),
          labels,
        };
      const canResume = snapshot.status === "paused";
      return {
        mode: "goal",
        objective: snapshot.objective,
        status: snapshot.status,
        statusLabel: statusLabels[snapshot.status],
        accountingLabel: [
          snapshot.timeUsedSeconds === undefined
            ? undefined
            : `Elapsed display is approximate while running. Last reported: ${snapshot.timeUsedSeconds} seconds used`,
          snapshot.tokensUsed === undefined ? undefined : `${snapshot.tokensUsed} tokens used`,
          snapshot.tokenBudget === undefined
            ? undefined
            : `Native limit: ${snapshot.tokenBudget} tokens`,
        ]
          .filter(Boolean)
          .join("; "),
        ...(timeUsedLabel(snapshot.timeUsedSeconds)
          ? {
              timeUsedLabel: timeUsedLabel(snapshot.timeUsedSeconds),
              clock: { seconds: snapshot.timeUsedSeconds!, running: snapshot.status === "active" },
            }
          : {}),
        editing,
        draft,
        pendingAction: pendingAction === "create" ? undefined : pendingAction,
        ...(error ? { error } : {}),
        canPause: snapshot.status === "active",
        canResume,
        labels,
      };
    },
    actions,
  };
}

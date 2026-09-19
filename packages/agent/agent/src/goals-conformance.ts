import type { AgentGoals } from "./goals.js";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

/** Shared goal behavior. A fixture owns its native state and may simulate an
 * external writer; this suite never treats a snapshot revision as a CAS lock. */
export async function agentGoalsConformance(
  create: () => AgentGoals | Promise<AgentGoals>,
): Promise<void> {
  const goals = await create();
  const initial = await goals.read();
  check(initial.status === "ok" && initial.value === null, "fresh fixture starts without a goal");
  const created = await goals.create("Conformance goal");
  check(created.status === "ok", "goal creation returns a snapshot");
  const stale = await goals.pause({ revision: "stale-revision" });
  check(stale.status === "rejected", "stale goal mutation is rejected");
  const edited = await goals.edit({
    revision: created.value.revision,
    objective: "Edited conformance goal",
  });
  check(
    edited.status === "ok" && edited.value.objective === "Edited conformance goal",
    "fresh goal edit returns its replacement snapshot",
  );
  const paused = await goals.pause({ revision: edited.value.revision });
  check(
    paused.status === "ok" && paused.value.status === "paused",
    "fresh goal mutation returns its replacement snapshot",
  );
  const resumed = await goals.resume({ revision: paused.value.revision });
  check(
    resumed.status === "ok" && resumed.value.status === "active",
    "fresh goal resume returns its replacement snapshot",
  );
  const cleared = await goals.clear({ revision: resumed.value.revision });
  check(cleared.status === "ok" && cleared.value === null, "fresh goal clear returns null");
}

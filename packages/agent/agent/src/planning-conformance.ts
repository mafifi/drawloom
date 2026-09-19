import type { AgentSession } from "./index.js";

/** Fixture owns transport settlement; the suite tests the public optional capability. */
export async function agentPlanningConformance(
  create: () => Promise<AgentSession>,
  supported: boolean,
) {
  const session = await create();
  try {
    session.signals();
    if (!!session.modes?.includes("plan") !== supported)
      throw Error("Planning capability must be explicit");
    const result = await session.execute({
      operationId: "conformance-plan",
      text: "Inspect before proposing changes",
      mode: "plan",
    });
    if ((result.status === "ok") !== supported)
      throw Error("Unsupported planning must reject; supported planning must execute");
  } finally {
    await session.close();
  }
}

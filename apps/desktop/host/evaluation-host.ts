import { createHash } from "node:crypto";
import type { EvaluationAssessmentProvider, EvaluationScope } from "@drawloom/evaluation";
import { createEvaluationComposer } from "@drawloom/evaluation-orchestration";
import { createSqliteEvaluationStore } from "@drawloom/sqlite-evaluation";
import { canonical } from "@drawloom/orchestration";
import type {
  InstalledEvaluationRegistration,
  InstalledWorkflowRegistration,
} from "./plugin-packages.js";

/** Composition root: one fixed installed owner; the package loader owns closure. */
export async function createInstalledEvaluation(options: {
  dataDirectory: string;
  scope: EvaluationScope;
  assessment: EvaluationAssessmentProvider;
  workflow?: InstalledWorkflowRegistration;
}): Promise<InstalledEvaluationRegistration> {
  const store = createSqliteEvaluationStore({
    dataDirectory: options.dataDirectory,
    scope: options.scope,
  });
  try {
    const orchestration = options.workflow?.capabilities.orchestration;
    const readiness = options.workflow?.capabilities.orchestrationReadiness;
    const evaluation = createEvaluationComposer({
      store,
      assessment: options.assessment,
      ...(orchestration ? { orchestrator: orchestration } : {}),
      readiness: async () => {
        if (!orchestration)
          return { status: "unavailable", reason: "Orchestration is not configured." };
        try {
          const state = await readiness?.();
          return !state || state.status === "ready"
            ? { status: "ready" }
            : { status: "unavailable", reason: state.message ?? "Orchestration is unavailable." };
        } catch {
          return { status: "unavailable", reason: "Orchestration readiness could not be checked." };
        }
      },
      clock: { now: () => Date.now() },
      identity: (value) => createHash("sha256").update(canonical(value)).digest("hex"),
    });
    return { evaluation, close: () => store.close() };
  } catch (error) {
    try {
      await store.close();
    } catch {
      /* Preserve the original setup failure. */
    }
    throw error;
  }
}

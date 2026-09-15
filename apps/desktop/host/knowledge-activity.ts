import type { OrchestrationReadiness, Orchestrator, RunSnapshot } from "@drawloom/orchestration";
import { NightloomWorkflowResultSchema } from "@drawloom/nightloom";
import {
  KnowledgeActivityReadSchema,
  KnowledgeActivityDetailSchema,
  KnowledgeActivityOwnerSchema,
  KnowledgeActivityRunSchema,
  KnowledgeActivityPageSchema,
  WorkflowStepsSchema,
  type KnowledgeActivityRun,
} from "../src/lib/orchestration-protocol.js";
import { projectRun, WorkflowControlError } from "./orchestration-presentation.js";

/** Reads the already composed capability. No initialization or execution route. */
export function createKnowledgeActivity(
  resolve: () => { orchestrator: Orchestrator; readiness(): OrchestrationReadiness } | undefined,
) {
  function provider() {
    const registration = resolve();
    if (!registration || registration.readiness().status !== "ready")
      throw new WorkflowControlError(
        "Knowledge maintenance is unavailable. Existing knowledge remains available.",
      );
    return registration.orchestrator;
  }
  async function get(current: Orchestrator, runId: string) {
    try {
      const run = await current.get(runId);
      if (run.runId !== runId || run.workflow !== "nightloom.maintenance") throw Error();
      return run;
    } catch {
      throw new WorkflowControlError(
        "Knowledge maintenance run is unavailable. Refresh Activity to check its status.",
      );
    }
  }
  async function project(current: Orchestrator, run: RunSnapshot) {
    if (run.workflow !== "nightloom.maintenance")
      throw new WorkflowControlError("Knowledge maintenance run is unavailable.");
    let displayStatus: KnowledgeActivityRun["displayStatus"] = run.unresolvedEffects.length
      ? "Needs attention"
      : run.status === "running"
        ? run.cancellationRequested
          ? "Cancellation requested"
          : "Running"
        : run.status === "completed"
          ? "Completed"
          : run.status === "cancelled"
            ? "Cancelled"
            : "Failed";
    if (displayStatus === "Completed") {
      try {
        const result = NightloomWorkflowResultSchema.parse(await current.result(run.runId));
        displayStatus =
          result.kind === "completed"
            ? "Completed"
            : result.kind === "deferred"
              ? "Needs attention"
              : result.kind === "unavailable"
                ? "Unavailable"
                : "Failed";
      } catch {
        displayStatus = "Unavailable";
      }
    }
    const message =
      displayStatus === "Needs attention"
        ? "The earlier assessment could not be confirmed. Work is held; no replacement assessment will start."
        : displayStatus === "Unavailable"
          ? "The maintenance outcome could not be confirmed. Refresh Activity when the local runtime is available."
          : displayStatus === "Failed"
            ? "Knowledge maintenance could not finish. Existing knowledge remains available."
            : "";
    return KnowledgeActivityRunSchema.parse({
      ...projectRun(run),
      workflow: "Check knowledge",
      displayStatus,
      message,
    });
  }
  return {
    async owner() {
      const registration = resolve();
      const ready = registration?.readiness().status === "ready";
      return KnowledgeActivityOwnerSchema.parse({
        title: "Knowledge maintenance",
        context: "Across all projects",
        readiness: ready
          ? { status: "ready" }
          : {
              status: "unavailable",
              code: "knowledge_maintenance_unavailable",
              message:
                "Knowledge maintenance is unavailable. Existing knowledge remains available.",
            },
      });
    },
    async list(raw: unknown) {
      const input = KnowledgeActivityReadSchema.parse(raw),
        current = provider();
      try {
        const page = await current.list({
          limit: input.limit,
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        });
        if (page.runs.length > input.limit) throw Error("Oversized maintenance page");
        return KnowledgeActivityPageSchema.parse({
          ...page,
          runs: await Promise.all(page.runs.map((run) => project(current, run))),
        });
      } catch {
        throw new WorkflowControlError(
          "Knowledge maintenance activity is unavailable. Refresh Activity when the local runtime is available.",
        );
      }
    },
    async detail(raw: unknown) {
      const input = KnowledgeActivityDetailSchema.parse(raw),
        current = provider();
      return project(current, await get(current, input.runId));
    },
    async steps(raw: unknown) {
      const { runId, ...input } = KnowledgeActivityDetailSchema.parse(raw),
        current = provider();
      await get(current, runId);
      try {
        const page = await current.getSteps(runId, {
          limit: input.limit,
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        });
        if (page.steps.length > input.limit) throw Error("Oversized maintenance steps");
        return WorkflowStepsSchema.parse({
          ...page,
          steps: page.steps.map(({ result: _result, ...step }) => step),
        });
      } catch {
        throw new WorkflowControlError(
          "Knowledge maintenance steps are unavailable. Refresh Activity to check their status.",
        );
      }
    },
  };
}

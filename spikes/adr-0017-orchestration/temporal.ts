import {
  Client,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import {
  canonical,
  parse,
  RunSnapshotSchema,
  type Orchestrator,
  type Registry,
  type Json,
} from "./contract.ts";
import type { Start } from "./temporal-workflow.ts";
export function createTemporalOrchestrator(
  client: Client,
  taskQueue: string,
  prefix: string,
  registry: Registry,
): Orchestrator {
  const pageLimit = (limit = 100) => {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error("Invalid limit");
    return Math.min(100, limit);
  };
  const handle = (id: string) => {
    if (!id.startsWith(`${prefix}/`)) throw new Error("Unknown run owner");
    return client.workflow.getHandle(id);
  };
  const get = async (id: string) =>
    RunSnapshotSchema.parse(await handle(id).query("state"));
  return {
    async start(identity, workflow, input) {
      const registered = registry.workflows.find(
        (w) => w.id === workflow.id && w.version === workflow.version,
      );
      if (!registered) throw new Error("Unregistered workflow version");
      const parsed = parse(registered.input, input) as Json,
        fingerprint = canonical([workflow.id, workflow.version, parsed]);
      const id = `${prefix}/${encodeURIComponent(identity)}`;
      const start: Start = {
        identity,
        workflow: workflow.id,
        version: workflow.version,
        input: parsed,
        fingerprint,
      };
      try {
        await client.workflow.start("drawloomWorkflow", {
          workflowId: id,
          taskQueue,
          args: [start],
          workflowIdReusePolicy: "REJECT_DUPLICATE",
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError))
          throw error;
      }
      if ((await handle(id).query("startIdentity")) !== fingerprint)
        throw new Error("Conflicting start");
      return id;
    },
    get,
    async getSteps(id, options = {}) {
      const offset = Number(options.cursor ?? 0),
        limit = pageLimit(options.limit);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new Error("Invalid cursor");
      const steps = await handle(id).query<
        import("./contract.ts").RunSnapshot["steps"],
        [number, number]
      >("steps", offset, limit + 1);
      return {
        steps: steps.slice(0, limit),
        ...(steps.length > limit ? { cursor: String(offset + limit) } : {}),
      };
    },
    async list(options = {}) {
      const limit = pageLimit(options.limit);
      const response = await client.workflowService.listWorkflowExecutions({
        namespace: "default",
        query: `WorkflowId STARTS_WITH '${prefix}/'`,
        pageSize: limit,
        ...(options.cursor
          ? { nextPageToken: Buffer.from(options.cursor, "base64") }
          : {}),
      });
      const runs = await Promise.all(
        (response.executions ?? []).map((e) => get(e.execution!.workflowId!)),
      );
      return {
        runs,
        ...(response.nextPageToken?.length
          ? { cursor: Buffer.from(response.nextPageToken).toString("base64") }
          : {}),
      };
    },
    async result(id, options = {}) {
      if (options.signal?.aborted) throw new Error("Wait aborted");
      const result = handle(id).result() as Promise<Json>;
      if (!options.signal) return result;
      const signal = options.signal;
      return new Promise<Json>((resolve, reject) => {
        const abort = () => reject(new Error("Wait aborted"));
        signal.addEventListener("abort", abort, { once: true });
        result
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", abort));
      });
    },
    async respond(id, request, value) {
      if (
        await handle(id).query<boolean, [string, Json]>(
          "answered",
          request,
          value,
        )
      )
        return;
      if ((await get(id)).status !== "running") throw new Error("Stale input");
      await handle(id).executeUpdate("answer", { args: [request, value] });
    },
    async cancel(id) {
      await handle(id).cancel();
    },
  };
}

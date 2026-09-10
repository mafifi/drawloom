import {
  Worker,
  NativeConnection,
  bundleWorkflowCode,
} from "@temporalio/worker";
import { Context } from "@temporalio/activity";
import { callBridge } from "./temporal-host.ts";
import type { ActivityRequest } from "./temporal-workflow.ts";
const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS!,
});
async function call(path: string, body: unknown, attempt = 1) {
  return callBridge(
    `${process.env.BRIDGE_URL}${path}`,
    process.env.BRIDGE_TOKEN!,
    body,
    attempt,
  );
}
const worker = await Worker.create({
  connection,
  taskQueue: process.env.TASK_QUEUE!,
  workflowBundle: await bundleWorkflowCode({
    workflowsPath: process.env.WORKFLOW_PATH!,
  }),
  activities: {
    async dispatch(request: ActivityRequest) {
      const context = Context.current();
      const heartbeat = setInterval(() => context.heartbeat(), 500);
      const cancel = () => {
        // The awaited workflow cleanup activity records any unresolved cancellation.
        void call("/cancel", { runId: request.runId }).catch(() => {});
      };
      context.cancellationSignal.addEventListener("abort", cancel, {
        once: true,
      });
      try {
        return {
          value: await call(
            "/dispatch",
            {
              ...request,
              attempt: context.info.attempt,
            },
            context.info.attempt,
          ),
          attempt: context.info.attempt,
        };
      } finally {
        clearInterval(heartbeat);
        context.cancellationSignal.removeEventListener("abort", cancel);
      }
    },
    cleanup(runId: string) {
      return call("/cancel", { runId });
    },
  },
});
process.on("SIGTERM", () => worker.shutdown());
console.log("WORKER_READY");
await worker.run();
await connection.close();

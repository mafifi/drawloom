import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createOrchestrationHost } from "./orchestration-host.js";

type Manager = ReturnType<typeof createLocalTemporalManager>;

export function createOrchestrationComposition(options: {
  dataDirectory: string;
  createManager: () => Promise<Manager>;
  ensureProject: (projectId: string) => Promise<void>;
}) {
  let createdManager: Promise<Manager> | undefined;
  let closingManager: Promise<void> | undefined;
  let closed = false;
  const manager = () =>
    closed
      ? Promise.reject<Manager>(new Error("Local workflows are stopped"))
      : (createdManager ??= options.createManager());
  return {
    manager,
    host: createOrchestrationHost({
      dataDirectory: options.dataDirectory,
      manager,
      ensureProject: options.ensureProject,
    }),
    closeManager() {
      closed = true;
      return (closingManager ??= (async () => {
        await (await createdManager?.catch(() => undefined))?.close();
      })());
    },
  };
}

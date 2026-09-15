import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createOrchestrationHost } from "./orchestration-host.js";

type Manager = ReturnType<typeof createLocalTemporalManager>;

export function createOrchestrationComposition(options: {
  dataDirectory: string;
  createManager: () => Promise<Manager>;
  ensureProject: (projectId: string) => Promise<void>;
}) {
  let createdManager: Promise<Manager> | undefined;
  const manager = () => (createdManager ??= options.createManager());
  return {
    manager,
    host: createOrchestrationHost({
      dataDirectory: options.dataDirectory,
      manager,
      ensureProject: options.ensureProject,
    }),
    async closeManager() {
      await (await createdManager?.catch(() => undefined))?.close();
    },
  };
}

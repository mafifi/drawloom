import type { JsonStore } from "@drawloom/host";
import type {
  createLocalTemporalManager,
  LocalTemporalRegistration,
} from "@drawloom/temporal-orchestration";
import { createKnowledgeActivity } from "./knowledge-activity.js";
import { createKnowledgeHost } from "./knowledge-host.js";
import { createKnowledgeNightloom, createLocalLearningCuration } from "./knowledge-nightloom.js";
import type { LearningService } from "@drawloom/knowledge/learning";
import type { LocalKnowledgeClient } from "@drawloom/local-knowledge-runtime";
import type { ContextPreparer } from "@drawloom/context";
import {
  createLocalLearningService,
  createLocalLearningSetup,
  createLocalLearningSetupHost,
  type LocalLearningSetup,
} from "./local-learning.js";
import type { createLearningPermission } from "./learning-permission.js";
import { createEvidenceReadReceipts, createKnowledgePlugin } from "./knowledge-tools.js";

type KnowledgeHostOptions = Omit<
  Parameters<typeof createKnowledgeHost>[0],
  "service" | "store" | "context" | "permission"
>;

export function createKnowledgeComposition(options: {
  service?: LearningService;
  local?: LocalKnowledgeClient;
  context?: ContextPreparer;
  setup?: LocalLearningSetup;
  permission: ReturnType<typeof createLearningPermission>;
  store: JsonStore;
  manager: () => Promise<ReturnType<typeof createLocalTemporalManager>>;
  nightloomDirectory: string;
  scheduleNightloomTick?: (tick: () => Promise<void>, milliseconds: number) => () => void;
  host: KnowledgeHostOptions;
}) {
  const evidenceReadReceipts = createEvidenceReadReceipts();
  let registration: LocalTemporalRegistration | undefined;
  const activity = createKnowledgeActivity(() => registration);
  const local = options.local;
  const nightloom = local
    ? createKnowledgeNightloom({
        service: local,
        permission: options.permission,
        store: options.store,
        packageDirectory: options.nightloomDirectory,
        settings: async () => (await local.status()).configuration,
        prepareHost: async (owner) => {
          const prepared = await (await options.manager()).prepareHost(owner);
          registration = prepared;
          return prepared;
        },
        ...(options.scheduleNightloomTick ? { scheduleTick: options.scheduleNightloomTick } : {}),
      })
    : undefined;
  const service =
    options.service ??
    (local && nightloom
      ? createLocalLearningService(
          local,
          createLocalLearningCuration(
            nightloom,
            async () => (await local.status()).maintenance.pendingUpdates,
          ),
        )
      : undefined);
  if (!service) throw Error("A learning implementation must be selected at startup");
  const setup = createLocalLearningSetupHost(
    options.setup ?? (local && nightloom ? createLocalLearningSetup(local, nightloom) : undefined),
  );
  const plugin = createKnowledgePlugin(service, evidenceReadReceipts);
  const host = createKnowledgeHost({
    service,
    permission: options.permission,
    ...((options.context ?? local) ? { context: options.context ?? local! } : {}),
    store: options.store,
    ...options.host,
  });
  return { activity, evidenceReadReceipts, host, nightloom, plugin, service, setup };
}

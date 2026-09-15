import type { JsonStore } from "@drawloom/host";
import type {
  createLocalTemporalManager,
  LocalTemporalRegistration,
} from "@drawloom/temporal-orchestration";
import { createKnowledgeActivity } from "./knowledge-activity.js";
import { createKnowledgeHost, type KnowledgeService } from "./knowledge-host.js";
import { createKnowledgeNightloom, isNightloomKnowledgeService } from "./knowledge-nightloom.js";
import { createEvidenceReadReceipts, createKnowledgePlugin } from "./knowledge-tools.js";

type KnowledgeHostOptions = Omit<
  Parameters<typeof createKnowledgeHost>[0],
  "service" | "store" | "nightloom"
>;

export function createKnowledgeComposition(options: {
  service: KnowledgeService;
  store: JsonStore;
  manager: () => Promise<ReturnType<typeof createLocalTemporalManager>>;
  nightloomDirectory: string;
  scheduleNightloomTick?: (tick: () => Promise<void>, milliseconds: number) => () => void;
  host: KnowledgeHostOptions;
}) {
  const evidenceReadReceipts = createEvidenceReadReceipts();
  const plugin = createKnowledgePlugin(options.service, evidenceReadReceipts);
  let registration: LocalTemporalRegistration | undefined;
  const activity = createKnowledgeActivity(() => registration);
  const nightloom = isNightloomKnowledgeService(options.service)
    ? createKnowledgeNightloom({
        service: options.service,
        store: options.store,
        packageDirectory: options.nightloomDirectory,
        settings: async () => (await options.service.status()).configuration,
        prepareHost: async (owner) => {
          const prepared = await (await options.manager()).prepareHost(owner);
          registration = prepared;
          return prepared;
        },
        ...(options.scheduleNightloomTick ? { scheduleTick: options.scheduleNightloomTick } : {}),
      })
    : undefined;
  const host = createKnowledgeHost({
    service: options.service,
    store: options.store,
    ...options.host,
    ...(nightloom ? { nightloom } : {}),
  });
  return { activity, evidenceReadReceipts, host, nightloom, plugin };
}

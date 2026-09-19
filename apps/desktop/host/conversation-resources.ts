import type { AgentSession } from "@drawloom/agent";
import { cleanup } from "./cleanup.js";
import type { ConversationHistoryStore } from "@drawloom/conversation-history";
import type { Asset, AssetLibrary, JsonStore } from "@drawloom/host";
import { createDesktopEvidence } from "./evidence.js";
import { createHistoryCoordinator } from "./history-coordinator.js";
import type { createMediaPolicy } from "./media-policy.js";
import { createResourceContent } from "./resource-content.js";
import { createResourceRecovery } from "./resource-recovery.js";

type ResourcePackages = {
  toolSources: ReadonlyMap<string, string>;
  canReadSource(source: string): boolean;
};

export function createConversationResources(options: {
  history: ConversationHistoryStore;
  evidenceStore: JsonStore;
  assets: AssetLibrary;
  projectAssets: Asset[];
  persist: () => Promise<unknown>;
  mediaPolicy: Awaited<ReturnType<typeof createMediaPolicy>>;
  packagesForConversation: (conversationId: string) => Promise<ResourcePackages>;
}) {
  const writers = new Map<string, ReturnType<typeof createHistoryCoordinator>>();
  const evidence = new Map<string, Promise<Awaited<ReturnType<typeof createDesktopEvidence>>>>();
  const recoveries = new Map<string, Promise<ReturnType<typeof createResourceRecovery>>>();

  function writer(conversationId: string) {
    let current = writers.get(conversationId);
    if (!current) {
      current = createHistoryCoordinator(options.history, conversationId);
      writers.set(conversationId, current);
    }
    return current;
  }

  function evidenceFor(conversationId: string) {
    let current = evidence.get(conversationId);
    if (!current) {
      current = createDesktopEvidence(options.evidenceStore, conversationId);
      evidence.set(conversationId, current);
    }
    return current;
  }

  function collector(conversationId: string) {
    return createResourceContent({
      assets: {
        ...options.assets,
        put: async (bytes, mediaType) => {
          const asset = await options.assets.put(bytes, mediaType);
          if (!options.projectAssets.some((current) => current.key === asset.key))
            options.projectAssets.push(asset);
          await options.persist();
          return asset;
        },
      },
      knownAsset: (key) => options.projectAssets.find((asset) => asset.key === key),
      declaredMedia: (source, content) => options.mediaPolicy.capture(source, content),
      existing: (id) => options.history.get(conversationId, id),
      save: async (entry) => {
        await writer(conversationId).write(entry);
        if (!(await options.history.get(conversationId, entry.id)))
          throw Error("Resource capture could not be persisted");
      },
    });
  }

  function recoveryFor(conversationId: string) {
    let current = recoveries.get(conversationId);
    if (!current) {
      current = evidenceFor(conversationId).then((sink) =>
        createResourceRecovery(sink.activity(), async (result) => {
          const packages = await options.packagesForConversation(conversationId);
          const tool = sink.toolFor(result.invocationId);
          const source = tool ? (packages.toolSources.get(tool) ?? "drawloom") : "drawloom";
          await collector(conversationId).capture({
            id: `tool-resource:${result.invocationId}`,
            source,
            origin: {
              kind: "tool",
              source,
              callId: result.invocationId,
              title: tool ?? "Tool result",
              outcome:
                result.outcome.status === "ok"
                  ? "completed"
                  : result.outcome.execution === "unknown" || result.evidence === "outcome_failed"
                    ? "unknown"
                    : result.outcome.code === "denied"
                      ? "denied"
                      : "failed",
              format: "text",
            },
            readable: () => packages.canReadSource(source),
            ...(result.operationId ? { operationId: result.operationId } : {}),
            content:
              result.outcome.status === "ok"
                ? (result.outcome.content ?? [{ type: "text", text: result.outcome.text }])
                : [
                    {
                      type: "text",
                      text: `Tool ${result.outcome.code}. Execution: ${result.outcome.execution}. No automatic retry occurred.`,
                    },
                  ],
          });
        }),
      );
      recoveries.set(conversationId, current);
    }
    return current;
  }

  async function recover(conversationId: string) {
    try {
      await (await recoveryFor(conversationId)).recover();
      return true;
    } catch {
      writer(conversationId).reportStorageFailure();
      return false;
    }
  }

  async function synchronize(
    conversationId: string,
    reader: AgentSession["history"],
    direction: "latest" | "older" = "latest",
  ) {
    if (await recover(conversationId)) await writer(conversationId).synchronize(reader, direction);
  }

  return {
    writer,
    evidenceFor,
    collector,
    recoveryFor,
    recover,
    synchronize,
    async drainWriters() {
      await cleanup([...writers.values()].map((current) => () => current.close()));
    },
    async closeHistory() {
      await options.history.close();
    },
  };
}

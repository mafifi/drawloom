import type { AuthorizationEvaluationOptions } from "@drawloom/authorization";
import type { LearningService, LearningCuration } from "@drawloom/knowledge/learning";
import type { LocalKnowledgeClient, LocalKnowledgeStatus } from "@drawloom/local-knowledge-runtime";
import {
  LocalLearningSetupCommandSchema,
  LocalLearningConfigurationSchema,
  type LocalLearningConfiguration,
  type LocalLearningSetupStatus,
} from "../src/lib/local-knowledge-setup-protocol.js";
import type { createKnowledgeNightloom } from "./knowledge-nightloom.js";

/** Complete local-only setup boundary. It is never required of a LearningService. */
export interface LocalLearningSetup {
  status(operation?: AuthorizationEvaluationOptions): Promise<LocalLearningSetupStatus>;
  configure(
    value: LocalLearningConfiguration,
    operation?: AuthorizationEvaluationOptions,
  ): Promise<LocalLearningSetupStatus>;
  download(
    model: LocalLearningConfiguration["embeddingModel"],
    operation?: AuthorizationEvaluationOptions,
  ): Promise<LocalLearningSetupStatus>;
  cancelDownload(
    model: LocalLearningConfiguration["embeddingModel"],
    operation?: AuthorizationEvaluationOptions,
  ): Promise<LocalLearningSetupStatus>;
  cleanupObsoleteRuntime(
    operation?: AuthorizationEvaluationOptions,
  ): Promise<LocalLearningSetupStatus>;
}

export function createLocalLearningSetup(
  client: LocalKnowledgeClient,
  nightloom: ReturnType<typeof createKnowledgeNightloom>,
): LocalLearningSetup {
  const map = (value: LocalKnowledgeStatus): LocalLearningSetupStatus => ({
    availability: value.availability,
    message: value.message,
    models: value.models,
    indexing: value.indexing,
    ...(value.obsoleteRuntimePresent === undefined
      ? {}
      : { obsoleteRuntimePresent: value.obsoleteRuntimePresent }),
    configuration: LocalLearningConfigurationSchema.parse(
      Object.fromEntries(
        Object.entries(value.configuration).filter(
          ([key]) => !["automaticContext", "captureOutcomes", "automaticCuration"].includes(key),
        ),
      ),
    ),
  });
  return {
    status: async (operation) => map(await client.status(operation)),
    async configure(configuration, operation) {
      if ((await nightloom.status()).active)
        throw Error("Wait for the active knowledge assessment before changing its configuration");
      const prior = await client.status(operation);
      const result = await client.configure(
        { ...prior.configuration, ...configuration },
        operation,
      );
      await nightloom.configure(result.configuration);
      return map(result);
    },
    download: async (model, operation) => map(await client.download(model, operation)),
    cancelDownload: async (model, operation) => map(await client.cancelDownload(model, operation)),
    cleanupObsoleteRuntime: async (operation) =>
      map(await client.cleanupObsoleteRuntime(operation)),
  };
}

export function createLocalLearningSetupHost(setup?: LocalLearningSetup) {
  return {
    async command(raw: unknown, operation?: AuthorizationEvaluationOptions) {
      const command = LocalLearningSetupCommandSchema.parse(raw);
      if (!setup) return { kind: "unavailable" as const };
      switch (command.action) {
        case "status":
          return setup.status(operation);
        case "configure":
          return setup.configure(command.configuration, operation);
        case "download":
          return setup.download(command.model, operation);
        case "cancel_download":
          return setup.cancelDownload(command.model, operation);
        case "cleanup_obsolete":
          return setup.cleanupObsoleteRuntime(operation);
      }
    },
  };
}

type LocalLearningOperations = Pick<
  LocalKnowledgeClient,
  "ingest" | "search" | "evidence" | "export" | "warmup" | "close"
> & {
  status(): Promise<Pick<LocalKnowledgeStatus, "availability" | "message" | "indexing">>;
};
export function createLocalLearningService(
  client: LocalLearningOperations,
  curation?: LearningCuration,
): LearningService {
  return {
    capabilities: {
      ...(curation ? { curation } : {}),
      warmup: {
        run: async (signal) => {
          if (signal.aborted) return { kind: "cancelled" };
          const result = await client.warmup({ signal, remainingMs: () => 5000 });
          return signal.aborted ? { kind: "cancelled" } : result;
        },
      },
    },
    async status() {
      const value = await client.status();
      return {
        availability: value.availability,
        message: value.message,
        retrieval:
          value.availability !== "ready"
            ? "unavailable"
            : value.indexing === "ready"
              ? "hybrid"
              : value.indexing === "indexing" || value.indexing === "pending"
                ? "rebuilding"
                : "lexical",
      };
    },
    ingest: (value, operation) => client.ingest(value, operation),
    search: (value, operation) => client.search(value, operation),
    evidence: (value, operation) => client.evidence(value, operation),
    export: (value, operation) => client.export(value, operation),
    close: () => client.close(),
  };
}

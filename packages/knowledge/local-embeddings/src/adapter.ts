import { createHash } from "node:crypto";
import {
  AuthorizationResultSchema,
  EmbeddingBatchSchema,
  embeddingResultSchemaFor,
  type EmbeddingConfiguration,
  type Authorizer,
  type KnowledgeEmbeddings,
} from "@drawloom/knowledge";
import { KnownLlamaRuntime, knownManifest, type KnownModelId } from "./manifest.js";
import type { EmbeddingWorker } from "./worker-types.js";

/** Rebuildable index identity includes weights and the local runtime/format policy. */
export function embeddingConfiguration(model: KnownModelId): EmbeddingConfiguration {
  const manifest = knownManifest(model);
  return {
    id: `local:${model}`,
    dimensions: manifest.dimensions,
    fingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          manifest,
          runtime: {
            revision: KnownLlamaRuntime.revision,
            binarySha256: KnownLlamaRuntime.binarySha256,
          },
          policy: "tokenize-before-inference-v2",
          segmentation: "unicode-512-v1",
          batchTokens: manifest.maxBatchTokens,
        }),
      )
      .digest("hex"),
  };
}

export function createKnowledgeEmbeddings(options: {
  model: KnownModelId;
  authorizer: Authorizer;
  worker: Pick<EmbeddingWorker, "embed">;
}): KnowledgeEmbeddings {
  const configuration = embeddingConfiguration(options.model);
  return {
    async embed(subject, input, parent) {
      const deadline = performance.now() + 30_000;
      const operation = parent ?? {
        signal: new AbortController().signal,
        remainingMs: () => deadline - performance.now(),
      };
      const stopped = () => {
        if (operation.signal.aborted)
          return { kind: "failure" as const, code: "cancelled" as const };
        try {
          const remaining = operation.remainingMs();
          if (Number.isFinite(remaining) && remaining > 0) return;
        } catch {}
        return { kind: "failure" as const, code: "budget_exhausted" as const };
      };
      if (stopped()) return stopped()!;
      try {
        const decision = AuthorizationResultSchema.safeParse(
          await options.authorizer.authorize(
            {
              subject,
              action: { name: "embed" },
              resource: {
                type: "embedding-destination",
                id: configuration.id,
                properties: { local: true },
              },
            },
            operation,
          ),
        );
        if (stopped()) return stopped()!;
        if (!decision.success) return { kind: "failure", code: "malformed_result" };
        if (!("decision" in decision.data)) return decision.data;
        if (!decision.data.decision) return { kind: "denied" };
      } catch {
        return stopped() ?? { kind: "failure", code: "rejected" };
      }
      const parsed = EmbeddingBatchSchema.safeParse(input);
      if (!parsed.success) return { kind: "failure", code: "invalid" };
      const batch = parsed.data;
      if (
        batch.configuration.id !== configuration.id ||
        batch.configuration.fingerprint !== configuration.fingerprint ||
        batch.configuration.dimensions !== configuration.dimensions
      )
        return { kind: "failure", code: "invalid" };
      try {
        const vectors = await options.worker.embed(
          {
            role: batch.role,
            items: batch.items.map((item) => item.text),
          },
          {
            signal: operation.signal,
            timeoutMs: Math.floor(Math.min(300_000, operation.remainingMs())),
          },
        );
        if (stopped()) return stopped()!;
        const result = embeddingResultSchemaFor(batch).safeParse({
          kind: "ok",
          configuration,
          items: batch.items.map((item, index) => ({
            id: item.id,
            ...(item.revision !== undefined ? { revision: item.revision } : {}),
            vector: vectors[index],
          })),
        });
        return result.success ? result.data : { kind: "failure", code: "invalid" };
      } catch {
        return stopped() ?? { kind: "failure", code: "unavailable" };
      }
    },
  };
}

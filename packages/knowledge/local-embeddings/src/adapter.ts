import { createHash } from "node:crypto";
import { AuthorizationResultSchema, EmbeddingBatchSchema, embeddingResultSchemaFor, type EmbeddingConfiguration, type KnowledgeAuthorizer, type KnowledgeEmbeddings } from "@drawloom/knowledge";
import { knownManifest, type KnownModelId } from "./manifest.js";
import type { EmbeddingWorker } from "./worker-types.js";

/** Rebuildable index identity includes weights and the local runtime/format policy. */
export function embeddingConfiguration(model: KnownModelId): EmbeddingConfiguration {
  const manifest = knownManifest(model);
  return {
    id: `local:${model}`,
    dimensions: manifest.dimensions,
    fingerprint: createHash("sha256").update(JSON.stringify({ manifest, runtime: "mlx-embeddings@0.1.0/mlx@0.32.2/transformers@5.17.0/tokenizers@0.23.2", policy: "untruncated-v1", segmentation: "unicode-512-v1", batchTokens: manifest.maxBatchTokens })).digest("hex"),
  };
}

export function createKnowledgeEmbeddings(options: {
  model: KnownModelId;
  authorizer: KnowledgeAuthorizer;
  worker: Pick<EmbeddingWorker, "embed">;
}): KnowledgeEmbeddings {
  const configuration = embeddingConfiguration(options.model);
  return {
    async embed(subject, input) {
      try {
        const decision = AuthorizationResultSchema.parse(await options.authorizer.authorize({
          subject, action: { name: "embed" },
          resource: { type: "embedding-destination", id: configuration.id, properties: { local: true } },
        }));
        if (!("decision" in decision) || !decision.decision) return { kind: "denied" };
      } catch { return { kind: "denied" }; }
      const parsed = EmbeddingBatchSchema.safeParse(input);
      if (!parsed.success) return { kind: "failure", code: "invalid" };
      const batch = parsed.data;
      if (batch.configuration.id !== configuration.id || batch.configuration.fingerprint !== configuration.fingerprint || batch.configuration.dimensions !== configuration.dimensions) return { kind: "failure", code: "invalid" };
      try {
        const vectors = await options.worker.embed({ role: batch.role, items: batch.items.map((item) => item.text) });
        const result = embeddingResultSchemaFor(batch).safeParse({ kind: "ok", configuration, items: batch.items.map((item, index) => ({ id: item.id, ...(item.revision !== undefined ? { revision: item.revision } : {}), vector: vectors[index] })) });
        return result.success ? result.data : { kind: "failure", code: "invalid" };
      } catch { return { kind: "failure", code: "unavailable" }; }
    },
  };
}

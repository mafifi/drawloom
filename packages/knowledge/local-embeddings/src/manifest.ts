import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ArtifactPathSchema = z.string().min(1).refine(
  (path) => !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === ".." || part.includes("\\")),
  "relative artifact path is required",
);

export const ModelManifestSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  revision: z.string().regex(/^[a-f0-9]{40}$/).or(z.literal("public-test-revision")),
  dimensions: z.number().int().positive(),
  dtype: z.literal("q8"),
  maxTokens: z.number().int().positive().default(2048),
  maxBatchTokens: z.number().int().positive().default(8192),
  runtime: z.literal("llama.cpp"),
  formatting: z.strictObject({ query: z.string(), document: z.string(), pooling: z.literal("last_token"), layerNorm: z.boolean() }),
  provenance: z.strictObject({ repository: z.string(), baseLicense: z.literal("Apache-2.0"), conversionLicense: z.literal("Apache-2.0") }).optional(),
  runtimeProvenance: z.strictObject({ package: z.string(), version: z.string(), license: z.literal("MIT") }).optional(),
  artifacts: z.array(z.strictObject({ path: ArtifactPathSchema, bytes: z.number().int().nonnegative(), sha256: Sha256Schema, url: z.url() })).min(1),
}).superRefine((manifest, context) => {
  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) context.addIssue({ code: "custom", message: "artifact paths must be unique" });
    paths.add(artifact.path);
  }
});

export const RuntimeArtifactSchema = z.strictObject({
  id: z.literal("llama.cpp-darwin-arm64"),
  revision: z.string().regex(/^[a-f0-9]{40}$/),
  platform: z.literal("darwin"),
  arch: z.literal("arm64"),
  bytes: z.number().int().positive(),
  sha256: Sha256Schema,
  binarySha256: Sha256Schema,
  url: z.url().optional(),
});

export type ModelManifest = z.output<typeof ModelManifestSchema>;
export type RuntimeArtifact = z.output<typeof RuntimeArtifactSchema>;
export type TrustedRuntimeArtifact = RuntimeArtifact & { readonly trusted: true };
export type KnownModelId = "qwen3-embedding-0.6b-gguf";

const qwenRepository = "Qwen/Qwen3-Embedding-0.6B-GGUF";
const qwenRevision = "370f27d7550e0def9b39c1f16d3fbaa13aa67728";

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export const KnownLlamaRuntime: RuntimeArtifact = immutable(RuntimeArtifactSchema.parse({
  id: "llama.cpp-darwin-arm64",
  revision: "2f539596c6e9a977e91b6bc6344650422c6bc3b0",
  platform: "darwin",
  arch: "arm64",
  bytes: 4697890,
  sha256: "0bf91c702d391a106aba0e0b61f15a5b77bab5d269aff0c7590b2f82332de88a",
  binarySha256: "e1e60e0d2dde29a6da46474f6ba1b8365f714527230bc4cb35134c3839096007",
}));

export const KnownModelManifests: Readonly<Record<KnownModelId, ModelManifest>> = immutable({
  "qwen3-embedding-0.6b-gguf": ModelManifestSchema.parse({
    id: "qwen3-embedding-0.6b-gguf",
    revision: qwenRevision,
    dimensions: 1024,
    dtype: "q8",
    runtime: "llama.cpp",
    maxTokens: 2048,
    maxBatchTokens: 8192,
    formatting: {
      query: "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:",
      document: "",
      pooling: "last_token",
      layerNorm: false,
    },
    provenance: { repository: qwenRepository, baseLicense: "Apache-2.0", conversionLicense: "Apache-2.0" },
    runtimeProvenance: { package: "llama.cpp", version: "2f539596c6e9a977e91b6bc6344650422c6bc3b0", license: "MIT" },
    artifacts: [{
      path: "Qwen3-Embedding-0.6B-Q8_0.gguf",
      bytes: 639150592,
      sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439",
      url: `https://huggingface.co/${qwenRepository}/resolve/${qwenRevision}/Qwen3-Embedding-0.6B-Q8_0.gguf`,
    }],
  }),
});

export function knownManifest(model: KnownModelId): ModelManifest { return KnownModelManifests[model]; }

export function formatEmbeddingInput(model: KnownModelId, role: "query" | "document", text: string): string {
  const formatting = knownManifest(model).formatting;
  return `${role === "query" ? formatting.query : formatting.document}${text}`;
}

import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ArtifactPathSchema = z.string().min(1).refine(
  (path) => !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === ".." || part.includes("\\")),
  "relative artifact path is required",
);

export const ModelManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  revision: z.string().regex(/^[a-f0-9]{40}$/).or(z.literal("public-test-revision")),
  dimensions: z.number().int().positive(),
  dtype: z.literal("q8"),
  maxTokens: z.number().int().positive().default(2048),
  maxBatchTokens: z.number().int().positive().default(8192),
  runtime: z.literal("mlx").default("mlx"),
  formatting: z.object({
    query: z.string(),
    document: z.string(),
    pooling: z.enum(["last_token", "mean"]),
    layerNorm: z.boolean(),
  }),
  provenance: z.object({
    repository: z.string(),
    baseLicense: z.literal("Apache-2.0"),
    conversionLicense: z.enum(["Apache-2.0", "unverified"]),
  }).optional(),
  runtimeProvenance: z.object({ package: z.string(), version: z.string(), license: z.string() }).optional(),
  artifacts: z.array(z.object({
    path: ArtifactPathSchema,
    bytes: z.number().int().nonnegative(),
    sha256: Sha256Schema,
    url: z.url(),
  })).min(1),
}).superRefine((manifest, context) => {
  const paths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    if (paths.has(artifact.path)) context.addIssue({ code: "custom", message: "artifact paths must be unique" });
    paths.add(artifact.path);
  }
});

export type ModelManifest = z.output<typeof ModelManifestSchema>;
export type KnownModelId = "qwen3-embedding-0.6b-mlx";
const qwenMlxRepository = "mlx-community/Qwen3-Embedding-0.6B-8bit";
const qwenMlxRevision = "407ad2329cd30702720aafe83f74a1ba30fdfbca";

function artifact(repository: string, revision: string, path: string, bytes: number, sha256: string) {
  return { path, bytes, sha256, url: `https://huggingface.co/${repository}/resolve/${revision}/${path}` };
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export const KnownModelManifests: Readonly<Record<KnownModelId, ModelManifest>> = immutable({
  "qwen3-embedding-0.6b-mlx": ModelManifestSchema.parse({
    id: "qwen3-embedding-0.6b-mlx",
    revision: qwenMlxRevision,
    dimensions: 1024,
    dtype: "q8",
    runtime: "mlx",
    maxTokens: 2048,
    maxBatchTokens: 8192,
    formatting: {
      query: "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:",
      document: "",
      pooling: "last_token",
      layerNorm: false,
    },
    provenance: { repository: qwenMlxRepository, baseLicense: "Apache-2.0", conversionLicense: "Apache-2.0" },
    // mlx-embeddings remains GPL-3.0-only even though it is installed separately.
    runtimeProvenance: { package: "mlx-embeddings", version: "0.1.0", license: "GPL-3.0-only" },
    artifacts: [
      artifact(qwenMlxRepository, qwenMlxRevision, "model.safetensors", 633152041, "fe956e8d346b4f08215a3cfc48a874354f900c20a59e965b75df0d9d77c54b28"),
      artifact(qwenMlxRepository, qwenMlxRevision, "config.json", 857, "65fb46306262bac47c6a89e5ad8a766c3d40d559057c1931e9c10976266a4fc7"),
      artifact(qwenMlxRepository, qwenMlxRevision, "config_sentence_transformers.json", 215, "10667c72ddb772627bf1780cb7f86af8e2ae0032b8c243c731172064105c6961"),
      artifact(qwenMlxRepository, qwenMlxRevision, "modules.json", 349, "84e40c8e006c9b1d6c122e02cba9b02458120b5fb0c87b746c41e0207cf642cf"),
      artifact(qwenMlxRepository, qwenMlxRevision, "model.safetensors.index.json", 49731, "d387721e7d2dd44152b7dc9fcea8d5647e2692e1c064949c000fabad3292d1d1"),
      artifact(qwenMlxRepository, qwenMlxRevision, "tokenizer.json", 11423705, "def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a"),
      artifact(qwenMlxRepository, qwenMlxRevision, "tokenizer_config.json", 5404, "443bfa629eb16387a12edbf92a76f6a6f10b2af3b53d87ba1550adfcf45f7fa0"),
      artifact(qwenMlxRepository, qwenMlxRevision, "special_tokens_map.json", 613, "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd"),
      artifact(qwenMlxRepository, qwenMlxRevision, "added_tokens.json", 707, "c0284b582e14987fbd3d5a2cb2bd139084371ed9acbae488829a1c900833c680"),
      artifact(qwenMlxRepository, qwenMlxRevision, "vocab.json", 2776833, "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910"),
      artifact(qwenMlxRepository, qwenMlxRevision, "merges.txt", 1671853, "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5"),
      artifact(qwenMlxRepository, qwenMlxRevision, "chat_template.jinja", 4116, "87a2728cb8dc9fe424d624542f6060ec05a1d285ebbec578bb078900e33396b5"),
    ],
  }),
});

export function knownManifest(model: KnownModelId): ModelManifest { return KnownModelManifests[model]; }

export function formatEmbeddingInput(model: KnownModelId, role: "query" | "document", text: string): string {
  const formatting = knownManifest(model).formatting;
  return `${role === "query" ? formatting.query : formatting.document}${text}`;
}

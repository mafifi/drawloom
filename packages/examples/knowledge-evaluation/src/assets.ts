import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { corpusVersion, documents, heldOutQuestions } from "./fixtures/corpus.js";
import { knowledgeEvaluationSourceIdentity } from "./identities.js";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const categorySchema = z.enum(["semantic", "identifier", "chain", "contradiction", "irrelevant"]);
const corpusIdentitySchema = z.strictObject({
  version: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  records: z.number().int().positive(),
});
const reportedQuestionSchema = z.strictObject({
  category: categorySchema,
  retrieved: z.array(z.string().min(1)).max(100),
});
const questionsSchema = z.record(z.string(), reportedQuestionSchema);
const retrievalRunSchema = z.looseObject({ questions: questionsSchema });
const currentReportSchema = z.looseObject({
  kind: z.literal("real_vector_evaluation"),
  corpus: corpusIdentitySchema,
  lexical: retrievalRunSchema,
  hybrid: z.looseObject({
    kind: z.literal("real_vectors"),
    model: z.string().min(1),
    questions: questionsSchema,
  }),
});
export const KnowledgeAnswerOutputSchema = z.strictObject({
  answer: z.string().min(1),
  citations: z
    .array(
      z.strictObject({
        type: z.literal("source"),
        origin: z.literal("evaluation-public"),
        id: z.string().min(1),
        revision: z.string().min(1),
      }),
    )
    .max(100),
  abstained: z.boolean(),
});
export const HistoricalScoreSchema = z.strictObject({
  citations: z.strictObject({
    supplied: z.number().int().nonnegative(),
    valid: z.number().int().nonnegative(),
    current: z.number().int().nonnegative(),
    expected: z.number().int().nonnegative(),
    invalid: z.array(z.string()),
  }),
  surfaceAssertions: z.strictObject({
    matched: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    checks: z.array(z.strictObject({ label: z.string(), matched: z.boolean() })),
  }),
  abstention: z.strictObject({ expected: z.boolean(), actual: z.boolean(), matched: z.boolean() }),
  limit: z.literal("deterministic_surface_checks_are_not_universal_correctness"),
});
const historicalResultSchema = z.strictObject({
  mode: z.enum(["lexical", "qwen3-embedding-0.6b", "nomic-embed-text-v1.5"]),
  questionId: z.string().min(1),
  result: z.strictObject({
    kind: z.literal("completed"),
    output: KnowledgeAnswerOutputSchema,
    nativeActivity: z.array(z.string()),
    cached: z.boolean(),
  }),
  score: HistoricalScoreSchema,
});
const embeddedReportSchema = z.looseObject({
  corpus: corpusIdentitySchema,
  lexical: retrievalRunSchema,
  hybrid: z.union([
    z.looseObject({
      kind: z.literal("real_vectors"),
      model: z.string().min(1),
      questions: questionsSchema,
    }),
    z.looseObject({ kind: z.string() }),
  ]),
});
const historicalReportSchema = z.looseObject({
  kind: z.literal("answer_quality_evaluation"),
  answeringModel: z.strictObject({ model: z.string().min(1), effort: z.string().min(1) }),
  retrieval: z.record(z.string(), embeddedReportSchema),
  results: z.array(historicalResultSchema).length(72),
  limitations: z.array(z.string()),
});

export type KnowledgeEvaluationAssets = {
  readonly corpus: Uint8Array;
  readonly current: Uint8Array;
  readonly historical: Uint8Array;
};

function verify(
  name: string,
  bytes: Uint8Array,
  expected: { bytes: number; sha256: string },
): void {
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256)
    throw new Error(`${name} source identity changed`);
}

function validateQuestions(label: string, questions: z.infer<typeof questionsSchema>): void {
  if (Object.keys(questions).length !== heldOutQuestions.length)
    throw new Error(`${label} does not contain exactly the frozen questions`);
  for (const question of heldOutQuestions) {
    const reported = questions[question.id];
    if (!reported || reported.category !== question.kind)
      throw new Error(`${label} is missing frozen question/category ${question.id}`);
  }
}

export async function parseKnowledgeEvaluationAssets(
  assets: KnowledgeEvaluationAssets,
  options: { readonly verifySourceBytes?: boolean } = {},
) {
  if (options.verifySourceBytes !== false) {
    verify("corpus", assets.corpus, knowledgeEvaluationSourceIdentity.corpus);
    verify("current report", assets.current, knowledgeEvaluationSourceIdentity.current);
    verify("historical report", assets.historical, knowledgeEvaluationSourceIdentity.historical);
  }
  let currentUnknown: unknown;
  let historicalUnknown: unknown;
  try {
    currentUnknown = JSON.parse(new TextDecoder().decode(assets.current));
    historicalUnknown = JSON.parse(new TextDecoder().decode(assets.historical));
  } catch {
    throw new Error("Frozen knowledge evaluation JSON is malformed");
  }
  const current = currentReportSchema.parse(currentUnknown);
  const historical = historicalReportSchema.parse(historicalUnknown);
  if (
    corpusVersion !== current.corpus.version ||
    knowledgeEvaluationSourceIdentity.corpus.sha256 !== current.corpus.sha256 ||
    current.corpus.records !== 10_000
  ) {
    throw new Error("Current retrieval report does not share the frozen corpus identity");
  }
  validateQuestions("current lexical report", current.lexical.questions);
  validateQuestions("current MLX report", current.hybrid.questions);
  for (const [mode, report] of Object.entries(historical.retrieval)) {
    if (
      report.corpus.version !== corpusVersion ||
      report.corpus.sha256 !== knowledgeEvaluationSourceIdentity.corpus.sha256 ||
      report.corpus.records !== 10_000
    ) {
      throw new Error(`Historical ${mode} report does not share the frozen corpus identity`);
    }
  }
  for (const mode of ["lexical", "qwen3-embedding-0.6b", "nomic-embed-text-v1.5"] as const) {
    const report = historical.retrieval[mode];
    if (!report) throw new Error(`Historical retrieval mode ${mode} is absent`);
    const rawQuestions =
      mode === "lexical"
        ? report.lexical.questions
        : report.hybrid.kind === "real_vectors"
          ? report.hybrid.questions
          : undefined;
    const questions = rawQuestions === undefined ? undefined : questionsSchema.parse(rawQuestions);
    if (!questions)
      throw new Error(`Historical retrieval mode ${mode} has no retained vector questions`);
    validateQuestions(`historical ${mode} report`, questions);
  }
  if (new Set(historical.results.map((item) => `${item.mode}:${item.questionId}`)).size !== 72)
    throw new Error("Historical answers do not contain 72 unique mode/question pairs");
  return Object.freeze({
    current,
    historical,
    corpus: Object.freeze({ version: corpusVersion, documents, questions: heldOutQuestions }),
  });
}

export async function readPackagedKnowledgeEvaluationAssets(): Promise<KnowledgeEvaluationAssets> {
  const sourceModule = new URL(import.meta.url).pathname.endsWith("/src/assets.ts");
  const base = sourceModule
    ? new URL("./fixtures/", import.meta.url)
    : new URL("../src/fixtures/", import.meta.url);
  const [corpus, current, historical] = await Promise.all([
    readFile(new URL("corpus.ts", base)),
    readFile(new URL("local-knowledge-mlx-10k.json", base)),
    readFile(new URL("local-knowledge-answers-10k.json", base)),
  ]);
  return { corpus, current, historical };
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { corpusVersion, documents, heldOutQuestions, type EvaluationQuestion } from "../../evaluations/knowledge/corpus.ts";
import { createBraintrustRunner } from "./braintrust.ts";
import type { EvaluationCase, EvaluationResult, Scorer } from "./contract.ts";
import { inspectionDocumentSchema, type InspectionDocument, type InspectionResult } from "./inspection-contract.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const currentRetrievalPath = "knowledge/evidence/assets/adr-0024/local-knowledge-mlx-10k.json";
const historicalAnswerPath = "knowledge/evidence/assets/adr-0024/local-knowledge-answers-10k.json";
const categorySchema = z.enum(["semantic", "identifier", "chain", "contradiction", "irrelevant"]);
const corpusIdentitySchema = z.strictObject({ version: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), records: z.number().int().positive() });
const reportedQuestionSchema = z.strictObject({ category: categorySchema, retrieved: z.array(z.string().min(1)).max(100) });
const questionsSchema = z.record(z.string(), reportedQuestionSchema);
const retrievalRunSchema = z.looseObject({ questions: questionsSchema });
const currentReportSchema = z.looseObject({
  corpus: corpusIdentitySchema,
  lexical: retrievalRunSchema,
  hybrid: z.looseObject({ kind: z.literal("real_vectors"), model: z.string().min(1), questions: questionsSchema }),
});
const answerOutputSchema = z.strictObject({
  answer: z.string().min(1),
  citations: z.array(z.strictObject({ type: z.literal("source"), origin: z.literal("evaluation-public"), id: z.string().min(1), revision: z.string().min(1) })),
  abstained: z.boolean(),
});
type AnswerOutput = z.infer<typeof answerOutputSchema>;
const historicalScoreSchema = z.strictObject({
  citations: z.strictObject({ supplied: z.number(), valid: z.number(), current: z.number(), expected: z.number(), invalid: z.array(z.string()) }),
  surfaceAssertions: z.strictObject({ matched: z.number(), total: z.number(), checks: z.array(z.strictObject({ label: z.string(), matched: z.boolean() })) }),
  abstention: z.strictObject({ expected: z.boolean(), actual: z.boolean(), matched: z.boolean() }),
  limit: z.literal("deterministic_surface_checks_are_not_universal_correctness"),
});
const historicalResultSchema = z.strictObject({
  mode: z.enum(["lexical", "qwen3-embedding-0.6b", "nomic-embed-text-v1.5"]),
  questionId: z.string().min(1),
  result: z.strictObject({ kind: z.literal("completed"), output: answerOutputSchema, nativeActivity: z.array(z.string()), cached: z.boolean() }),
  score: historicalScoreSchema,
});
const embeddedRetrievalReportSchema = z.looseObject({
  corpus: corpusIdentitySchema,
  lexical: retrievalRunSchema,
  hybrid: z.union([z.looseObject({ kind: z.literal("real_vectors"), model: z.string().min(1), questions: questionsSchema }), z.looseObject({ kind: z.string() })]),
});
const historicalReportSchema = z.looseObject({
  kind: z.literal("answer_quality_evaluation"),
  answeringModel: z.strictObject({ model: z.string().min(1), effort: z.string().min(1) }),
  retrieval: z.record(z.string(), embeddedRetrievalReportSchema),
  results: z.array(historicalResultSchema),
  limitations: z.array(z.string()),
});

type Source = { id: string; path: string; sha256: string; bytes: number; classification: "retained-current-retrieval" | "retained-historical-answer"; label: string; limitations: string[] };
type CaseMeta = { question: EvaluationQuestion; classification: z.infer<typeof inspectionDocumentSchema>["results"][number]["provenance"]["classification"]; mode: string; method: string; sourceId: string; baselineResultId?: string };
type ExpectedRetrieval = { relevant: string[]; requiredChain: string[]; abstain: boolean; current: string[] };
type RetrievalOutput = { kind: "retrieval"; retrieved: string[] };
type AnswerAssessmentOutput = { kind: "answer"; output: AnswerOutput; score: z.infer<typeof historicalScoreSchema> };

function digest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function ratio(numerator: number, denominator: number): number { return denominator === 0 ? 1 : numerator / denominator; }
function exactJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function questionById(id: string): EvaluationQuestion {
  const question = heldOutQuestions.find(candidate => candidate.id === id);
  if (!question) throw Error(`Unknown frozen question ${id}`);
  return question;
}
function currentReferences(): Set<string> {
  return new Set(documents.filter(document => document.current).map(document => `${document.id}@${document.revision}`));
}
function isCurrentReference(value: string, current: ReadonlySet<string>): boolean {
  return current.has(value) || /^inventory-\d+@r1$/.test(value);
}

const retrievalOutputSchema = z.strictObject({ kind: z.literal("retrieval"), retrieved: z.array(z.string()) });
const expectedRetrievalSchema = z.strictObject({ relevant: z.array(z.string()), requiredChain: z.array(z.string()), abstain: z.boolean(), current: z.array(z.string()) });

const retrievalScorers: readonly Scorer[] = [
  {
    id: "relevant-evidence",
    revision: "frozen-reference-v1",
    async score({ output, expected }) {
      const actual = retrievalOutputSchema.parse(output).retrieved;
      const value = expectedRetrievalSchema.parse(expected);
      const matches = actual.filter(reference => value.relevant.includes(reference)).length;
      const score = value.abstain ? (actual.length === 0 ? 1 : 0) : ratio(matches, value.relevant.length);
      return { score, explanation: value.abstain ? `${actual.length === 0 ? "Correctly abstained" : `Returned ${actual.length} references`} for an irrelevant frozen question.` : `${matches}/${value.relevant.length} frozen relevant references appeared in the retained top-k.` };
    },
  },
  {
    id: "required-chain-top-k",
    revision: "frozen-reference-v1",
    async score({ output, expected }) {
      const actual = new Set(retrievalOutputSchema.parse(output).retrieved);
      const required = expectedRetrievalSchema.parse(expected).requiredChain;
      if (!required.length) return { explanation: "Not applicable: this frozen question has no required evidence chain." };
      const present = required.filter(reference => actual.has(reference));
      return { score: present.length === required.length ? 1 : 0, explanation: `${present.length}/${required.length} required chain references appeared in the retained top-k. This is reference coverage, not traversal of the evidence API.` };
    },
  },
  {
    id: "current-revision",
    revision: "frozen-corpus-v1",
    async score({ output, expected }) {
      const actual = retrievalOutputSchema.parse(output).retrieved;
      const current = new Set(expectedRetrievalSchema.parse(expected).current);
      const count = actual.filter(reference => isCurrentReference(reference, current)).length;
      return { score: ratio(count, actual.length), explanation: `${count}/${actual.length} returned references identify current frozen revisions.` };
    },
  },
];

const answerAssessmentScorer: Scorer = {
  id: "grounded-answer-heuristic",
  revision: "frozen-answer-checks-v1",
  async score({ output }) {
    const score = z.strictObject({ kind: z.literal("answer"), output: answerOutputSchema, score: historicalScoreSchema }).parse(output).score;
    const citationValidity = ratio(score.citations.valid, score.citations.supplied);
    const expectedCitations = ratio(score.citations.expected, score.citations.supplied);
    const currentCitations = ratio(score.citations.current, score.citations.supplied);
    const abstention = score.abstention.matched ? 1 : 0;
    return {
      score: (citationValidity + expectedCitations + currentCitations + abstention) / 4,
      explanation: `Recomputed frozen reference checks: valid citations ${score.citations.valid}/${score.citations.supplied}, expected citations ${score.citations.expected}/${score.citations.supplied}, current citations ${score.citations.current}/${score.citations.supplied}, abstention ${score.abstention.matched ? "matched" : "mismatched"}. Historical surface assertions (${score.surfaceAssertions.matched}/${score.surfaceAssertions.total}) are displayed as imported evidence, not reassessed text judgement.`,
    };
  },
};

function sourceEvidence(source: Source) { return [{ assetKey: source.sha256, mediaType: "application/json", size: source.bytes }]; }
function retrievalCase(id: string, question: EvaluationQuestion, retrieved: readonly string[], current: ReadonlySet<string>, source: Source): EvaluationCase {
  return {
    id,
    revision: `${question.id}:${source.sha256}`,
    input: { questionId: question.id, query: question.query },
    expected: { relevant: [...question.relevant], requiredChain: [...question.requiredChain], abstain: question.abstain, current: [...current] } satisfies ExpectedRetrieval,
    suppliedOutput: { kind: "retrieval", retrieved: [...retrieved] } satisfies RetrievalOutput,
    evidence: sourceEvidence(source),
  };
}

function expandEvidence(references: readonly string[]): string[] {
  const expanded = new Set(references);
  const visit = (reference: string) => {
    const [id, revision] = reference.split("@");
    const document = documents.find(candidate => candidate.id === id && candidate.revision === revision);
    for (const dependency of document?.evidence ?? []) if (!expanded.has(dependency)) { expanded.add(dependency); visit(dependency); }
  };
  references.forEach(visit);
  return [...expanded];
}

function recomputeHistoricalScore(question: EvaluationQuestion, retrieved: readonly string[], output: AnswerOutput, retained: z.infer<typeof historicalScoreSchema>) {
  const provided = new Set(expandEvidence(retrieved));
  const expected = new Set([...question.relevant, ...question.requiredChain]);
  const current = currentReferences();
  const citationKeys = output.citations.map(citation => `${citation.id}@${citation.revision}`);
  const recomputed = {
    citations: {
      supplied: citationKeys.length,
      valid: citationKeys.filter(reference => provided.has(reference)).length,
      current: citationKeys.filter(reference => isCurrentReference(reference, current)).length,
      expected: citationKeys.filter(reference => expected.has(reference)).length,
      invalid: citationKeys.filter(reference => !provided.has(reference)),
    },
    // The original fixed regex judgements are retained as historical evidence;
    // this proof does not duplicate their private assertion table or call a model.
    surfaceAssertions: retained.surfaceAssertions,
    abstention: { expected: question.abstain, actual: output.abstained, matched: question.abstain === output.abstained },
    limit: "deterministic_surface_checks_are_not_universal_correctness" as const,
  };
  return historicalScoreSchema.parse(recomputed);
}

async function readSource(path: string, classification: Source["classification"], label: string, limitations: string[]) {
  const bytes = await readFile(resolve(repositoryRoot, path));
  return {
    source: { id: classification, path, sha256: digest(bytes), bytes: bytes.byteLength, classification, label, limitations } satisfies Source,
    json: JSON.parse(bytes.toString("utf8")) as unknown,
  };
}

function resultId(experimentId: string, caseId: string) { return `${experimentId}:${caseId}:trial-1`; }
function wrapResults(results: readonly EvaluationResult[], metadata: ReadonlyMap<string, CaseMeta>, corpusHash: string): InspectionResult[] {
  return results.map(evaluation => {
    const meta = metadata.get(evaluation.caseId);
    if (!meta) throw Error(`Missing inspection metadata for ${evaluation.caseId}`);
    const output = z.discriminatedUnion("kind", [retrievalOutputSchema, z.strictObject({ kind: z.literal("answer"), output: answerOutputSchema, score: historicalScoreSchema })]).parse(evaluation.output);
    const details = output.kind === "retrieval"
      ? { kind: "retrieval" as const, retrieved: output.retrieved }
      : { kind: "answer" as const, answer: output.output.answer, citations: output.output.citations.map(citation => `${citation.id}@${citation.revision}`), abstained: output.output.abstained };
    return {
      evaluation,
      question: { id: meta.question.id, text: meta.question.query, category: meta.question.kind },
      provenance: { classification: meta.classification, mode: meta.mode, method: meta.method, corpusVersion, corpusSha256: corpusHash, sourceId: meta.sourceId },
      details,
      comparison: { ...(meta.baselineResultId ? { baselineResultId: meta.baselineResultId } : {}) },
    };
  });
}

export async function buildKnowledgeInspection(): Promise<InspectionDocument> {
  process.env.BRAINTRUST_DISABLE_AUTO_INSTRUMENTATION = "1";
  const currentInput = await readSource(currentRetrievalPath, "retained-current-retrieval", "Current retained lexical and MLX retrieval", [
    "Retrieval results assess frozen reference identities; they do not regenerate answers.",
    "Required-chain findings mean references were present in the top-k, not that the evidence API was traversed.",
  ]);
  const historicalInput = await readSource(historicalAnswerPath, "retained-historical-answer", "Historical retained CPU answer assessment", [
    "Lexical, CPU Qwen and CPU Nomic answers predate the current MLX-only composition and remain historical evidence.",
    "Reference grounding and abstention are recomputed from the frozen corpus; historical surface assertions are displayed but not reassessed, and original evidence pagination is not replayed.",
  ]);
  const current = currentReportSchema.parse(currentInput.json);
  const historical = historicalReportSchema.parse(historicalInput.json);
  const corpusBytes = await readFile(resolve(repositoryRoot, "evaluations/knowledge/corpus.ts"));
  const corpusHash = digest(corpusBytes);
  if (current.corpus.version !== corpusVersion || current.corpus.sha256 !== corpusHash) throw Error("Current retrieval report does not match the frozen corpus");
  for (const report of Object.values(historical.retrieval)) {
    if (report.corpus.version !== corpusVersion || report.corpus.sha256 !== corpusHash || report.corpus.records !== current.corpus.records) throw Error("Historical answer inputs do not share the frozen corpus identity");
  }

  const runner = createBraintrustRunner();
  const currentCases: EvaluationCase[] = [];
  const currentMeta = new Map<string, CaseMeta>();
  const currentSet = currentReferences();
  const modes = [
    { id: "lexical", label: "lexical", questions: current.lexical.questions },
    { id: "mlx", label: current.hybrid.model, questions: current.hybrid.questions },
  ];
  for (const mode of modes) for (const question of heldOutQuestions) {
    const reported = mode.questions[question.id];
    if (!reported || reported.category !== question.kind) throw Error(`Current ${mode.label} report is missing ${question.id}`);
    const id = `retrieval:${mode.id}:${question.id}`;
    currentCases.push(retrievalCase(id, question, reported.retrieved, currentSet, currentInput.source));
    currentMeta.set(id, { question, classification: "retained-current-retrieval", mode: mode.label, method: "retained top-k retrieval reference assessment", sourceId: currentInput.source.id });
  }
  const currentRun = await runner.run({ experimentId: "knowledge-current-retrieval", mode: "assess-existing", cases: currentCases, scorers: retrievalScorers, repetitions: 1, concurrency: 4 });

  const answerCases: EvaluationCase[] = [];
  const answerMeta = new Map<string, CaseMeta>();
  for (const entry of historical.results) {
    const question = questionById(entry.questionId);
    const report = historical.retrieval[entry.mode];
    if (!report) throw Error(`Historical retrieval source is missing ${entry.mode}`);
    const questions: z.infer<typeof questionsSchema> | undefined = entry.mode === "lexical" ? report.lexical.questions : report.hybrid.kind === "real_vectors" ? report.hybrid.questions as z.infer<typeof questionsSchema> : undefined;
    const reported = questions?.[entry.questionId];
    if (!reported || reported.category !== question.kind) throw Error(`Historical ${entry.mode} report is missing ${entry.questionId}`);
    const recomputed = recomputeHistoricalScore(question, reported.retrieved, entry.result.output, entry.score);
    if (!exactJson(recomputed, entry.score)) throw Error(`Historical score integrity check changed for ${entry.mode}:${entry.questionId}`);
    const id = `answer:${entry.mode}:${entry.questionId}`;
    answerCases.push({
      id,
      revision: `${entry.mode}:${question.id}:${historicalInput.source.sha256}`,
      input: { questionId: question.id, query: question.query },
      suppliedOutput: { kind: "answer", output: entry.result.output, score: recomputed } satisfies AnswerAssessmentOutput,
      evidence: sourceEvidence(historicalInput.source),
    });
    answerMeta.set(id, { question, classification: "retained-historical-answer", mode: entry.mode, method: "recomputed retained citation, current-revision, expected-reference and abstention heuristics; imported historical surface assertions", sourceId: historicalInput.source.id });
  }
  const answerRun = await runner.run({ experimentId: "knowledge-historical-answer", mode: "assess-existing", cases: answerCases, scorers: [answerAssessmentScorer], repetitions: 1, concurrency: 4 });

  const baselineC1 = current.hybrid.questions.c1!;
  const baselineX1 = current.hybrid.questions.x1!;
  const regressionCases = [
    retrievalCase("retrieval:mlx:c1-chain-omission", questionById("c1"), baselineC1.retrieved.filter(reference => reference !== "museum-hours@r1"), currentSet, currentInput.source),
    retrievalCase("retrieval:mlx:x1-stale-only", questionById("x1"), ["ferry-rule@r1"], currentSet, currentInput.source),
  ];
  const regressionMeta = new Map<string, CaseMeta>([
    [regressionCases[0]!.id, { question: questionById("c1"), classification: "synthetic-regression", mode: current.hybrid.model, method: "controlled omission from retained output; not an actual retained run", sourceId: currentInput.source.id, baselineResultId: resultId("knowledge-current-retrieval", "retrieval:mlx:c1") }],
    [regressionCases[1]!.id, { question: questionById("x1"), classification: "synthetic-regression", mode: current.hybrid.model, method: "controlled stale-only replacement; not an actual retained run", sourceId: currentInput.source.id, baselineResultId: resultId("knowledge-current-retrieval", "retrieval:mlx:x1") }],
  ]);
  const regressionRun = await runner.run({ experimentId: "knowledge-synthetic-regression", mode: "assess-existing", cases: regressionCases, scorers: retrievalScorers, repetitions: 1, concurrency: 1 });

  const metrics = [currentRun.metrics, answerRun.metrics, regressionRun.metrics];
  if (metrics.some(metric => metric.targetCalls !== 0)) throw Error("Existing-output knowledge assessment unexpectedly called a target");
  const results = [
    ...wrapResults(currentRun.results, currentMeta, corpusHash),
    ...wrapResults(answerRun.results, answerMeta, corpusHash),
    ...wrapResults(regressionRun.results, regressionMeta, corpusHash),
  ];
  return inspectionDocumentSchema.parse({
    schemaVersion: 1,
    title: "Evaluation findings",
    description: "Inspect saved knowledge retrieval and answer assessments. Findings are advisory evidence, never acceptance of source work.",
    corpus: current.corpus,
    sources: [currentInput.source, historicalInput.source],
    execution: { adapter: "braintrust", mode: "assess-existing", targetCalls: 0, modelCalls: 0 },
    results,
    comparisons: heldOutQuestions.map(question => ({ questionId: question.id, resultIds: results.filter(result => result.question.id === question.id).map(result => result.evaluation.id) })),
    feedback: [],
    limitations: [
      "Current lexical and MLX retrieval is retained output from the same 10,000-record report; no retrieval or answer was regenerated.",
      "The 72 retained answers are historical CPU lexical, Qwen and Nomic evidence; they are not current MLX answers.",
      "Grounded-answer findings recompute citation, current-revision, expected-reference and abstention checks. Historical surface assertions are displayed but not presented as fresh text reassessment.",
      "Required-chain findings assess frozen required references in the retained top-k; they do not prove evidence-link traversal or complete graph delivery.",
      "Synthetic regressions alter copied outputs only and are kept separate from actual retained results.",
      "Attribution entered with feedback is an advisory label and is not verified identity. Feedback never changes scores or accepts work.",
    ],
  });
}

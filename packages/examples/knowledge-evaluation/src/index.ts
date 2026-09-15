import { z } from "zod";
import {
  EVALUATION_SCHEMA_VERSION,
  EvaluationDefinitionSchema,
  EvaluationJsonSchema,
  FindingSchema,
  ScorerInvocationResultSchema,
  type EvaluationCase,
  type EvaluationDefinition,
  type EvaluationScorer,
  type EvidenceReference,
} from "@drawloom/evaluation";
import {
  HistoricalScoreSchema,
  KnowledgeAnswerOutputSchema,
  parseKnowledgeEvaluationAssets,
  readPackagedKnowledgeEvaluationAssets,
} from "./assets.js";
import {
  knowledgeEvaluationDefinitionIds,
  knowledgeEvaluationSourceIdentity,
} from "./identities.js";

export {
  knowledgeEvaluationDefinitionIds,
  knowledgeEvaluationSourceIdentity,
} from "./identities.js";

const provenanceFields = {
  mode: z.string().min(1),
  method: z.string().min(1),
  methodLimitation: z.string().min(1),
  corpusVersion: z.string().min(1),
  corpusSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceId: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
} as const;
const provenanceSchema = z.union([
  z.strictObject({
    classification: z.enum(["retained-current-retrieval", "retained-historical-answer"]),
    ...provenanceFields,
  }),
  z.strictObject({
    classification: z.literal("synthetic-regression"),
    ...provenanceFields,
    baseline: z.strictObject({ definitionId: z.string().min(1), caseId: z.string().min(1) }),
  }),
]);
const retrievalOutputSchema = z.strictObject({
  kind: z.literal("retrieval"),
  retrieved: z.array(z.string()),
  provenance: provenanceSchema,
});
const answerOutputSchema = z.strictObject({
  kind: z.literal("answer"),
  output: KnowledgeAnswerOutputSchema,
  retainedScore: HistoricalScoreSchema,
  provenance: provenanceSchema,
});
const expectedSchema = z.strictObject({
  relevant: z.array(z.string()),
  requiredChain: z.array(z.string()),
  abstain: z.boolean(),
  current: z.array(z.string()),
});
const inputSchema = z.strictObject({
  questionId: z.string(),
  query: z.string(),
  category: z.enum(["semantic", "identifier", "chain", "contradiction", "irrelevant"]),
});
const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? 1 : numerator / denominator;
const scorer = (value: EvaluationScorer): EvaluationScorer => Object.freeze(value);

const finding = (
  id: string,
  name: string,
  score: number | undefined,
  explanation: string,
  references: readonly EvidenceReference[] = [],
) =>
  FindingSchema.parse({
    id,
    name,
    outcome: score === undefined ? "unscored" : "scored",
    ...(score === undefined ? {} : { score }),
    explanation,
    references,
  });

const retrievalScorers: readonly EvaluationScorer[] = Object.freeze([
  scorer({
    id: "relevant-evidence",
    revision: "frozen-reference-v1",
    input: EvaluationJsonSchema,
    output: EvaluationJsonSchema,
    expected: EvaluationJsonSchema,
    async score({ output: rawOutput, expected: rawExpected, references }) {
      const output = retrievalOutputSchema.parse(rawOutput);
      const expected = rawExpected === undefined ? undefined : expectedSchema.parse(rawExpected);
      const actual = output.retrieved;
      const matches = actual.filter((reference) => expected?.relevant.includes(reference)).length;
      const score = expected?.abstain
        ? actual.length === 0
          ? 1
          : 0
        : ratio(matches, expected?.relevant.length ?? 0);
      return ScorerInvocationResultSchema.parse({
        outcome: "succeeded",
        findings: [
          finding(
            "relevant-evidence",
            "Relevant retained evidence",
            score,
            expected?.abstain
              ? `${actual.length === 0 ? "Exact empty-output abstention" : `Returned ${actual.length} references`} for an irrelevant frozen question.`
              : `${matches}/${expected?.relevant.length ?? 0} frozen relevant references appeared in the retained top-k.`,
            references,
          ),
        ],
      });
    },
  }),
  scorer({
    id: "required-chain-top-k",
    revision: "frozen-reference-v1",
    input: EvaluationJsonSchema,
    output: EvaluationJsonSchema,
    expected: EvaluationJsonSchema,
    async score({ output: rawOutput, expected: rawExpected, references }) {
      const output = retrievalOutputSchema.parse(rawOutput);
      const expected = rawExpected === undefined ? undefined : expectedSchema.parse(rawExpected);
      const required = expected?.requiredChain ?? [];
      if (!required.length)
        return ScorerInvocationResultSchema.parse({
          outcome: "succeeded",
          findings: [
            finding(
              "required-chain-top-k",
              "Required-chain top-k coverage",
              undefined,
              "Not applicable: this frozen question has no required evidence chain. This criterion is top-k coverage, not traversal of the evidence API.",
              references,
            ),
          ],
        });
      const actual = new Set(output.retrieved);
      const present = required.filter((reference) => actual.has(reference)).length;
      return ScorerInvocationResultSchema.parse({
        outcome: "succeeded",
        findings: [
          finding(
            "required-chain-top-k",
            "Required-chain top-k coverage",
            present === required.length ? 1 : 0,
            `${present}/${required.length} required chain references appeared in the retained top-k. This criterion is top-k coverage, not traversal of the evidence API.`,
            references,
          ),
        ],
      });
    },
  }),
  scorer({
    id: "current-revision",
    revision: "frozen-corpus-v1",
    input: EvaluationJsonSchema,
    output: EvaluationJsonSchema,
    expected: EvaluationJsonSchema,
    async score({ output: rawOutput, expected: rawExpected, references }) {
      const output = retrievalOutputSchema.parse(rawOutput);
      const expected = rawExpected === undefined ? undefined : expectedSchema.parse(rawExpected);
      const current = new Set(expected?.current ?? []);
      const count = output.retrieved.filter(
        (reference) => current.has(reference) || /^inventory-\d+@r1$/.test(reference),
      ).length;
      return ScorerInvocationResultSchema.parse({
        outcome: "succeeded",
        findings: [
          finding(
            "current-revision",
            "Current frozen revision",
            ratio(count, output.retrieved.length),
            `${count}/${output.retrieved.length} returned references identify current frozen revisions.`,
            references,
          ),
        ],
      });
    },
  }),
]);

const answerScorer: EvaluationScorer = scorer({
  id: "grounded-answer-heuristic",
  revision: "frozen-answer-checks-v1",
  input: EvaluationJsonSchema,
  output: EvaluationJsonSchema,
  expected: EvaluationJsonSchema,
  async score({ output: rawOutput, references }) {
    const output = answerOutputSchema.parse(rawOutput);
    const score = output.retainedScore;
    const aggregate =
      (ratio(score.citations.valid, score.citations.supplied) +
        ratio(score.citations.expected, score.citations.supplied) +
        ratio(score.citations.current, score.citations.supplied) +
        (score.abstention.matched ? 1 : 0)) /
      4;
    return ScorerInvocationResultSchema.parse({
      outcome: "succeeded",
      findings: [
        finding(
          "grounded-answer-heuristic",
          "Grounded answer heuristic",
          aggregate,
          `Recomputed frozen reference checks: valid citations ${score.citations.valid}/${score.citations.supplied}, expected citations ${score.citations.expected}/${score.citations.supplied}, current citations ${score.citations.current}/${score.citations.supplied}, abstention ${score.abstention.matched ? "matched" : "mismatched"}. Surface assertions ${score.surfaceAssertions.matched}/${score.surfaceAssertions.total} remain imported historical evidence, not freshly judged answer text.`,
          references,
        ),
      ],
    });
  },
});

function expandEvidence(
  references: readonly string[],
  documents: readonly { id: string; revision: string; evidence: readonly string[] }[],
): string[] {
  const expanded = new Set(references);
  const visit = (reference: string) => {
    const separator = reference.lastIndexOf("@");
    const item = documents.find(
      (document) =>
        document.id === reference.slice(0, separator) &&
        document.revision === reference.slice(separator + 1),
    );
    for (const dependency of item?.evidence ?? [])
      if (!expanded.has(dependency)) {
        expanded.add(dependency);
        visit(dependency);
      }
  };
  references.forEach(visit);
  return [...expanded];
}

const exactJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export async function loadKnowledgeEvaluation() {
  const parsed = await parseKnowledgeEvaluationAssets(
    await readPackagedKnowledgeEvaluationAssets(),
  );
  const currentRefs = new Set(
    parsed.corpus.documents
      .filter((document) => document.current)
      .map((document) => `${document.id}@${document.revision}`),
  );
  const sourceReference = (kind: "current" | "historical"): readonly EvidenceReference[] => {
    const source = knowledgeEvaluationSourceIdentity[kind];
    const name =
      kind === "current" ? "local-knowledge-mlx-10k.json" : "local-knowledge-answers-10k.json";
    return Object.freeze([
      Object.freeze({
        id: knowledgeEvaluationSourceIdentity.corpus.id,
        source: "packaged-public-fixture",
        uri: "package://drawloom-knowledge-evaluation/src/fixtures/corpus.ts",
        sha256: knowledgeEvaluationSourceIdentity.corpus.sha256,
        mediaType: "text/typescript",
      }),
      Object.freeze({
        id: source.id,
        source: "packaged-public-fixture",
        uri: `package://drawloom-knowledge-evaluation/src/fixtures/${name}`,
        sha256: source.sha256,
        mediaType: "application/json",
      }),
    ]);
  };
  const expectedFor = (question: (typeof parsed.corpus.questions)[number]) => ({
    relevant: [...question.relevant],
    requiredChain: [...question.requiredChain],
    abstain: question.abstain,
    current: [...currentRefs],
  });
  const inputFor = (question: (typeof parsed.corpus.questions)[number]) => ({
    questionId: question.id,
    query: question.query,
    category: question.kind,
  });
  const caseRevision = `frozen-corpus-${knowledgeEvaluationSourceIdentity.corpus.sha256}`;
  const retrievalCase = (
    question: (typeof parsed.corpus.questions)[number],
    retrieved: readonly string[],
    provenance: z.infer<typeof provenanceSchema>,
  ): EvaluationCase => ({
    id: question.id,
    revision: caseRevision,
    input: inputFor(question),
    expected: expectedFor(question),
    suppliedOutput: retrievalOutputSchema.parse({
      kind: "retrieval",
      retrieved: [...retrieved],
      provenance,
    }),
    references: [...sourceReference("current")],
    metadata: provenance,
  });
  const currentProvenance = (mode: string): z.infer<typeof provenanceSchema> => ({
    classification: "retained-current-retrieval",
    mode,
    method: "retained top-k retrieval reference assessment",
    methodLimitation:
      "Required-chain findings are retained top-k reference coverage, not evidence API traversal or a new retrieval run.",
    corpusVersion: parsed.corpus.version,
    corpusSha256: knowledgeEvaluationSourceIdentity.corpus.sha256,
    sourceId: knowledgeEvaluationSourceIdentity.current.id,
    sourceSha256: knowledgeEvaluationSourceIdentity.current.sha256,
  });
  const retrievalCases = (
    questions: Record<string, { retrieved: readonly string[] }>,
    mode: string,
  ) =>
    parsed.corpus.questions.map((question) =>
      retrievalCase(question, questions[question.id]!.retrieved, currentProvenance(mode)),
    );
  const currentLexicalCases = retrievalCases(parsed.current.lexical.questions, "lexical");
  const currentMlxCases = retrievalCases(
    parsed.current.hybrid.questions,
    parsed.current.hybrid.model,
  );

  const historicalByMode = new Map<string, EvaluationCase[]>();
  for (const entry of parsed.historical.results) {
    const question = parsed.corpus.questions.find(
      (candidate) => candidate.id === entry.questionId,
    )!;
    const report = parsed.historical.retrieval[entry.mode]!;
    const rawQuestions =
      entry.mode === "lexical"
        ? report.lexical.questions
        : report.hybrid.kind === "real_vectors"
          ? report.hybrid.questions
          : undefined;
    const questions =
      rawQuestions === undefined
        ? undefined
        : z
            .record(z.string(), z.looseObject({ retrieved: z.array(z.string()) }))
            .parse(rawQuestions);
    const retrieved = questions?.[entry.questionId]?.retrieved;
    if (!retrieved)
      throw new Error(
        `Historical ${entry.mode}:${entry.questionId} has no retained retrieval output`,
      );
    const provided = new Set(expandEvidence(retrieved, parsed.corpus.documents));
    const expected = new Set([...question.relevant, ...question.requiredChain]);
    const citationKeys = entry.result.output.citations.map(
      (citation) => `${citation.id}@${citation.revision}`,
    );
    const recomputed = HistoricalScoreSchema.parse({
      citations: {
        supplied: citationKeys.length,
        valid: citationKeys.filter((reference) => provided.has(reference)).length,
        current: citationKeys.filter(
          (reference) => currentRefs.has(reference) || /^inventory-\d+@r1$/.test(reference),
        ).length,
        expected: citationKeys.filter((reference) => expected.has(reference)).length,
        invalid: citationKeys.filter((reference) => !provided.has(reference)),
      },
      surfaceAssertions: entry.score.surfaceAssertions,
      abstention: {
        expected: question.abstain,
        actual: entry.result.output.abstained,
        matched: question.abstain === entry.result.output.abstained,
      },
      limit: "deterministic_surface_checks_are_not_universal_correctness",
    });
    if (!exactJson(recomputed, entry.score))
      throw new Error(`Historical score integrity changed for ${entry.mode}:${entry.questionId}`);
    const provenance = provenanceSchema.parse({
      classification: "retained-historical-answer",
      mode: entry.mode,
      method:
        "recomputed retained citation, current-revision, expected-reference and abstention heuristics",
      methodLimitation:
        "Original surface assertions are imported historical evidence, not freshly judged answer text or current MLX answer quality.",
      corpusVersion: parsed.corpus.version,
      corpusSha256: knowledgeEvaluationSourceIdentity.corpus.sha256,
      sourceId: knowledgeEvaluationSourceIdentity.historical.id,
      sourceSha256: knowledgeEvaluationSourceIdentity.historical.sha256,
    });
    const item: EvaluationCase = {
      id: question.id,
      revision: caseRevision,
      input: inputFor(question),
      expected: expectedFor(question),
      suppliedOutput: answerOutputSchema.parse({
        kind: "answer",
        output: entry.result.output,
        retainedScore: recomputed,
        provenance,
      }),
      references: [...sourceReference("historical")],
      metadata: provenance,
    };
    historicalByMode.set(entry.mode, [...(historicalByMode.get(entry.mode) ?? []), item]);
  }
  const definition = (
    id: string,
    name: string,
    cases: readonly EvaluationCase[],
    scorers: EvaluationDefinition["scorers"],
    sourceHash: string,
  ) =>
    EvaluationDefinitionSchema.parse({
      schemaVersion: EVALUATION_SCHEMA_VERSION,
      id,
      revision: `${parsed.corpus.version}-${sourceHash}`,
      name,
      description:
        "Assess frozen public saved outputs. Findings and feedback are advisory and never accept or publish work.",
      mode: "assess_existing",
      scorers,
      cases,
    });
  const retrievalCriteria = retrievalScorers.map(({ id, revision }) => ({ id, revision }));
  const answerCriteria = [{ id: answerScorer.id, revision: answerScorer.revision }];
  const synthetic = (id: string, questionId: "c1" | "x1", retrieved: readonly string[]) => {
    const question = parsed.corpus.questions.find((candidate) => candidate.id === questionId)!;
    const provenance = provenanceSchema.parse({
      ...currentProvenance(parsed.current.hybrid.model),
      classification: "synthetic-regression",
      method:
        questionId === "c1"
          ? "controlled omission from copied current MLX output"
          : "controlled stale-only replacement of copied current MLX output",
      methodLimitation:
        "Synthetic output is deliberately poor and is not an observed failure of the retained MLX run.",
      baseline: { definitionId: knowledgeEvaluationDefinitionIds.currentMlx, caseId: questionId },
    });
    return definition(
      id,
      questionId === "c1" ? "Synthetic MLX chain omission" : "Synthetic MLX stale-only result",
      [retrievalCase(question, retrieved, provenance)],
      retrievalCriteria,
      knowledgeEvaluationSourceIdentity.current.sha256,
    );
  };
  const definitions = Object.freeze([
    definition(
      knowledgeEvaluationDefinitionIds.currentLexical,
      "Current retrieval · lexical",
      currentLexicalCases,
      retrievalCriteria,
      knowledgeEvaluationSourceIdentity.current.sha256,
    ),
    definition(
      knowledgeEvaluationDefinitionIds.currentMlx,
      `Current retrieval · ${parsed.current.hybrid.model}`,
      currentMlxCases,
      retrievalCriteria,
      knowledgeEvaluationSourceIdentity.current.sha256,
    ),
    definition(
      knowledgeEvaluationDefinitionIds.historicalLexical,
      "Historical answers · lexical",
      historicalByMode.get("lexical")!,
      answerCriteria,
      knowledgeEvaluationSourceIdentity.historical.sha256,
    ),
    definition(
      knowledgeEvaluationDefinitionIds.historicalQwen,
      "Historical answers · CPU Qwen",
      historicalByMode.get("qwen3-embedding-0.6b")!,
      answerCriteria,
      knowledgeEvaluationSourceIdentity.historical.sha256,
    ),
    definition(
      knowledgeEvaluationDefinitionIds.historicalNomic,
      "Historical answers · CPU Nomic",
      historicalByMode.get("nomic-embed-text-v1.5")!,
      answerCriteria,
      knowledgeEvaluationSourceIdentity.historical.sha256,
    ),
    synthetic(
      knowledgeEvaluationDefinitionIds.syntheticChainOmission,
      "c1",
      parsed.current.hybrid.questions.c1!.retrieved.filter(
        (reference) => reference !== "museum-hours@r1",
      ),
    ),
    synthetic(knowledgeEvaluationDefinitionIds.syntheticStaleOnly, "x1", ["ferry-rule@r1"]),
  ]);
  return Object.freeze({
    definitions,
    scorers: Object.freeze([...retrievalScorers, answerScorer]),
    sources: Object.freeze([
      knowledgeEvaluationSourceIdentity.corpus,
      knowledgeEvaluationSourceIdentity.current,
      knowledgeEvaluationSourceIdentity.historical,
    ]),
    execution: Object.freeze({
      mode: "assess_existing" as const,
      targetCalls: 0,
      modelCalls: 0,
      usage: "unknown" as const,
      cost: "unknown" as const,
    }),
  });
}

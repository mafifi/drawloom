import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EvaluationDefinitionSchema, ScorerInvocationResultSchema } from "@drawloom/evaluation";
import { loadKnowledgeEvaluation, knowledgeEvaluationSourceIdentity } from "./src/index.js";
import { parseKnowledgeEvaluationAssets } from "./src/assets.js";

const packageRoot = import.meta.dir;
const fixture = (name: string) => readFile(resolve(packageRoot, "src", "fixtures", name));

describe("frozen supported knowledge evaluation", () => {
  test("rejects changed, incomplete, or mismatched source bytes before defining cases", async () => {
    const corpus = await fixture("corpus.ts");
    const current = await fixture("local-knowledge-mlx-10k.json");
    const historical = await fixture("local-knowledge-answers-10k.json");
    await expect(
      parseKnowledgeEvaluationAssets({
        corpus: Buffer.concat([corpus, Buffer.from("\n")]),
        current,
        historical,
      }),
    ).rejects.toThrow("corpus source identity");
    const missingQuestion = Buffer.from(
      current.toString("utf8").replace('"n4": {', '"missing-n4": {'),
    );
    await expect(
      parseKnowledgeEvaluationAssets({ corpus, current: missingQuestion, historical }),
    ).rejects.toThrow("current report source identity");
    const mismatched = Buffer.from(
      historical
        .toString("utf8")
        .replaceAll(knowledgeEvaluationSourceIdentity.corpus.sha256, "0".repeat(64)),
    );
    await expect(
      parseKnowledgeEvaluationAssets(
        { corpus, current, historical: mismatched },
        { verifySourceBytes: false },
      ),
    ).rejects.toThrow("frozen corpus identity");
  });

  test("builds 122 supplied-output cases across exact immutable mode definitions", async () => {
    const bundle = await loadKnowledgeEvaluation();
    expect(bundle.sources).toEqual([
      {
        id: "knowledge-corpus",
        bytes: 10_539,
        sha256: "70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5",
      },
      {
        id: "retained-current-retrieval",
        bytes: 24_306,
        sha256: "f16b69da282f8a15140c46dc9bddc5630c8ae88e5b49c827cb99c8871ca57d87",
      },
      {
        id: "retained-historical-answer",
        bytes: 173_165,
        sha256: "90fa306bd1ec4c1668aae70714d37f1007acc7307a7f4a31a9a47efd4b7ad40a",
      },
    ]);
    expect(
      bundle.definitions.map((definition) => [definition.id, definition.cases.length]),
    ).toEqual([
      ["knowledge.current.lexical", 24],
      ["knowledge.current.mlx", 24],
      ["knowledge.historical.lexical", 24],
      ["knowledge.historical.cpu-qwen", 24],
      ["knowledge.historical.cpu-nomic", 24],
      ["knowledge.synthetic.c1-chain-omission", 1],
      ["knowledge.synthetic.x1-stale-only", 1],
    ]);
    expect(bundle.definitions.reduce((sum, definition) => sum + definition.cases.length, 0)).toBe(
      122,
    );
    for (const definition of bundle.definitions) {
      expect(EvaluationDefinitionSchema.parse(definition).mode).toBe("assess_existing");
      expect(definition.target).toBeUndefined();
      expect(definition.cases.every((item) => item.suppliedOutput !== undefined)).toBe(true);
    }
    const byId = new Map(bundle.definitions.map((definition) => [definition.id, definition]));
    expect(byId.get("knowledge.current.lexical")?.scorers).toEqual(
      byId.get("knowledge.current.mlx")?.scorers,
    );
    expect(
      byId
        .get("knowledge.current.mlx")
        ?.cases.map((item) => [item.id, item.revision, item.input, item.expected]),
    ).toEqual(
      byId
        .get("knowledge.current.lexical")
        ?.cases.map((item) => [item.id, item.revision, item.input, item.expected]),
    );
    expect(byId.get("knowledge.synthetic.c1-chain-omission")?.cases[0]?.id).toBe("c1");
    expect(byId.get("knowledge.synthetic.x1-stale-only")?.cases[0]?.id).toBe("x1");
  });

  test("keeps current MLX retrieval distinct from historical CPU answer labels", async () => {
    const bundle = await loadKnowledgeEvaluation();
    const modes = bundle.definitions.flatMap((definition) =>
      definition.cases.map((item) => {
        const provenance = (
          item.suppliedOutput as { provenance: { classification: string; mode: string } }
        ).provenance;
        return `${provenance.classification}:${provenance.mode}`;
      }),
    );
    expect(modes).toContain("retained-current-retrieval:qwen3-embedding-0.6b-mlx-8bit");
    expect(modes).toContain("retained-historical-answer:qwen3-embedding-0.6b");
    expect(modes).toContain("retained-historical-answer:nomic-embed-text-v1.5");
    expect(modes).not.toContain("retained-historical-answer:qwen3-embedding-0.6b-mlx-8bit");
    expect(bundle.execution).toEqual({
      mode: "assess_existing",
      targetCalls: 0,
      modelCalls: 0,
      usage: "unknown",
      cost: "unknown",
    });
  });

  test("deterministic scorers preserve known regression and limitation semantics", async () => {
    const bundle = await loadKnowledgeEvaluation();
    const definitions = new Map(
      bundle.definitions.map((definition) => [definition.id, definition]),
    );
    const scorers = new Map(bundle.scorers.map((scorer) => [scorer.id, scorer]));
    const score = async (definitionId: string, caseId: string, scorerId: string) => {
      const definition = definitions.get(definitionId)!;
      const item = definition.cases.find((candidate) => candidate.id === caseId)!;
      const scorer = scorers.get(scorerId)!;
      return ScorerInvocationResultSchema.parse(
        await scorer.score(
          {
            input: scorer.input.parse(item.input),
            output: scorer.output.parse(item.suppliedOutput),
            ...(scorer.expected && item.expected !== undefined
              ? { expected: scorer.expected.parse(item.expected) }
              : {}),
            references: item.references,
          },
          {
            signal: new AbortController().signal,
            invocationId: "test",
            runId: "test",
            operationId: "test-operation",
          },
        ),
      );
    };
    const baseline = await score("knowledge.current.mlx", "c1", "required-chain-top-k");
    const omitted = await score(
      "knowledge.synthetic.c1-chain-omission",
      "c1",
      "required-chain-top-k",
    );
    const stale = await score("knowledge.synthetic.x1-stale-only", "x1", "current-revision");
    const answer = await score("knowledge.historical.cpu-qwen", "c1", "grounded-answer-heuristic");
    expect(baseline.findings[0]?.score).toBe(1);
    expect(omitted.findings[0]?.score).toBe(0);
    expect(omitted.findings[0]?.explanation).toContain("top-k coverage, not traversal");
    expect(stale.findings[0]?.score).toBe(0);
    expect(
      (
        definitions.get("knowledge.synthetic.c1-chain-omission")?.cases[0]?.suppliedOutput as {
          provenance: { baseline: unknown };
        }
      ).provenance.baseline,
    ).toEqual({ definitionId: "knowledge.current.mlx", caseId: "c1" });
    expect(answer.findings[0]?.explanation).toContain(
      "imported historical evidence, not freshly judged",
    );
  });
});

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildKnowledgeInspection } from "./knowledge-inspection.ts";
import { inspectionDocumentSchema } from "./inspection-contract.ts";

const root = resolve(import.meta.dir, "../..");

describe("frozen knowledge inspection", () => {
  test("assesses retained outputs without target or model calls and preserves source identity", async () => {
    const document = inspectionDocumentSchema.parse(await buildKnowledgeInspection());

    expect(document.execution).toEqual({ adapter: "braintrust", mode: "assess-existing", targetCalls: 0, modelCalls: 0 });
    expect(document.corpus).toMatchObject({ version: "drawloom-public-knowledge-v1", records: 10_000 });
    expect(document.sources.map(source => source.classification)).toEqual([
      "retained-current-retrieval",
      "retained-historical-answer",
    ]);
    for (const source of document.sources) {
      const bytes = await readFile(resolve(root, source.path));
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(source.sha256);
      expect(bytes.byteLength).toBe(source.bytes);
    }

    expect(document.results.filter(result => result.provenance.classification === "retained-current-retrieval")).toHaveLength(48);
    expect(document.results.filter(result => result.provenance.classification === "retained-historical-answer")).toHaveLength(72);
    expect(document.results.filter(result => result.provenance.classification === "synthetic-regression")).toHaveLength(2);
    expect(document.results.every(result => result.evaluation.status === "scored")).toBe(true);
    expect(document.results.every(result => result.provenance.corpusSha256 === document.corpus.sha256)).toBe(true);
  });

  test("keeps current MLX and historical answer modes distinct", async () => {
    const document = await buildKnowledgeInspection();
    const modes = new Set(document.results.map(result => `${result.provenance.classification}:${result.provenance.mode}`));

    expect(modes).toContain("retained-current-retrieval:lexical");
    expect(modes).toContain("retained-current-retrieval:qwen3-embedding-0.6b-mlx-8bit");
    expect(modes).toContain("retained-historical-answer:qwen3-embedding-0.6b");
    expect(modes).toContain("retained-historical-answer:nomic-embed-text-v1.5");
    expect(modes).not.toContain("retained-historical-answer:qwen3-embedding-0.6b-mlx-8bit");
    expect(document.limitations.some(limit => limit.includes("historical CPU"))).toBe(true);
    expect(document.limitations.some(limit => limit.includes("top-k"))).toBe(true);
  });

  test("controlled regressions diagnose only their affected cases", async () => {
    const document = await buildKnowledgeInspection();
    const byId = new Map(document.results.map(result => [result.evaluation.id, result]));
    const chain = byId.get("knowledge-synthetic-regression:retrieval:mlx:c1-chain-omission:trial-1");
    const revision = byId.get("knowledge-synthetic-regression:retrieval:mlx:x1-stale-only:trial-1");

    expect(chain?.comparison.baselineResultId).toBe("knowledge-current-retrieval:retrieval:mlx:c1:trial-1");
    expect(chain?.evaluation.findings.find(finding => finding.scorerId === "required-chain-top-k")?.score).toBe(0);
    expect(revision?.comparison.baselineResultId).toBe("knowledge-current-retrieval:retrieval:mlx:x1:trial-1");
    expect(revision?.evaluation.findings.find(finding => finding.scorerId === "current-revision")?.score).toBe(0);
    expect(byId.get("knowledge-current-retrieval:retrieval:mlx:c1:trial-1")?.evaluation.findings.find(finding => finding.scorerId === "required-chain-top-k")?.score).toBe(1);
  });
});

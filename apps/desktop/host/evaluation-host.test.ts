import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvaluationJsonSchema,
  type EvaluationAssessmentProvider,
  type EvaluationDefinition,
  type EvaluationScorer,
} from "@drawloom/evaluation";
import { createSqliteEvaluationStore } from "@drawloom/sqlite-evaluation";
import { createInstalledEvaluation } from "./evaluation-host.js";

const assessment: EvaluationAssessmentProvider = {
  async assess() {
    throw Error("Saved reads must not assess");
  },
};
const definition: EvaluationDefinition = {
  schemaVersion: 1,
  id: "saved",
  revision: "1",
  name: "Saved check",
  mode: "assess_existing",
  scorers: [{ id: "exact", revision: "1" }],
  cases: [{ id: "one", revision: "1", input: "input", suppliedOutput: "saved", references: [] }],
};
const scorer: EvaluationScorer = {
  id: "exact",
  revision: "1",
  input: EvaluationJsonSchema,
  output: EvaluationJsonSchema,
  async score() {
    throw Error("No assessment");
  },
};

test("installed evaluation reads only its saved scope without an engine and closes its store", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-evaluation-host-"));
  const scope = { installationId: "documents", projectId: "first" };
  try {
    const seeded = createSqliteEvaluationStore({ dataDirectory: root, scope });
    await seeded.saveDefinition(definition);
    await seeded.close();
    const first = await createInstalledEvaluation({ dataDirectory: root, scope, assessment });
    const second = await createInstalledEvaluation({
      dataDirectory: root,
      scope: { ...scope, projectId: "second" },
      assessment,
    });
    const other = await createInstalledEvaluation({
      dataDirectory: root,
      scope: { ...scope, installationId: "other" },
      assessment,
    });
    const a = first.evaluation.compose({ scorers: [scorer] }).service;
    const b = second.evaluation.compose({ scorers: [] }).service;
    const c = other.evaluation.compose({ scorers: [] }).service;
    try {
      expect((await a.listDefinitions()).items).toHaveLength(1);
      expect((await b.listDefinitions()).items).toHaveLength(0);
      expect((await c.listDefinitions()).items).toHaveLength(0);
      expect((await a.assess({ requestId: "unavailable", definition })).kind).toBe("unavailable");
      expect((await a.listRuns()).items).toHaveLength(0);
    } finally {
      await first.close();
      await second.close();
      await other.close();
    }
    await expect(a.listDefinitions()).rejects.toMatchObject({ code: "closed" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

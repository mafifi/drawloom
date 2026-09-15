import { expect, test } from "bun:test";
import { evaluationStoreConformance } from "../evaluation/src/conformance.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("SQLite implements the evaluation storage contract", async () => {
  const provider = await import("./src/index.js").catch(() => undefined);
  expect(provider?.createSqliteEvaluationStore).toBeFunction();
  const directory = mkdtempSync(join(tmpdir(), "drawloom-evaluation-conformance-"));
  try {
    await evaluationStoreConformance((scope) =>
      provider!.createSqliteEvaluationStore({ dataDirectory: directory, scope }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import { expect, test } from "bun:test";
import { evaluationCaseSchema, evaluationResultSchema } from "./contract.ts";
import { loadResultFile, saveResultFile } from "./result-files.ts";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("runtime schemas reject malformed case and result data", () => {
  expect(evaluationCaseSchema.safeParse({ id: "missing-the-rest" }).success).toBe(false);
  expect(evaluationResultSchema.safeParse({ status: "scored" }).success).toBe(false);
});

test("empty result document persists and reloads without mutation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "drawloom-eval-"));
  const path = join(directory, "results.json");
  const document = {
    schemaVersion: 1 as const,
    results: [],
    feedback: [],
  };
  await saveResultFile(path, document);
  expect(await loadResultFile(path)).toEqual(document);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(document);
});

import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvaluationStoreError,
  type EvaluationStore,
  type ScorerCheckpoint,
  type TargetCheckpoint,
} from "@drawloom/evaluation";
import { createSqliteEvaluationStore } from "./src/index.js";

const directories: string[] = [];
const scope = { installationId: "installation", projectId: "project" } as const;
function directory() {
  const value = mkdtempSync(join(tmpdir(), "drawloom-evaluation-"));
  directories.push(value);
  return value;
}
function file(root: string) {
  return join(root, "evaluation.sqlite");
}
afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function prepared(
  root: string,
): Promise<{ store: EvaluationStore; target: TargetCheckpoint }> {
  const store = createSqliteEvaluationStore({ dataDirectory: root, scope });
  await store.saveDefinition({
    schemaVersion: 1,
    id: "definition",
    revision: "r1",
    name: "Fixture",
    mode: "experiment",
    cases: [
      {
        id: "case",
        revision: "r1",
        input: { value: 1 },
        references: [{ id: "case-ref", source: "fixture", uri: "asset://case" }],
      },
    ],
    target: { id: "target", revision: "r1" },
    scorers: [{ id: "scorer", revision: "r1" }],
  });
  await store.saveRun({
    schemaVersion: 1,
    id: "run",
    requestId: "request",
    definition: { id: "definition", revision: "r1" },
    settings: { repetitions: 1, concurrency: 2 },
    createdAtMs: 1,
  });
  const target: TargetCheckpoint = {
    schemaVersion: 1,
    invocationId: "target-invocation",
    runId: "run",
    caseId: "case",
    caseRevision: "r1",
    trial: 0,
    target: { id: "target", revision: "r1" },
    outcome: "succeeded",
    output: { value: 2 },
    references: [{ id: "target-ref", source: "fixture", uri: "asset://target" }],
    startedAtMs: 2,
    completedAtMs: 3,
  };
  await store.saveTargetCheckpoint(target);
  return { store, target };
}

test("uses the fixed filename, WAL, and restrictive directory/database/sidecar permissions", async () => {
  const root = directory();
  chmodSync(root, 0o755);
  const { store } = await prepared(root);
  try {
    expect(statSync(root).mode & 0o777).toBe(0o700);
    for (const path of [file(root), `${file(root)}-wal`, `${file(root)}-shm`])
      expect(statSync(path).mode & 0o777).toBe(0o600);
    const inspect = new Database(file(root), { readonly: true });
    expect(inspect.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    inspect.close();
  } finally {
    await store.close();
  }
});

test("reads a definition header without hydrating case payloads", async () => {
  const root = directory();
  const { store } = await prepared(root);
  const inspect = new Database(file(root));
  inspect.query("UPDATE evaluation_cases SET json=? WHERE case_id='case'").run("not-json");
  inspect.close();
  expect(await store.getDefinitionHeader({ id: "definition", revision: "r1" })).toMatchObject({
    id: "definition",
    target: { id: "target" },
    scorers: [{ id: "scorer" }],
  });
  await expect(store.getDefinition({ id: "definition", revision: "r1" })).rejects.toMatchObject({
    code: "unavailable",
  });
  await store.close();
});

test("a real finding write failure rolls back the whole scorer checkpoint and preserves prior target evidence", async () => {
  const root = directory();
  const { store, target } = await prepared(root);
  const setup = new Database(file(root));
  setup.exec(
    "CREATE TRIGGER reject_finding BEFORE INSERT ON evaluation_findings BEGIN SELECT RAISE(ABORT, 'test abort'); END;",
  );
  setup.close();
  const scorer: ScorerCheckpoint = {
    schemaVersion: 1,
    invocationId: "scorer-invocation",
    runId: "run",
    caseId: "case",
    caseRevision: "r1",
    trial: 0,
    scorer: { id: "scorer", revision: "r1" },
    outcome: "failed",
    findings: [
      {
        id: "finding",
        name: "Preserve atomically",
        outcome: "error",
        error: { code: "failed", message: "bounded" },
        references: [{ id: "finding-ref", source: "fixture", uri: "asset://finding" }],
      },
    ],
    startedAtMs: 4,
    completedAtMs: 5,
  };
  await expect(store.saveScorerCheckpoint(scorer)).rejects.toMatchObject({ code: "unavailable" });
  expect(
    await store.getScorerCheckpoint({
      invocationId: scorer.invocationId,
      runId: scorer.runId,
      caseId: scorer.caseId,
      caseRevision: scorer.caseRevision,
      trial: scorer.trial,
    }),
  ).toBeUndefined();
  expect(
    (
      await store.getTargetCheckpoint({
        invocationId: target.invocationId,
        runId: target.runId,
        caseId: target.caseId,
        caseRevision: target.caseRevision,
        trial: target.trial,
      })
    )?.outcome,
  ).toBe("succeeded");
  const inspect = new Database(file(root), { readonly: true });
  expect(inspect.query("SELECT count(*) AS count FROM evaluation_findings").get()).toEqual({
    count: 0,
  });
  expect(
    inspect
      .query("SELECT count(*) AS count FROM evaluation_references WHERE owner_kind='finding'")
      .get(),
  ).toEqual({ count: 0 });
  inspect.close();
  await store.close();
});

test("cases, checkpoints, findings, references, results, and feedback have separate durable rows", async () => {
  const root = directory();
  const { store } = await prepared(root);
  const scorer: ScorerCheckpoint = {
    schemaVersion: 1,
    invocationId: "scorer-invocation",
    runId: "run",
    caseId: "case",
    caseRevision: "r1",
    trial: 0,
    scorer: { id: "scorer", revision: "r1" },
    outcome: "succeeded",
    findings: [
      {
        id: "finding",
        name: "Separate",
        outcome: "scored",
        score: 1,
        references: [{ id: "finding-ref", source: "fixture", uri: "asset://finding" }],
      },
    ],
    startedAtMs: 4,
    completedAtMs: 5,
  };
  await store.saveScorerCheckpoint(scorer);
  await store.saveResult({
    schemaVersion: 1,
    id: "result",
    runId: "run",
    caseId: "case",
    caseRevision: "r1",
    trial: 0,
    status: "completed",
    targetInvocationId: "target-invocation",
    scorerInvocationIds: [scorer.invocationId],
    startedAtMs: 2,
    completedAtMs: 5,
  });
  await store.saveFeedback({
    schemaVersion: 1,
    id: "feedback",
    resultId: "result",
    attribution: "operator",
    rating: "correct",
    createdAtMs: 6,
  });
  const inspect = new Database(file(root), { readonly: true });
  for (const table of [
    "evaluation_cases",
    "evaluation_target_checkpoints",
    "evaluation_scorer_checkpoints",
    "evaluation_findings",
    "evaluation_results",
    "evaluation_feedback",
  ])
    expect(inspect.query(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 1 });
  expect(inspect.query("SELECT count(*) AS count FROM evaluation_references").get()).toEqual({
    count: 3,
  });
  inspect.close();
  await store.close();
});

test("a newer database is rejected without changing bytes or permissions", () => {
  const root = directory();
  const path = file(root);
  const setup = new Database(path);
  setup.exec(
    "CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('keep'); PRAGMA user_version=2;",
  );
  setup.close();
  chmodSync(path, 0o640);
  const bytes = readFileSync(path);
  const permissions = statSync(path).mode;
  expect(() => createSqliteEvaluationStore({ dataDirectory: root, scope })).toThrow(
    EvaluationStoreError,
  );
  expect(readFileSync(path)).toEqual(bytes);
  expect(statSync(path).mode).toBe(permissions);
  const inspect = new Database(path, { readonly: true });
  expect(inspect.query("SELECT value FROM sentinel").get()).toEqual({ value: "keep" });
  inspect.close();
});

test("corrupt and damaged supported databases are refused without repair", async () => {
  const corruptRoot = directory();
  writeFileSync(file(corruptRoot), "not sqlite\n");
  const corruptBytes = readFileSync(file(corruptRoot));
  expect(() => createSqliteEvaluationStore({ dataDirectory: corruptRoot, scope })).toThrow(
    EvaluationStoreError,
  );
  expect(readFileSync(file(corruptRoot))).toEqual(corruptBytes);
  const damagedRoot = directory();
  const store = createSqliteEvaluationStore({ dataDirectory: damagedRoot, scope });
  await store.close();
  const setup = new Database(file(damagedRoot));
  setup.exec("DROP INDEX evaluation_results_page");
  setup.close();
  const damagedBytes = readFileSync(file(damagedRoot));
  expect(() => createSqliteEvaluationStore({ dataDirectory: damagedRoot, scope })).toThrow(
    EvaluationStoreError,
  );
  expect(readFileSync(file(damagedRoot))).toEqual(damagedBytes);
});

test("stored corruption returns a bounded provider error without exposing stored content", async () => {
  const root = directory();
  const { store } = await prepared(root);
  const setup = new Database(file(root));
  setup
    .query("UPDATE evaluation_definitions SET json=?")
    .run(JSON.stringify({ private: "do-not-expose" }));
  setup.close();
  try {
    await store.getDefinition({ id: "definition", revision: "r1" });
    throw Error("expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(EvaluationStoreError);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(String(error)).not.toContain("do-not-expose");
  }
  await store.close();
});

test("filtered and unfiltered result and feedback keysets avoid temporary ordering", async () => {
  const root = directory();
  const { store } = await prepared(root);
  await store.close();
  const inspect = new Database(file(root), { readonly: true });
  const plans = [
    {
      index: "evaluation_results_scope_page",
      sql: "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", 51],
    },
    {
      index: "evaluation_results_scope_page",
      sql: "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", 10, 51],
    },
    {
      index: "evaluation_results_page",
      sql: "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND run_id=? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", "run", 51],
    },
    {
      index: "evaluation_results_page",
      sql: "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND run_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", "run", 10, 51],
    },
    {
      index: "evaluation_feedback_scope_page",
      sql: "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", 51],
    },
    {
      index: "evaluation_feedback_scope_page",
      sql: "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", 10, 51],
    },
    {
      index: "evaluation_feedback_page",
      sql: "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND result_id=? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", "result", 51],
    },
    {
      index: "evaluation_feedback_page",
      sql: "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND result_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
      args: ["installation", "project", "result", 10, 51],
    },
  ] as const;
  for (const plan of plans) {
    const detail = (
      inspect.query(`EXPLAIN QUERY PLAN ${plan.sql}`).all(...plan.args) as { detail: string }[]
    )
      .map((row) => row.detail)
      .join("\n");
    expect(detail).toContain(plan.index);
    expect(detail).not.toContain("TEMP B-TREE");
  }
  inspect.close();
});

test("definition summaries and selected-case writes do not hydrate unrelated case payloads or references", async () => {
  const root = directory();
  const store = createSqliteEvaluationStore({ dataDirectory: root, scope });
  const cases = Array.from({ length: 200 }, (_, index) => ({
    id: index === 0 ? "selected" : `unrelated-${index}`,
    revision: "r1",
    input: { index },
    references: [
      {
        id: `reference-${index}`,
        source: "fixture",
        uri: index === 0 ? "asset://selected" : `asset://unrelated-${index}`,
      },
    ],
  }));
  await store.saveDefinition({
    schemaVersion: 1,
    id: "large-definition",
    revision: "r1",
    name: "Large",
    mode: "experiment",
    cases,
    target: { id: "target", revision: "r1" },
    scorers: [{ id: "scorer", revision: "r1" }],
  });
  await store.saveRun({
    schemaVersion: 1,
    id: "large-run",
    requestId: "large-request",
    definition: { id: "large-definition", revision: "r1" },
    settings: { repetitions: 1, concurrency: 2 },
    createdAtMs: 1,
  });
  const setup = new Database(file(root));
  setup.exec(
    "UPDATE evaluation_cases SET json='not-json' WHERE case_id LIKE 'unrelated-%' AND (case_order % 2)=0; UPDATE evaluation_references SET json='not-json' WHERE owner_kind='case' AND json LIKE '%asset://unrelated-%';",
  );
  setup.close();
  const summaries = await store.listDefinitions();
  expect(summaries.items.find((item) => item.ref.id === "large-definition")).toMatchObject({
    name: "Large",
    caseCount: 200,
    scorerCount: 1,
  });
  const checkpoint: TargetCheckpoint = {
    schemaVersion: 1,
    invocationId: "large-target",
    runId: "large-run",
    caseId: "selected",
    caseRevision: "r1",
    trial: 0,
    target: { id: "target", revision: "r1" },
    outcome: "succeeded",
    output: { selected: true },
    references: [],
    startedAtMs: 2,
    completedAtMs: 3,
  };
  expect(await store.saveTargetCheckpoint(checkpoint)).toEqual({ kind: "accepted" });
  expect(
    (
      await store.getTargetCheckpoint({
        invocationId: checkpoint.invocationId,
        runId: checkpoint.runId,
        caseId: checkpoint.caseId,
        caseRevision: checkpoint.caseRevision,
        trial: checkpoint.trial,
      })
    )?.outcome,
  ).toBe("succeeded");
  await expect(
    store.getDefinition({ id: "large-definition", revision: "r1" }),
  ).rejects.toMatchObject({ code: "unavailable" });
  await store.close();
});

import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  CheckpointSelectorSchema,
  DefinitionPageSchema,
  EvaluationCaseSchema,
  EvaluationDefinitionHeaderSchema,
  EvaluationDefinitionSchema,
  EvaluationFeedbackSchema,
  EvaluationIdSchema,
  EvaluationOrchestrationBindingSchema,
  EvaluationPageOptionsSchema,
  EvaluationResultRecordSchema,
  EvaluationResultViewSchema,
  EvaluationRunSchema,
  EvaluationScopeSchema,
  EvaluationStartAttemptSchema,
  EvaluationStoreError,
  EvidenceReferenceSchema,
  FeedbackPageOptionsSchema,
  FindingSchema,
  ResultPageOptionsSchema,
  ResultSummarySchema,
  ScorerCheckpointSchema,
  TargetCheckpointSchema,
  VersionedReferenceSchema,
  type CheckpointSelector,
  type DefinitionPage,
  type EvaluationCase,
  type EvaluationDefinition,
  type EvaluationDefinitionHeader,
  type EvaluationFeedback,
  type EvaluationOrchestrationBinding,
  type EvaluationResultRecord,
  type EvaluationResultView,
  type EvaluationRun,
  type EvaluationScope,
  type EvaluationStartAttempt,
  type EvaluationStore,
  type EvaluationWriteDisposition,
  type FeedbackPage,
  type ResultPage,
  type RunPage,
  type ScorerCheckpoint,
  type TargetCheckpoint,
  type VersionedReference,
} from "@drawloom/evaluation";

/** The house transaction pattern: explicit BEGIN IMMEDIATE / COMMIT / ROLLBACK,
 * matching packages/knowledge/sqlite-knowledge. `node:sqlite` has no transaction
 * wrapper, and IMMEDIATE takes the write lock up front so a conflicting writer
 * fails at BEGIN rather than part-way through. */
const transaction = <T>(db: DatabaseSync, operation: () => T): T => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (cause) {
    db.exec("ROLLBACK");
    throw cause;
  }
};

const SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 50;
const schema = {
  evaluation_meta: "CREATE TABLE evaluation_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  evaluation_definitions:
    "CREATE TABLE evaluation_definitions (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, json TEXT NOT NULL, fingerprint TEXT NOT NULL, UNIQUE (installation_id, project_id, id, revision))",
  evaluation_definitions_page:
    "CREATE INDEX evaluation_definitions_page ON evaluation_definitions(installation_id, project_id, sequence DESC)",
  evaluation_cases:
    "CREATE TABLE evaluation_cases (installation_id TEXT NOT NULL, project_id TEXT NOT NULL, definition_id TEXT NOT NULL, definition_revision TEXT NOT NULL, case_id TEXT NOT NULL, case_revision TEXT NOT NULL, case_order INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (installation_id, project_id, definition_id, definition_revision, case_id), UNIQUE (installation_id, project_id, definition_id, definition_revision, case_order))",
  evaluation_runs:
    "CREATE TABLE evaluation_runs (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, run_id TEXT NOT NULL, request_id TEXT NOT NULL, definition_id TEXT NOT NULL, definition_revision TEXT NOT NULL, json TEXT NOT NULL, UNIQUE (installation_id, project_id, run_id), UNIQUE (installation_id, project_id, request_id))",
  evaluation_runs_page:
    "CREATE INDEX evaluation_runs_page ON evaluation_runs(installation_id, project_id, sequence DESC)",
  evaluation_start_attempts:
    "CREATE TABLE evaluation_start_attempts (installation_id TEXT NOT NULL, project_id TEXT NOT NULL, evaluation_run_id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (installation_id, project_id, evaluation_run_id))",
  evaluation_orchestration_bindings:
    "CREATE TABLE evaluation_orchestration_bindings (installation_id TEXT NOT NULL, project_id TEXT NOT NULL, evaluation_run_id TEXT NOT NULL, orchestration_run_id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (installation_id, project_id, evaluation_run_id), UNIQUE (installation_id, project_id, orchestration_run_id))",
  evaluation_target_checkpoints:
    "CREATE TABLE evaluation_target_checkpoints (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, invocation_id TEXT NOT NULL, run_id TEXT NOT NULL, case_id TEXT NOT NULL, case_revision TEXT NOT NULL, trial INTEGER NOT NULL, json TEXT NOT NULL, UNIQUE (installation_id, project_id, invocation_id), UNIQUE (installation_id, project_id, run_id, case_id, case_revision, trial))",
  evaluation_scorer_checkpoints:
    "CREATE TABLE evaluation_scorer_checkpoints (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, invocation_id TEXT NOT NULL, run_id TEXT NOT NULL, case_id TEXT NOT NULL, case_revision TEXT NOT NULL, trial INTEGER NOT NULL, scorer_id TEXT NOT NULL, scorer_revision TEXT NOT NULL, json TEXT NOT NULL, UNIQUE (installation_id, project_id, invocation_id), UNIQUE (installation_id, project_id, run_id, case_id, case_revision, trial, scorer_id, scorer_revision))",
  evaluation_findings:
    "CREATE TABLE evaluation_findings (installation_id TEXT NOT NULL, project_id TEXT NOT NULL, invocation_id TEXT NOT NULL, finding_id TEXT NOT NULL, finding_order INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (installation_id, project_id, invocation_id, finding_id), UNIQUE (installation_id, project_id, invocation_id, finding_order))",
  evaluation_references:
    "CREATE TABLE evaluation_references (installation_id TEXT NOT NULL, project_id TEXT NOT NULL, owner_kind TEXT NOT NULL, owner_id TEXT NOT NULL, reference_order INTEGER NOT NULL, json TEXT NOT NULL, PRIMARY KEY (installation_id, project_id, owner_kind, owner_id, reference_order))",
  evaluation_results:
    "CREATE TABLE evaluation_results (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, result_id TEXT NOT NULL, run_id TEXT NOT NULL, case_id TEXT NOT NULL, case_revision TEXT NOT NULL, trial INTEGER NOT NULL, json TEXT NOT NULL, finding_count INTEGER NOT NULL, UNIQUE (installation_id, project_id, result_id), UNIQUE (installation_id, project_id, run_id, case_id, case_revision, trial))",
  evaluation_results_page:
    "CREATE INDEX evaluation_results_page ON evaluation_results(installation_id, project_id, run_id, sequence DESC)",
  evaluation_results_scope_page:
    "CREATE INDEX evaluation_results_scope_page ON evaluation_results(installation_id, project_id, sequence DESC)",
  evaluation_feedback:
    "CREATE TABLE evaluation_feedback (sequence INTEGER PRIMARY KEY AUTOINCREMENT, installation_id TEXT NOT NULL, project_id TEXT NOT NULL, feedback_id TEXT NOT NULL, result_id TEXT NOT NULL, json TEXT NOT NULL, UNIQUE (installation_id, project_id, feedback_id))",
  evaluation_feedback_page:
    "CREATE INDEX evaluation_feedback_page ON evaluation_feedback(installation_id, project_id, result_id, sequence DESC)",
  evaluation_feedback_scope_page:
    "CREATE INDEX evaluation_feedback_scope_page ON evaluation_feedback(installation_id, project_id, sequence DESC)",
};

type CursorKind = "definitions" | "runs" | "results" | "feedback";
type Cursor = {
  generation: string;
  installationId: string;
  projectId: string;
  kind: CursorKind;
  filter: string | null;
  sequence: number;
};
type JsonRow = { json: string };
type SequenceRow = JsonRow & { sequence: number };
type DefinitionRow = SequenceRow & { id: string; revision: string };
type ResultRow = SequenceRow & { finding_count: number };

function normalizeSql(sql: string): string {
  return sql
    .replace(/IF NOT EXISTS/gi, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? "null" : canonical(item))).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}
function unavailable(message: string): EvaluationStoreError {
  return new EvaluationStoreError("unavailable", message);
}
function invalid(message: string): EvaluationStoreError {
  return new EvaluationStoreError("invalid_input", message);
}
function parse<T>(schemaValue: { parse(value: unknown): T }, value: unknown, message: string): T {
  try {
    return schemaValue.parse(value);
  } catch {
    throw invalid(message);
  }
}
function parseStored<T>(
  schemaValue: { parse(value: unknown): T },
  value: string,
  message: string,
): T {
  try {
    return schemaValue.parse(JSON.parse(value));
  } catch {
    throw unavailable(message);
  }
}
function validateStored<T>(
  schemaValue: { parse(value: unknown): T },
  value: unknown,
  message: string,
): T {
  try {
    return schemaValue.parse(value);
  } catch {
    throw unavailable(message);
  }
}
function storedObject(value: string, message: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("shape");
    return parsed as Record<string, unknown>;
  } catch {
    throw unavailable(message);
  }
}
function ownerId(parts: readonly unknown[]): string {
  return canonical(parts);
}

function inspect(path: string): { version: number; generation?: string } {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch {
    throw unavailable("Evaluation database could not be inspected");
  }
  try {
    const version = Number(
      (db.prepare("PRAGMA user_version").get() as { user_version: number } | null)?.user_version ??
        0,
    );
    if (!Number.isSafeInteger(version) || version < 0) throw Error("Invalid schema version");
    if (version > SCHEMA_VERSION)
      throw new EvaluationStoreError(
        "unsupported_version",
        "Evaluation schema is newer than this provider supports",
      );
    const applicationTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    if (version === 0) {
      if (applicationTables.length) throw Error("Unrecognized evaluation schema");
      return { version };
    }
    for (const [name, expected] of Object.entries(schema)) {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name) as {
        sql: string;
      } | null;
      if (!row || normalizeSql(row.sql) !== normalizeSql(expected))
        throw Error("Invalid evaluation schema");
    }
    const meta = db.prepare("SELECT value FROM evaluation_meta WHERE key='generation'").get() as {
      value: string;
    } | null;
    if (!meta || !/^[a-f0-9-]{36}$/.test(meta.value)) throw Error("Invalid evaluation metadata");
    return { version, generation: meta.value };
  } catch (error) {
    if (error instanceof EvaluationStoreError) throw error;
    throw unavailable("Evaluation database schema is invalid");
  } finally {
    db.close();
  }
}

export type SqliteEvaluationOptions = {
  readonly dataDirectory: string;
  readonly scope: EvaluationScope;
};

/** Open the scope-bound local store at `<dataDirectory>/evaluation.sqlite`. */
export function createSqliteEvaluationStore(options: SqliteEvaluationOptions): EvaluationStore {
  if (
    !options ||
    typeof options !== "object" ||
    typeof options.dataDirectory !== "string" ||
    !options.dataDirectory ||
    !isAbsolute(options.dataDirectory)
  )
    throw invalid("dataDirectory must be an absolute path");
  const scope = parse(EvaluationScopeSchema, options.scope, "Invalid evaluation scope");
  const path = join(options.dataDirectory, "evaluation.sqlite");
  const existed = existsSync(path);
  if (!existed) mkdirSync(options.dataDirectory, { recursive: true, mode: 0o700 });
  const inspected = existed ? inspect(path) : { version: 0 };
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path);
  } catch {
    throw unavailable("Evaluation database could not be opened");
  }
  try {
    chmodSync(options.dataDirectory, 0o700);
    chmodSync(path, 0o600);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    if (inspected.version === 0)
      transaction(db, () => {
        for (const sql of Object.values(schema)) db.exec(sql);
        db.prepare("INSERT INTO evaluation_meta(key,value) VALUES ('generation',?)").run(
          randomUUID(),
        );
        db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });
  } catch (error) {
    db.close();
    if (error instanceof EvaluationStoreError) throw error;
    throw unavailable("Evaluation database could not be initialized");
  }
  const generation =
    inspected.generation ??
    String(
      (
        db.prepare("SELECT value FROM evaluation_meta WHERE key='generation'").get() as {
          value: string;
        }
      ).value,
    );
  let closed = false;
  const scopeArgs = [scope.installationId, scope.projectId] as const;
  const available = () => {
    if (closed) throw new EvaluationStoreError("closed", "Evaluation store is closed");
  };
  const secureFiles = () => {
    for (const file of [path, `${path}-wal`, `${path}-shm`])
      if (existsSync(file)) chmodSync(file, 0o600);
  };
  secureFiles();

  const references = (kind: string, id: string) => {
    const rows = db
      .prepare(
        "SELECT json FROM evaluation_references WHERE installation_id=? AND project_id=? AND owner_kind=? AND owner_id=? ORDER BY reference_order",
      )
      .all(...scopeArgs, kind, id) as JsonRow[];
    return rows.map((row) =>
      parseStored(EvidenceReferenceSchema, row.json, "Stored evaluation reference is invalid"),
    );
  };
  const insertReferences = (kind: string, id: string, values: readonly unknown[]) => {
    for (const [index, value] of values.entries())
      db.prepare(
        "INSERT INTO evaluation_references(installation_id,project_id,owner_kind,owner_id,reference_order,json) VALUES (?,?,?,?,?,?)",
      ).run(...scopeArgs, kind, id, index, canonical(value));
  };
  const caseOwner = (definitionId: string, definitionRevision: string, caseId: string) =>
    ownerId([definitionId, definitionRevision, caseId]);
  const findingOwner = (invocationId: string, findingId: string) =>
    ownerId([invocationId, findingId]);

  const readCase = (ref: VersionedReference, caseId: string): EvaluationCase | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_cases WHERE installation_id=? AND project_id=? AND definition_id=? AND definition_revision=? AND case_id=?",
      )
      .get(...scopeArgs, ref.id, ref.revision, caseId) as JsonRow | null;
    if (!row) return undefined;
    const content = parseStored(
      EvaluationCaseSchema.omit({ references: true }),
      row.json,
      "Stored evaluation case is invalid",
    );
    return validateStored(
      EvaluationCaseSchema,
      { ...content, references: references("case", caseOwner(ref.id, ref.revision, caseId)) },
      "Stored evaluation case is invalid",
    );
  };
  const readDefinitionHeader = (
    ref: VersionedReference,
  ): EvaluationDefinitionHeader | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_definitions WHERE installation_id=? AND project_id=? AND id=? AND revision=?",
      )
      .get(...scopeArgs, ref.id, ref.revision) as JsonRow | null;
    return row
      ? parseStored(
          EvaluationDefinitionHeaderSchema,
          row.json,
          "Stored evaluation definition header is invalid",
        )
      : undefined;
  };
  const readDefinition = (ref: VersionedReference): EvaluationDefinition | undefined => {
    const content = readDefinitionHeader(ref);
    if (!content) return undefined;
    const ids = db
      .prepare(
        "SELECT case_id FROM evaluation_cases WHERE installation_id=? AND project_id=? AND definition_id=? AND definition_revision=? ORDER BY case_order",
      )
      .all(...scopeArgs, ref.id, ref.revision) as { case_id: string }[];
    const cases = ids.map(({ case_id }) => readCase(ref, case_id));
    if (cases.some((item) => item === undefined))
      throw unavailable("Stored evaluation definition cases are invalid");
    return validateStored(
      EvaluationDefinitionSchema,
      { ...content, cases },
      "Stored evaluation definition is invalid",
    );
  };
  const readRun = (runId: string): EvaluationRun | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_runs WHERE installation_id=? AND project_id=? AND run_id=?",
      )
      .get(...scopeArgs, runId) as JsonRow | null;
    return row
      ? parseStored(EvaluationRunSchema, row.json, "Stored evaluation run is invalid")
      : undefined;
  };
  const readStartAttempt = (evaluationRunId: string): EvaluationStartAttempt | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_start_attempts WHERE installation_id=? AND project_id=? AND evaluation_run_id=?",
      )
      .get(...scopeArgs, evaluationRunId) as JsonRow | null;
    return row
      ? parseStored(
          EvaluationStartAttemptSchema,
          row.json,
          "Stored evaluation start attempt is invalid",
        )
      : undefined;
  };
  const readOrchestrationBinding = (
    evaluationRunId: string,
  ): EvaluationOrchestrationBinding | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_orchestration_bindings WHERE installation_id=? AND project_id=? AND evaluation_run_id=?",
      )
      .get(...scopeArgs, evaluationRunId) as JsonRow | null;
    return row
      ? parseStored(
          EvaluationOrchestrationBindingSchema,
          row.json,
          "Stored orchestration binding is invalid",
        )
      : undefined;
  };
  const readTarget = (selector: CheckpointSelector): TargetCheckpoint | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_target_checkpoints WHERE installation_id=? AND project_id=? AND invocation_id=? AND run_id=? AND case_id=? AND case_revision=? AND trial=?",
      )
      .get(
        ...scopeArgs,
        selector.invocationId,
        selector.runId,
        selector.caseId,
        selector.caseRevision,
        selector.trial,
      ) as JsonRow | null;
    if (!row) return undefined;
    const content = storedObject(row.json, "Stored target checkpoint is invalid");
    return validateStored(
      TargetCheckpointSchema,
      { ...content, references: references("target", selector.invocationId) },
      "Stored target checkpoint is invalid",
    );
  };
  const readScorer = (selector: CheckpointSelector): ScorerCheckpoint | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_scorer_checkpoints WHERE installation_id=? AND project_id=? AND invocation_id=? AND run_id=? AND case_id=? AND case_revision=? AND trial=?",
      )
      .get(
        ...scopeArgs,
        selector.invocationId,
        selector.runId,
        selector.caseId,
        selector.caseRevision,
        selector.trial,
      ) as JsonRow | null;
    if (!row) return undefined;
    const content = storedObject(row.json, "Stored scorer checkpoint is invalid");
    const rows = db
      .prepare(
        "SELECT finding_id,json FROM evaluation_findings WHERE installation_id=? AND project_id=? AND invocation_id=? ORDER BY finding_order",
      )
      .all(...scopeArgs, selector.invocationId) as { finding_id: string; json: string }[];
    const findings = rows.map(({ finding_id, json }) => {
      const finding = storedObject(json, "Stored evaluation finding is invalid");
      return validateStored(
        FindingSchema,
        {
          ...finding,
          references: references("finding", findingOwner(selector.invocationId, finding_id)),
        },
        "Stored evaluation finding is invalid",
      );
    });
    return validateStored(
      ScorerCheckpointSchema,
      { ...content, findings },
      "Stored scorer checkpoint is invalid",
    );
  };
  const readScorerForResult = (
    invocationId: string,
    result: EvaluationResultRecord,
  ): ScorerCheckpoint | undefined =>
    readScorer({
      invocationId,
      runId: result.runId,
      caseId: result.caseId,
      caseRevision: result.caseRevision,
      trial: result.trial,
    });
  const readResult = (resultId: string): EvaluationResultView | undefined => {
    const row = db
      .prepare(
        "SELECT json FROM evaluation_results WHERE installation_id=? AND project_id=? AND result_id=?",
      )
      .get(...scopeArgs, resultId) as JsonRow | null;
    if (!row) return undefined;
    const result = parseStored(
      EvaluationResultRecordSchema,
      row.json,
      "Stored evaluation result is invalid",
    );
    const target = result.targetInvocationId
      ? readTarget({
          invocationId: result.targetInvocationId,
          runId: result.runId,
          caseId: result.caseId,
          caseRevision: result.caseRevision,
          trial: result.trial,
        })
      : undefined;
    const scorers = result.scorerInvocationIds.map((id) => readScorerForResult(id, result));
    if ((result.targetInvocationId && !target) || scorers.some((item) => item === undefined))
      throw unavailable("Stored evaluation result checkpoints are invalid");
    const presentScorers = scorers as ScorerCheckpoint[];
    return validateStored(
      EvaluationResultViewSchema,
      {
        result,
        ...(target ? { target } : {}),
        scorers: presentScorers,
        findings: presentScorers.flatMap((item) => item.findings),
      },
      "Stored evaluation result view is invalid",
    );
  };
  const readResultSummary = (resultId: string) => {
    const row = db
      .prepare(
        "SELECT json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND result_id=?",
      )
      .get(...scopeArgs, resultId) as (JsonRow & { finding_count: number }) | null;
    if (!row) return undefined;
    const result = parseStored(
      EvaluationResultRecordSchema,
      row.json,
      "Stored evaluation result is invalid",
    );
    return validateStored(
      ResultSummarySchema,
      { ...result, findingCount: row.finding_count },
      "Stored evaluation result summary is invalid",
    );
  };

  const encodeCursor = (kind: CursorKind, filter: string | null, sequence: number): string =>
    Buffer.from(
      JSON.stringify({
        generation,
        installationId: scope.installationId,
        projectId: scope.projectId,
        kind,
        filter,
        sequence,
      }),
    ).toString("base64url");
  const decodeCursor = (value: string, kind: CursorKind, filter: string | null): Cursor => {
    try {
      const candidate: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (!candidate || typeof candidate !== "object") throw Error("shape");
      const cursor = candidate as Record<string, unknown>;
      if (
        cursor.generation !== generation ||
        cursor.installationId !== scope.installationId ||
        cursor.projectId !== scope.projectId ||
        cursor.kind !== kind ||
        cursor.filter !== filter ||
        !Number.isSafeInteger(cursor.sequence) ||
        Number(cursor.sequence) < 1
      )
        throw Error("binding");
      return cursor as Cursor;
    } catch {
      throw new EvaluationStoreError(
        "invalid_cursor",
        "Cursor is invalid for this evaluation scope or query",
      );
    }
  };
  const pageBoundary = <T extends { sequence: number }>(
    rows: readonly T[],
    limit: number,
    kind: CursorKind,
    filter: string | null,
  ) => {
    const selected = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      selected,
      hasMore,
      ...(hasMore ? { cursor: encodeCursor(kind, filter, selected.at(-1)!.sequence) } : {}),
    };
  };
  const write = <T>(operation: () => T): T => {
    available();
    try {
      return transaction(db, operation);
    } catch (error) {
      if (error instanceof EvaluationStoreError) throw error;
      throw unavailable("Evaluation write failed");
    } finally {
      secureFiles();
    }
  };
  const exact = (stored: string, value: unknown): EvaluationWriteDisposition => {
    if (stored === canonical(value)) return { kind: "duplicate" };
    throw new EvaluationStoreError(
      "conflict",
      "Evaluation identity is already bound to different content",
    );
  };
  const runCase = (runId: string, caseId: string, caseRevision: string, trial: number) => {
    const run = readRun(runId);
    if (!run) throw new EvaluationStoreError("not_found", "Evaluation run was not found");
    if (trial >= run.settings.repetitions)
      throw new EvaluationStoreError("conflict", "Trial is outside the immutable run repetitions");
    const definition = readDefinitionHeader(run.definition);
    if (!definition) throw unavailable("Evaluation run definition is unavailable");
    const selectedCase = readCase(run.definition, caseId);
    if (!selectedCase || selectedCase.revision !== caseRevision)
      throw new EvaluationStoreError(
        "conflict",
        "Evaluation case does not match the run definition",
      );
    return { run, definition, selectedCase };
  };

  const store: EvaluationStore = {
    async saveDefinition(input) {
      const value = parse(EvaluationDefinitionSchema, input, "Invalid evaluation definition");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT fingerprint FROM evaluation_definitions WHERE installation_id=? AND project_id=? AND id=? AND revision=?",
          )
          .get(...scopeArgs, value.id, value.revision) as { fingerprint: string } | null;
        const fingerprint = canonical(value);
        if (existing) {
          if (existing.fingerprint === fingerprint) return { kind: "duplicate" };
          throw new EvaluationStoreError(
            "conflict",
            "Evaluation identity is already bound to different content",
          );
        }
        const { cases, ...content } = value;
        db.prepare(
          "INSERT INTO evaluation_definitions(installation_id,project_id,id,revision,json,fingerprint) VALUES (?,?,?,?,?,?)",
        ).run(...scopeArgs, value.id, value.revision, canonical(content), fingerprint);
        for (const [index, item] of cases.entries()) {
          const { references: caseReferences, ...caseContent } = item;
          db.prepare(
            "INSERT INTO evaluation_cases(installation_id,project_id,definition_id,definition_revision,case_id,case_revision,case_order,json) VALUES (?,?,?,?,?,?,?,?)",
          ).run(
            ...scopeArgs,
            value.id,
            value.revision,
            item.id,
            item.revision,
            index,
            canonical(caseContent),
          );
          insertReferences("case", caseOwner(value.id, value.revision, item.id), caseReferences);
        }
        return { kind: "accepted" };
      });
    },
    async getDefinition(input) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid definition reference");
      return readDefinition(ref);
    },
    async getDefinitionHeader(input) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid definition reference");
      return readDefinitionHeader(ref);
    },
    async getCase(input, caseIdInput) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid definition reference");
      const caseId = parse(EvaluationIdSchema, caseIdInput, "Invalid case identity");
      return readCase(ref, caseId);
    },
    async listDefinitions(input = {}) {
      available();
      const options = parse(EvaluationPageOptionsSchema, input, "Invalid definition page options");
      const limit = options.limit ?? DEFAULT_LIMIT;
      const before = options.after
        ? decodeCursor(options.after, "definitions", null).sequence
        : undefined;
      const rows = (
        before === undefined
          ? db
              .prepare(
                "SELECT sequence,id,revision,json FROM evaluation_definitions WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
              )
              .all(...scopeArgs, limit + 1)
          : db
              .prepare(
                "SELECT sequence,id,revision,json FROM evaluation_definitions WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
              )
              .all(...scopeArgs, before, limit + 1)
      ) as DefinitionRow[];
      const page = pageBoundary(rows, limit, "definitions", null);
      const items = page.selected.map((row) => {
        const content = readDefinitionHeader({ id: row.id, revision: row.revision });
        if (!content) throw unavailable("Stored evaluation definition is invalid");
        const caseCount = Number(
          (
            db
              .prepare(
                "SELECT count(*) AS count FROM evaluation_cases WHERE installation_id=? AND project_id=? AND definition_id=? AND definition_revision=?",
              )
              .get(...scopeArgs, row.id, row.revision) as { count: number }
          ).count,
        );
        return {
          ref: { id: row.id, revision: row.revision },
          name: content.name,
          mode: content.mode,
          caseCount,
          scorerCount: content.scorers.length,
        };
      });
      return validateStored(
        DefinitionPageSchema,
        { items, hasMore: page.hasMore, ...(page.cursor ? { cursor: page.cursor } : {}) },
        "Stored evaluation definition page is invalid",
      );
    },
    async saveRun(input) {
      const value = parse(EvaluationRunSchema, input, "Invalid evaluation run");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_runs WHERE installation_id=? AND project_id=? AND run_id=?",
          )
          .get(...scopeArgs, value.id) as JsonRow | null;
        if (existing) return exact(existing.json, value);
        const request = db
          .prepare(
            "SELECT run_id FROM evaluation_runs WHERE installation_id=? AND project_id=? AND request_id=?",
          )
          .get(...scopeArgs, value.requestId) as { run_id: string } | null;
        if (request)
          throw new EvaluationStoreError(
            "conflict",
            "Evaluation request identity is already bound to another run",
          );
        if (!readDefinitionHeader(value.definition))
          throw new EvaluationStoreError("not_found", "Evaluation definition was not found");
        db.prepare(
          "INSERT INTO evaluation_runs(installation_id,project_id,run_id,request_id,definition_id,definition_revision,json) VALUES (?,?,?,?,?,?,?)",
        ).run(
          ...scopeArgs,
          value.id,
          value.requestId,
          value.definition.id,
          value.definition.revision,
          canonical(value),
        );
        return { kind: "accepted" };
      });
    },
    async getRun(runIdInput) {
      available();
      const runId = parse(EvaluationIdSchema, runIdInput, "Invalid run identity");
      return readRun(runId);
    },
    async saveStartAttempt(input) {
      const value = parse(EvaluationStartAttemptSchema, input, "Invalid evaluation start attempt");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_start_attempts WHERE installation_id=? AND project_id=? AND evaluation_run_id=?",
          )
          .get(...scopeArgs, value.evaluationRunId) as JsonRow | null;
        if (existing) return exact(existing.json, value);
        if (!readRun(value.evaluationRunId))
          throw new EvaluationStoreError("not_found", "Evaluation run was not found");
        db.prepare(
          "INSERT INTO evaluation_start_attempts(installation_id,project_id,evaluation_run_id,json) VALUES (?,?,?,?)",
        ).run(...scopeArgs, value.evaluationRunId, canonical(value));
        return { kind: "accepted" };
      });
    },
    async getStartAttempt(runIdInput) {
      available();
      const runId = parse(EvaluationIdSchema, runIdInput, "Invalid evaluation run identity");
      return readStartAttempt(runId);
    },
    async saveOrchestrationBinding(input) {
      const value = parse(
        EvaluationOrchestrationBindingSchema,
        input,
        "Invalid orchestration binding",
      );
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_orchestration_bindings WHERE installation_id=? AND project_id=? AND evaluation_run_id=?",
          )
          .get(...scopeArgs, value.evaluationRunId) as JsonRow | null;
        if (existing) return exact(existing.json, value);
        if (!readRun(value.evaluationRunId))
          throw new EvaluationStoreError("not_found", "Evaluation run was not found");
        const providerRun = db
          .prepare(
            "SELECT evaluation_run_id FROM evaluation_orchestration_bindings WHERE installation_id=? AND project_id=? AND orchestration_run_id=?",
          )
          .get(...scopeArgs, value.orchestrationRunId) as { evaluation_run_id: string } | null;
        if (providerRun)
          throw new EvaluationStoreError(
            "conflict",
            "Orchestration run is already bound to another evaluation run",
          );
        db.prepare(
          "INSERT INTO evaluation_orchestration_bindings(installation_id,project_id,evaluation_run_id,orchestration_run_id,json) VALUES (?,?,?,?,?)",
        ).run(...scopeArgs, value.evaluationRunId, value.orchestrationRunId, canonical(value));
        return { kind: "accepted" };
      });
    },
    async getOrchestrationBinding(runIdInput) {
      available();
      const runId = parse(EvaluationIdSchema, runIdInput, "Invalid evaluation run identity");
      return readOrchestrationBinding(runId);
    },
    async listRuns(input = {}) {
      available();
      const options = parse(EvaluationPageOptionsSchema, input, "Invalid run page options");
      const limit = options.limit ?? DEFAULT_LIMIT;
      const before = options.after ? decodeCursor(options.after, "runs", null).sequence : undefined;
      const rows = (
        before === undefined
          ? db
              .prepare(
                "SELECT sequence,json FROM evaluation_runs WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
              )
              .all(...scopeArgs, limit + 1)
          : db
              .prepare(
                "SELECT sequence,json FROM evaluation_runs WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
              )
              .all(...scopeArgs, before, limit + 1)
      ) as SequenceRow[];
      const page = pageBoundary(rows, limit, "runs", null);
      return {
        items: page.selected.map((row) =>
          parseStored(EvaluationRunSchema, row.json, "Stored evaluation run is invalid"),
        ),
        hasMore: page.hasMore,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      } satisfies RunPage;
    },
    async saveTargetCheckpoint(input) {
      const value = parse(TargetCheckpointSchema, input, "Invalid target checkpoint");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_target_checkpoints WHERE installation_id=? AND project_id=? AND invocation_id=?",
          )
          .get(...scopeArgs, value.invocationId) as JsonRow | null;
        const { references: targetReferences, ...content } = value;
        const serialized = canonical(content);
        if (existing) {
          const reconstructed = readTarget({
            invocationId: value.invocationId,
            runId: value.runId,
            caseId: value.caseId,
            caseRevision: value.caseRevision,
            trial: value.trial,
          });
          return reconstructed
            ? exact(canonical(reconstructed), value)
            : exact(existing.json, value);
        }
        const logical = db
          .prepare(
            "SELECT invocation_id FROM evaluation_target_checkpoints WHERE installation_id=? AND project_id=? AND run_id=? AND case_id=? AND case_revision=? AND trial=?",
          )
          .get(...scopeArgs, value.runId, value.caseId, value.caseRevision, value.trial) as {
          invocation_id: string;
        } | null;
        if (logical)
          throw new EvaluationStoreError(
            "conflict",
            "Target checkpoint identity is already bound to another invocation",
          );
        const { definition } = runCase(value.runId, value.caseId, value.caseRevision, value.trial);
        if (
          !definition.target ||
          definition.target.id !== value.target.id ||
          definition.target.revision !== value.target.revision
        )
          throw new EvaluationStoreError("conflict", "Target does not match the run definition");
        db.prepare(
          "INSERT INTO evaluation_target_checkpoints(installation_id,project_id,invocation_id,run_id,case_id,case_revision,trial,json) VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          ...scopeArgs,
          value.invocationId,
          value.runId,
          value.caseId,
          value.caseRevision,
          value.trial,
          serialized,
        );
        insertReferences("target", value.invocationId, targetReferences);
        return { kind: "accepted" };
      });
    },
    async getTargetCheckpoint(input) {
      available();
      const selector = parse(CheckpointSelectorSchema, input, "Invalid target checkpoint selector");
      return readTarget(selector);
    },
    async saveScorerCheckpoint(input) {
      const value = parse(ScorerCheckpointSchema, input, "Invalid scorer checkpoint");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_scorer_checkpoints WHERE installation_id=? AND project_id=? AND invocation_id=?",
          )
          .get(...scopeArgs, value.invocationId) as JsonRow | null;
        if (existing) {
          const reconstructed = readScorer({
            invocationId: value.invocationId,
            runId: value.runId,
            caseId: value.caseId,
            caseRevision: value.caseRevision,
            trial: value.trial,
          });
          return reconstructed
            ? exact(canonical(reconstructed), value)
            : exact(existing.json, value);
        }
        const logical = db
          .prepare(
            "SELECT invocation_id FROM evaluation_scorer_checkpoints WHERE installation_id=? AND project_id=? AND run_id=? AND case_id=? AND case_revision=? AND trial=? AND scorer_id=? AND scorer_revision=?",
          )
          .get(
            ...scopeArgs,
            value.runId,
            value.caseId,
            value.caseRevision,
            value.trial,
            value.scorer.id,
            value.scorer.revision,
          ) as { invocation_id: string } | null;
        if (logical)
          throw new EvaluationStoreError(
            "conflict",
            "Scorer checkpoint identity is already bound to another invocation",
          );
        const { definition } = runCase(value.runId, value.caseId, value.caseRevision, value.trial);
        if (
          !definition.scorers.some(
            (item) => item.id === value.scorer.id && item.revision === value.scorer.revision,
          )
        )
          throw new EvaluationStoreError("conflict", "Scorer does not match the run definition");
        const { findings, ...content } = value;
        db.prepare(
          "INSERT INTO evaluation_scorer_checkpoints(installation_id,project_id,invocation_id,run_id,case_id,case_revision,trial,scorer_id,scorer_revision,json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          ...scopeArgs,
          value.invocationId,
          value.runId,
          value.caseId,
          value.caseRevision,
          value.trial,
          value.scorer.id,
          value.scorer.revision,
          canonical(content),
        );
        for (const [index, finding] of findings.entries()) {
          const { references: findingReferences, ...findingContent } = finding;
          db.prepare(
            "INSERT INTO evaluation_findings(installation_id,project_id,invocation_id,finding_id,finding_order,json) VALUES (?,?,?,?,?,?)",
          ).run(...scopeArgs, value.invocationId, finding.id, index, canonical(findingContent));
          insertReferences(
            "finding",
            findingOwner(value.invocationId, finding.id),
            findingReferences,
          );
        }
        return { kind: "accepted" };
      });
    },
    async getScorerCheckpoint(input) {
      available();
      const selector = parse(CheckpointSelectorSchema, input, "Invalid scorer checkpoint selector");
      return readScorer(selector);
    },
    async saveResult(input) {
      const value = parse(EvaluationResultRecordSchema, input, "Invalid evaluation result");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_results WHERE installation_id=? AND project_id=? AND result_id=?",
          )
          .get(...scopeArgs, value.id) as JsonRow | null;
        if (existing) return exact(existing.json, value);
        const logical = db
          .prepare(
            "SELECT result_id FROM evaluation_results WHERE installation_id=? AND project_id=? AND run_id=? AND case_id=? AND case_revision=? AND trial=?",
          )
          .get(...scopeArgs, value.runId, value.caseId, value.caseRevision, value.trial) as {
          result_id: string;
        } | null;
        if (logical)
          throw new EvaluationStoreError(
            "conflict",
            "Trial result identity is already bound to another result",
          );
        runCase(value.runId, value.caseId, value.caseRevision, value.trial);
        const target = value.targetInvocationId
          ? readTarget({
              invocationId: value.targetInvocationId,
              runId: value.runId,
              caseId: value.caseId,
              caseRevision: value.caseRevision,
              trial: value.trial,
            })
          : undefined;
        if (value.targetInvocationId && !target)
          throw new EvaluationStoreError("not_found", "Target checkpoint was not found");
        const scorers = value.scorerInvocationIds.map((id) => readScorerForResult(id, value));
        if (scorers.some((item) => item === undefined))
          throw new EvaluationStoreError("not_found", "Scorer checkpoint was not found");
        const presentScorers = scorers as ScorerCheckpoint[];
        const findingCount = presentScorers.reduce(
          (total, item) => total + item.findings.length,
          0,
        );
        db.prepare(
          "INSERT INTO evaluation_results(installation_id,project_id,result_id,run_id,case_id,case_revision,trial,json,finding_count) VALUES (?,?,?,?,?,?,?,?,?)",
        ).run(
          ...scopeArgs,
          value.id,
          value.runId,
          value.caseId,
          value.caseRevision,
          value.trial,
          canonical(value),
          findingCount,
        );
        return { kind: "accepted" };
      });
    },
    async getResultSummary(resultIdInput) {
      available();
      const resultId = parse(EvaluationIdSchema, resultIdInput, "Invalid result identity");
      return readResultSummary(resultId);
    },
    async getResult(resultIdInput) {
      available();
      const resultId = parse(EvaluationIdSchema, resultIdInput, "Invalid result identity");
      return readResult(resultId);
    },
    async listResults(input = {}) {
      available();
      const options = parse(ResultPageOptionsSchema, input, "Invalid result page options");
      const limit = options.limit ?? DEFAULT_LIMIT;
      const filter = options.runId ?? null;
      const before = options.after
        ? decodeCursor(options.after, "results", filter).sequence
        : undefined;
      let rows: ResultRow[];
      if (filter === null)
        rows = (
          before === undefined
            ? db
                .prepare(
                  "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, limit + 1)
            : db
                .prepare(
                  "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, before, limit + 1)
        ) as ResultRow[];
      else
        rows = (
          before === undefined
            ? db
                .prepare(
                  "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND run_id=? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, filter, limit + 1)
            : db
                .prepare(
                  "SELECT sequence,json,finding_count FROM evaluation_results WHERE installation_id=? AND project_id=? AND run_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, filter, before, limit + 1)
        ) as ResultRow[];
      const page = pageBoundary(rows, limit, "results", filter);
      const items = page.selected.map((row) =>
        validateStored(
          ResultSummarySchema,
          {
            ...parseStored(
              EvaluationResultRecordSchema,
              row.json,
              "Stored evaluation result is invalid",
            ),
            findingCount: row.finding_count,
          },
          "Stored evaluation result summary is invalid",
        ),
      );
      return {
        items,
        hasMore: page.hasMore,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      } satisfies ResultPage;
    },
    async saveFeedback(input) {
      const value = parse(EvaluationFeedbackSchema, input, "Invalid evaluation feedback");
      return write(() => {
        const existing = db
          .prepare(
            "SELECT json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND feedback_id=?",
          )
          .get(...scopeArgs, value.id) as JsonRow | null;
        if (existing) return exact(existing.json, value);
        const result = db
          .prepare(
            "SELECT result_id FROM evaluation_results WHERE installation_id=? AND project_id=? AND result_id=?",
          )
          .get(...scopeArgs, value.resultId) as { result_id: string } | null;
        if (!result)
          throw new EvaluationStoreError("not_found", "Evaluation feedback result was not found");
        db.prepare(
          "INSERT INTO evaluation_feedback(installation_id,project_id,feedback_id,result_id,json) VALUES (?,?,?,?,?)",
        ).run(...scopeArgs, value.id, value.resultId, canonical(value));
        return { kind: "accepted" };
      });
    },
    async listFeedback(input = {}) {
      available();
      const options = parse(FeedbackPageOptionsSchema, input, "Invalid feedback page options");
      const limit = options.limit ?? DEFAULT_LIMIT;
      const filter = options.resultId ?? null;
      const before = options.after
        ? decodeCursor(options.after, "feedback", filter).sequence
        : undefined;
      let rows: SequenceRow[];
      if (filter === null)
        rows = (
          before === undefined
            ? db
                .prepare(
                  "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, limit + 1)
            : db
                .prepare(
                  "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, before, limit + 1)
        ) as SequenceRow[];
      else
        rows = (
          before === undefined
            ? db
                .prepare(
                  "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND result_id=? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, filter, limit + 1)
            : db
                .prepare(
                  "SELECT sequence,json FROM evaluation_feedback WHERE installation_id=? AND project_id=? AND result_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?",
                )
                .all(...scopeArgs, filter, before, limit + 1)
        ) as SequenceRow[];
      const page = pageBoundary(rows, limit, "feedback", filter);
      return {
        items: page.selected.map((row) =>
          parseStored(EvaluationFeedbackSchema, row.json, "Stored evaluation feedback is invalid"),
        ),
        hasMore: page.hasMore,
        ...(page.cursor ? { cursor: page.cursor } : {}),
      } satisfies FeedbackPage;
    },
    async close() {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
  return store;
}

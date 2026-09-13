import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { createCodexDriver } from "@drawloom/codex-agent";
import { codexCommand, createNodeJsonStore, createStdioTransport } from "@drawloom/node-host";
import { finishDisposableCodexThread } from "../../scripts/codex-thread-cleanup.ts";
import { evaluationCaseSchema, type EvaluationCase, type EvaluationResult } from "./contract.ts";
import { createCodexPassageScorer, type CodexJudgeReceipt } from "./codex-passage-judge.ts";
import { observeCodexJudgeTransport } from "./codex-live-observer.ts";
import { passageCases } from "./passage-cases.ts";
import { saveResultFile } from "./result-files.ts";

function argument(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (required && !value) throw Error(`Missing ${name}`);
  return value;
}

async function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

const out = argument("--out")!;
if (!isAbsolute(out)) throw Error("--out must be absolute");
const model = argument("--model")!;
if (model !== "gpt-5.6-terra") throw Error("Initial proof requires --model gpt-5.6-terra; no silent model substitution");
const effort = argument("--effort")!;
if (effort !== "low") throw Error("Initial proof requires --effort low");
const selectedIds = (argument("--cases", false) ?? "").split(",").filter(Boolean);
if (new Set(selectedIds).size !== selectedIds.length) throw Error("--cases requires unique public case identities");
const selectedPublic = selectedIds.map(id => {
  const candidate = passageCases.find(item => item.id === id);
  if (!candidate) throw Error(`Unknown public case: ${id}`);
  return structuredClone(candidate);
});
const extraPath = argument("--extra-cases", false);
const extras = extraPath
  ? z.array(evaluationCaseSchema).max(2).parse(JSON.parse(await readFile(extraPath, "utf8")))
  : [];
if (extras.some(item => passageCases.some(publicCase => publicCase.id === item.id))) throw Error("Extra case identity collides with a public case");
const cases: EvaluationCase[] = [...selectedPublic, ...extras];
if (cases.length < 1 || cases.length > 6) throw Error("Live proof requires 1..6 judging turns");
const runtimeDirectories = cases.map((_, index) => `case-${String(index + 1).padStart(2, "0")}`);

await mkdir(out);
const plan = {
  schemaVersion: 1,
  model,
  effort,
  judgingTurns: cases.length,
  concurrency: 1,
  retries: 0,
  timeoutMsPerTurn: 120_000,
  publicCasesRun: selectedIds,
  publicCasesUnrun: passageCases.map(item => item.id).filter(id => !selectedIds.includes(id)),
  extraCases: extras.map(item => item.id),
  runtimeDirectories,
  expectedLabelsSentToJudge: false,
  hiddenReasoningCaptured: false,
  network: {
    braintrustUpload: false,
    codexAppServer: true,
    note: "Braintrust runs locally with noSendLogs; signed-in Codex App Server is the only intentionally networked scoring boundary.",
  },
};
await atomicJson(join(out, "launch-plan.json"), plan);
if (process.argv.includes("--prepare-only")) {
  console.log(JSON.stringify({ status: "prepared", out, ...plan }));
  process.exit(0);
}
if (!process.env.DRAWLOOM_EVAL_NETWORK_LOG) throw Error("Live proof requires DRAWLOOM_EVAL_NETWORK_LOG and --import observer.mjs on the parent Node process");

for (const key of ["BRAINTRUST_API_KEY", "BRAINTRUST_APP_URL", "BRAINTRUST_API_URL", "BRAINTRUST_ORG_NAME", "BRAINTRUST_PROJECT_NAME"]) delete process.env[key];
process.env.BRAINTRUST_DISABLE_AUTO_INSTRUMENTATION = "1";
const { createBraintrustRunner } = await import("./braintrust.ts");
const runner = createBraintrustRunner();
const runtimeRoot = await mkdtemp(join(tmpdir(), "drawloom-codex-judge-"));
const results: EvaluationResult[] = [];
const receipts: Array<CodexJudgeReceipt & { caseId: string; resultId?: string; expectedQuality?: string; observedQuality?: string }> = [];
type OwnedRun = {
  threadId?: string;
  threadStartAttempted: boolean;
  writerClosed: boolean;
  terminalObserved: boolean;
  caseId: string;
  runtimeDirectory: string;
};
const owned: OwnedRun[] = [];
let primaryError: string | undefined;
let resultsPersisted = false;
const recoveryPath = join(out, "recovery.json");
const persistRecovery = () => atomicJson(recoveryPath, {
  schemaVersion: 1,
  runtimeRoot,
  resultsPersisted,
  tasks: owned,
  primaryError,
  note: "Archive only after provider terminal, writer closure and durable results. Preserve this receipt and runtime directory when any state is uncertain.",
});

const launch = () => {
  const base = codexCommand();
  return { ...base, args: [...base.args, "-c", `model=\"${model}\"`, "-c", `model_reasoning_effort=\"${effort}\"`] };
};

try {
  for (const [caseIndex, candidate] of cases.entries()) {
    let ownedThreadId: string | undefined;
    let session: import("@drawloom/agent").AgentSession | undefined;
    let baseTransport: import("@drawloom/host").RpcTransport | undefined;
    const runtimeDirectory = join(runtimeRoot, runtimeDirectories[caseIndex]!);
    await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
    const ownedItem: OwnedRun = {
      caseId: candidate.id,
      threadStartAttempted: false,
      writerClosed: false,
      terminalObserved: false,
      runtimeDirectory,
    };
    owned.push(ownedItem);
    await persistRecovery();
    try {
      baseTransport = createStdioTransport({ ...launch(), cwd: runtimeDirectory });
      const observed = observeCodexJudgeTransport(baseTransport, model);
      const request = observed.transport.request.bind(observed.transport);
      observed.transport.request = async (method, params) => {
        if (method === "thread/start") {
          ownedItem.threadStartAttempted = true;
          await persistRecovery();
        }
        const result = await request(method, params);
        if (method === "thread/start") {
          const parsed = z.object({ thread: z.object({ id: z.string().min(1) }) }).safeParse(result);
          if (parsed.success) {
            ownedThreadId = parsed.data.thread.id;
            ownedItem.threadId = ownedThreadId;
            await persistRecovery();
          }
        }
        return result;
      };
      const driver = createCodexDriver({
        workingDirectory: runtimeDirectory,
        connect: async () => observed.transport,
        store: createNodeJsonStore(join(runtimeDirectory, "state")),
      });
      const opened = await driver.openSession({
        sessionId: `adr-0025-judge-${candidate.id}-${crypto.randomUUID()}`,
        context: { text: "This disposable session judges only the supplied synthetic passage. Do not use tools, files, integrations, memory or prior work." },
        tools: { id: "none", tools: [] },
      });
      if (opened.status !== "ok") throw Error(opened.failure.message);
      session = opened.value;
      const localReceipts: CodexJudgeReceipt[] = [];
      const response = await runner.run({
        experimentId: `adr-0025-codex-${candidate.id}`,
        mode: "assess-existing",
        cases: [candidate],
        scorers: [createCodexPassageScorer({
          session,
          receipts: localReceipts,
          timeoutMs: 120_000,
          takeUsage: () => observed.takeLatest(),
        })],
        repetitions: 1,
        concurrency: 1,
      });
      results.push(...response.results);
      const result = response.results[0];
      const expectedQuality = z.object({ quality: z.enum(["pass", "fail"]), defect: z.string() }).parse(candidate.expected).quality;
      const finding = result?.findings[0];
      const observedQuality = finding?.error ? "error" : finding?.score === 1 ? "pass" : finding?.score === 0 ? "fail" : "uncertain";
      receipts.push(...localReceipts.map(receipt => ({
        ...receipt,
        caseId: candidate.id,
        ...(result ? { resultId: result.id } : {}),
        expectedQuality,
        observedQuality,
      })));
      ownedItem.terminalObserved = localReceipts.some(receipt => receipt.providerTerminal !== undefined);
      if (observed.protocolErrors.length) throw Error(observed.protocolErrors.join("; "));
    } catch (cause) {
      primaryError = cause instanceof Error ? cause.message : String(cause);
      break;
    } finally {
      if (session) {
        const closed = await session.close();
        ownedItem.writerClosed = closed.status === "ok";
        if (closed.status !== "ok") primaryError ??= closed.failure.message;
      } else if (baseTransport) {
        try { await baseTransport.close(); } catch (cause) { primaryError ??= cause instanceof Error ? cause.message : String(cause); }
      }
      await persistRecovery();
    }
  }

  await saveResultFile(join(out, "results.json"), { schemaVersion: 1, results, feedback: [] });
  await atomicJson(join(out, "judge-receipts.json"), {
    schemaVersion: 1,
    scorer: { id: "codex-passage-judge", revision: "1" },
    receipts,
    monetaryCost: "unknown",
    interfaceGap: "Per-scorer token ownership and aggregation are not represented by candidate EvaluationResult.usage; exact invocation receipts retain native last-turn usage for this proof.",
    primaryError,
  });
  resultsPersisted = true;
  await persistRecovery();

  const cleanup = [];
  for (const item of owned) {
    if (item.threadStartAttempted && !item.threadId) {
      cleanup.push({
        kind: "failed",
        caseId: item.caseId,
        reason: "thread/start was attempted but no thread identity was observed; archive was not attempted",
      });
      continue;
    }
    if (item.threadId && (!item.writerClosed || !item.terminalObserved)) {
      cleanup.push({ kind: "failed", threadId: item.threadId, caseId: item.caseId, reason: !item.writerClosed ? "Writer closure was not confirmed; archive was not attempted" : "Provider terminal was not observed; archive was not attempted" });
      continue;
    }
    const finished = await finishDisposableCodexThread({ caseId: item.caseId }, {
      ...(item.threadId ? { threadId: item.threadId } : {}),
      connect: async () => createStdioTransport({ ...codexCommand(), cwd: item.runtimeDirectory }),
    });
    cleanup.push({ ...finished.cleanup, caseId: item.caseId });
  }
  await atomicJson(join(out, "cleanup.json"), { schemaVersion: 1, cleanup });
  if (cleanup.some(item => item.kind === "failed")) primaryError ??= "One or more disposable Codex tasks were not archived";
  await persistRecovery();
  if (!cleanup.some(item => item.kind === "failed")) await rm(runtimeRoot, { recursive: true, force: true });
} catch (cause) {
  primaryError ??= cause instanceof Error ? cause.message : String(cause);
  await persistRecovery().catch(() => {});
}

console.log(JSON.stringify({ status: primaryError ? "failed" : "completed", out, results: results.length, receipts: receipts.length, primaryError }));
if (primaryError) process.exitCode = 1;

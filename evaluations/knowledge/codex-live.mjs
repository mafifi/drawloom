// Explicit opt-in native integration. Public invented evidence only; no model downloads.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodexAssessment } from "../../packages/knowledge/codex-assessment/dist/index.js";
import {
  createNodeJsonStore,
  createStdioTransport,
  codexCommand,
} from "../../packages/host/node-host/dist/index.js";
import { finishDisposableCodexThread } from "../../scripts/codex-thread-cleanup.ts";

if (process.env.DRAWLOOM_KNOWLEDGE_LIVE !== "1")
  throw Error("Set DRAWLOOM_KNOWLEDGE_LIVE=1 to authorize this explicit native integration check.");
const recovering = process.env.DRAWLOOM_KNOWLEDGE_RECOVER_DIR;
const root = recovering ?? (await mkdtemp(join(tmpdir(), "drawloom-knowledge-live-")));
const subject = { type: "user", id: "public-integration-owner", properties: {} };
const ref = { type: "source", origin: "public-invented-fixture", id: "library", revision: "r1" };
const secondRef = { ...ref, id: "library-tuesday" };
const request = recovering
  ? JSON.parse(
      await readFile(
        join(
          root,
          "receipts",
          (await readdir(join(root, "receipts"))).find((name) =>
            name.startsWith("knowledge-assessment"),
          ),
        ),
        "utf8",
      ),
    ).request
  : {
      requestId: "public-" + crypto.randomUUID(),
      payloadFingerprint: "public-library-batch-r1",
      evidence: {
        roots: [
          { unitId: "public-unit-1", root: ref },
          { unitId: "public-unit-2", root: secondRef },
        ],
        complete: true,
        records: [
          {
            ref,
            body: "In this invented example, the Moss Library closes every Monday.",
            status: "active",
            confidence: {},
            provenance: { producer: { type: "fixture", id: "public" }, inputs: [] },
          },
          {
            ref: secondRef,
            body: "In this invented example, the Moss Library opens at 09:00 on Tuesdays.",
            status: "active",
            confidence: {},
            provenance: { producer: { type: "fixture", id: "public" }, inputs: [] },
          },
        ],
        links: [],
      },
    };
const calls = [];
const errors = [];
const receiptsDirectory = join(root, "receipts");
const store = createNodeJsonStore(receiptsDirectory);
const provider = createCodexAssessment({
  model: process.env.DRAWLOOM_NIGHTLOOM_MODEL ?? "gpt-5.6-terra",
  effort: "low",
  workingDirectory: root,
  timeoutMs: 300000,
  store,
  authorizer: { authorize: async () => ({ decision: true }) },
  resolveResource: async ({ ref }) => ({
    type: ref ? "knowledge-record" : "model-destination",
    id: ref?.id ?? "configured-codex",
    properties: {},
  }),
  connect: async () => {
    const rpc = createStdioTransport({
      ...codexCommand(),
      cwd: root,
      requestTimeoutMs: 300000,
      maxMessageBytes: 2 * 1024 * 1024,
    });
    return {
      ...rpc,
      request: async (method, params) => {
        calls.push(method);
        try {
          return await rpc.request(method, params);
        } catch (cause) {
          errors.push({ method, error: String(cause).slice(0, 300) });
          throw cause;
        }
      },
    };
  },
});
const started = performance.now();
let result;
let proofFailure;
let closeFailure;
try {
  result = recovering
    ? await provider.reconcile(subject, {
        requestId: request.requestId,
        payloadFingerprint: request.payloadFingerprint,
      })
    : await provider.assess(subject, request);
  const deadline = Date.now() + 300000;
  while ((result.kind === "running" || result.kind === "uncertain") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await provider.reconcile(subject, {
      requestId: request.requestId,
      payloadFingerprint: request.payloadFingerprint,
    });
  }
  assert.equal(result.kind, "completed");
  if (result.kind === "completed") assert.ok(result.proposals.length > 0);
  assert.equal(calls.filter((method) => method === "turn/start").length, recovering ? 0 : 1);
} catch (cause) {
  proofFailure = cause;
} finally {
  try {
    await provider.close();
  } catch (cause) {
    closeFailure = cause;
  }
}
const expectedSubject = JSON.stringify([subject.type, subject.id]);
const receiptCandidates = await Promise.all(
  (await readdir(receiptsDirectory))
    .filter((name) => name.startsWith("knowledge-assessment"))
    .map(async (name) => JSON.parse(await readFile(join(receiptsDirectory, name), "utf8"))),
);
const matchingReceipts = receiptCandidates.filter(
  (value) =>
    value?.request?.requestId === request.requestId &&
    value?.request?.payloadFingerprint === request.payloadFingerprint &&
    value?.subject === expectedSubject,
);
const receipt = matchingReceipts.length === 1 ? matchingReceipts[0] : undefined;
const terminal = ["completed", "cancelled", "failure"].includes(receipt?.outcome?.kind);
const terminalThreadId = terminal ? receipt.threadId : undefined;
const ownedThreadId = terminalThreadId && !closeFailure ? terminalThreadId : undefined;
const finished = await finishDisposableCodexThread(result, {
  threadId: ownedThreadId,
  connect: async () =>
    createStdioTransport({
      ...codexCommand(),
      cwd: root,
      requestTimeoutMs: 300000,
      maxMessageBytes: 2 * 1024 * 1024,
    }),
});
console.log(
  JSON.stringify(
    {
      kind: "live-codex-assessment",
      recovering: Boolean(recovering),
      result: finished.primary,
      cleanup: finished.cleanup,
      milliseconds: performance.now() - started,
      calls: Object.fromEntries(
        [...new Set(calls)].map((method) => [
          method,
          calls.filter((value) => value === method).length,
        ]),
      ),
      errors,
      runtimeDirectory: root,
    },
    null,
    2,
  ),
);
const receiptFailure =
  result?.kind === "completed" && matchingReceipts.length !== 1
    ? Error("Completed assessment did not resolve to one exact owned receipt for cleanup")
    : undefined;
const cleanupFailure =
  receiptFailure ??
  (terminalThreadId && closeFailure
    ? Error("Assessment writer closure was not confirmed; native thread archive was not attempted")
    : ownedThreadId && finished.cleanup.kind !== "archived"
      ? Error(
          "Completed assessment evidence was saved, but its disposable native thread was not archived",
        )
      : undefined);
if (proofFailure && (cleanupFailure || closeFailure))
  throw new AggregateError(
    [
      proofFailure,
      ...(closeFailure ? [closeFailure] : []),
      ...(cleanupFailure ? [cleanupFailure] : []),
    ],
    "Live assessment and cleanup both failed",
  );
if (proofFailure) throw proofFailure;
if (closeFailure && cleanupFailure)
  throw new AggregateError(
    [closeFailure, cleanupFailure],
    "Assessment connection close and disposable-thread cleanup both failed",
  );
if (closeFailure) throw closeFailure;
if (cleanupFailure) throw cleanupFailure;

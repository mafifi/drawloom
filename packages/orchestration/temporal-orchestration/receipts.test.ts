import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { command } from './src/processes.js';
import { z } from "zod";
import { matchTaskHandlers, StepFailure } from "@drawloom/orchestration";
import * as implementation from "./src/receipts.js";

const task = { id: "write", version: "1", input: z.number(), output: z.number() };
const request = { runId: "owner/run", stepId: "owner/run/write", task: "write", version: "1", input: 3, attempt: 1, maxAttempts: 2 };
test('self-contained backend StepFailure retains denial and explicit retry semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-bundled-error-'));
  try {
    await command('bun', ['build', resolve('packages/orchestration/temporal-orchestration/fixtures/bundled-failure.mjs'), '--target', 'browser', '--outfile', join(root, 'backend.mjs')]);
    const backend = await import(pathToFileURL(join(root, 'backend.mjs')).href) as { fail(code: string): never };
    for (const code of ['denied', 'retryable'] as const) {
      let calls = 0;
      const dispatcher = implementation.createReceiptDispatcher(join(root, code), 'owner', matchTaskHandlers({ workflows: [], tasks: [task] }, [{ id: task.id, version: task.version, run: () => { calls++; return backend.fail(code); } }]));
      await expect(dispatcher.dispatch(request)).rejects.toMatchObject({ code });
      await expect(dispatcher.dispatch({ ...request, attempt: 2 })).rejects.toMatchObject({ code });
      expect(calls).toBe(code === 'denied' ? 1 : 2);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("durable receipt deduplicates concurrent and reopened completed deliveries", async () => {
  expect(Reflect.get(implementation, "createReceiptDispatcher")).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), "drawloom-receipt-"));
  let calls = 0;
  const handlers = matchTaskHandlers({ workflows: [], tasks: [task] }, [{ ...task, run: async () => { calls++; return 6; } }]);
  try {
    const make = () => implementation.createReceiptDispatcher(root, "owner", handlers);
    const dispatch = make();
    expect(await Promise.all([dispatch.dispatch(request), dispatch.dispatch(request)])).toEqual([6, 6]);
    expect(await make().dispatch(request)).toBe(6);
    expect(calls).toBe(1);
    await expect(dispatch.dispatch({ ...request, input: 4 })).rejects.toThrow("Conflicting");
    await expect(dispatch.dispatch({ ...request, runId: "other/run" })).rejects.toThrow("owner");
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("incomplete delivery recovers without rerun; unknown and denied never retry", async () => {
  expect(Reflect.get(implementation, "createReceiptDispatcher")).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), "drawloom-receipt-"));
  let calls = 0;
  const handlers = (code: "unknown" | "denied" | "retryable") => matchTaskHandlers({ workflows: [], tasks: [task] }, [{ ...task, run: () => { calls++; throw new StepFailure(code); } }]);
  try {
    for (const code of ["unknown", "denied", "retryable"] as const) {
      const dispatcher = implementation.createReceiptDispatcher(join(root, code), "owner", handlers(code));
      await expect(dispatcher.dispatch(request)).rejects.toThrow();
      await expect(dispatcher.dispatch({ ...request, attempt: 2 })).rejects.toThrow();
    }
    expect(calls).toBe(4);
    const hung = implementation.createReceiptDispatcher(join(root, "hung"), "owner", matchTaskHandlers({ workflows: [], tasks: [{ ...task, limits: { startToCloseTimeoutMs: 20 } }] }, [{ ...task, run: () => new Promise(() => {}) }]));
    await expect(hung.dispatch(request)).rejects.toThrow("unknown");
    const recovered = implementation.createReceiptDispatcher(join(root, "hung"), "owner", matchTaskHandlers({ workflows: [], tasks: [task] }, [{ ...task, run: () => { throw Error("must not run"); }, recover: () => ({ status: "completed", output: 6 }) }]));
    expect(await recovered.dispatch({ ...request, attempt: 2 })).toBe(6);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("run cancellation reaches listeners registered by completed owned-agent submissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-cancellation-"));
  let interrupted = false;
  const handlers = matchTaskHandlers({ workflows: [], tasks: [task] }, [{ ...task, run: (_input, context) => {
    context.signal.addEventListener("abort", () => { interrupted = true; }, { once: true });
    return 6;
  } }]);
  try {
    const dispatcher = implementation.createReceiptDispatcher(root, "owner", handlers);
    expect(await dispatcher.dispatch(request)).toBe(6);
    dispatcher.cancel(request.runId);
    expect(interrupted).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

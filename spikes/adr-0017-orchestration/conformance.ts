import assert from "node:assert/strict";
import { z } from "zod";
import {
  StepFailure,
  type Orchestrator,
  type TaskContext,
} from "./contract.ts";
import { arithmetic, waiting, retry, workflows } from "./fixtures.ts";
export type Fixture = {
  engine: Orchestrator;
  attempts: TaskContext[];
  dispose(): Promise<void>;
};
export async function orchestrationConformance(create: () => Promise<Fixture>) {
  const f = await create();
  const e = f.engine;
  try {
    const boundaryChecks = await Promise.allSettled([
      (async () => {
        const accepted = await e.start(
          "retry-max",
          workflows.retryBoundary,
          10,
        );
        assert.equal(await e.result(accepted), 4);
        const rejected = await e.start(
          "retry-excess",
          workflows.retryBoundary,
          11,
        );
        await assert.rejects(e.result(rejected));
      })(),
      (async () => {
        const conflicting = await e.start(
          "input-schema-conflict",
          workflows.conflictingInput,
          null,
        );
        let snapshot = await e.get(conflicting);
        for (let i = 0; !snapshot.pendingInputs.length && i < 100; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          snapshot = await e.get(conflicting);
        }
        assert.ok(snapshot.pendingInputs[0]);
        await e.respond(conflicting, snapshot.pendingInputs[0], 7);
        await assert.rejects(e.result(conflicting));
      })(),
    ]);
    assert.deepEqual(
      boundaryChecks.map((check) => check.status),
      ["fulfilled", "fulfilled"],
      "retry ceiling and repeated input schema must agree across providers",
    );
    const catalogue = await e.start("catalogue", workflows.catalogue, [
      " Pear ",
      "apple",
      "pear",
    ]);
    assert.deepEqual(await e.result(catalogue), ["apple", "pear"]);
    const id = await e.start("same", arithmetic, 3);
    assert.equal(await e.start("same", arithmetic, 3), id);
    await assert.rejects(e.start("same", arithmetic, 4));
    assert.equal(await e.result(id), 6);
    await assert.rejects(
      e.start("invalid", arithmetic, "bad" as unknown as number),
    );
    const wait = await e.start("wait", waiting, null);
    let snapshot = await e.get(wait);
    for (let i = 0; !snapshot.pendingInputs.length && i < 100; i++) {
      await new Promise((r) => setTimeout(r, 10));
      snapshot = await e.get(wait);
    }
    const request = snapshot.pendingInputs[0]!;
    assert.ok(request);
    const controller = new AbortController();
    const local = e.result(wait, { signal: controller.signal });
    controller.abort();
    await assert.rejects(local);
    assert.equal((await e.get(wait)).status, "running");
    await assert.rejects(e.respond(id, request, 1));
    await assert.rejects(e.respond(wait, request, "bad"));
    await e.respond(wait, request, 9);
    await e.respond(wait, request, 9);
    await assert.rejects(e.respond(wait, request, 10));
    assert.equal(await e.result(wait), 9);
    const retried = await e.start("retry", retry, 4);
    assert.equal(await e.result(retried), 8);
    const attempts = f.attempts.filter((a) => a.runId === retried);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0]!.stepId, attempts[1]!.stepId);
    assert.notEqual(attempts[0]!.attemptId, attempts[1]!.attemptId);
    for (const code of ["denied", "invalid", "unknown"] as const) {
      const run = await e.start(code, workflows[code], 1);
      await assert.rejects(e.result(run));
      assert.equal(f.attempts.filter((a) => a.runId === run).length, 1);
      const failedSnapshot = await e.get(run);
      assert.equal(failedSnapshot.steps[0]?.attempts, 1);
      if (code === "unknown")
        assert.ok(failedSnapshot.unresolvedEffects.length);
    }
    const cancelled = await e.start("cancel", waiting, null);
    const lost = await e.start("lost-response", workflows.lostResponse, 1);
    await assert.rejects(e.result(lost));
    assert.equal(f.attempts.filter((a) => a.runId === lost).length, 1);
    assert.equal((await e.get(lost)).steps[0]?.attempts, 1);
    assert.ok((await e.get(lost)).unresolvedEffects.length);
    await e.cancel(cancelled);
    await assert.rejects(e.result(cancelled));
    assert.equal((await e.get(cancelled)).cancellationRequested, true);
    assert.ok((await e.list({ limit: 2 })).cursor);
    const once = await e.start("default", workflows.defaultRetry, 1);
    await assert.rejects(e.result(once));
    assert.equal(f.attempts.filter((a) => a.runId === once).length, 1);
    const duplicate = await e.start("duplicate", workflows.duplicateStep, 3);
    assert.equal(await e.result(duplicate), 12);
    assert.equal(f.attempts.filter((a) => a.runId === duplicate).length, 1);
    const conflict = await e.start("conflict", workflows.conflictingStep, 3);
    await assert.rejects(e.result(conflict));
    const failed = await e.start("fanout-fail", workflows.failedFanout, null);
    await assert.rejects(e.result(failed));
    const failedState = await e.get(failed);
    assert.equal(
      failedState.steps.find((s) => s.status === "completed")?.result,
      10,
    );
    assert.equal(failedState.childRunIds.length, 2);
    for (const child of failedState.childRunIds) {
      await assert.rejects(e.result(child));
      assert.notEqual((await e.get(child)).status, "running");
    }
    const principal = await e.start("spine", workflows.spine, 3);
    let principalState = await e.get(principal);
    for (let i = 0; !principalState.pendingInputs.length && i < 200; i++) {
      await new Promise((r) => setTimeout(r, 10));
      principalState = await e.get(principal);
    }
    assert.ok(principalState.pendingInputs[0]);
    await e.respond(principal, principalState.pendingInputs[0]!, 1);
    assert.equal(((await e.result(principal)) as { total: number }).total, 15);
  } finally {
    await f.dispose();
  }
}
export function taskHandler(
  task: string,
  input: unknown,
  context: TaskContext,
) {
  if (task === "catalogue")
    return [
      ...new Set(
        z
          .array(z.string())
          .parse(input)
          .map((s) => s.trim().toLowerCase()),
      ),
    ].sort();
  if (["denied", "invalid", "unknown"].includes(task))
    throw new StepFailure(task as "denied");
  if (task === "lost-response") throw new StepFailure("unknown");
  if (task === "fail-once" && context.attempt === 1)
    throw new StepFailure("retryable");
  return z.number().parse(input) * 2;
}

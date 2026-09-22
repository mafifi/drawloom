import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  assertCompleteNodeCheckInventory,
  discoverNodeChecks,
  environmentForNodeCheckLane,
  nodeCheckLanes,
} from "./node-test-lanes.mjs";

const repository = resolve(import.meta.dirname, "..");

test("every maintained node-check file belongs to a declared lane", async () => {
  const discovered = await discoverNodeChecks(repository);
  assert.doesNotThrow(() => assertCompleteNodeCheckInventory(discovered, nodeCheckLanes));
});

test("the default CI lane includes deterministic answer and metrics checks", () => {
  assert.ok(nodeCheckLanes.ci.includes("evaluations/knowledge/answer-evaluation.node-check.ts"));
  assert.ok(nodeCheckLanes.ci.includes("evaluations/knowledge/metrics.node-check.ts"));
});

test("Temporal and installed-model checks stay opt-in", () => {
  assert.deepEqual(nodeCheckLanes.temporal, [
    "apps/desktop/tests/nightloom-orchestration.integration.node-check.mjs",
    "packages/evaluation/evaluation-orchestration/real.test.mjs",
    "packages/orchestration/temporal-orchestration/real.test.mjs",
    "packages/orchestration/temporal-orchestration/installed-host.test.mjs",
    "packages/orchestration/temporal-orchestration/bundled-runtime.test.mjs",
  ]);
  assert.deepEqual(nodeCheckLanes.modelEnabled, [
    "packages/knowledge/local-knowledge-runtime/embedding-conformance.node-check.ts",
  ]);
  assert.ok(nodeCheckLanes.modelEnabled.every((file) => nodeCheckLanes.ci.includes(file)));
  assert.ok(nodeCheckLanes.temporal.every((file) => !nodeCheckLanes.ci.includes(file)));
  assert.deepEqual(
    environmentForNodeCheckLane(
      {
        PATH: "/bin",
        DRAWLOOM_EMBEDDING_CONFORMANCE_ROOT: "/installed/model",
        DRAWLOOM_TEMPORAL_TEST: "1",
      },
      "ci",
    ),
    { PATH: "/bin" },
  );
});

test("the inventory covers .test.mjs, which Vitest does not collect", () => {
  assert.ok(
    nodeCheckLanes.ci.includes("packages/evaluation/braintrust-assessment/offline.test.mjs"),
  );
  assert.ok(nodeCheckLanes.ci.includes("scripts/node-test-lanes.test.mjs"));
  assert.ok(nodeCheckLanes.ci.includes("scripts/packaged-sidecars.test.mjs"));
});

test("inventory rejects an unassigned maintained check", () => {
  assert.throws(
    () =>
      assertCompleteNodeCheckInventory(["packages/example/unassigned.node-check.ts"], {
        ci: [],
        temporal: [],
        modelEnabled: [],
      }),
    /Unassigned maintained Node-lane files: packages\/example\/unassigned\.node-check\.ts/,
  );
});

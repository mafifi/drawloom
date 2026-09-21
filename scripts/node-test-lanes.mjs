import { readdir } from "node:fs/promises";
import { relative, sep } from "node:path";

const ignoredDirectories = new Set([
  ".git",
  ".svelte-kit",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);

export const nodeCheckLanes = Object.freeze({
  ci: Object.freeze([
    "scripts/node-test-lanes.test.mjs",
    "scripts/packaged-sidecars.test.mjs",
    "packages/evaluation/braintrust-assessment/offline.test.mjs",
    "packages/knowledge/sqlite-knowledge/sqlite-knowledge.node-check.ts",
    "packages/knowledge/local-embeddings/llama-worker.node-check.mjs",
    "packages/knowledge/local-knowledge-runtime/runtime.node-check.ts",
    "packages/knowledge/local-knowledge-runtime/semantic.node-check.ts",
    "packages/knowledge/local-knowledge-runtime/embedding-conformance.node-check.ts",
    "evaluations/knowledge/answer-evaluation.node-check.ts",
    "evaluations/knowledge/candidate-runtime.node-check.ts",
    "evaluations/knowledge/evaluation-shutdown.node-check.ts",
    "evaluations/knowledge/metrics.node-check.ts",
    "evaluations/knowledge/runner.node-check.ts",
    "evaluations/knowledge/scale-run.node-check.ts",
  ]),
  // Opt-in: these require a real Temporal server or a deployed runtime, and are
  // executed by the test:temporal and test:temporal:compiled scripts.
  temporal: Object.freeze([
    "apps/desktop/tests/nightloom-orchestration.integration.node-check.mjs",
    "packages/evaluation/evaluation-orchestration/real.test.mjs",
    "packages/orchestration/temporal-orchestration/real.test.mjs",
    "packages/orchestration/temporal-orchestration/installed-host.test.mjs",
    "packages/orchestration/temporal-orchestration/compiled-runtime.test.mjs",
  ]),
  // This file's synthetic checks run in CI. Its installed-model conformance test
  // remains skipped unless DRAWLOOM_EMBEDDING_CONFORMANCE_ROOT is explicitly set.
  modelEnabled: Object.freeze([
    "packages/knowledge/local-knowledge-runtime/embedding-conformance.node-check.ts",
  ]),
});

export async function discoverNodeChecks(repository) {
  const checks = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !ignoredDirectories.has(entry.name)) {
          await visit(`${directory}/${entry.name}`);
        }
        // `.test.mjs` is deliberately excluded from Vitest (it is the real-Node
        // lane), so it must be inventoried here or it runs nowhere at all.
      } else if (
        entry.isFile() &&
        (/\.node-check\.(?:[cm]?[jt]s)$/.test(entry.name) || /\.test\.mjs$/.test(entry.name))
      ) {
        checks.push(relative(repository, `${directory}/${entry.name}`).split(sep).join("/"));
      }
    }
  }
  await visit(repository);
  return checks.sort();
}

export function assertCompleteNodeCheckInventory(discovered, lanes) {
  const assigned = new Set(Object.values(lanes).flat());
  const unassigned = discovered.filter((file) => !assigned.has(file));
  const missing = [...assigned].filter((file) => !discovered.includes(file));
  if (unassigned.length > 0) {
    throw new Error(`Unassigned maintained Node-lane files: ${unassigned.join(", ")}`);
  }
  if (missing.length > 0) {
    throw new Error(`Inventoried Node-lane files do not exist: ${missing.join(", ")}`);
  }
}

export function environmentForNodeCheckLane(environment, lane) {
  const selected = { ...environment };
  if (lane === "ci") {
    delete selected.DRAWLOOM_EMBEDDING_CONFORMANCE_ROOT;
    delete selected.DRAWLOOM_TEMPORAL_TEST;
  }
  return selected;
}

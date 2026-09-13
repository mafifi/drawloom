import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";
import type { AssetLibrary } from "@drawloom/host";
import { createNodeJsonStore } from "@drawloom/node-host";
import {
  matchTaskHandlers,
  type Orchestrator,
  type RegisteredTaskHandler,
  type Registry,
  type RunSnapshot,
  type WorkflowContext,
} from "@drawloom/orchestration";
import { createInstalledEvaluation } from "../../../apps/desktop/host/evaluation-host.js";
import type { Installation } from "../../../apps/desktop/host/plugin-installations.js";
import { loadInstalledPackages, type InstalledWorkflowRegistration } from "../../../apps/desktop/host/plugin-packages.js";
import { createWorkflowAuthority } from "../../../apps/desktop/host/workflow-authority.js";
import { buildKnowledgeEvaluationPackage } from "./build.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

function unusedAssets(): AssetLibrary {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return { open: unused, putStream: unused, read: unused, put: unused };
}

function localOrchestrator(registry: Registry) {
  let handlers: readonly RegisteredTaskHandler[] = [];
  const runs = new Map<string, { snapshot: RunSnapshot; settled: Promise<unknown>; abort: AbortController }>();
  const orchestrator: Orchestrator = {
    async start(identity, workflow, input) {
      const runId = `installed/${identity}`;
      if (runs.has(runId)) return runId;
      const abort = new AbortController();
      const snapshot: RunSnapshot = { runId, identity, workflow: workflow.id, version: workflow.version, status: "running", cancellationRequested: false, childRunIds: [], unresolvedEffects: [], pendingInputs: [], stepsTruncated: false, steps: [] };
      const matched = matchTaskHandlers(registry, handlers);
      const context: WorkflowContext = {
        runId,
        async task(stepId, task, taskInput) {
          const handler = matched.find(item => item.task.id === task.id && item.task.version === task.version);
          if (!handler) throw new Error("Installed evaluation handler unavailable");
          snapshot.steps.push({ stepId, attempts: 1, status: "running" });
          const output = await handler.run(taskInput, { taskVersion: task.version, runId, stepId, attemptId: `${runId}/${stepId}/1`, attempt: 1, signal: abort.signal });
          snapshot.steps[snapshot.steps.length - 1] = { stepId, attempts: 1, status: "completed", result: output };
          return task.output.parse(output);
        },
        child: (_stepId, child, childInput) => child.run(context, childInput),
        async input() { throw new Error("unsupported"); },
        async sleep() {},
      };
      const settled = workflow.run(context, input).then(value => {
        snapshot.status = "completed"; snapshot.output = value as never; return value;
      }, cause => {
        snapshot.status = abort.signal.aborted ? "cancelled" : "failed";
        snapshot.failure = cause instanceof Error ? cause.message : String(cause);
        throw cause;
      });
      runs.set(runId, { snapshot, settled, abort });
      return runId;
    },
    async get(runId) { const value = runs.get(runId); if (!value) throw new Error("run unavailable"); return structuredClone(value.snapshot); },
    async getSteps(runId) { return { steps: (await orchestrator.get(runId)).steps }; },
    async list() { return { runs: [...runs.values()].map(value => structuredClone(value.snapshot)) }; },
    async result(runId) { const value = runs.get(runId); if (!value) throw new Error("run unavailable"); return await value.settled as never; },
    async respond() { throw new Error("unsupported"); },
    async cancel(runId) { const value = runs.get(runId); if (!value) throw new Error("run unavailable"); value.snapshot.cancellationRequested = true; value.abort.abort(); },
  };
  return { orchestrator, attach(value: readonly RegisteredTaskHandler[]) { handlers = value; }, close: async () => { await Promise.allSettled([...runs.values()].map(value => value.settled)); } };
}

test("packed public knowledge consumer executes outside the checkout and preserves project-scoped results and feedback across restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-installed-knowledge-evaluation-")); temporary.push(root);
  await buildKnowledgeEvaluationPackage();
  const archive = join(root, "knowledge-evaluation.tgz");
  const packed = Bun.spawnSync(["bun", "pm", "pack", "--filename", archive, "--quiet"], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
  expect(packed.exitCode, packed.stderr.toString()).toBe(0);
  const packageRoot = join(root, "installed", "consumer");
  await mkdir(packageRoot, { recursive: true });
  const extracted = Bun.spawnSync(["tar", "-xzf", archive, "--strip-components=1", "-C", packageRoot], { stdout: "pipe", stderr: "pipe" });
  expect(extracted.exitCode, extracted.stderr.toString()).toBe(0);
  expect((await realpath(packageRoot)).startsWith(await realpath(import.meta.dir))).toBe(false);
  const fixtureNames = ["corpus.ts", "local-knowledge-mlx-10k.json", "local-knowledge-answers-10k.json"] as const;
  const installedSourceHashes = async () => Promise.all(fixtureNames.map(async name => createHash("sha256").update(await readFile(join(packageRoot, "src", "fixtures", name))).digest("hex")));
  const sourceHashesBefore = await installedSourceHashes();
  expect(sourceHashesBefore).toEqual([
    "70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5",
    "f16b69da282f8a15140c46dc9bddc5630c8ae88e5b49c827cb99c8871ca57d87",
    "90fa306bd1ec4c1668aae70714d37f1007acc7307a7f4a31a9a47efd4b7ad40a",
  ]);

  const installation: Installation = { id: "installed-public-knowledge", root: packageRoot, name: "drawloom-knowledge-evaluation", enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] };
  const authority = createWorkflowAuthority();
  const assessmentScopes: unknown[] = [];
  const assessment: EvaluationAssessmentProvider = {
    async assess(scorer, args, context) {
      assessmentScopes.push({ owner: authority.current(), hasExpected: args.expected !== undefined, outputKind: typeof args.output === "object" && args.output !== null ? (args.output as { kind?: string }).kind : undefined });
      return scorer.score(args, context);
    },
  };

  async function activate(projectId: string) {
    let local: ReturnType<typeof localOrchestrator> | undefined;
    const loaded = await loadInstalledPackages({
      root, project: { id: projectId, directory: root }, installations: [installation], host: { store: createNodeJsonStore(join(root, `host-${projectId}`)), assets: unusedAssets() },
      async prepareWorkflows(_installation, inventory): Promise<InstalledWorkflowRegistration> {
        const registry = (await import(`${pathToFileURL(join(inventory.root, inventory.drawloom!.workflows!.entrypoint)).href}?project=${projectId}&restart=${Date.now()}`)).default as Registry;
        local = localOrchestrator(registry);
        return {
          capabilities: { orchestration: local.orchestrator, orchestrationReadiness: async () => ({ status: "ready" }) },
          attach: async handlers => local!.attach(authority.wrap({ projectId, installationId: installation.id }, handlers, async () => {})),
          close: () => local!.close(),
        };
      },
      prepareEvaluation: (_installation, _inventory, workflow) => createInstalledEvaluation({ dataDirectory: join(root, "evaluation-state"), scope: { installationId: installation.id, projectId }, assessment, ...(workflow ? { workflow } : {}) }),
    });
    expect(loaded.statuses[0]).toMatchObject({ status: "ready", codes: [] });
    return loaded;
  }

  const first = await activate("project-a");
  let resultId: string;
  try {
    const app = first.mcpApps.get("knowledge-evaluation");
    expect(app?.html).toContain("prefers-reduced-motion");
    const opened = await app!.callTool({ name: "evaluation.open", arguments: {} });
    const definitions = (opened.structuredContent as { items: Array<{ ref: { id: string; revision: string } }> }).items;
    const expected = [
      ["knowledge.current.lexical", 24, 3], ["knowledge.current.mlx", 24, 3],
      ["knowledge.historical.lexical", 24, 1], ["knowledge.historical.cpu-qwen", 24, 1], ["knowledge.historical.cpu-nomic", 24, 1],
      ["knowledge.synthetic.c1-chain-omission", 1, 3], ["knowledge.synthetic.x1-stale-only", 1, 3],
    ] as const;
    const resultIds = new Map<string, string>();
    for (const [definitionId, caseCount, findingCount] of expected) {
      const definition = definitions.find(item => item.ref.id === definitionId)!;
      const started = await app!.callTool({ name: "evaluation.request", arguments: { operation: "assess", input: { requestId: `installed-${definitionId}`, definition: definition.ref } } });
      expect(started.structuredContent).toMatchObject({ kind: "started" });
      const evaluationRunId = (started.structuredContent as { evaluationRunId: string }).evaluationRunId;
      let status: { kind: string } = { kind: "running" };
      for (let attempt = 0; attempt < 100 && status.kind === "running"; attempt++) {
        await Bun.sleep(2);
        status = (await app!.callTool({ name: "evaluation.request", arguments: { operation: "status", input: evaluationRunId } })).structuredContent as { kind: string };
      }
      expect(status.kind).toBe("completed");
      const results = await app!.callTool({ name: "evaluation.request", arguments: { operation: "listResults", input: { runId: evaluationRunId, limit: 50 } } });
      const items = (results.structuredContent as { items: Array<{ id: string; status: string; findingCount: number }> }).items;
      expect(items).toHaveLength(caseCount);
      expect(items.every(item => item.status === "completed" && item.findingCount === findingCount)).toBe(true);
      resultIds.set(definitionId, items[0]!.id);
    }
    resultId = resultIds.get("knowledge.current.mlx")!;
    const saved = await app!.callTool({ name: "evaluation.request", arguments: { operation: "saveFeedback", input: { schemaVersion: 1, id: "installed-feedback", resultId, attribution: "public integration test", rating: "correct", correction: "Retained frozen evidence only.", createdAtMs: 1 } } });
    expect(saved.structuredContent).toEqual({ kind: "accepted" });
    expect(assessmentScopes).toHaveLength(222);
    expect(assessmentScopes.every(value => (value as { hasExpected: boolean }).hasExpected)).toBe(true);
    expect(assessmentScopes.filter(value => (value as { outputKind: string }).outputKind === "retrieval")).toHaveLength(150);
    expect(assessmentScopes.filter(value => (value as { outputKind: string }).outputKind === "answer")).toHaveLength(72);
    expect(assessmentScopes[0]).toMatchObject({ owner: { projectId: "project-a", installationId: installation.id, recovering: false } });
    const historical = await app!.callTool({ name: "evaluation.request", arguments: { operation: "getResult", input: resultIds.get("knowledge.historical.cpu-qwen") } });
    expect((historical.structuredContent as { findings: Array<{ id: string }> }).findings.map(item => item.id)).toEqual(["grounded-answer-heuristic"]);
    for (const id of ["knowledge.synthetic.c1-chain-omission", "knowledge.synthetic.x1-stale-only"] as const) {
      const synthetic = await app!.callTool({ name: "evaluation.request", arguments: { operation: "getResult", input: resultIds.get(id) } });
      expect((synthetic.structuredContent as { findings: Array<{ score?: number }> }).findings.some(item => item.score === 0)).toBe(true);
    }
  } finally { await first.close(); }

  const restarted = await activate("project-a");
  try {
    const app = restarted.mcpApps.get("knowledge-evaluation")!;
    const runs = await app.callTool({ name: "evaluation.request", arguments: { operation: "listRuns", input: { limit: 50 } } });
    expect((runs.structuredContent as { items: unknown[] }).items).toHaveLength(7);
    const feedback = await app.callTool({ name: "evaluation.request", arguments: { operation: "listFeedback", input: { resultId: resultId!, limit: 50 } } });
    expect((feedback.structuredContent as { items: Array<{ id: string; attribution: string }> }).items).toEqual([expect.objectContaining({ id: "installed-feedback", attribution: "public integration test" })]);
  } finally { await restarted.close(); }

  const otherProject = await activate("project-b");
  try {
    const app = otherProject.mcpApps.get("knowledge-evaluation")!;
    const runs = await app.callTool({ name: "evaluation.request", arguments: { operation: "listRuns", input: { limit: 50 } } });
    const feedback = await app.callTool({ name: "evaluation.request", arguments: { operation: "listFeedback", input: { limit: 50 } } });
    expect((runs.structuredContent as { items: unknown[] }).items).toEqual([]);
    expect((feedback.structuredContent as { items: unknown[] }).items).toEqual([]);
  } finally { await otherProject.close(); }
  expect(await installedSourceHashes()).toEqual(sourceHashesBefore);
});

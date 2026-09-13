import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";
import type { AssetLibrary } from "@drawloom/host";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createInstalledEvaluation } from "../../../apps/desktop/host/evaluation-host.js";
import type { Installation } from "../../../apps/desktop/host/plugin-installations.js";
import { loadInstalledPackages } from "../../../apps/desktop/host/plugin-packages.js";
import { createWorkflowAuthority } from "../../../apps/desktop/host/workflow-authority.js";
import { buildKnowledgeEvaluationPackage } from "./build.js";

function unusedAssets(): AssetLibrary {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return { open: unused, putStream: unused, read: unused, put: unused };
}

test.skipIf(process.env.DRAWLOOM_TEMPORAL_TEST !== "1")(
  "opt-in real Temporal restores the packed installed knowledge assessment and feedback without repeating scorers",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-installed-knowledge-temporal-"));
    let active: {
      loaded: Awaited<ReturnType<typeof loadInstalledPackages>>;
      manager: ReturnType<typeof createLocalTemporalManager>;
    } | undefined;
    try {
      await buildKnowledgeEvaluationPackage();
      const archive = join(root, "knowledge-evaluation.tgz");
      const packed = Bun.spawnSync(["bun", "pm", "pack", "--filename", archive, "--quiet"], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
      expect(packed.exitCode, packed.stderr.toString()).toBe(0);
      const packageRoot = join(root, "installed", "consumer");
      await mkdir(packageRoot, { recursive: true });
      const extracted = Bun.spawnSync(["tar", "-xzf", archive, "--strip-components=1", "-C", packageRoot], { stdout: "pipe", stderr: "pipe" });
      expect(extracted.exitCode, extracted.stderr.toString()).toBe(0);
      const installation: Installation = { id: "installed-public-knowledge", root: packageRoot, name: "drawloom-knowledge-evaluation", enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] };
      const authority = createWorkflowAuthority();
      let scorerCalls = 0;
      const assessment: EvaluationAssessmentProvider = { async assess(scorer, args, context) { scorerCalls++; return scorer.score(args, context); } };

      async function activate() {
        const manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
        const loaded = await loadInstalledPackages({
          root, project: { id: "project-a", directory: root }, installations: [installation], host: { store: createNodeJsonStore(join(root, "host")), assets: unusedAssets() },
          async prepareWorkflows(_installed, inventory) {
            const registration = await manager.prepare({ projectId: "project-a", installationId: installation.id, packageDirectory: inventory.root, entrypoint: inventory.drawloom!.workflows!.entrypoint });
            return {
              capabilities: { orchestration: registration.orchestrator, orchestrationReadiness: async () => registration.readiness() },
              attach: handlers => registration.attach(authority.wrap({ projectId: "project-a", installationId: installation.id }, handlers, async () => {})),
              close: () => registration.close(),
            };
          },
          prepareEvaluation: (_installed, _inventory, workflow) => createInstalledEvaluation({ dataDirectory: join(root, "evaluation-state"), scope: { installationId: installation.id, projectId: "project-a" }, assessment, ...(workflow ? { workflow } : {}) }),
        });
        expect(loaded.statuses[0]).toMatchObject({ status: "ready", codes: [] });
        return { loaded, manager };
      }

      active = await activate();
      const firstApp = active.loaded.mcpApps.get("knowledge-evaluation")!;
      const opened = await firstApp.callTool({ name: "evaluation.open", arguments: {} });
      const definition = (opened.structuredContent as { items: Array<{ ref: { id: string; revision: string } }> }).items.find(item => item.ref.id === "knowledge.current.mlx")!;
      const readiness = await firstApp.callTool({ name: "evaluation.request", arguments: { operation: "readiness", input: {} } });
      expect(readiness.structuredContent).toEqual({ status: "ready" });
      const started = await firstApp.callTool({ name: "evaluation.request", arguments: { operation: "assess", input: { requestId: "durable-installed-mlx", definition: definition.ref } } });
      expect(started.isError, JSON.stringify(started)).not.toBe(true);
      expect(started.structuredContent).toMatchObject({ kind: "started" });
      const start = started.structuredContent as { evaluationRunId: unknown; orchestrationRunId: unknown };
      expect(typeof start.evaluationRunId, JSON.stringify(started)).toBe("string");
      expect(typeof start.orchestrationRunId, JSON.stringify(started)).toBe("string");
      const evaluationRunId = start.evaluationRunId as string;
      let status: { kind: string } = { kind: "running" };
      for (let attempt = 0; attempt < 800 && status.kind === "running"; attempt++) {
        await Bun.sleep(25);
        const response = await firstApp.callTool({ name: "evaluation.request", arguments: { operation: "status", input: evaluationRunId } });
        expect(response.isError, JSON.stringify(response)).not.toBe(true);
        expect(typeof (response.structuredContent as { kind?: unknown } | undefined)?.kind, JSON.stringify(response)).toBe("string");
        status = response.structuredContent as { kind: string };
      }
      expect(status.kind).toBe("completed");
      expect(scorerCalls).toBe(72);
      const results = await firstApp.callTool({ name: "evaluation.request", arguments: { operation: "listResults", input: { runId: evaluationRunId, limit: 50 } } });
      const resultId = (results.structuredContent as { items: Array<{ id: string }> }).items[0]!.id;
      await firstApp.callTool({ name: "evaluation.request", arguments: { operation: "saveFeedback", input: { schemaVersion: 1, id: "durable-installed-feedback", resultId, attribution: "public real Temporal integration", rating: "correct", createdAtMs: 1 } } });
      await active.loaded.close();
      await active.manager.close();
      active = undefined;

      active = await activate();
      const restartedApp = active.loaded.mcpApps.get("knowledge-evaluation")!;
      const reopened = await restartedApp.callTool({ name: "evaluation.open", arguments: {} });
      const restartedDefinition = (reopened.structuredContent as { items: Array<{ ref: { id: string; revision: string } }> }).items.find(item => item.ref.id === "knowledge.current.mlx")!;
      const reconciled = await restartedApp.callTool({ name: "evaluation.request", arguments: { operation: "assess", input: { requestId: "durable-installed-mlx", definition: restartedDefinition.ref } } });
      expect(reconciled.structuredContent).toMatchObject({ kind: "reconciled", evaluationRunId });
      expect(scorerCalls).toBe(72);
      const feedback = await restartedApp.callTool({ name: "evaluation.request", arguments: { operation: "listFeedback", input: { resultId, limit: 50 } } });
      expect((feedback.structuredContent as { items: Array<{ id: string }> }).items).toEqual([expect.objectContaining({ id: "durable-installed-feedback" })]);
    } finally {
      await active?.loaded.close();
      await active?.manager.close();
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);

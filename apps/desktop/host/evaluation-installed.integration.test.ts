import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";
import { matchTaskHandlers, type Orchestrator, type RegisteredTaskHandler, type Registry, type RunSnapshot, type WorkflowContext } from "@drawloom/orchestration";
import { createNodeJsonStore } from "@drawloom/node-host";
import type { AssetLibrary } from "@drawloom/host";
import type { Installation } from "./plugin-installations.js";
import { createInstalledEvaluation } from "./evaluation-host.js";
import { loadInstalledPackages, type InstalledWorkflowRegistration } from "./plugin-packages.js";
import { createWorkflowAuthority } from "./workflow-authority.js";

function unusedAssets(): AssetLibrary {
  const unused = async (): Promise<never> => { throw Error("unused"); };
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
          if (!handler) throw Error("Installed evaluation handler unavailable");
          snapshot.steps.push({ stepId, attempts: 1, status: "running" });
          const output = await handler.run(taskInput, { taskVersion: task.version, runId, stepId, attemptId: `${runId}/${stepId}/1`, attempt: 1, signal: abort.signal });
          snapshot.steps[snapshot.steps.length - 1] = { stepId, attempts: 1, status: "completed", result: output };
          return task.output.parse(output);
        },
        child: (_stepId, child, childInput) => child.run(context, childInput),
        async input() { throw Error("unsupported"); },
        async sleep() {},
      };
      const settled = workflow.run(context, input).then(value => { snapshot.status = "completed"; snapshot.output = value as never; return value; }, cause => { snapshot.status = abort.signal.aborted ? "cancelled" : "failed"; snapshot.failure = cause instanceof Error ? cause.message : String(cause); throw cause; });
      runs.set(runId, { snapshot, settled, abort });
      return runId;
    },
    async get(runId) { const value = runs.get(runId); if (!value) throw Error("run unavailable"); return structuredClone(value.snapshot); },
    async getSteps(runId) { return { steps: (await orchestrator.get(runId)).steps }; },
    async list() { return { runs: [...runs.values()].map(value => structuredClone(value.snapshot)) }; },
    async result(runId) { const value = runs.get(runId); if (!value) throw Error("run unavailable"); return await value.settled as never; },
    async respond() { throw Error("unsupported"); },
    async cancel(runId) { const value = runs.get(runId); if (!value) throw Error("run unavailable"); value.snapshot.cancellationRequested = true; value.abort.abort(); },
  };
  return { orchestrator, attach(value: readonly RegisteredTaskHandler[]) { handlers = value; }, close: async () => { await Promise.allSettled([...runs.values()].map(value => value.settled)); } };
}

const backendSource = `
const definition={schemaVersion:1,id:'installed-check',revision:'r1',name:'Installed check',mode:'assess_existing',scorers:[{id:'exact',revision:'r1'}],cases:[{id:'case-a',revision:'r1',input:'answer',expected:'answer',suppliedOutput:'answer',references:[]}]};
export default context=>{
  const exact={id:'exact',revision:'r1',input:{parse:value=>value},output:{parse:value=>value},expected:{parse:value=>value},async score(args){return{outcome:'succeeded',findings:[{id:'exact',name:'Exact',outcome:'scored',score:args.output===args.expected?1:0,references:[]}]}}};
  const composition=context.capabilities.evaluation.compose({scorers:[exact]});
  let closed=false;
  const transport={
    async start(){}, async close(){closed=true; transport.onclose?.();},
    async send(message){
      const respond=async()=>{if(closed)return; let result;
        if(message.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{},resources:{}},serverInfo:{name:'installed-evaluation',version:'1'}};
        else if(message.method==='notifications/initialized')return;
        else if(message.method==='tools/list')result={tools:[
          {name:'open',title:'Open evaluation',inputSchema:{type:'object'},_meta:{ui:{resourceUri:'ui://evaluation/view.html'}}},
          {name:'start',title:'Start evaluation',inputSchema:{type:'object'},_meta:{ui:{visibility:['app']}}},
          {name:'status',title:'Evaluation status',inputSchema:{type:'object'},_meta:{ui:{visibility:['app']}}},
          {name:'results',title:'Evaluation results',inputSchema:{type:'object'},_meta:{ui:{visibility:['app']}}}
        ]};
        else if(message.method==='resources/read')result={contents:[{uri:'ui://evaluation/view.html',mimeType:'text/html;profile=mcp-app',text:'<main>Installed evaluation</main>'}]};
        else if(message.method==='resources/list')result={resources:[]};
        else if(message.method==='tools/call'){
          const name=message.params.name,args=message.params.arguments??{};
          const value=name==='open'?await composition.service.listDefinitions({limit:50}):name==='start'?await composition.service.assess({requestId:args.requestId,definition}):name==='status'?await composition.service.status(args.runId):name==='results'?await composition.service.listResults({runId:args.runId,limit:50}):null;
          result={content:[{type:'text',text:name}],structuredContent:value};
        } else result={};
        if(message.id!==undefined)transport.onmessage?.({jsonrpc:'2.0',id:message.id,result});
      }; queueMicrotask(()=>void respond().catch(error=>transport.onerror?.(error)));
    }
  };
  return {contributions:{workbenches:[{id:'evaluation',title:'Evaluation',description:'Installed evaluation',tools:[],skills:[]}],views:[{id:'evaluation-view',workbenchId:'evaluation',title:'Evaluation',entrypoint:'ui://evaluation/view.html'}]},servers:[{name:'evaluation',transport}],taskHandlers:composition.taskHandlers,dispose(){}};
};`;

test("trusted installed evaluation executes through attached authority-wrapped handlers and standard MCP App tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-installed-evaluation-"));
  const packageRoot = join(root, "consumer");
  const authority = createWorkflowAuthority();
  const observedOwners: unknown[] = [];
  const assessment: EvaluationAssessmentProvider = {
    async assess(scorer, args, context) { observedOwners.push(authority.current()); return scorer.score(args, context); },
  };
  try {
    await mkdir(join(packageRoot, "org.drawloom"), { recursive: true });
    const workflowUrl = pathToFileURL(join(process.cwd(), "packages/evaluation/evaluation-orchestration/dist/index.js")).href;
    await writeFile(join(packageRoot, "plugin.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "installed-evaluation", extensions: { "org.drawloom": { version: 1, backend: { entrypoint: "./org.drawloom/backend.mjs" }, workflows: { entrypoint: "./org.drawloom/workflows.mjs" }, requires: [{ kind: "capability", id: "evaluation" }], optional: [{ kind: "capability", id: "orchestration" }], workbenches: [{ id: "evaluation", title: "Evaluation", openingTool: { server: "evaluation", tool: "open" } }] } } }));
    await writeFile(join(packageRoot, "mcp.json"), JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: {} }));
    await writeFile(join(packageRoot, "org.drawloom", "workflows.mjs"), `export { evaluationRegistry as default } from ${JSON.stringify(workflowUrl)};`);
    await writeFile(join(packageRoot, "org.drawloom", "backend.mjs"), backendSource);
    const installation: Installation = { id: "installed-consumer", root: packageRoot, name: "installed-evaluation", enabled: true, trustedBackend: true, servers: [], configuration: {}, approvedResourceOrigins: [], elicitationDisabledServers: [] };
    let local: ReturnType<typeof localOrchestrator> | undefined;
    const loaded = await loadInstalledPackages({ root, project: { id: "project-a", directory: root }, installations: [installation], host: { store: createNodeJsonStore(join(root, "state")), assets: unusedAssets() },
      async prepareWorkflows(_installation, inventory): Promise<InstalledWorkflowRegistration> {
        const registry = (await import(pathToFileURL(join(inventory.root, inventory.drawloom!.workflows!.entrypoint)).href)).default as Registry;
        local = localOrchestrator(registry);
        return { capabilities: { orchestration: local.orchestrator, orchestrationReadiness: async () => ({ status: "ready" }) },
          attach: async handlers => local!.attach(authority.wrap({ projectId: "project-a", installationId: installation.id }, handlers, async () => {})), close: () => local!.close() };
      },
      prepareEvaluation: (_installation, _inventory, workflow) => createInstalledEvaluation({ dataDirectory: root, scope: { installationId: installation.id, projectId: "project-a" }, assessment, ...(workflow ? { workflow } : {}) }),
    });
    try {
      expect(loaded.statuses[0]).toMatchObject({ status: "ready", codes: [] });
      const app = loaded.mcpApps.get("evaluation");
      expect(app?.html).toContain("Installed evaluation");
      expect(observedOwners).toEqual([]);
      const opened = await app!.callTool({ name: "open", arguments: {} });
      expect(opened.structuredContent).toEqual({ items: [], hasMore: false });
      const started = await app!.callTool({ name: "start", arguments: { requestId: "installed-request" } });
      const start = started.structuredContent as { evaluationRunId: string };
      let status: { kind: string } = { kind: "running" };
      for (let attempt = 0; attempt < 20 && status.kind === "running"; attempt++) {
        await Bun.sleep(1);
        status = (await app!.callTool({ name: "status", arguments: { runId: start.evaluationRunId } })).structuredContent as { kind: string };
      }
      expect(status.kind).toBe("completed");
      const page = (await app!.callTool({ name: "results", arguments: { runId: start.evaluationRunId } })).structuredContent as { items: Array<{ findingCount: number; status: string }> };
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ findingCount: 1, status: "completed" });
      expect(observedOwners).toEqual([{ projectId: "project-a", installationId: installation.id, runId: expect.any(String), stepId: expect.stringContaining("scorer"), attemptId: expect.any(String), recovering: false, signal: expect.any(AbortSignal) }]);
    } finally { await loaded.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

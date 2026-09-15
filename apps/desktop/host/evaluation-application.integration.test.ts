import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RegisteredTaskHandler } from "@drawloom/orchestration";
import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createDesktopApplication } from "./application.js";
import { createInstallationStore } from "./plugin-installations.js";

test("controllerless installed evaluation tasks run while protected tools remain denied", async () => {
  const base = await mkdtemp(join(tmpdir(), "drawloom-controllerless-evaluation-"));
  const root = join(base, "data");
  const packageRoot = join(base, "package");
  await mkdir(root);
  await mkdir(join(packageRoot, "org.drawloom"), { recursive: true });
  let remoteCalls = 0;
  const remote = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = (await request.json()) as { id?: number; method: string };
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result =
        message.method === "initialize"
          ? {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "remote", version: "1" },
            }
          : message.method === "tools/list"
            ? { tools: [{ name: "inspect", inputSchema: { type: "object" } }] }
            : (remoteCalls++, { content: [{ type: "text", text: "unexpected" }] });
      return Response.json({ jsonrpc: "2.0", id: message.id, result });
    },
  });
  const handlers = new Map<string, readonly RegisteredTaskHandler[]>();
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    async prepare(owner) {
      return {
        registry: { workflows: [], tasks: [] },
        readiness: () => ({ status: "ready" }),
        orchestrator: {
          start: async () => "unused",
          get: async () => {
            throw Error("unused");
          },
          getSteps: async () => ({ steps: [] }),
          list: async () => ({ runs: [] }),
          respond: async () => {},
          cancel: async () => {},
          result: async () => ({}),
        },
        attach: async (values) => {
          handlers.set(owner.projectId, values);
        },
        close: async () => {},
      };
    },
    prepareHost: async () => {
      throw Error("unused");
    },
    listHostOwners: async () => [],
    listOwners: async () => [],
    hasUnfinishedInstallation: async () => false,
    close: async () => {},
  };
  try {
    await writeFile(
      join(packageRoot, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "controllerless-evaluation",
        extensions: {
          "org.drawloom": {
            version: 1,
            backend: { entrypoint: "./org.drawloom/backend.mjs" },
            workflows: { entrypoint: "./org.drawloom/workflows.mjs" },
            requires: [
              { kind: "capability", id: "host" },
              { kind: "capability", id: "tools" },
              { kind: "capability", id: "evaluation" },
            ],
            optional: [{ kind: "capability", id: "orchestration" }],
            workbenches: [
              {
                id: "evaluation",
                title: "Evaluation",
                openingTool: { server: "remote", tool: "inspect" },
              },
            ],
          },
        },
      }),
    );
    await writeFile(
      join(packageRoot, "mcp.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { remote: { type: "streamable-http", url: remote.url.href } },
      }),
    );
    await writeFile(
      join(packageRoot, "org.drawloom", "workflows.mjs"),
      "export default {workflows:[],tasks:[]}",
    );
    await writeFile(
      join(packageRoot, "org.drawloom", "backend.mjs"),
      `
      export default async ({capabilities}) => ({
        contributions: {workbenches: [{id: 'evaluation', title: 'Evaluation', description: '', tools: [], skills: []}]},
        taskHandlers: [
          {id: 'evaluation.plan', version: '1', run: async () => ({status: 'planned'})},
          {id: 'evaluation.protected', version: '1', run: async (_input, context) => {
            const binding = capabilities.tools.bind(context.runId);
            try { return await capabilities.tools.invoke(binding, 'package:controllerless-evaluation:remote:inspect', {}, context.signal); }
            finally { capabilities.tools.revoke(binding); }
          }},
        ],
        dispose: async () => {},
      });
    `,
    );
    const installations = await createInstallationStore(createNodeJsonStore(join(root, "state")));
    const installationId = await installations.add(packageRoot);
    await installations.configure(installationId, {
      enabled: true,
      trustedBackend: true,
      servers: ["remote"],
      configuration: {},
    });
    const app = await createDesktopApplication(root, {
      evaluation: {
        assessment: { assess: (scorer, args, context) => scorer.score(args, context) },
      },
      orchestration: { manager: async () => manager },
    });
    try {
      const directory = join(base, "project");
      await mkdir(directory);
      const snapshot = await app.command({ kind: "add_project", directory });
      const projectHandlers = handlers.get(snapshot.selectedProjectId!);
      expect(projectHandlers).toBeDefined();
      const context = {
        runId: "evaluation-run",
        stepId: "plan",
        attemptId: "attempt",
        attempt: 1,
        taskVersion: "1",
        signal: new AbortController().signal,
      };
      const plan = projectHandlers!.find((handler) => handler.id === "evaluation.plan");
      expect(await plan!.run({}, context)).toEqual({ status: "planned" });
      const protectedTask = projectHandlers!.find(
        (handler) => handler.id === "evaluation.protected",
      );
      expect(
        await protectedTask!.run({}, { ...context, stepId: "protected", attemptId: "protected" }),
      ).toMatchObject({ outcome: { status: "failed", code: "denied" } });
      expect(remoteCalls).toBe(0);
    } finally {
      await app.close();
    }
  } finally {
    remote.stop(true);
    await rm(base, { recursive: true, force: true });
  }
});

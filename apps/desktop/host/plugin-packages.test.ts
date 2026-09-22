import { toolAuthorizationFixture } from "@drawloom/tools/conformance";
import { test, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, realpath, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createInstallationStore } from "./plugin-installations.js";
import { loadInstalledPackages } from "./plugin-packages.js";
import type { DrawloomPackageExtension } from "@drawloom/plugins";
import type { Installation } from "./plugin-installations.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { createTestDesktopApplication as createDesktopApplication } from "./test-project.fixture.js";
import { createPluginRegistry } from "@drawloom/startup-plugins";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createElicitationPresenter } from "./elicitation.js";
import type { AssetLibrary } from "@drawloom/host";
import { createSqliteEvaluationStore } from "@drawloom/sqlite-evaluation";
import { setTimeout as sleep } from "node:timers/promises";
import { serve } from "@hono/node-server";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

function unusedAssets(): AssetLibrary {
  const unused = async (): Promise<never> => {
    throw Error("unused");
  };
  return { open: unused, putStream: unused, read: unused, put: unused };
}

test("installed package branding reaches discovery without replacing plugin identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-package-branding-"));
  let app = await createDesktopApplication(root);
  try {
    const pkg = join(root, "branded");
    await mkdir(pkg);
    await writeFile(
      join(pkg, "icon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    );
    await writeFile(
      join(pkg, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "test-brand",
        extensions: {
          "org.drawloom": {
            version: 1,
            presentation: { displayName: "Public Test Plugin", icon: { light: "./icon.svg" } },
          },
        },
      }),
    );
    await app.packageAction({ action: "add", root: pkg });
    const installed = (await app.installedPackages()).find((item) => item.name === "test-brand")!;
    await app.packageAction({
      action: "configure",
      id: installed.id,
      settings: { enabled: true, trustedBackend: false, servers: [] },
    });
    await app.close();
    app = await createDesktopApplication(root);
    const catalogue = await app.discover((await app.snapshot()).selectedId);
    const entry = catalogue.entries.find(
      (e) => e.presentation?.displayName === "Public Test Plugin",
    );
    expect(entry?.presentation?.icon?.light?.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(entry?.name?.startsWith("package:")).toBe(true);
    expect(entry?.selectable).toBe(false);
  } finally {
    await app.close();
    await rm(root, { recursive: true });
  }
});

test("desktop package activation shares installation setup and binds each project independently", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "drawloom-installed-binding-")));
  try {
    const installation = await installedFixture(
      root,
      "shared-documents",
      "https://example.com/mcp",
    );
    await writeFile(
      join(installation.root, "mcp.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: { remote: { type: "stdio", command: "node", args: ["./server.mjs"] } },
      }),
    );
    await writeFile(
      join(installation.root, "server.mjs"),
      `import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
writeFileSync(process.env.PLUGIN_DATA + '/binding.json', JSON.stringify({ configuration: process.env.DRAWLOOM_PLUGIN_CONFIG_DIR, project: process.env.DRAWLOOM_PROJECT_DIR }));
createInterface({input:process.stdin}).on('line', line => { const m=JSON.parse(line); if(m.id===undefined)return; const result=m.method==='initialize'?{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}:{tools:[]}; process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n'); });`,
    );
    for (const id of ["first", "second", "first"]) {
      const directory = join(root, id);
      await mkdir(directory, { recursive: true });
      const loaded = await loadInstalledPackages({
        root: directory,
        installationRoot: root,
        project: { id, directory },
        installations: [installation],
        host: packageHost(directory),
      });
      try {
        expect(
          JSON.parse(
            await readFile(join(directory, "plugins", installation.id, "binding.json"), "utf8"),
          ),
        ).toEqual({ configuration: join(root, "plugins", installation.id), project: directory });
      } finally {
        await loaded.close();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function packageServer(
  label = "owner",
  tools: Tool[] = [
    {
      name: "open",
      inputSchema: { type: "object" },
      _meta: { ui: { resourceUri: "ui://owner/view.html" } },
    },
  ],
  resource?: { revision: number; text: string },
) {
  const events: string[] = [];
  const handshakes: unknown[] = [];
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = (await request.json()) as {
        method: string;
        id?: number;
        params?: { uri?: string; name?: string; capabilities?: unknown };
      };
      events.push(message.method);
      if (message.method === "initialize") handshakes.push(message.params?.capabilities);
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result =
        message.method === "initialize"
          ? {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {}, resources: {} },
              serverInfo: { name: label, version: "1" },
            }
          : message.method === "tools/list"
            ? { tools }
            : message.method === "resources/list"
              ? {
                  resources: resource
                    ? [
                        {
                          uri: "doc://reference",
                          name: "Reference",
                          description: `Revision ${resource.revision}`,
                        },
                      ]
                    : [{ uri: "doc://example", name: "Example", mimeType: "text/plain" }],
                }
              : message.method === "resources/read"
                ? {
                    contents: [
                      {
                        uri: message.params!.uri,
                        mimeType: resource ? "text/plain" : "text/html;profile=mcp-app",
                        text: resource?.text ?? `<p>${label}</p>`,
                      },
                    ],
                  }
                : { content: [{ type: "text", text: `${label}:${message.params?.name}` }] };
      return Response.json({ jsonrpc: "2.0", id: message.id, result });
    },
  });
  await once(server, "listening");
  const serverUrl = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  return { server, serverUrl, events, handshakes };
}

test("installed connection policy survives reconnect without affecting consent-enabled peers", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-policy-reconnect-"));
  const remote = await packageServer("documents", [
    { name: "inspect", inputSchema: { type: "object" } },
  ]);
  try {
    const parallel = await installedFixture(root, "parallel-documents", remote.serverUrl.href);
    parallel.elicitationDisabledServers = ["remote"];
    const consent = await installedFixture(root, "consent-documents", remote.serverUrl.href);
    const loaded = await loadInstalledPackages({
      root,
      installations: [parallel, consent],
      host: packageHost(root),
      elicitation: async () => ({ action: "cancel" }),
    });
    try {
      expect(remote.handshakes).toHaveLength(2);
      expect(remote.handshakes[0]).not.toHaveProperty("elicitation");
      expect(remote.handshakes[1]).toHaveProperty("elicitation");
      await loaded.reconnect(parallel.id, "remote");
      expect(remote.handshakes[2]).not.toHaveProperty("elicitation");
      expect(remote.events.filter((event) => event === "tools/call")).toHaveLength(0);
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});
async function installedFixture(
  root: string,
  name: string,
  url: string,
  extension?: DrawloomPackageExtension,
  ownsView = false,
) {
  const pkg = join(root, name);
  await mkdir(join(pkg, "org.drawloom"), { recursive: true });
  await writeFile(
    join(pkg, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name,
      ...(extension ? { extensions: { "org.drawloom": extension } } : {}),
    }),
  );
  await writeFile(
    join(pkg, "mcp.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { remote: { type: "streamable-http", url } },
    }),
  );
  if (extension?.backend) {
    const contribution = ownsView
      ? {
          workbenches: [{ id: "owner", title: "Owner", description: "", tools: [], skills: [] }],
          views: [
            {
              id: "owner-view",
              workbenchId: "owner",
              title: "Owner view",
              entrypoint: "ui://owner/view.html",
            },
          ],
        }
      : {};
    await mkdir(join(pkg, "org.drawloom"), { recursive: true });
    await writeFile(
      join(pkg, "org.drawloom", "backend.mjs"),
      `export default () => ({ contributions: ${JSON.stringify(contribution)}, dispose() {} });`,
    );
  }
  const installation: Installation = {
    approvedResourceOrigins: [],
    elicitationDisabledServers: [],
    id: crypto.randomUUID(),
    root: pkg,
    name,
    enabled: true,
    trustedBackend: true,
    servers: ["remote"],
    configuration: {},
  };
  return installation;
}
function packageHost(root: string) {
  return { store: createNodeJsonStore(join(root, "state")), assets: unusedAssets() };
}
const ownerPlacement = {
  id: "owner",
  title: "Owner",
  openingTool: { server: "remote", tool: "open" },
};

test("installed evaluation prepares only for trusted declared consumers and survives unavailable orchestration", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-evaluation-loading-"));
  const remote = await packageServer();
  const events: string[] = [];
  try {
    const installation = await installedFixture(
      root,
      "evaluation-documents",
      remote.serverUrl.href,
      {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workflows: { entrypoint: "./org.drawloom/workflows.mjs" },
        requires: [{ kind: "capability", id: "evaluation" }],
        optional: [{ kind: "capability", id: "orchestration" }],
      },
    );
    await writeFile(
      join(installation.root, "org.drawloom", "workflows.mjs"),
      "export default {workflows:[],tasks:[]}",
    );
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default context => {
      if (!context.capabilities.evaluation || context.capabilities.orchestration) throw Error('Incorrect capabilities');
      return {taskHandlers:[],dispose(){}};
    }`,
    );
    const base = {
      root,
      project: { id: "project-a", directory: root },
      installations: [installation],
      host: packageHost(root),
      prepareWorkflows: async () => {
        events.push("workflow");
        return {
          capabilities: {},
          attach: async () => {
            events.push("attach");
          },
          close: async () => {
            events.push("stop");
          },
        };
      },
      prepareEvaluation: async () => {
        events.push("evaluation");
        return {
          evaluation: {
            compose() {
              throw Error("No composition during discovery");
            },
          },
          close: async () => {
            events.push("storage-close");
          },
        };
      },
    };
    const untrusted = await loadInstalledPackages({
      ...base,
      installations: [{ ...installation, trustedBackend: false }],
    });
    await untrusted.close();
    expect(events).toEqual([]);
    const unrelated = await installedFixture(root, "unrelated-documents", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
    });
    const undeclared = await loadInstalledPackages({ ...base, installations: [unrelated] });
    await undeclared.close();
    expect(events).toEqual([]);
    const loaded = await loadInstalledPackages(base);
    try {
      expect(events).toEqual(["workflow", "evaluation", "attach"]);
      expect(loaded.statuses[0]?.codes).not.toContain("extension:unavailable");
      expect(loaded.statuses[0]?.codes).not.toContain("backend:backend_activation_failed");
    } finally {
      await loaded.close();
    }
    expect(events).toEqual(["workflow", "evaluation", "attach", "stop", "storage-close"]);
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("failed backend activation releases its prepared evaluation immediately and only once", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-evaluation-failed-backend-"));
  const remote = await packageServer();
  let closes = 0;
  try {
    const installation = await installedFixture(root, "failed-evaluation", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires: [{ kind: "capability", id: "evaluation" }],
    });
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default context => { context.capabilities.evaluation.compose({scorers:[]}); throw Error('activation failed'); };`,
    );
    const loaded = await loadInstalledPackages({
      root,
      project: { id: "project-a", directory: root },
      installations: [installation],
      host: packageHost(root),
      prepareEvaluation: async () => ({
        evaluation: {
          compose() {
            return { service: {}, taskHandlers: [] };
          },
        } as never,
        close: async () => {
          closes++;
        },
      }),
    });
    expect(loaded.statuses[0]).toMatchObject({
      status: "partial",
      codes: expect.arrayContaining(["backend:failed"]),
    });
    expect(closes).toBe(1);
    await loaded.close();
    expect(closes).toBe(1);
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("installed workflow preparation is trusted, precedes backend activation, and closes before backend cleanup", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-workflow-loading-"));
  const remote = await packageServer();
  const events: string[] = [];
  try {
    const installation = await installedFixture(root, "workflow-documents", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      workflows: { entrypoint: "./org.drawloom/workflows.mjs" },
      optional: [{ kind: "capability", id: "orchestration" }],
    });
    await writeFile(
      join(installation.root, "org.drawloom", "workflows.mjs"),
      "export default {workflows:[],tasks:[]}",
    );
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default async context => {
      if (!context.capabilities.orchestrationReadiness) throw Error('Missing readiness');
      return {taskHandlers:[],dispose(){}};
    }`,
    );
    const base = {
      root,
      project: { id: "project-a", directory: root },
      installations: [installation],
      host: packageHost(root),
      prepareWorkflows: async () => {
        events.push("prepare");
        return {
          capabilities: {
            orchestrationReadiness: async () => ({
              status: "configuration_required" as const,
              code: "missing_cli",
              message: "Install Temporal.",
            }),
          },
          attach: async (handlers: readonly unknown[]) => {
            expect(handlers).toEqual([]);
            events.push("attach");
          },
          close: async () => {
            events.push("close");
          },
        };
      },
    };
    const untrusted = await loadInstalledPackages({
      ...base,
      installations: [{ ...installation, trustedBackend: false }],
    });
    expect(events).toEqual([]);
    await untrusted.close();
    const trusted = await loadInstalledPackages(base);
    expect(events).toEqual(["prepare", "attach"]);
    expect(trusted.statuses[0]?.codes).not.toContain("backend:failed");
    await trusted.close();
    expect(events).toEqual(["prepare", "attach", "close"]);
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop discovery shows friendly standard and app-only tools without executing them", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-package-discovery-"));
  const remote = await packageServer("documents", [
    { name: "inspect", title: "Inspect document", inputSchema: { type: "object" } },
    {
      name: "save",
      title: "Save draft",
      inputSchema: { type: "object" },
      _meta: { ui: { visibility: ["app"] } },
    },
  ]);
  try {
    const installation = await installedFixture(root, "documents", remote.serverUrl.href);
    const store = createNodeJsonStore(join(root, "state"));
    await store.set("plugin-installations", { version: 1, installations: [installation] });
    const app = await createDesktopApplication(root);
    try {
      const catalogue = await app.discover((await app.snapshot()).selectedId);
      expect(catalogue.entries.find((e) => e.name === "Inspect document")).toMatchObject({
        kind: "tool",
        availability: "available",
      });
      expect(catalogue.entries.find((e) => e.name === "Save draft")).toMatchObject({
        kind: "tool",
        scope: "app-only",
        selectable: false,
      });
      const snapshot = await app.snapshot();
      const installedTool = snapshot.toolLabels.find(
        (label) => label.title === "Inspect document" && label.origin === "documents / remote",
      );
      const grant = snapshot.operator.grants.find((g) => g.toolName === installedTool?.toolName);
      expect(grant).toBeDefined();
      expect(snapshot.toolLabels).toContainEqual({
        toolName: grant!.toolName,
        title: "Inspect document",
        origin: "documents / remote",
      });
      expect(remote.events).not.toContain("tools/call");
    } finally {
      await app.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("desktop supplies scoped saved evaluation to installed backends across restart without running checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-desktop-evaluation-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(root, "evaluation-reader", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires: [{ kind: "capability", id: "evaluation" }],
    });
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default async context=>{
      const {service}=context.capabilities.evaluation.compose({scorers:[]});
      const page=await service.listDefinitions();
      return {contributions:{skills:[{id:'saved-checks',title:'Saved checks '+page.items.length,instructions:'Inspect saved checks only.'}]},dispose(){}};
    }`,
    );
    await createNodeJsonStore(join(root, "state")).set("plugin-installations", {
      version: 1,
      installations: [installation],
    });
    const app = await createDesktopApplication(root);
    let projectId: string;
    try {
      const snapshot = await app.snapshot();
      projectId = snapshot.projects[0]!.id;
      const catalogue = await app.discover(snapshot.selectedId);
      expect(
        catalogue.entries.find((e) => e.name === `package:${installation.id}:backend`)?.presentation
          ?.displayName,
      ).toBe("Evaluation reader services");
      expect(catalogue.entries.some((e) => e.kind === "skill" && e.name === "Saved checks 0")).toBe(
        true,
      );
      expect(remote.events).not.toContain("tools/call");
    } finally {
      await app.close();
    }
    const saved = createSqliteEvaluationStore({
      dataDirectory: root,
      scope: { installationId: installation.id, projectId },
    });
    try {
      await saved.saveDefinition({
        schemaVersion: 1,
        id: "prior",
        revision: "1",
        name: "Prior assessment",
        mode: "assess_existing",
        scorers: [{ id: "check", revision: "1" }],
        cases: [{ id: "one", revision: "1", input: null, suppliedOutput: "saved", references: [] }],
      });
    } finally {
      await saved.close();
    }
    const reopened = await createDesktopApplication(root);
    try {
      const catalogue = await reopened.discover((await reopened.snapshot()).selectedId);
      expect(catalogue.entries.some((e) => e.kind === "skill" && e.name === "Saved checks 1")).toBe(
        true,
      );
      expect(remote.events).not.toContain("tools/call");
    } finally {
      await reopened.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("backend collision with built-in workbench is isolated without losing standard skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-reserved-workbench-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(root, "collision", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
    });
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default () => ({ contributions: {workbenches: [{id:'text', title:'Hijack',description:'',tools:[],skills:[]}]},dispose(){}})`,
    );
    await mkdir(join(installation.root, "skills", "editing"), { recursive: true });
    await writeFile(
      join(installation.root, "skills", "editing", "SKILL.md"),
      "---\nname: editing\ndescription: Edit a document\n---\nCheck clarity.",
    );
    await createNodeJsonStore(join(root, "state")).set("plugin-installations", {
      version: 1,
      installations: [installation],
    });
    const app = await createDesktopApplication(root);
    try {
      expect((await app.packageStatuses())[0]?.codes).toContain("backend:invalid-contribution");
      const catalogue = await app.discover((await app.snapshot()).selectedId);
      expect(catalogue.entries.some((e) => e.kind === "skill" && e.name === "editing")).toBe(true);
    } finally {
      await app.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("installed HTTP package tools present standard elicitation only after independent gateway grant", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-package-forms-"));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  const mcp = new McpServer({ name: "stationery", version: "1" });
  let calls = 0,
    presentations = 0;
  mcp.registerTool("choose", { inputSchema: {} }, async (_args, extra) => {
    calls++;
    const answer = await mcp.server.elicitInput(
      {
        mode: "form",
        message: "Choose paper",
        requestedSchema: {
          type: "object",
          properties: { paper: { type: "string", enum: ["plain", "lined"] } },
          required: ["paper"],
        },
      },
      { relatedRequestId: extra.requestId },
    );
    return { content: [{ type: "text", text: JSON.stringify(answer) }] };
  });
  await mcp.connect(transport);
  const http = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request) => transport.handleRequest(request),
  });
  await once(http, "listening");
  const httpUrl = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/`);
  try {
    const installation = await installedFixture(root, "stationery", httpUrl.href);
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
      elicitation: async (request) => {
        presentations++;
        expect(request.operationId).toBe("operation");
        expect(request.source).toBe(`package:${installation.id}:remote`);
        return { action: "accept", content: { paper: "plain" } };
      },
    });
    try {
      const registry = createPluginRegistry(loaded.installs, ["agent", "host"]);
      const tools = registry.tools;
      let allowed = false;
      const gateway = createLocalToolGateway({
        tools,
        authorization: toolAuthorizationFixture({ authorize: async () => ({ decision: allowed }) }),
        nextInvocationId: () => crypto.randomUUID(),
        evidence: { record: async () => {} },
      });
      const binding = gateway.bind("operation"),
        signal = new AbortController().signal;
      const name = [...loaded.toolIds][0]!;
      expect((await gateway.invoke(binding, name, {}, signal)).outcome).toMatchObject({
        status: "failed",
        code: "denied",
      });
      expect(calls).toBe(0);
      expect(presentations).toBe(0);
      allowed = true;
      expect((await gateway.invoke(binding, name, {}, signal)).outcome).toMatchObject({
        status: "ok",
        text: '{"action":"accept","content":{"paper":"plain"}}',
      });
      expect(calls).toBe(1);
      expect(presentations).toBe(1);
    } finally {
      await loaded.close();
    }
  } finally {
    await mcp.close();
    http.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reconnected package cancellation removes its form and exposes the replacement connection retirement", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-package-reconnect-form-"));
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  const servers: McpServer[] = [];
  const shown = Promise.withResolvers<void>();
  const presenter = createElicitationPresenter((operation) =>
    operation === "operation" ? "conversation" : undefined,
  );
  const http = serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      let transport = transports.get(request.headers.get("mcp-session-id") ?? "");
      if (!transport) {
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
        });
        const mcp = new McpServer({ name: "stationery", version: "1" });
        mcp.registerTool("choose", { inputSchema: {} }, async (_args, extra) => {
          const answer = await mcp.server.elicitInput(
            {
              mode: "form",
              message: "Choose paper",
              requestedSchema: {
                type: "object",
                properties: { paper: { type: "string", enum: ["plain", "lined"] } },
                required: ["paper"],
              },
            },
            { relatedRequestId: extra.requestId, signal: extra.signal },
          );
          return { content: [{ type: "text", text: JSON.stringify(answer) }] };
        });
        await mcp.connect(transport);
        servers.push(mcp);
      }
      const response = await transport.handleRequest(request);
      if (transport.sessionId) transports.set(transport.sessionId, transport);
      return response;
    },
  });
  await once(http, "listening");
  const httpUrl = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/`);
  try {
    const installation = await installedFixture(root, "stationery", httpUrl.href);
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
      elicitation: (request, signal) => {
        const result = presenter.request(request, signal);
        shown.resolve();
        return result;
      },
    });
    try {
      await loaded.disconnect(installation.id, "remote");
      expect(await loaded.reconnect(installation.id, "remote")).toEqual({ restartRequired: false });
      expect(loaded.statuses[0]?.servers[0]?.status).toBe("connected");
      const registry = createPluginRegistry(loaded.installs, ["agent", "host"]);
      const gateway = createLocalToolGateway({
        tools: registry.tools,
        authorization: toolAuthorizationFixture(),
        nextInvocationId: () => "invocation",
        evidence: { record: async () => {} },
      });
      const abort = new AbortController();
      const result = gateway.invoke(
        gateway.bind("operation"),
        [...loaded.toolIds][0]!,
        {},
        abort.signal,
      );
      await shown.promise;
      expect(presenter.pending("conversation")).toHaveLength(1);
      abort.abort();
      expect((await result).outcome).toMatchObject({ status: "failed", code: "cancelled" });
      expect(presenter.pending("conversation")).toEqual([]);
      // StreamableHTTP close includes its asynchronous session DELETE.
      for (
        let attempts = 0;
        attempts < 100 && loaded.statuses[0]?.servers[0]?.status === "connected";
        attempts++
      )
        await sleep(5);
      expect(loaded.statuses[0]?.servers[0]).toMatchObject({
        name: "remote",
        status: "failed",
        code: "connection-closed",
      });
    } finally {
      await loaded.close();
    }
  } finally {
    await Promise.all(servers.map((server) => server.close()));
    http.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("standard resource discovery is cached and source-bound without executing tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-package-resources-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(root, "resources", remote.serverUrl.href);
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
    });
    try {
      const first = await loaded.discoverResources();
      expect(first.entries).toHaveLength(1);
      expect((await loaded.discoverResources()).entries).toEqual(first.entries);
      expect(remote.events.filter((e) => e === "resources/list")).toHaveLength(1);
      expect(remote.events).not.toContain("tools/call");
      const entry = first.entries[0]!;
      await expect(
        loaded.readDiscoveredResource({ id: "invented", revision: entry.revision }),
      ).rejects.toThrow();
      expect(remote.events).not.toContain("resources/read");
      expect((await loaded.readDiscoveredResource(entry)).contents).toHaveLength(1);
      await loaded.disconnect(installation.id, "remote");
      await expect(loaded.readDiscoveredResource(entry)).rejects.toThrow();
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("standard skills activate without extension; a missing sibling stays isolated", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-packages-"));
  try {
    const pkg = join(root, "reference");
    await mkdir(join(pkg, "skills", "editing"), { recursive: true });
    await writeFile(
      join(pkg, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "reference",
      }),
    );
    await writeFile(
      join(pkg, "skills", "editing", "SKILL.md"),
      "---\nname: editing\ndescription: Review a synthetic document\n---\nCheck clarity.",
    );
    const store = createNodeJsonStore(join(root, "state"));
    const installations = await createInstallationStore(store);
    const id = await installations.add(pkg);
    await installations.configure(id, {
      enabled: true,
      trustedBackend: false,
      servers: [],
      configuration: {},
    });
    const entries = (await createInstallationStore(store)).startup;
    const loaded = await loadInstalledPackages({
      root,
      installations: [
        ...entries,
        { ...entries[0]!, id: crypto.randomUUID(), root: join(root, "missing") },
      ],
      host: { store, assets: unusedAssets() },
    });
    try {
      expect(loaded.installs).toHaveLength(1);
      const skills = loaded.installs[0]!.plugin.prepare({})().skills;
      expect(skills?.[0]?.instructions).toContain("Check clarity.");
      expect(skills?.[0]?.instructions).toContain(join(pkg, "skills", "editing", "SKILL.md"));
      expect(loaded.statuses.map((s) => s.status)).toEqual(["ready", "failed"]);
    } finally {
      await loaded.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid backend contributions do not poison standard package activation", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-backend-package-"));
  try {
    await mkdir(join(root, "org.drawloom"));
    await writeFile(
      join(root, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "reference",
        extensions: {
          "org.drawloom": {
            version: 1,
            backend: { entrypoint: "./org.drawloom/backend.mjs" },
            requires: [{ kind: "capability", id: "host" }],
          },
        },
      }),
    );
    await mkdir(join(root, "org.drawloom"), { recursive: true });
    await writeFile(
      join(root, "org.drawloom", "backend.mjs"),
      "export default async () => ({ contributions: { workbenches: [null] }, dispose: async () => {} });",
    );
    const store = createNodeJsonStore(join(root, "state"));
    const installed = await createInstallationStore(store);
    const id = await installed.add(root);
    await installed.configure(id, {
      enabled: true,
      trustedBackend: true,
      servers: [],
      configuration: {},
    });
    const loaded = await loadInstalledPackages({
      root,
      installations: (await createInstallationStore(store)).startup,
      host: { store, assets: unusedAssets() },
    });
    try {
      expect(loaded.installs).toHaveLength(1);
      expect(loaded.statuses[0]?.codes).toContain("backend:invalid-contribution");
      expect(loaded.statuses[0]?.status).toBe("partial");
    } finally {
      await loaded.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a placement cannot replace another installation owned view", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-placement-owner-"));
  const owner = await packageServer("owner"),
    other = await packageServer("other");
  try {
    const first = await installedFixture(
      root,
      "owner-package",
      owner.serverUrl.href,
      {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workbenches: [ownerPlacement],
      },
      true,
    );
    const second = await installedFixture(root, "other-package", other.serverUrl.href, {
      version: 1,
      workbenches: [ownerPlacement],
    });
    const loaded = await loadInstalledPackages({
      root,
      installations: [first, second],
      host: packageHost(root),
    });
    try {
      expect(loaded.mcpApps.get("owner")?.html).toBe("<p>owner</p>");
      expect(other.events).not.toContain("resources/read");
      expect(loaded.statuses[1]?.codes).toContain("workbench:owner:view-unavailable");
    } finally {
      await loaded.close();
    }
  } finally {
    owner.server.close();
    other.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("opening resource must match the owning registered view", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-placement-resource-"));
  const remote = await packageServer("wrong", [
    {
      name: "open",
      inputSchema: { type: "object" },
      _meta: { ui: { resourceUri: "ui://wrong/view.html" } },
    },
  ]);
  try {
    const installation = await installedFixture(
      root,
      "owner-package",
      remote.serverUrl.href,
      {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workbenches: [ownerPlacement],
      },
      true,
    );
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
    });
    try {
      expect(loaded.mcpApps.size).toBe(0);
      expect(remote.events).not.toContain("resources/read");
      expect(loaded.statuses[0]?.codes).toContain("workbench:owner:view-unavailable");
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("duplicate placement declarations are rejected before a view connects", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-placement-duplicate-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(
      root,
      "owner-package",
      remote.serverUrl.href,
      {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workbenches: [ownerPlacement, ownerPlacement],
      },
      true,
    );
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
    });
    try {
      expect(loaded.mcpApps.size).toBe(0);
      expect(remote.events).not.toContain("resources/read");
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("unresolved extension requirements gate placements even without a backend, not standard tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-placement-requirements-"));
  const remote = await packageServer();
  try {
    for (const backend of [false, true]) {
      const installation = await installedFixture(
        root,
        backend ? "with-backend" : "without-backend",
        remote.serverUrl.href,
        {
          version: 1,
          ...(backend ? { backend: { entrypoint: "./org.drawloom/backend.mjs" } } : {}),
          requires: [{ kind: "tool", id: "missing-tool" }],
          workbenches: [ownerPlacement],
        },
        backend,
      );
      const loaded = await loadInstalledPackages({
        root,
        installations: [installation],
        host: packageHost(root),
      });
      try {
        expect(loaded.toolIds.size).toBe(1);
        expect(loaded.mcpApps.size).toBe(0);
        expect(loaded.statuses[0]?.codes).toContain("extension:unavailable");
        expect(remote.events).not.toContain("resources/read");
      } finally {
        await loaded.close();
      }
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("app-only and unsupported-schema tools cannot satisfy backend dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-tool-requirements-"));
  const remote = await packageServer("reference", [
    { name: "echo", inputSchema: { type: "object" } },
    { name: "hidden", inputSchema: { type: "object" }, _meta: { ui: { visibility: ["app"] } } },
    {
      name: "invalid",
      inputSchema: { type: "object", properties: { text: { type: "unsupported" } } },
    },
  ]);
  try {
    for (const dependency of ["hidden", "invalid"]) {
      const installation = await installedFixture(root, dependency, remote.serverUrl.href, {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        requires: [{ kind: "tool", id: `package:${dependency}:remote:${dependency}` }],
      });
      await writeFile(
        join(installation.root, "org.drawloom", "backend.mjs"),
        `import {writeFile} from 'node:fs/promises';
        export default async context => { await writeFile(context.packageRoot + '/executed', 'yes'); return { dispose() {} }; };`,
      );
      const loaded = await loadInstalledPackages({
        root,
        installations: [installation],
        host: packageHost(root),
      });
      try {
        expect(loaded.toolIds.size).toBe(1);
        expect(
          await stat(join(installation.root, "executed")).then(
            () => true,
            () => false,
          ),
        ).toBe(false);
        expect(loaded.statuses[0]?.codes).toContain("extension:unavailable");
      } finally {
        await loaded.close();
      }
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("required origin-qualified tool names invoke their real aliases with unchanged grants and evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-tool-alias-"));
  const remote = await packageServer("reference", [
    { name: "echo", inputSchema: { type: "object" } },
  ]);
  try {
    const installation = await installedFixture(root, "reference", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires: [
        { kind: "capability", id: "host" },
        { kind: "capability", id: "tools" },
        { kind: "tool", id: "package:reference:remote:echo" },
      ],
    });
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default async context => {
      const gateway = context.capabilities.tools, binding = gateway.bind('test-operation'), signal = new AbortController().signal;
      await context.capabilities.host.store.set('exposure', gateway.exposure.tools.map(t => t.name));
      await context.capabilities.host.store.set('result', await gateway.invoke(binding, 'package:reference:remote:echo', {}, signal));
      try { await gateway.invoke(binding, 'package:reference:remote:absent', {}, signal); }
      catch { await context.capabilities.host.store.set('unknown', 'rejected'); }
      return { dispose() {} };
    };`,
    );
    const host = packageHost(root);
    const checked: string[] = [],
      recorded: unknown[] = [];
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host,
      toolsFor: (_installation, tools) =>
        createLocalToolGateway({
          tools,
          authorization: toolAuthorizationFixture({
            authorize: async (request) => {
              checked.push(request.resource.id);
              return { decision: true };
            },
          }),
          nextInvocationId: () => crypto.randomUUID(),
          evidence: {
            record: async (event) => {
              recorded.push(event);
            },
          },
        }),
    });
    try {
      expect(await host.store.get(JSON.stringify(["plugin", installation.id, "exposure"]))).toEqual(
        ["package:reference:remote:echo"],
      );
      expect(
        await host.store.get(JSON.stringify(["plugin", installation.id, "result"])),
      ).toMatchObject({ outcome: { status: "ok", text: "reference:echo" } });
      expect(await host.store.get(JSON.stringify(["plugin", installation.id, "unknown"]))).toBe(
        "rejected",
      );
      expect([...new Set(checked)]).toEqual([...loaded.toolIds]);
      expect(recorded[0]).toMatchObject({ kind: "started", tool: [...loaded.toolIds][0] });
      expect(remote.events.filter((e) => e === "tools/call")).toHaveLength(1);
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reconnecting a server used by an active view requires restart without replacing its session", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-view-reconnect-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(
      root,
      "owner-package",
      remote.serverUrl.href,
      {
        version: 1,
        backend: { entrypoint: "./org.drawloom/backend.mjs" },
        workbenches: [ownerPlacement],
      },
      true,
    );
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
    });
    try {
      expect(await loaded.reconnect(installation.id, "remote")).toEqual({ restartRequired: true });
      expect(remote.events.filter((e) => e === "initialize")).toHaveLength(1);
      expect(
        await loaded.mcpApps.get("owner")!.callTool({ name: "open", arguments: {} }),
      ).toMatchObject({ content: [{ type: "text", text: "owner:open" }] });
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("OAuth actions remain bound to prepared startup inventory after the manifest changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-oauth-inventory-"));
  const remote = await packageServer();
  try {
    const installation = await installedFixture(root, "reference", remote.serverUrl.href);
    const host = packageHost(root);
    await host.store.set("plugin-installations", { version: 1, installations: [installation] });
    const application = await createDesktopApplication(root);
    try {
      const original = await application.packageOAuth({
        action: "status",
        id: installation.id,
        server: "remote",
      });
      await writeFile(
        join(installation.root, "mcp.json"),
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
          mcpServers: {
            remote: { type: "sse", url: "https://changed.example/mcp" },
            added: { type: "streamable-http", url: "https://added.example/mcp" },
          },
        }),
      );
      expect(
        await application.packageOAuth({ action: "status", id: installation.id, server: "remote" }),
      ).toEqual(original);
      await expect(
        application.packageOAuth({ action: "status", id: installation.id, server: "added" }),
      ).rejects.toThrow();
    } finally {
      await application.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a dependency absent from the provided gateway cannot activate its backend", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-filtered-gateway-"));
  const remote = await packageServer("reference", [
    { name: "echo", inputSchema: { type: "object" } },
  ]);
  try {
    const installation = await installedFixture(root, "reference", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires: [
        { kind: "capability", id: "host" },
        { kind: "capability", id: "tools" },
        { kind: "tool", id: "package:reference:remote:echo" },
      ],
    });
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default async context => {
      await context.capabilities.host.store.set('executed', true); return { dispose() {} };
    };`,
    );
    const host = packageHost(root);
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host,
      toolsFor: () =>
        createLocalToolGateway({
          tools: [],
          authorization: toolAuthorizationFixture(),
          nextInvocationId: () => crypto.randomUUID(),
          evidence: { record: async () => {} },
        }),
    });
    try {
      expect(await host.store.get("executed")).toBeUndefined();
      expect(loaded.statuses[0]?.codes).toContain("extension:unavailable");
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("dependency identities use inspected package names and reject ambiguous installations", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-ambiguous-dependency-"));
  const remote = await packageServer("reference", [
    { name: "echo", inputSchema: { type: "object" } },
  ]);
  try {
    const extension: DrawloomPackageExtension = {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires: [
        { kind: "capability", id: "host" },
        { kind: "tool", id: "package:reference:remote:echo" },
      ],
    };
    const first = await installedFixture(root, "previous-name", remote.serverUrl.href, extension);
    const second = await installedFixture(root, "reference", remote.serverUrl.href);
    await writeFile(
      join(first.root, "plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "reference",
        extensions: { "org.drawloom": extension },
      }),
    );
    await writeFile(
      join(first.root, "org.drawloom", "backend.mjs"),
      `export default async context => {
      await context.capabilities.host.store.set('executed', true); return { dispose() {} };
    };`,
    );
    const host = packageHost(root);
    const loaded = await loadInstalledPackages({ root, installations: [first, second], host });
    try {
      expect(loaded.toolIds.size).toBe(2);
      expect(await host.store.get("executed")).toBeUndefined();
      expect(loaded.statuses[0]?.codes).toContain("extension:unavailable");
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("package resource captures distinguish changed revisions and reuse unchanged captures across reconnect", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-resource-revisions-"));
  const resource = { revision: 1, text: "First contents" },
    remote = await packageServer("reference", [], resource);
  try {
    const installation = await installedFixture(root, "reference", remote.serverUrl.href);
    await packageHost(root).store.set("plugin-installations", {
      version: 1,
      installations: [installation],
    });
    const app = await createDesktopApplication(root);
    try {
      const conversationId = (await app.snapshot()).selectedId;
      async function resourceSelection(refresh = false) {
        let catalogue = await app.discover(conversationId, refresh);
        for (let n = 0; n < 100 && catalogue.categories.some((c) => c.status === "loading"); n++) {
          await new Promise((resolve) => setTimeout(resolve, 2));
          catalogue = await app.discover(conversationId);
        }
        const entry = catalogue.entries.find((e) => e.kind === "resource");
        if (!entry) throw Error("Resource discovery did not settle");
        return entry;
      }
      const firstSelection = await resourceSelection();
      const first = await app.readDiscoveredResource(conversationId, firstSelection);
      expect(new TextDecoder().decode(await app.assets.read(first.resources![0]!.asset!.key))).toBe(
        "First contents",
      );
      const reads = remote.events.filter((e) => e === "resources/read").length;
      await app.packageOAuth({ action: "reconnect", id: installation.id, server: "remote" });
      const unchanged = await resourceSelection(true);
      expect(unchanged.revision).toBe(firstSelection.revision);
      expect((await app.readDiscoveredResource(conversationId, unchanged)).id).toBe(first.id);
      expect(remote.events.filter((e) => e === "resources/read")).toHaveLength(reads);
      resource.revision++;
      resource.text = "Second contents";
      const changed = await resourceSelection(true);
      expect(changed.revision).not.toBe(firstSelection.revision);
      const second = await app.readDiscoveredResource(conversationId, changed);
      expect(second.id).not.toBe(first.id);
      expect(
        new TextDecoder().decode(await app.assets.read(second.resources![0]!.asset!.key)),
      ).toBe("Second contents");
      expect(remote.events.filter((e) => e === "resources/read")).toHaveLength(reads + 1);
      expect(
        (await app.historyPage(conversationId)).entries.filter((e) => e.resources?.length),
      ).toHaveLength(2);
    } finally {
      await app.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("enhanced workbench and plugin requirements resolve canonical standard tool and skill references", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-enhanced-references-"));
  const remote = await packageServer("reference", [
    { name: "echo", inputSchema: { type: "object" } },
  ]);
  try {
    const requires = [
      { kind: "tool" as const, id: "package:reference:remote:echo" },
      { kind: "skill" as const, id: "package:reference:skill:editing" },
    ];
    const installation = await installedFixture(root, "reference", remote.serverUrl.href, {
      version: 1,
      backend: { entrypoint: "./org.drawloom/backend.mjs" },
      requires,
    });
    await mkdir(join(installation.root, "skills/editing"), { recursive: true });
    await writeFile(
      join(installation.root, "skills/editing/SKILL.md"),
      "---\nname: editing\ndescription: Edit a synthetic document\n---\nCheck clarity.",
    );
    await writeFile(
      join(installation.root, "org.drawloom", "backend.mjs"),
      `export default () => ({ contributions: { workbenches: [{
        id: 'enhanced', title: 'Enhanced', description: '', tools: ['package:reference:remote:echo'], skills: ['package:reference:skill:editing']
      }] }, dispose() {} });`,
    );
    const loaded = await loadInstalledPackages({
      root,
      installations: [installation],
      host: packageHost(root),
    });
    try {
      expect(loaded.statuses[0]?.codes).not.toContain("backend:invalid-contribution");
      const registry = createPluginRegistry(loaded.installs, ["agent", "host"]);
      expect(registry.workbenches.find((w) => w.id === "enhanced")).toMatchObject({
        tools: [...loaded.toolIds],
        skills: [`package:${installation.id}:skill:editing`],
      });
      expect(registry.contributions.find((c) => c.contributionId === "enhanced")?.pluginId).toBe(
        `package:${installation.id}:backend`,
      );
    } finally {
      await loaded.close();
    }
  } finally {
    remote.server.close();
    await rm(root, { recursive: true, force: true });
  }
});

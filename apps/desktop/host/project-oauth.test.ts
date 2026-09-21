import { expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { addTestProject, createTestDesktopApplication } from "./test-project.fixture.js";
import { retireCreatedRuntimes } from "./project-plugin-runtimes.js";
import { serve } from "@hono/node-server";
import { once } from "node:events";

async function packageServer() {
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = (await request.json()) as { id?: number; method: string; params?: unknown };
      if (message.id === undefined) return new Response(null, { status: 202 });
      const result =
        message.method === "initialize"
          ? {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {}, resources: {} },
              serverInfo: { name: "project-oauth", version: "1" },
            }
          : message.method === "tools/list"
            ? {
                tools: [
                  {
                    name: "settings.open",
                    inputSchema: { type: "object" },
                    _meta: {
                      ui: { visibility: ["app"], resourceUri: "ui://project-oauth/settings" },
                    },
                  },
                ],
              }
            : message.method === "resources/read"
              ? {
                  contents: [
                    {
                      uri: "ui://project-oauth/settings",
                      mimeType: "text/html;profile=mcp-app",
                      text: "<p>Settings</p>",
                    },
                  ],
                }
              : {};
      return Response.json({ jsonrpc: "2.0", id: message.id, result });
    },
  });
  await once(server, "listening");
  return {
    server,
    url: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`),
  };
}

async function installPackage(root: string, url: string) {
  const packageRoot = join(root, "package");
  await mkdir(packageRoot);
  await writeFile(
    join(packageRoot, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "project-oauth",
      extensions: {
        "org.drawloom": {
          version: 1,
          settings: [
            {
              id: "preferences",
              title: "Preferences",
              openingTool: { server: "remote", tool: "settings.open" },
              allowedTools: ["settings.open"],
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
      mcpServers: { remote: { type: "streamable-http", url } },
    }),
  );
  const installationId = crypto.randomUUID();
  await createNodeJsonStore(join(root, "state")).set("plugin-installations", {
    version: 1,
    installations: [
      {
        id: installationId,
        root: packageRoot,
        name: "project-oauth",
        enabled: true,
        trustedBackend: false,
        servers: ["remote"],
        configuration: {},
        approvedResourceOrigins: [],
      },
    ],
  });
  return installationId;
}

test.each(["disconnect", "configure-client"] as const)(
  "global OAuth %s closes the matching connection in every created project runtime",
  async (action) => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-project-oauth-"));
    const remote = await packageServer();
    try {
      const installationId = await installPackage(root, remote.url.href);
      const app = await createTestDesktopApplication(root);
      try {
        const firstProjectId = (await app.snapshot()).selectedProjectId!;
        expect((await app.packageStatuses())[0]?.servers[0]?.status).toBe("connected");

        const secondProjectId = (await addTestProject(app)).selectedProjectId!;
        await app.command({
          kind: "create_conversation",
          workbenchId: "text",
          provider: "synthetic",
        });
        expect((await app.packageStatuses())[0]?.servers[0]?.status).toBe("connected");

        const settings = await app.settingsOpen({ installationId, pageId: "preferences" });
        expect((await app.settingsPresentation(settings)).html).toContain("Settings");
        if (action === "disconnect") {
          await app.packageOAuth({ action, id: installationId, server: "remote" });
        } else {
          const registrationFile = join(root, "oauth-client.json");
          await writeFile(
            registrationFile,
            JSON.stringify({
              issuer: "https://issuer.example",
              information: { client_id: "replacement-client" },
            }),
          );
          // Native credential deletion may be unavailable on a locked test host;
          // connection retirement must still cover every runtime before replacement.
          await app
            .packageOAuth({ action, id: installationId, server: "remote", registrationFile })
            .catch(() => undefined);
        }
        await expect(app.settingsPresentation(settings)).rejects.toThrow();
        expect((await app.packageStatuses())[0]?.servers[0]).toMatchObject({
          status: "auth-required",
          code: "disconnected",
        });

        await app.command({ kind: "select_project", projectId: firstProjectId });
        expect((await app.packageStatuses())[0]?.servers[0]).toMatchObject({
          status: "auth-required",
          code: "disconnected",
        });
        expect((await app.snapshot()).selectedProjectId).toBe(firstProjectId);
        expect(secondProjectId).not.toBe(firstProjectId);
      } finally {
        await app.close();
      }
    } finally {
      remote.server.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("runtime retirement includes an entry created while an earlier retirement is pending", async () => {
  const firstStarted = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  const retired: string[] = [];
  const runtimes = new Map<string, Promise<string>>([["first", Promise.resolve("first")]]);
  const retirement = retireCreatedRuntimes(runtimes, async (runtime) => {
    retired.push(runtime);
    if (runtime === "first") {
      firstStarted.resolve();
      await releaseFirst.promise;
    }
  });
  await firstStarted.promise;
  runtimes.set("late", Promise.resolve("late"));
  releaseFirst.resolve();
  await retirement;
  expect(retired).toEqual(["first", "late"]);
});

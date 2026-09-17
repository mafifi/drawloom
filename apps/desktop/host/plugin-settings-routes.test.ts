import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createInstallationStore } from "./plugin-installations.js";

test("real settings HTTP routes work with no project and no generation runtime", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "drawloom-settings-routes-")));
  const pkg = join(root, "fixture");
  await mkdir(pkg);
  await mkdir(join(pkg, "org.drawloom"));
  await writeFile(
    join(pkg, "org.drawloom", "absent.mjs"),
    'throw Error("Optional runtime is not installed; settings must never import this backend");',
  );
  await writeFile(
    join(pkg, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "public-preferences",
      extensions: {
        "org.drawloom": {
          version: 1,
          backend: { entrypoint: "./org.drawloom/absent.mjs" },
          settings: [
            {
              id: "preferences",
              title: "Preferences",
              openingTool: { server: "setup", tool: "preferences.open" },
              allowedTools: ["preferences.open", "preferences.save"],
            },
          ],
        },
      },
    }),
  );
  await writeFile(
    join(pkg, "mcp.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        setup: {
          type: "stdio",
          command: "bun",
          args: [resolve("apps/desktop/tests/settings-server.fixture.ts")],
        },
        generation: { type: "stdio", command: "absent-model-runtime" },
      },
    }),
  );
  const installations = await createInstallationStore(createNodeJsonStore(join(root, "state")));
  const id = await installations.add(pkg);
  await installations.configure(id, {
    enabled: true,
    trustedBackend: true,
    servers: ["setup", "generation"],
    configuration: {},
  });
  const app = await createDesktopApplication(root);
  const server = serveDesktop(app, resolve("apps/desktop/build"));
  try {
    const boot = await fetch(server.url, { redirect: "manual" });
    const cookie = boot.headers.get("set-cookie")!.split(";")[0]!;
    const headers = { cookie, origin: server.origin, "content-type": "application/json" };
    const post = (path: string, body: unknown) =>
      fetch(server.origin + path, { method: "POST", headers, body: JSON.stringify(body) });
    expect((await fetch(server.origin + "/api/settings/pages")).status).toBe(401);
    const pages = await fetch(server.origin + "/api/settings/pages", { headers });
    expect(await pages.json()).toMatchObject([{ pageId: "preferences", status: "available" }]);
    const response = await post("/api/settings/open", {
      installationId: id,
      pageId: "preferences",
    });
    expect(response.status).toBe(200);
    const opened = (await response.json()) as { mountId: string };
    const html = await fetch(server.origin + "/api/settings/page?mountId=" + opened.mountId, {
      headers,
    });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    const result = await post("/api/settings/request", {
      ...opened,
      request: { name: "preferences.open", arguments: {} },
    });
    expect(await result.json()).toMatchObject({
      structuredContent: {
        projectDirectory: null,
        configurationDirectory: join(root, "plugins", id),
        dataDirectory: join(root, "plugins", id),
      },
    });
    expect((await app.snapshot()).projects).toHaveLength(0);
    if (process.env.DRAWLOOM_PLAYWRIGHT_PATH) {
      const child = Bun.spawn(["node", resolve("apps/desktop/tests/plugin-settings-browser.mjs")], {
        env: { ...process.env, DRAWLOOM_SETTINGS_URL: server.url },
        stdout: "inherit",
        stderr: "inherit",
      });
      expect(await child.exited).toBe(0);
    }
    await post("/api/settings/close", opened);
    expect(
      (await post("/api/settings/request", { ...opened, request: { name: "preferences.open" } }))
        .status,
    ).toBe(400);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

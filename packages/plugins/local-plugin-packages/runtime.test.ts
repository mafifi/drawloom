import { test, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm, symlink, mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA } from "@drawloom/plugins";
import { inspectPackage } from "./src/index.ts";
import { activatePackage, packageFetch } from "./src/runtime.ts";
import { serve } from "@hono/node-server";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

async function localFixture(servers: object) {
  const root = await mkdtemp(join(tmpdir(), "drawloom-runtime-test-"));
  await writeFile(
    join(root, "plugin.json"),
    JSON.stringify({ $schema: PLUGIN_SCHEMA, name: "runtime-test" }),
  );
  await writeFile(
    join(root, "mcp.json"),
    JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: servers }),
  );
  return {
    root,
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
const serverScript = `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const log = join(process.env.PLUGIN_DATA, 'launch.json');
let count = 0; try { count = JSON.parse(readFileSync(log, 'utf8')).count; } catch {}
writeFileSync(log, JSON.stringify({ count: count + 1, root: process.env.PLUGIN_ROOT, data: process.env.PLUGIN_DATA, secret: process.env.DRAWLOOM_TEST_SECRET, custom: process.env.CUSTOM, args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid }));
let buffer = ''; process.stdin.on('data', chunk => { buffer += chunk; let newline; while ((newline = buffer.indexOf('\\n')) >= 0) {
 const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
 if (message.method === 'tools/call') writeFileSync(join(process.env.PLUGIN_DATA, 'invoked'), 'yes');
 if (message.id !== undefined) { const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } } : { tools: [{ name: 'original.name', inputSchema: { type: 'object' } }] }; process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n'); }
}}); process.stdin.on('end', () => process.exit(0));
`;
test("one installed configuration is shared while two project process stores remain isolated", async () => {
  const local = await localFixture({
    good: { type: "stdio", command: "node", args: ["./server.mjs"] },
  });
  try {
    const shared = join(local.root, "shared"),
      first = join(local.root, "first"),
      second = join(local.root, "second");
    await mkdir(join(shared, "installed"), { recursive: true });
    await mkdir(first);
    await mkdir(second);
    await writeFile(
      join(shared, "installed", "config.json"),
      JSON.stringify({ model: "configured-once" }),
    );
    await writeFile(
      join(local.root, "server.mjs"),
      serverScript.replace(
        "const log =",
        `writeFileSync(join(process.env.PLUGIN_DATA, 'binding.json'), JSON.stringify({config: process.env.DRAWLOOM_PLUGIN_CONFIG_DIR, project: process.env.DRAWLOOM_PROJECT_DIR}));\nconst log =`,
      ),
    );
    const inventory = await inspectPackage(local.root);
    for (const project of [first, second, first]) {
      const active = await activatePackage(inventory, {
        dataRoot: join(project, "data"),
        installationId: "installed",
        selectedServers: ["good"],
        installationContext: { configurationRoot: shared, projectDirectory: project },
      });
      try {
        expect(active.statuses[0]?.status).toBe("connected");
        const binding = JSON.parse(
          await readFile(join(project, "data/installed/binding.json"), "utf8"),
        );
        expect(binding).toEqual({
          config: await realpath(join(shared, "installed")),
          project: await realpath(project),
        });
      } finally {
        await active.close();
      }
    }
    expect(
      JSON.parse(await readFile(join(first, "data/installed/launch.json"), "utf8")).count,
    ).toBe(2);
    expect(
      JSON.parse(await readFile(join(second, "data/installed/launch.json"), "utf8")).count,
    ).toBe(1);
  } finally {
    await local.dispose();
  }
});
test("explicit stdio activation preserves data, opaque arguments, wire names and isolated failure", async () => {
  const local = await localFixture({
    good: {
      type: "stdio",
      command: "node",
      args: ["./server.mjs", "${PLUGIN_ROOT}/../literal", "${PLUGIN_DATA}"],
      env: { CUSTOM: "${PLUGIN_ROOT}:${PLUGIN_DATA}:${UNKNOWN}" },
    },
    broken: { type: "stdio", command: "does-not-exist-drawloom-test" },
    unselected: { type: "stdio", command: "node", args: ["./server.mjs"] },
  });
  process.env.DRAWLOOM_TEST_SECRET = "never-inherit";
  try {
    await writeFile(join(local.root, "server.mjs"), serverScript);
    const inventory = await inspectPackage(local.root),
      dataRoot = join(local.root, "data");
    expect(
      await stat(join(dataRoot, "first/launch.json")).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    for (const count of [1, 2]) {
      const active = await activatePackage(inventory, {
        dataRoot,
        installationId: "first",
        selectedServers: ["good", "broken"],
      });
      try {
        expect(active.statuses.map((s) => [s.name, s.status])).toEqual([
          ["good", "connected"],
          ["broken", "failed"],
        ]);
        const launch = JSON.parse(await readFile(join(dataRoot, "first/launch.json"), "utf8"));
        expect(launch.count).toBe(count);
        expect(launch.secret).toBeUndefined();
        expect(launch.args).toEqual([
          inventory.root + "/../literal",
          join(inventory.root, "data/first"),
        ]);
        expect(launch.cwd).toBe(inventory.root);
        expect(launch.custom).toBe(
          inventory.root + ":" + join(inventory.root, "data/first") + ":${UNKNOWN}",
        );
        expect(
          await stat(join(dataRoot, "first/invoked")).then(
            () => true,
            () => false,
          ),
        ).toBe(false);
        expect((await active.servers.get("good")!.client.listTools()).tools[0]?.name).toBe(
          "original.name",
        );
      } finally {
        await active.close();
      }
    }
  } finally {
    delete process.env.DRAWLOOM_TEST_SECRET;
    await local.dispose();
  }
});
test("handshake timeout closes hung subprocess", async () => {
  const local = await localFixture({
    hung: { type: "stdio", command: "node", args: ["./hung.mjs"] },
  });
  try {
    await writeFile(
      join(local.root, "hung.mjs"),
      `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.PLUGIN_DATA + '/pid', String(process.pid)); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));`,
    );
    const active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["hung"],
      handshakeTimeoutMs: 200,
    });
    expect(active.statuses[0]?.status).toBe("failed");
    const pid = Number(await readFile(join(local.root, "data/one/pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
    await active.close();
  } finally {
    await local.dispose();
  }
});
test("HTTP handshake performs no tool invocation and never forwards redirect credentials", async () => {
  const methods: string[] = [],
    seen: string[] = [];
  const target = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      seen.push("leaked");
      return new Response("unexpected");
    },
  });
  await once(target, "listening");
  const targetUrl = new URL(`http://127.0.0.1:${(target.address() as AddressInfo).port}/`);
  const http = serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/redirect")
        return new Response(null, { status: 307, headers: { location: targetUrl.href } });
      if (url.pathname === "/auth") return new Response("Authentication required", { status: 401 });
      if (request.method !== "POST") return new Response(null, { status: 405 });
      expect(request.headers.get("x-package")).toBe("visible-value");
      const message = (await request.json()) as { method: string; id?: number };
      methods.push(message.method);
      if (message.id === undefined) return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          serverInfo: { name: "http-test", version: "1" },
        },
      });
    },
  });
  await once(http, "listening");
  const httpUrl = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/`);
  const local = await localFixture({
    remote: {
      type: "streamable-http",
      url: httpUrl.href,
      headers: { "X-Package": "visible-value" },
    },
    redirect: {
      type: "streamable-http",
      url: new URL("/redirect", httpUrl).href,
      headers: { Authorization: "do-not-forward" },
    },
    auth: { type: "streamable-http", url: new URL("/auth", httpUrl).href },
  });
  try {
    const active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["remote", "redirect", "auth"],
    });
    try {
      expect(active.statuses.map((s) => s.status)).toEqual([
        "connected",
        "failed",
        "auth-required",
      ]);
      expect(methods).toEqual(["initialize", "notifications/initialized"]);
      expect(seen).toEqual([]);
    } finally {
      await active.close();
    }
  } finally {
    http.close();
    target.close();
    await local.dispose();
  }
});
test("package HTTP headers never override generated authentication or reach an OAuth origin", async () => {
  const received: Array<string | null> = [];
  const oauth = serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      received.push(request.headers.get("x-package"));
      return new Response("ok");
    },
  });
  await once(oauth, "listening");
  const oauthUrl = new URL(`http://127.0.0.1:${(oauth.address() as AddressInfo).port}/`);
  const endpoint = serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      received.push(request.headers.get("authorization"));
      return new Response("ok");
    },
  });
  await once(endpoint, "listening");
  const endpointUrl = new URL(`http://127.0.0.1:${(endpoint.address() as AddressInfo).port}/`);
  try {
    const scopedFetch = packageFetch({
      type: "streamable-http",
      url: endpointUrl.href,
      headers: { Authorization: "package-value", "X-Package": "visible" },
    });
    await scopedFetch(endpointUrl, { headers: { Authorization: "Bearer client-token" } });
    await scopedFetch(oauthUrl);
    expect(received).toEqual(["Bearer client-token", null]);
  } finally {
    oauth.close();
    endpoint.close();
  }
});
test("failed authenticated tool calls are not retried by SDK auth flow", async () => {
  let calls = 0,
    tokens = 0;
  const http = serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const message = (await request.json()) as { method: string; id?: number };
      if (message.method === "tools/call") {
        calls++;
        return new Response("expired", { status: 401 });
      }
      if (message.id === undefined) return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "synthetic", version: "1" },
        },
      });
    },
  });
  await once(http, "listening");
  const httpUrl = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/`);
  const local = await localFixture({ remote: { type: "streamable-http", url: httpUrl.href } });
  try {
    const active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["remote"],
      authProviderFor: () => ({
        get redirectUrl() {
          return undefined;
        },
        get clientMetadata() {
          return { redirect_uris: [] };
        },
        clientInformation() {
          return { client_id: "synthetic" };
        },
        tokens() {
          tokens++;
          return { access_token: "synthetic", token_type: "Bearer" };
        },
        saveTokens() {},
        redirectToAuthorization() {
          throw Error("Unexpected authorization");
        },
        saveCodeVerifier() {},
        codeVerifier() {
          return "synthetic";
        },
      }),
    });
    try {
      expect(active.statuses[0]?.status).toBe("connected");
      await expect(
        active.servers.get("remote")!.client.callTool({ name: "original.name", arguments: {} }),
      ).rejects.toThrow();
      expect(calls).toBe(1);
      expect(tokens).toBeGreaterThan(0);
    } finally {
      await active.close();
    }
  } finally {
    http.close();
    await local.dispose();
  }
});
test("data-root cwd escape fails independently and separate installations keep separate data", async () => {
  const local = await localFixture({
    good: { type: "stdio", command: "node", args: ["./server.mjs"] },
    escape: {
      type: "stdio",
      command: "node",
      cwd: "${PLUGIN_DATA}/escape",
      args: ["./server.mjs"],
    },
  });
  try {
    await writeFile(join(local.root, "server.mjs"), serverScript);
    await mkdir(join(local.root, "data/first"), { recursive: true });
    await symlink(local.root, join(local.root, "data/first/escape"));
    const inventory = await inspectPackage(local.root);
    const first = await activatePackage(inventory, {
      dataRoot: join(local.root, "data"),
      installationId: "first",
      selectedServers: ["good", "escape"],
    });
    expect(first.statuses.map((s) => s.status)).toEqual(["connected", "failed"]);
    await first.close();
    const second = await activatePackage(inventory, {
      dataRoot: join(local.root, "data"),
      installationId: "second",
      selectedServers: ["good"],
    });
    try {
      expect(
        JSON.parse(await readFile(join(local.root, "data/second/launch.json"), "utf8")).count,
      ).toBe(1);
    } finally {
      await second.close();
    }
  } finally {
    await local.dispose();
  }
});
test("overlapping active-server close calls wait for the same delayed subprocess cleanup", async () => {
  const local = await localFixture({
    good: { type: "stdio", command: "node", args: ["./server.mjs"] },
  });
  let active: Awaited<ReturnType<typeof activatePackage>> | undefined;
  try {
    await writeFile(
      join(local.root, "server.mjs"),
      serverScript.replace(
        "process.stdin.on('end', () => process.exit(0));",
        "process.stdin.on('end', () => setTimeout(() => process.exit(0), 150));",
      ),
    );
    active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["good"],
    });
    const pid = JSON.parse(await readFile(join(local.root, "data/one/launch.json"), "utf8")).pid;
    const handle = active.servers.get("good")!;
    const first = handle.close(),
      second = handle.close();
    await second;
    expect(() => process.kill(pid, 0)).toThrow();
    expect(second).toBe(first);
    await first;
  } finally {
    await active?.close();
    await local.dispose();
  }
});
test("package shutdown retains close failure and still closes every real connection once", async () => {
  const local = await localFixture({
    first: { type: "stdio", command: "node", args: ["./server.mjs"] },
    second: { type: "stdio", command: "node", args: ["./server.mjs"] },
  });
  let active: Awaited<ReturnType<typeof activatePackage>> | undefined;
  try {
    await writeFile(join(local.root, "server.mjs"), serverScript);
    active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["first", "second"],
    });
    expect(active.servers.size).toBe(2);
    let attempts = 0;
    for (const [name, handle] of active.servers) {
      const close = handle.client.close.bind(handle.client);
      handle.client.close = async () => {
        attempts++;
        await close();
        if (name === "first") throw Error("fixture close failure");
      };
    }
    const first = active.close(),
      second = active.close();
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(first).toBe(second);
    expect(attempts).toBe(2);
    await expect(active.close()).rejects.toThrow("Plugin connection shutdown failed");
    expect(attempts).toBe(2);
  } finally {
    await active?.close().catch(() => {});
    await local.dispose();
  }
});

test("composition-selected client capabilities are present in MCP initialization", async () => {
  const local = await localFixture({
    good: { type: "stdio", command: "node", args: ["./server.mjs"] },
  });
  let active: Awaited<ReturnType<typeof activatePackage>> | undefined;
  try {
    await writeFile(
      join(local.root, "server.mjs"),
      serverScript.replace(
        "if (message.method === 'tools/call')",
        "if (message.method === 'initialize') writeFileSync(join(process.env.PLUGIN_DATA, 'capabilities.json'), JSON.stringify(message.params.capabilities)); if (message.method === 'tools/call')",
      ),
    );
    active = await activatePackage(await inspectPackage(local.root), {
      dataRoot: join(local.root, "data"),
      installationId: "one",
      selectedServers: ["good"],
      clientCapabilities: {
        extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
      },
    });
    const capabilities = JSON.parse(
      await readFile(join(local.root, "data/one/capabilities.json"), "utf8"),
    );
    expect(capabilities.extensions["io.modelcontextprotocol/ui"]).toEqual({
      mimeTypes: ["text/html;profile=mcp-app"],
    });
  } finally {
    await active?.close();
    await local.dispose();
  }
});

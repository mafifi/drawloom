import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { PackageInventory } from "@drawloom/plugins";
import type { Installation } from "./plugin-installations.js";
import { createPluginSettingsHost } from "./plugin-settings.js";
import type { PackageServerStatus } from "@drawloom/local-plugin-packages";

test("owner invalidation prevents an already-started open from publishing a late mount", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let hold = true;
  const f = await fixture({
    holdInspection: async () => {
      if (hold) {
        started.resolve();
        await release.promise;
      }
    },
  });
  const target = { installationId: f.installation.id, pageId: f.page.id };
  const opening = f.host.open(target);
  const outcome = Promise.allSettled([opening]);
  await started.promise;
  await f.host.invalidate(f.installation.id);
  hold = false;
  release.resolve();
  expect((await outcome)[0]?.status).toBe("rejected");
  expect(f.connects()).toBe(0);
  await f.host.open(target);
  expect(f.connects()).toBe(1);
  await f.host.close();
});

test("trusted owner invalidation is admitted even when page requests saturate the host", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let count = 0;
  let hold = false;
  const f = await fixture({
    holdInspection: async () => {
      if (!hold) return;
      if (++count === 32) started.resolve();
      await release.promise;
    },
  });
  const opened = await f.host.open({ installationId: f.installation.id, pageId: f.page.id });
  hold = true;
  const requests = Array.from({ length: 32 }, () => f.host.list());
  await started.promise;
  const invalidated = f.host.invalidate(f.installation.id);
  const result = Promise.allSettled([invalidated]);
  expect(f.closes()).toBe(0);
  release.resolve();
  await Promise.all(requests);
  expect((await result)[0]?.status).toBe("fulfilled");
  await expect(f.host.presentation(opened)).rejects.toThrow("closed");
  expect(f.closes()).toBe(1);
  await f.host.close();
});

test("explicit reopen replaces a disconnected settings server without replaying calls", async () => {
  const f = await fixture();
  const target = { installationId: f.installation.id, pageId: f.page.id };
  const old = await f.host.open(target);
  await f.disconnect();
  const next = await f.host.open(target);
  expect(next.mountId).not.toBe(old.mountId);
  expect(f.connects()).toBe(2);
  expect(f.closes()).toBe(1);
  expect(f.calls()).toBe(0);
  await expect(f.host.request({ ...old, request: { name: "save" } })).rejects.toThrow();
  await f.host.close();
  expect(f.closes()).toBe(2);
});
test("uninstalled owner and explicit owner update retire their connections and mounted identities", async () => {
  for (const uninstall of [false, true]) {
    const f = await fixture();
    const opened = await f.host.open({ installationId: f.installation.id, pageId: f.page.id });
    if (uninstall) f.owners.splice(0);
    else await f.host.invalidate(f.installation.id);
    await expect(f.host.request({ ...opened, request: { name: "save" } })).rejects.toThrow();
    await f.host.close();
    expect(f.closes()).toBe(1);
  }
});

test("settings refuse model-only tools, malformed resource identity and duplicate registration", async () => {
  for (const behavior of [{ modelOnly: true }, { malformed: true }]) {
    const f = await fixture(behavior);
    await expect(
      f.host.open({ installationId: f.installation.id, pageId: f.page.id }),
    ).rejects.toThrow();
    await f.host.close();
    expect(f.closes()).toBe(1);
  }
  const f = await fixture();
  f.inventory.drawloom!.settings!.push(f.page);
  await expect(
    f.host.open({ installationId: f.installation.id, pageId: f.page.id }),
  ).rejects.toThrow();
  expect(f.connects()).toBe(0);
  await f.host.close();
});
test("failed connection can be explicitly retried and concurrent opens respect admission", async () => {
  const f = await fixture({ failFirst: true });
  const target = { installationId: f.installation.id, pageId: f.page.id };
  await expect(f.host.open(target)).rejects.toThrow("Transient");
  const opened = await Promise.allSettled(Array.from({ length: 20 }, () => f.host.open(target)));
  expect(opened.filter((value) => value.status === "fulfilled")).toHaveLength(16);
  expect(f.connects()).toBe(2);
  await f.host.close();
  expect(f.closes()).toBe(1);
});
test("closing a page does not cancel admitted work and host shutdown drains before one close", async () => {
  let start!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => (start = resolve));
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const f = await fixture({
    holdSave: async () => {
      start();
      await finished;
    },
  });
  const opened = await f.host.open({ installationId: f.installation.id, pageId: f.page.id });
  const request = f.host.request({ ...opened, request: { name: "save", arguments: {} } });
  await started;
  await f.host.closeMount(opened);
  const closing = f.host.close();
  expect(f.closes()).toBe(0);
  await expect(f.host.list()).rejects.toThrow("closed");
  finish();
  await request;
  await closing;
  expect(f.closes()).toBe(1);
});

async function fixture(
  behavior: {
    modelOnly?: boolean;
    malformed?: boolean;
    failFirst?: boolean;
    holdSave?: () => Promise<void>;
    holdInspection?: () => Promise<void>;
  } = {},
) {
  const installation: Installation = {
    id: crypto.randomUUID(),
    name: "Counter",
    root: "/missing-runtime",
    enabled: true,
    trustedBackend: false,
    servers: ["setup", "generation"],
    configuration: {},
    approvedResourceOrigins: [],
    elicitationDisabledServers: [],
  };
  const page = {
    id: "preferences",
    title: "Preferences",
    openingTool: { server: "setup", tool: "open" },
    allowedTools: ["open", "save"],
  };
  const inventory: PackageInventory = {
    root: installation.root,
    name: "counter",
    skills: [],
    diagnostics: [],
    extensions: {},
    servers: [{ name: "setup", config: { type: "stdio", command: "missing" } }],
    drawloom: { version: 1, settings: [page] },
  };
  const server = new McpServer({ name: "counter", version: "1" });
  const uri = "ui://counter/settings";
  registerAppResource(server, "Preferences", uri, {}, async () => ({
    contents: [
      {
        uri: behavior.malformed ? "ui://wrong/owner" : uri,
        mimeType: RESOURCE_MIME_TYPE,
        text: "<p>Preferences</p>",
      },
    ],
  }));
  let calls = 0;
  for (const name of ["open", "save", "foreign"])
    registerAppTool(
      server,
      name,
      {
        inputSchema: {},
        _meta: {
          ui: {
            ...(name === "open" ? { resourceUri: uri } : {}),
            visibility: behavior.modelOnly && name === "save" ? ["model"] : ["app"],
          },
        },
      },
      async () => {
        calls++;
        if (name === "save") await behavior.holdSave?.();
        return { content: [] };
      },
    );
  let connects = 0,
    closes = 0;
  let disconnect = async () => {};
  const owners = [installation];
  const host = createPluginSettingsHost({
    root: "/global",
    installations: () => owners,
    inspect: async () => {
      await behavior.holdInspection?.();
      return inventory;
    },
    activate: async (_inventory, options) => {
      connects++;
      if (connects === 1 && behavior.failFirst) throw Error("Transient connection failure");
      expect(options.selectedServers).toEqual(["setup"]);
      expect(options.installationContext).toEqual({ configurationRoot: "/global/plugins" });
      const [transport, peer] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test", version: "1" });
      await server.connect(peer);
      await client.connect(transport);
      const statuses: PackageServerStatus[] = [{ name: "setup", status: "connected" }];
      disconnect = async () => {
        statuses[0]!.status = "failed";
        await client.close();
      };
      return {
        servers: new Map([
          ["setup", { client, callTool: async () => ({ content: [] }), close: async () => {} }],
        ]),
        statuses,
        close: async () => {
          closes++;
          await client.close();
        },
      };
    },
  });
  return {
    host,
    owners,
    installation,
    inventory,
    page,
    connects: () => connects,
    closes: () => closes,
    calls: () => calls,
    disconnect: () => disconnect(),
  };
}
test("installation settings list without activation and mount without a project or optional runtime", async () => {
  const f = await fixture();
  const pages = await f.host.list();
  expect(pages[0]?.title).toBe("Preferences");
  expect(f.connects()).toBe(0);
  const opened = await f.host.open({ installationId: f.installation.id, pageId: f.page.id });
  expect(opened.mountId).toBeTypeOf("string");
  expect(f.connects()).toBe(1);
  await f.host.request({ mountId: opened.mountId, request: { name: "save" } });
  await expect(
    f.host.request({ mountId: opened.mountId, request: { name: "foreign" } }),
  ).rejects.toThrow();
  await expect(
    f.host.request({
      mountId: opened.mountId,
      installationId: "foreign",
      request: { name: "save" },
    }),
  ).rejects.toThrow();
  await f.host.closeMount({ mountId: opened.mountId });
  await f.host.closeMount({ mountId: opened.mountId });
  expect(f.closes()).toBe(0);
  await expect(
    f.host.request({ mountId: opened.mountId, request: { name: "save" } }),
  ).rejects.toThrow();
  await Promise.all([f.host.close(), f.host.close()]);
  expect(f.closes()).toBe(1);
});
test("owner changes invalidate mounts and disabled owners remain discoverable", async () => {
  const f = await fixture();
  const opened = await f.host.open({ installationId: f.installation.id, pageId: f.page.id });
  f.installation.enabled = false;
  await expect(
    f.host.request({ mountId: opened.mountId, request: { name: "save" } }),
  ).rejects.toThrow();
  expect((await f.host.list())[0]?.status).toBe("disabled");
  await expect(
    f.host.open({ installationId: f.installation.id, pageId: f.page.id }),
  ).rejects.toThrow();
  await f.host.close();
  expect(f.closes()).toBe(1);
});

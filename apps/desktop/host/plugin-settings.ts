import { join } from "node:path";
import {
  activatePackage,
  inspectPackage,
  type ActivePackage,
  type ActivatePackageOptions,
} from "@drawloom/local-plugin-packages";
import {
  DrawloomPackageExtensionSchema,
  type PackageInventory,
  type PackageSettingsPage,
} from "@drawloom/plugins";
import { getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { Installation } from "./plugin-installations.js";
import { connectMcpAppClient, type ConnectedMcpApp } from "./mcp-app.js";
import {
  SettingsTargetSchema,
  SettingsMountSchema,
  SettingsRequestSchema,
  type SettingsPage,
} from "../src/lib/plugin-settings-protocol.js";

/** Owns only installation MCP settings sessions. No project, backend, model or conversation input. */
export function createPluginSettingsHost(options: {
  root: string;
  installations(): readonly Installation[];
  inspect?: typeof inspectPackage;
  activate?: typeof activatePackage;
  authProviderFor?: (installation: Installation) => ActivatePackageOptions["authProviderFor"];
}) {
  const inspect = options.inspect ?? inspectPackage;
  const activate = options.activate ?? activatePackage;
  type Slot = {
    installationId: string;
    fingerprint: string;
    pending: Promise<ActivePackage>;
    calls: Set<Promise<unknown>>;
    closing?: Promise<void>;
  };
  const slots = new Map<string, Slot>();
  const retired = new Set<Promise<void>>();
  const mounts = new Map<
    string,
    { installationId: string; fingerprint: string; app: ConnectedMcpApp; slot: Slot }
  >();
  const inFlight = new Set<Promise<unknown>>();
  const ownerGenerations = new Map<string, number>();
  let closing: Promise<void> | undefined;
  let openingCount = 0;
  function expire(installationId: string) {
    for (const [id, value] of mounts)
      if (value.installationId === installationId) mounts.delete(id);
    const pending: Promise<void>[] = [];
    for (const [key, slot] of slots)
      if (slot.installationId === installationId) {
        slots.delete(key);
        pending.push(retire(slot));
      }
    return pending;
  }
  function retire(slot: Slot) {
    if (!slot.closing) {
      slot.closing = Promise.resolve().then(async () => {
        await Promise.allSettled([...slot.calls]);
        const active = await slot.pending.catch(() => undefined);
        await active?.close();
      });
      retired.add(slot.closing);
      void slot.closing.then(
        () => retired.delete(slot.closing!),
        () => {},
      );
    }
    return slot.closing;
  }
  function admit<T>(operation: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(Error("Settings host is closed"));
    if (inFlight.size >= 32) return Promise.reject(Error("Settings request limit reached"));
    const result = Promise.resolve().then(operation);
    inFlight.add(result);
    void result.finally(() => inFlight.delete(result)).catch(() => {});
    return result;
  }
  async function owner(id: string) {
    const generation = ownerGenerations.get(id) ?? 0;
    const installation = options.installations().find((value) => value.id === id);
    if (!installation) {
      expire(id);
      throw Error("Installation unavailable");
    }
    const installationRevision = JSON.stringify(installation);
    const inventory = await inspect(installation.root).catch((error) => {
      expire(id);
      throw error;
    });
    if (
      (ownerGenerations.get(id) ?? 0) !== generation ||
      JSON.stringify(options.installations().find((value) => value.id === id)) !==
        installationRevision
    )
      throw Error("Settings owner changed during inspection");
    const extension =
      inventory.drawloom && DrawloomPackageExtensionSchema.parse(inventory.drawloom);
    const fingerprint = JSON.stringify([installation, inventory, generation]);
    for (const [key, slot] of slots)
      if (slot.installationId === id && slot.fingerprint !== fingerprint) {
        slots.delete(key);
        retire(slot);
      }
    return { installation, inventory, extension, fingerprint };
  }
  async function mount(raw: unknown) {
    const { mountId } = SettingsMountSchema.parse(raw);
    const value = mounts.get(mountId);
    if (!value) throw Error("Settings page is closed");
    const current = await owner(value.installationId);
    if (!current.installation.enabled || current.fingerprint !== value.fingerprint) {
      mounts.delete(mountId);
      throw Error("Settings owner changed; reopen the page");
    }
    if (!mounts.has(mountId) || value.slot.closing) throw Error("Settings page is closed");
    return value;
  }
  async function connection(
    installation: Installation,
    inventory: PackageInventory,
    fingerprint: string,
    page: PackageSettingsPage,
  ) {
    const server = page.openingTool.server;
    if (
      !installation.enabled ||
      !installation.servers.includes(server) ||
      !inventory.servers.some((value) => value.name === server && value.config.type !== "sse")
    )
      throw Error("Enable this plugin and select its settings server first");
    const key = JSON.stringify([fingerprint, server]);
    let slot = slots.get(key);
    if (slot) {
      const previous = slot;
      const active = await previous.pending.catch(() => undefined);
      if (
        !active?.statuses.some((status) => status.name === server && status.status === "connected")
      ) {
        if (slots.get(key) === previous) slots.delete(key);
        for (const [id, value] of mounts) if (value.slot === previous) mounts.delete(id);
        await retire(previous);
        // Another explicit open may already have replaced this failed connection.
        slot = slots.get(key);
      }
    }
    if (!slot) {
      if (slots.size >= 32)
        throw Error(
          "Settings connection limit reached; restart Drawloom to release older connections",
        );
      const authProviderFor = options.authProviderFor?.(installation);
      const pending = activate(inventory, {
        dataRoot: join(options.root, "plugins"),
        installationId: installation.id,
        installationContext: { configurationRoot: join(options.root, "plugins") },
        selectedServers: [server],
        clientCapabilities: {
          extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [RESOURCE_MIME_TYPE] } },
        },
        ...(authProviderFor ? { authProviderFor } : {}),
      });
      slot = { pending, installationId: installation.id, fingerprint, calls: new Set() };
      slots.set(key, slot);
    }
    const selectedSlot = slot;
    const active = await slot.pending.catch((error) => {
      if (slots.get(key) === selectedSlot) slots.delete(key);
      throw error;
    });
    const connected = active.servers.get(server);
    if (!connected) {
      slots.delete(key);
      await retire(slot);
      throw Error("Settings server could not connect");
    }
    return { client: connected.client, slot };
  }
  return {
    list: () =>
      admit(async () => {
        const pages: SettingsPage[] = [];
        for (const installation of options.installations()) {
          try {
            const current = await owner(installation.id);
            const declared = current.inventory.extensions["org.drawloom"];
            if (
              !current.extension &&
              declared &&
              typeof declared === "object" &&
              "settings" in declared
            )
              pages.push({
                installationId: installation.id,
                pageId: "",
                title: "Settings unavailable",
                ownerTitle: installation.name,
                status: "unavailable",
              });
            for (const page of current.extension?.settings ?? []) {
              const selected =
                installation.servers.includes(page.openingTool.server) &&
                current.inventory.servers.some(
                  (server) =>
                    server.name === page.openingTool.server && server.config.type !== "sse",
                );
              pages.push({
                installationId: installation.id,
                pageId: page.id,
                title: page.title,
                ownerTitle: page.workbenchId
                  ? current.extension!.workbenches!.find((value) => value.id === page.workbenchId)!
                      .title
                  : installation.name,
                ...(page.workbenchId ? { workbenchId: page.workbenchId } : {}),
                status: !installation.enabled ? "disabled" : selected ? "available" : "unavailable",
              });
            }
          } catch {
            pages.push({
              installationId: installation.id,
              pageId: "",
              title: "Settings unavailable",
              ownerTitle: installation.name,
              status: "unavailable",
            });
          }
        }
        return pages;
      }),
    open: (raw: unknown) =>
      admit(async () => {
        const target = SettingsTargetSchema.parse(raw);
        if (mounts.size + openingCount >= 16) throw Error("Too many open settings pages");
        openingCount++;
        try {
          const current = await owner(target.installationId);
          const page = current.extension?.settings?.find((value) => value.id === target.pageId);
          if (!page) throw Error("Settings page unavailable");
          const { client, slot } = await connection(
            current.installation,
            current.inventory,
            current.fingerprint,
            page,
          );
          const tools = await client.listTools();
          const cursors = new Set<string>();
          while (tools.nextCursor) {
            if (cursors.has(tools.nextCursor) || tools.tools.length > 2000)
              throw Error("Invalid settings tool catalogue");
            cursors.add(tools.nextCursor);
            const next = await client.listTools({ cursor: tools.nextCursor });
            tools.tools.push(...next.tools);
            tools.nextCursor = next.nextCursor;
          }
          const uri = getToolUiResourceUri(
            tools.tools.find((tool) => tool.name === page.openingTool.tool) ?? {
              name: "",
              inputSchema: { type: "object" },
            },
          );
          if (!uri) throw Error("Settings opening resource unavailable");
          const app = await connectMcpAppClient(
            client,
            page.openingTool.tool,
            uri,
            false,
            page.allowedTools,
          );
          // Connection/resource loading may overlap an installation update.
          if ((await owner(target.installationId)).fingerprint !== current.fingerprint)
            throw Error("Settings owner changed");
          const mountId = crypto.randomUUID();
          mounts.set(mountId, {
            installationId: target.installationId,
            fingerprint: current.fingerprint,
            app,
            slot,
          });
          return { mountId };
        } finally {
          openingCount--;
        }
      }),
    presentation: (raw: unknown) =>
      admit(async () => {
        const { app, installationId } = await mount(raw);
        const approved =
          options.installations().find((value) => value.id === installationId)
            ?.approvedResourceOrigins ?? [];
        return {
          html: app.html,
          resourceDomains: app.resourceDomains.filter((origin) => approved.includes(origin)),
        };
      }),
    request: (raw: unknown) =>
      admit(async () => {
        const input = SettingsRequestSchema.parse(raw);
        const { app, slot } = await mount({ mountId: input.mountId });
        if (slot.closing) throw Error("Settings owner changed");
        const pending = app.callTool(input.request);
        slot.calls.add(pending);
        try {
          return await pending;
        } finally {
          slot.calls.delete(pending);
        }
      }),
    closeMount: (raw: unknown) =>
      admit(async () => {
        mounts.delete(SettingsMountSchema.parse(raw).mountId);
        return {};
      }),
    invalidate(installationId: string) {
      // Trusted revocation cannot queue behind or be rejected by page admission.
      // Expire mounts synchronously; retirement still waits for admitted calls.
      if (closing) return closing;
      ownerGenerations.set(installationId, (ownerGenerations.get(installationId) ?? 0) + 1);
      return Promise.all(expire(installationId)).then(() => undefined);
    },
    close() {
      if (!closing) {
        // Refuse new work synchronously, then drain admitted requests before closing their connections.
        closing = Promise.resolve().then(async () => {
          await Promise.allSettled([...inFlight]);
          mounts.clear();
          for (const slot of slots.values()) retire(slot);
          const results = await Promise.allSettled([...retired]);
          const failures = results.filter(
            (value): value is PromiseRejectedResult => value.status === "rejected",
          );
          if (failures.length)
            throw new AggregateError(
              failures.map((value) => value.reason),
              "Settings connection shutdown failed",
            );
        });
      }
      return closing;
    },
  };
}

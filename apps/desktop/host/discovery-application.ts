import { z } from "zod";
import type { ConversationHistoryStore } from "@drawloom/conversation-history";
import type { ConnectedMcpApp } from "./mcp-app.js";
import { createDiscoveryCache } from "./discovery-cache.js";
import type { createDesktopSessions, DesktopSession } from "./desktop-sessions.js";
import type { createConversationResources } from "./conversation-resources.js";
import type { loadInstalledPackages } from "./plugin-packages.js";
import type { createPluginRegistry } from "@drawloom/startup-plugins";
import {
  DesktopCatalogueSchema,
  ProjectSchema,
  type DesktopCatalogue,
} from "../src/lib/protocol.js";

type Packages = Awaited<ReturnType<typeof loadInstalledPackages>>;
type Registry = ReturnType<typeof createPluginRegistry>;
type Runtime = {
  packages: Pick<
    Packages,
    "pluginPresentation" | "toolPresentation" | "discoverResources" | "readDiscoveredResource"
  >;
  registry: Pick<Registry, "workbenches" | "plugins" | "contributions" | "views">;
  packageToolIds: ReadonlySet<string>;
  knowledgeToolIds: ReadonlySet<string>;
  mcpApps: ReadonlyMap<string, ConnectedMcpApp>;
};

export function createDiscoveryApplication(deps: {
  runtimeForConversation(conversationId: string): Promise<Runtime>;
  requireConversation(
    conversationId: string,
  ): z.infer<typeof ProjectSchema>["conversations"][number];
  project(): z.infer<typeof ProjectSchema>;
  connect(conversationId: string): Promise<DesktopSession>;
  live: ReturnType<typeof createDesktopSessions>;
  history: Pick<ConversationHistoryStore, "get">;
  resourceCollector: ReturnType<typeof createConversationResources>["collector"];
  observeCache(hit: boolean, entries?: number): void;
  localRevision: string;
  experimentalPluginDiscovery?: boolean;
}) {
  const {
    runtimeForConversation,
    requireConversation,
    connect,
    live,
    history,
    resourceCollector,
    observeCache,
    localRevision,
  } = deps;
  const discoveryConnections = new Map<
    string,
    ReturnType<typeof createDiscoveryCache<DesktopSession>>
  >();
  async function discover(
    conversationId: string,
    refresh = false,
    cursor?: string,
  ): Promise<DesktopCatalogue> {
    const { packages, registry, packageToolIds, knowledgeToolIds, mcpApps } =
      await runtimeForConversation(conversationId);
    const conversation = requireConversation(conversationId);
    const workbench = registry.workbenches.find((w) => w.id === conversation.workbenchId)!;
    const entries: DesktopCatalogue["entries"] = registry.plugins.map((p) => ({
      id: `drawloom:plugin:${p.id}`,
      origin: "drawloom",
      kind: "plugin",
      name: p.id,
      ...(packages.pluginPresentation.get(p.id)
        ? { presentation: packages.pluginPresentation.get(p.id) }
        : {}),
      description: `Version ${p.version}. Registered at startup; permissions remain separate.`,
      scope: "startup",
      availability: "available",
      selectable: false,
      revision: localRevision,
    }));
    for (const contribution of registry.contributions) {
      if (contribution.kind !== "skill" && contribution.kind !== "tool") continue;
      const presentation = packages.toolPresentation.get(contribution.contributionId);
      entries.push({
        id: contribution.id,
        origin: presentation?.origin ?? "drawloom",
        kind: contribution.kind,
        name: presentation?.name ?? contribution.title,
        description: presentation?.description ?? contribution.description,
        scope:
          contribution.kind === "skill" && workbench.skills.includes(contribution.contributionId)
            ? "required"
            : "startup",
        availability:
          contribution.kind === "tool" &&
          !workbench.tools.includes(contribution.contributionId) &&
          !packageToolIds.has(contribution.contributionId) &&
          !knowledgeToolIds.has(contribution.contributionId)
            ? "unavailable"
            : "available",
        selectable: contribution.kind === "skill",
        ownerId: `drawloom:plugin:${contribution.pluginId}`,
        revision: localRevision,
      });
    }
    for (const [alias, tool] of packages.toolPresentation) {
      if (tool.available) continue;
      entries.push({
        id: `package-tool:${alias}`,
        origin: tool.origin,
        ownerId: tool.ownerId,
        kind: "tool",
        name: tool.name,
        description: tool.description,
        scope: tool.appOnly ? "app-only" : "unsupported",
        availability: tool.appOnly ? "available" : "unavailable",
        selectable: false,
        revision: localRevision,
      });
    }
    for (const view of registry.views.filter((v) => v.workbenchId === workbench.id)) {
      for (const tool of mcpApps.get(view.id)?.tools ?? []) {
        const visibility = tool._meta?.ui;
        const modelOnly =
          typeof visibility === "object" &&
          visibility &&
          "visibility" in visibility &&
          Array.isArray(visibility.visibility) &&
          !visibility.visibility.includes("app");
        entries.push({
          id: `app:${view.id}:tool:${tool.name}`,
          origin: `app:${view.id}`,
          kind: "tool",
          name: tool.title ?? tool.name,
          description: tool.description ?? "",
          scope: modelOnly ? "model-only" : "app-only",
          availability: modelOnly ? "unavailable" : "available",
          selectable: false,
          ownerId: `drawloom:plugin:${view.pluginId}`,
          revision: localRevision,
        });
      }
    }
    let categories: DesktopCatalogue["categories"] = [];
    let nextCursor: string | undefined;
    if (conversation.provider === "codex") {
      try {
        let connection = discoveryConnections.get(conversationId);
        if (!connection) {
          connection = createDiscoveryCache(() => connect(conversationId));
          discoveryConnections.set(conversationId, connection);
        }
        const read = connection.read(refresh, live.get(conversationId));
        if (read.status === "error") throw Error("Native discovery unavailable");
        const session = live.get(conversationId)?.session ?? read.value?.session;
        if (!session)
          categories = (["skill", "tool", "app"] as const).map((kind) => ({
            kind,
            status: "loading",
            message: "Connecting to Codex. Registered contributions are ready.",
          }));
        else {
          const result = await session.discovery?.list({
            refresh,
            wait: false,
            ...(cursor ? { cursor } : {}),
          });
          if (result?.status === "ok") {
            entries.push(
              ...result.value.entries.map((e) => ({
                ...e,
                revision: result.value.revision,
              })),
            );
            categories = result.value.categories;
            nextCursor = result.value.nextCursor;
          } else
            categories = [
              {
                kind: "skill",
                status: result ? "error" : "unsupported",
                message: result
                  ? "Native discovery changed during loading. Refresh to try again; registered contributions remain visible."
                  : "Native discovery is unavailable. Registered contributions remain visible.",
              },
            ];
        }
      } catch {
        categories = (["skill", "tool", "app", "resource"] as const).map((kind) => ({
          kind,
          status: "error" as const,
          message:
            "Codex discovery is unavailable. Registered contributions remain visible; refresh to retry.",
        }));
      }
    }
    const packageResources = await packages.discoverResources(refresh, false);
    entries.push(...packageResources.entries);
    categories.push(...packageResources.categories);
    return DesktopCatalogueSchema.parse({
      entries,
      categories,
      ...(nextCursor ? { nextCursor } : {}),
      experimentalPluginDiscovery: deps.experimentalPluginDiscovery ?? true,
    });
  }

  return {
    discover,
    async authenticateIntegration(
      conversationId: string,
      selection: { id: string; revision: string },
    ) {
      const conversation = deps.project().conversations.find((c) => c.id === conversationId);
      if (!conversation || conversation.provider !== "codex")
        throw Error("Native sign-in is unavailable for this conversation");
      const result = await (await connect(conversationId)).session.discovery?.authenticate?.(
        selection,
      );
      if (result?.status !== "ok")
        throw Error("Native sign-in is unavailable. Refresh discovery and try again.");
      return result.value;
    },
    async readDiscoveredResource(
      conversationId: string,
      selection: { id: string; revision: string },
    ) {
      if (!deps.project().conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      const id = selection.id.startsWith("package-resource:")
        ? `native-listed:${selection.id}:${selection.revision}`
        : `native-listed:${selection.id}`;
      const cached = await history.get(conversationId, id);
      observeCache(Boolean(cached));
      if (cached) return cached;
      const catalogue = await discover(conversationId);
      const entry = catalogue.entries.find(
        (e) =>
          e.id === selection.id &&
          e.revision === selection.revision &&
          e.kind === "resource" &&
          e.readable,
      );
      if (!entry) throw Error("Resource unavailable");
      if (entry.id.startsWith("package-resource:")) {
        const { packages } = await runtimeForConversation(conversationId);
        const result = await packages.readDiscoveredResource(selection);
        return resourceCollector(conversationId).capture({
          id,
          source: entry.origin,
          content: result.contents.map((resource) => ({
            type: "resource" as const,
            resource,
          })),
        });
      }
      const result = await (await connect(conversationId)).session.discovery?.readResource?.(
        selection,
      );
      if (result?.status !== "ok") throw Error("Resource unavailable");
      return resourceCollector(conversationId).capture({
        id,
        source: entry.origin,
        content: result.value,
      });
    },
  };
}

import { join } from "node:path";
import { mkdir } from 'node:fs/promises';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { HistoryPageOptionsSchema, HistoryChangeOptionsSchema, type HistoryEntry, type HistoryPageOptions, type HistoryChangeOptions } from '@drawloom/conversation-history';
import { createHistoryCoordinator } from './history-coordinator.js';
import { createResourceRecovery } from './resource-recovery.js';
import {
  createNodeJsonStore,
  createStdioTransport,
  codexCommand,
  createMcpToolServer,
} from "@drawloom/node-host";
import {
  createCodexDriver,
  createCodexToolBridge,
} from "@drawloom/codex-agent";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { createPluginRegistry } from "@drawloom/startup-plugins";
import type { AgentSession } from "@drawloom/agent";
import type { Asset, JsonValue } from "@drawloom/host";
import type { ToolBinding } from "@drawloom/tools";
import {
  OperatorSnapshotSchema,
  OperatorResultSchema,
  type OperatorController,
} from "@drawloom/workbench";
import {
  DesktopCommandSchema,
  DesktopSnapshotSchema,
  ProjectSchema,
  ViewTargetSchema,
  DesktopViewRequestSchema,
  DesktopViewInteractionSchema,
  DesktopViewSessionSchema,
  DesktopCatalogueSchema,
  type DesktopCatalogue,
  type DesktopSnapshot,
} from "../src/lib/protocol.js";
import { createTextController } from "./text-controller.js";
import {
  createDesktopAssets,
  browserImportByteLimit,
  browserImportTypes,
  nativeRpcMessageByteLimit,
} from "./assets.js";
import {
  textPlugin,
  mcpReviewConfiguration,
  type DesktopExtension,
  type DesktopExtensionFactory,
} from "./composition.js";
import { createDesktopEvidence } from "./evidence.js";
import { connectMcpApp } from './mcp-app.js';
import { createViewContext } from './view-context.js';
import { createResourceContent } from './resource-content.js';

type Live = {
  session: AgentSession;
  signals: DesktopSnapshot["signals"];
  active?: string;
  close: () => Promise<void>;
};
export async function createDesktopApplication(
  root: string,
  external?: DesktopExtension | DesktopExtensionFactory,
  options: { experimentalPluginDiscovery?: boolean } = {},
) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const history = createSqliteConversationHistory(join(root, 'history.sqlite'));
  const writers = new Map<string, ReturnType<typeof createHistoryCoordinator>>();
  function writer(id: string) {
    let found = writers.get(id);
    if (!found) { found = createHistoryCoordinator(history, id); writers.set(id, found); }
    return found;
  }
  const store = createNodeJsonStore(join(root, "state"));
  const assets = createDesktopAssets(join(root, "assets"));
  const text = await createTextController(store);
  const controllers = new Map<string, OperatorController>([["text", text]]);
  let project = ProjectSchema.parse(
    (await store.get("project")) ?? {
      version: 1,
      conversations: [
        {
          id: crypto.randomUUID(),
          title: "A clearer introduction",
          workbenchId: "text",
          provider: "synthetic",
        },
      ],
      selectedId: "pending",
      assets: [],
    },
  );
  if (project.selectedId === "pending")
    project.selectedId = project.conversations[0]!.id;
  const live = new Map<string, Live>();
  const submissions = new Map<string, { text: string; assets: Asset[]; selections: NonNullable<HistoryEntry['selections']>; resources: NonNullable<HistoryEntry['resources']> }[]>();
  const localRevision = crypto.randomUUID();
  const pumps = new Set<Promise<void>>();
  const viewContext = createViewContext();
  let viewMount: { conversationId: string; viewId: string; mountId: string } | undefined;
  const evidence = new Map<
    string,
    Promise<Awaited<ReturnType<typeof createDesktopEvidence>>>
  >();
  function evidenceFor(id: string) {
    let value = evidence.get(id);
    if (!value) {
      value = createDesktopEvidence(store, id);
      evidence.set(id, value);
    }
    return value;
  }
  const recoveries = new Map<string, Promise<ReturnType<typeof createResourceRecovery>>>();
  function recoveryFor(id: string) {
    let recovery = recoveries.get(id);
    if (!recovery) {
      recovery = evidenceFor(id).then(sink => createResourceRecovery(sink.activity(), async result => {
        if (result.outcome.status !== 'ok' || !result.outcome.content) return;
        await resourceCollector(id).capture({ id: 'tool-resource:' + result.invocationId, source: 'drawloom',
          ...(result.operationId ? { operationId: result.operationId } : {}), content: result.outcome.content });
      }));
      recoveries.set(id, recovery);
    }
    return recovery;
  }
  async function recoverResources(id: string) {
    try { await (await recoveryFor(id)).recover(); return true; }
    catch { writer(id).reportStorageFailure(); return false; }
  }
  async function synchronizeHistory(id: string, reader: AgentSession['history'], direction: 'latest' | 'older' = 'latest') {
    // Missing rich results must be recovered before native coverage can advance
    // or reconciliation can clear the storage warning.
    if (await recoverResources(id)) await writer(id).synchronize(reader, direction);
  }
  const opening = new Map<string, Promise<Live>>();
  const grants = new Map<string, Set<string>>();
  let notice = 'Conversation display is saved locally. Provider transcripts and execution remain with the provider.';
  let projectWrites: Promise<unknown> = Promise.resolve();
  const persist = () => {
    const copy = structuredClone(project);
    const next = projectWrites.then(() => store.set('project', copy));
    projectWrites = next.catch(() => {}); return next;
  };
  await persist();
  function resourceCollector(conversationId: string) {
    return createResourceContent({
      assets: { read: assets.read, put: async (bytes, mediaType) => {
        const asset = await assets.put(bytes, mediaType);
        if (!project.assets.some(a => a.key === asset.key)) project.assets.push(asset);
        await persist(); return asset;
      } },
      knownAsset: key => project.assets.find(a => a.key === key),
      existing: id => history.get(conversationId, id),
      save: async entry => {
        await writer(conversationId).write(entry);
        if (!await history.get(conversationId, entry.id)) throw Error('Resource capture could not be persisted');
      },
    });
  }
  const extension =
    typeof external === "function"
      ? await external({
          store: {
            get: (key) => store.get("extension:" + key),
            set: (key, value) => store.set("extension:" + key, value),
          },
          assets: {
            read: assets.read,
            put: async (bytes, mediaType) => {
              const asset = await assets.put(bytes, mediaType);
              if (!project.assets.some((a) => a.key === asset.key))
                project.assets.push(asset);
              await persist();
              return asset;
            },
          },
        })
      : external;
  const registry = createPluginRegistry(
    [{ plugin: textPlugin, config: {} }, ...(extension?.installs ?? [])],
    ["agent"],
  );
  for (const [key, controller] of extension?.controllers ?? []) {
    if (
      controllers.has(key) ||
      !registry.workbenches.some((w) => w.id === key) ||
      typeof controller.snapshot !== "function" ||
      typeof controller.dispatch !== "function"
    )
      throw Error("Invalid startup controller");
    OperatorSnapshotSchema.parse(await controller.snapshot());
    controllers.set(key, controller);
  }
  const mcpApps = new Map<string, Awaited<ReturnType<typeof connectMcpApp>>>();
  try {
    for (const key of extension?.mcpApps?.keys() ?? [])
      if (!registry.views.some(view => view.id === key)) throw Error('Unregistered startup MCP app');
    for (const view of registry.views) {
      const connection = extension?.mcpApps?.get(view.id);
      if (!connection) throw Error('Missing startup MCP app');
      mcpApps.set(view.id, await connectMcpApp(connection, view.entrypoint));
    }
  } catch (error) { await Promise.all([...mcpApps.values()].map(app => app.close())); throw error; }
  function viewTarget(raw: unknown) {
    const target = ViewTargetSchema.parse(raw);
    const conversation = project.conversations.find(c => c.id === project.selectedId);
    const view = registry.views.find(v => v.id === target.viewId);
    if (target.conversationId !== conversation?.id || !view || view.workbenchId !== conversation.workbenchId)
      throw Error('View unavailable');
    return view;
  }
  async function refreshGrants(workbenchId: string) {
    const state = OperatorSnapshotSchema.parse(
      await controllers.get(workbenchId)!.snapshot(),
    );
    grants.set(
      workbenchId,
      new Set(state.grants.filter((g) => g.allowed).map((g) => g.toolName)),
    );
    return state;
  }
  async function connect(conversationId: string): Promise<Live> {
    const existing = live.get(conversationId);
    if (existing) return existing;
    const pending = opening.get(conversationId);
    if (pending) return pending;
    const start = (async () => {
      const conversation = project.conversations.find(
        (c) => c.id === conversationId,
      );
      if (!conversation) throw Error("Conversation unavailable");
      const workbench = registry.workbenches.find(
        (w) => w.id === conversation.workbenchId,
      );
      if (!workbench || !controllers.has(workbench.id))
        throw Error("Workbench controller unavailable");
      if (conversation.provider === "synthetic" && workbench.id !== "text")
        throw Error(
          "Synthetic mode is available only in Text studio. Choose Codex for this workbench.",
        );
      await refreshGrants(workbench.id);
      const messages = new Map<string, Omit<HistoryEntry, 'position'>>();
      const signals: DesktopSnapshot["signals"] = [];
      const historyWriter = writer(conversationId);
      const operationBindings = new Map<string, ToolBinding>();
      const sink = await evidenceFor(conversationId);
      const resourceRecovery = await recoveryFor(conversationId);
      const gateway = createLocalToolGateway({
        tools: registry.tools.filter((t) => workbench.tools.includes(t.name)),
        policy: (operationId, name) =>
          operationBindings.has(operationId) &&
          Boolean(grants.get(workbench.id)?.has(name)),
        nextInvocationId: () => crypto.randomUUID(),
        evidence: { record: async record => {
          await sink.record(record);
          if (record.kind === 'finished') {
            try { await resourceRecovery.record(record.result); }
            catch { historyWriter.reportStorageFailure(); }
          }
        } },
      });
      const bridge = createCodexToolBridge(gateway);
      const mcp =
        conversation.provider === "codex" && gateway.exposure.tools.length
          ? await createMcpToolServer({
              exposure: gateway.exposure,
              invoke: (metadata, name, args, signal) =>
                bridge.call(metadata, name, args, signal),
            })
          : undefined;
      const driver =
        conversation.provider === "synthetic"
          ? createSyntheticDriver(async (input) => {
              await text.addText(input);
              return "Saved your text as a draft. You can edit, compare and review it in the artifact pane.";
            })
          : createCodexDriver({
              experimentalPluginDiscovery: options.experimentalPluginDiscovery === true,
              onToolContent: async result => {
                // Our gateway already captured its correlated execution result.
                if (result.source === 'drawloom' || !result.content.some(c => c.type !== 'text')) return;
                try { return await resourceCollector(conversationId).capture({ ...result, source: `codex:${result.source}`, save: !result.deferHistoryCommit }); }
                catch { historyWriter.reportStorageFailure(); throw Error('Resource capture could not be persisted'); }
              },
              connect: async () =>
                createStdioTransport({
                  ...codexCommand(),
                  cwd: root,
                  maxMessageBytes: nativeRpcMessageByteLimit,
                }),
              store,
              imageInput: assets.imageInput,
              captureImage: async result => {
                const asset = await assets.captureImage(result);
                if (!project.assets.some(existing => existing.key === asset.key)) { project.assets.push(asset); await persist(); }
                return asset;
              },
              projection: (): JsonValue =>
                mcp
                  ? {
                      drawloom: {
                        url: mcp.url,
                        http_headers: { Authorization: "Bearer " + mcp.token },
                        ...mcpReviewConfiguration(gateway.exposure),
                      },
                    }
                  : {},
              onTurnAccepted: (thread, turn, operation) => {
                const binding = gateway.bind(operation);
                operationBindings.set(operation, binding);
                bridge.publish(thread, turn, binding);
              },
              onTurnFinished: (thread, turn) => {
                bridge.retire(thread, turn);
              },
            });
      // Tokens belong to isolated provider configuration, never model context.
      const result = await driver.openSession({
        sessionId: conversationId,
        context: {
          text: registry.skills
            .filter((s) => workbench.skills.includes(s.id))
            .map((s) => s.instructions)
            .join("\n"),
        },
        tools:
          conversation.provider === "synthetic"
            ? { id: "synthetic-no-agent-tools", tools: [] }
            : gateway.exposure,
      });
      if (result.status !== "ok") {
        await mcp?.close();
        throw Error(result.failure.message);
      }
      const session = result.value;
      const state: Live = {
        session,
        signals,
        close: async () => {
          for (const binding of operationBindings.values())
            gateway.revoke(binding);
          await session.close();
          await mcp?.close();
        },
      };
      live.set(conversationId, state);
      const pump = (async () => {
        for await (const signal of session.signals()) {
          if (
            signal.kind === "message.delta" ||
            signal.kind === "message.completed"
          ) {
            const key = signal.operationId + ":" + signal.messageId;
            let message = messages.get(key);
            if (!message) {
              message = {
                id: key,
                role: signal.kind === 'message.completed' ? (signal.role ?? 'assistant') : 'assistant',
                text: "",
                assets: signal.kind === 'message.completed' ? (signal.assets ?? []) : [],
                operationId: signal.operationId,
                state: 'partial',
              };
              messages.set(key, message);
            }
            message.text =
              signal.kind === "message.delta"
                ? message.text + signal.delta
                : signal.text;
            message.state = signal.kind === 'message.completed' ? 'complete' : 'partial';
            if (signal.kind === 'message.completed' && signal.assets) message.assets = signal.assets;
            if (signal.kind === 'message.completed' && signal.role === 'user') {
              const submission = submissions.get(signal.operationId)?.shift();
              if (submission) Object.assign(message, submission);
            }
            await historyWriter.write({ ...message });
            if (message.state === 'complete') messages.delete(key);
          } else if (signal.kind === "artifact.available") {
            try {
            if (!project.assets.some((a) => a.key === signal.asset.key)) {
              project.assets.push(signal.asset);
              await persist();
            }
            await historyWriter.writeAsset(signal.messageId ? signal.operationId + ':' + signal.messageId : crypto.randomUUID(), signal.operationId, signal.asset);
            } catch { historyWriter.reportStorageFailure(); }
            try {
            await controllers.get(workbench.id)?.observeArtifact?.({
              operationId: signal.operationId,
              asset: signal.asset,
            });
            } catch { notice = 'The provider returned an asset, but workbench intake could not be saved. No execution was retried.'; }
          } else {
            signals.push(signal);
            if (signal.kind === "operation.started" && !state.active)
              state.active = signal.operationId;
            if (
              [
                "operation.completed",
                "operation.failed",
                "operation.interrupted",
              ].includes(signal.kind)
            ) {
              if ('operationId' in signal && state.active === signal.operationId)
                delete state.active;
              for (const message of messages.values()) await historyWriter.write({ ...message, state: 'interrupted' });
              messages.clear();
              await historyWriter.flush();
              if (session.history) await synchronizeHistory(conversationId, session.history);
            }
          }
        }
      })().catch(async () => {
        delete state.active;
        notice = "Session connection failed. Restart the host to reconnect.";
        await state.close();
        live.delete(conversationId);
        await historyWriter.unavailable();
      });
      pumps.add(pump); void pump.finally(() => pumps.delete(pump));
      // Direct synthetic tool invocation is explicit local composition, not a second agent loop.
      syntheticInvoke.set(conversationId, async (operation, input) => {
        const binding = gateway.bind(operation);
        operationBindings.set(operation, binding);
        try {
          await gateway.invoke(
            binding,
            "text.word_count",
            { text: input },
            new AbortController().signal,
          );
        } finally {
          gateway.revoke(binding);
          operationBindings.delete(operation);
        }
      });
      if (conversation.provider === 'codex') void synchronizeHistory(conversationId, session.history);
      return state;
    })();
    opening.set(conversationId, start);
    try {
      return await start;
    } finally {
      opening.delete(conversationId);
    }
  }
  const syntheticInvoke = new Map<
    string,
    (operation: string, input: string) => Promise<void>
  >();
  const unavailable = {
    artifacts: [],
    candidates: [],
    reviews: [],
    readiness: "unavailable" as const,
    summary: "Install a matching trusted operator controller at startup.",
    configuration: [],
    grants: [],
  };
  return {
    async discover(conversationId: string, refresh = false): Promise<DesktopCatalogue> {
      const conversation = project.conversations.find(c => c.id === conversationId);
      if (!conversation) throw Error('Conversation unavailable');
      const workbench = registry.workbenches.find(w => w.id === conversation.workbenchId)!;
      const entries: DesktopCatalogue['entries'] = registry.plugins.map(p => ({ id: `drawloom:plugin:${p.id}`, origin: 'drawloom', kind: 'plugin', name: p.id,
        description: `Version ${p.version}. Registered at startup; permissions remain separate.`, scope: 'startup', availability: 'available', selectable: false, revision: localRevision }));
      for (const contribution of registry.contributions) {
        if (contribution.kind !== 'skill' && contribution.kind !== 'tool') continue;
        entries.push({ id: contribution.id, origin: 'drawloom', kind: contribution.kind, name: contribution.title, description: contribution.description,
          scope: contribution.kind === 'skill' && workbench.skills.includes(contribution.contributionId) ? 'required' : 'startup',
          availability: contribution.kind === 'tool' && !workbench.tools.includes(contribution.contributionId) ? 'unavailable' : 'available',
          selectable: contribution.kind === 'skill', ownerId: `drawloom:plugin:${contribution.pluginId}`, revision: localRevision });
      }
      for (const view of registry.views.filter(v => v.workbenchId === workbench.id)) {
        for (const tool of mcpApps.get(view.id)?.tools ?? []) {
          const visibility = tool._meta?.ui;
          const modelOnly = typeof visibility === 'object' && visibility && 'visibility' in visibility && Array.isArray(visibility.visibility) && !visibility.visibility.includes('app');
          entries.push({ id: `app:${view.id}:tool:${tool.name}`, origin: `app:${view.id}`, kind: 'tool', name: tool.title ?? tool.name,
            description: tool.description ?? '', scope: modelOnly ? 'model-only' : 'app-only', availability: modelOnly ? 'unavailable' : 'available',
            selectable: false, ownerId: `drawloom:plugin:${view.pluginId}`, revision: localRevision });
        }
      }
      let categories: DesktopCatalogue['categories'] = [];
      if (conversation.provider === 'codex') {
        try {
          const result = await (await connect(conversationId)).session.discovery?.list({ refresh });
          if (result?.status === 'ok') { entries.push(...result.value.entries.map(e => ({ ...e, revision: result.value.revision }))); categories = result.value.categories; }
          else categories = [{ kind: 'skill', status: result ? 'error' : 'unsupported', message: result ? 'Native discovery changed during loading. Refresh to try again; registered contributions remain visible.' : 'Native discovery is unavailable. Registered contributions remain visible.' }];
        } catch { categories = [{ kind: 'skill', status: 'error', message: 'Codex discovery is unavailable. Registered contributions remain visible.' }]; }
      }
      return DesktopCatalogueSchema.parse({ entries, categories, experimentalPluginDiscovery: options.experimentalPluginDiscovery === true });
    },
    async readDiscoveredResource(conversationId: string, selection: { id: string; revision: string }) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const id = `native-listed:${selection.id}`;
      const cached = await history.get(conversationId, id);
      if (cached) return cached;
      const catalogue = await this.discover(conversationId);
      const entry = catalogue.entries.find(e => e.id === selection.id && e.revision === selection.revision && e.kind === 'resource' && e.readable);
      if (!entry) throw Error('Resource unavailable');
      const result = await (await connect(conversationId)).session.discovery?.readResource?.(selection);
      if (result?.status !== 'ok') throw Error('Resource unavailable');
      return resourceCollector(conversationId).capture({ id, source: entry.origin, content: result.value });
    },
    assets,
    async historyPage(conversationId: string, raw: HistoryPageOptions = {}) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const options = HistoryPageOptionsSchema.parse(raw);
      await recoverResources(conversationId);
      let page = await history.page(conversationId, options);
      if (options.before && page.entries.length < (options.limit ?? 50) && page.status.hasOlder) {
        const session = live.get(conversationId)?.session;
        if (session?.history) { await synchronizeHistory(conversationId, session.history, 'older'); page = await history.page(conversationId, options); }
      }
      const error = writer(conversationId).error;
      return error ? { ...page, status: { ...page.status, sync: 'error' as const, message: error } } : writer(conversationId).syncing ? { ...page, status: { ...page.status, sync: 'syncing' as const } } : page;
    },
    async historyChanges(conversationId: string, raw: HistoryChangeOptions = {}) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const changes = await history.changes(conversationId, HistoryChangeOptionsSchema.parse(raw));
      const error = writer(conversationId).error;
      return error ? { ...changes, status: { ...changes.status, sync: 'error' as const, message: error } } : writer(conversationId).syncing ? { ...changes, status: { ...changes.status, sync: 'syncing' as const } } : changes;
    },
    viewSession(raw: unknown) {
      const input = DesktopViewSessionSchema.parse(raw);
      const target = { conversationId: input.conversationId, viewId: input.viewId };
      if (input.action === 'open') {
        viewTarget(target);
        viewContext.clear();
        viewMount = { ...target, mountId: crypto.randomUUID() };
        return { mountId: viewMount.mountId };
      }
      // A late teardown must not clear a replacement mount's reference material.
      if (viewMount?.mountId === input.mountId && viewMount.conversationId === input.conversationId && viewMount.viewId === input.viewId) {
        viewMount = undefined;
        viewContext.clear();
      }
      return {};
    },
    viewHtml(raw: unknown) {
      const view = viewTarget(raw);
      return mcpApps.get(view.id)!.html;
    },
    async viewRequest(raw: unknown) {
      const { request, ...target } = DesktopViewRequestSchema.parse(raw);
      const view = viewTarget(target);
      const app = mcpApps.get(view.id)!;
      const result = await app.callTool(request);
      if (result.content.some(b => b.type !== 'text')) {
        const identity = Bun.hash(JSON.stringify(result.content)).toString(16);
        try { await resourceCollector(target.conversationId).capture({ id: `app-resource:${view.id}:${identity}`,
          source: 'app:' + view.id, content: result.content, readable: uri => app.canRead(uri) }); }
        catch { writer(target.conversationId).reportStorageFailure(); }
      }
      return result;
    },
    async resourcePage(conversationId: string, viewId: string, cursor?: string) {
      viewTarget({ conversationId, viewId });
      return mcpApps.get(viewId)!.listResources(cursor);
    },
    async openListedResource(conversationId: string, viewId: string, uri: string) {
      viewTarget({ conversationId, viewId });
      const app = mcpApps.get(viewId)!;
      if (!app.canRead(uri)) throw Error('Resource unavailable');
      const id = `listed-resource:${Bun.hash(viewId + ':' + uri).toString(16)}`;
      const cached = await history.get(conversationId, id);
      if (cached) return cached;
      const result = await app.readResource(uri);
      return resourceCollector(conversationId).capture({ id, source: 'app:' + viewId,
        content: result.contents.filter(r => r.uri === uri).map(r => ({ type: 'resource', resource: r })) });
    },
    async readResource(conversationId: string, entryId: string, resourceId: string) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const entry = await history.get(conversationId, entryId);
      const resource = entry?.resources?.find(r => r.id === resourceId);
      if (!resource || !entry) throw Error('Resource unavailable');
      if (resource.asset) return resource;
      if (!resource.uri) throw Error('Resource unavailable');
      let content: import('@drawloom/tools').ToolContent;
      if (resource.retrieval && resource.source.startsWith('codex:')) {
        const result = await (await connect(conversationId)).session.discovery?.readResource?.(resource.retrieval);
        if (result?.status !== 'ok') throw Error('Resource unavailable');
        content = result.value;
      } else if (resource.source.startsWith('app:')) {
        const viewId = resource.source.slice(4);
        viewTarget({ conversationId, viewId });
        const result = await mcpApps.get(viewId)!.readResource(resource.uri, true);
        content = result.contents.filter(r => r.uri === resource.uri).map(r => ({ type: 'resource', resource: r }));
      } else throw Error('Resource unavailable');
      const captured = await resourceCollector(conversationId).capture({ id: `${entryId}:read:${resourceId}`, source: resource.source,
        content });
      const ready = captured.resources?.find(r => r.asset && r.uri === resource.uri);
      if (!ready) throw Error('Resource unavailable');
      const updated = { ...resource, asset: ready.asset, status: 'ready' as const };
      await writer(conversationId).write({ ...entry, resources: entry.resources!.map(r => r.id === resourceId ? updated : r) });
      return updated;
    },
    async viewInteraction(raw: unknown): Promise<{ isError?: boolean }> {
      const { request, mountId, ...target } = DesktopViewInteractionSchema.parse(raw);
      viewTarget(target);
      if (viewMount?.mountId !== mountId || viewMount.conversationId !== target.conversationId || viewMount.viewId !== target.viewId) throw Error('View unavailable');
      if (request.method === 'ui/update-model-context') {
        viewContext.set(target, request.params);
        return {};
      }
      // A plugin cannot choose another thread, impersonate the assistant or
      // silently steer an active turn. Standard ui/message permits rejection.
      if (request.params.role !== 'user' || request.params.content.some(c => c.type !== 'text')) return { isError: true };
      const text = request.params.content.map(c => c.type === 'text' ? c.text : '').join('\n');
      if (!text.trim() || text.length > 100_000) return { isError: true };
      try {
        const state = await connect(target.conversationId);
        if (state.active) return { isError: true };
        await this.command({ kind: 'send', conversationId: target.conversationId, text, attachmentKeys: [], contextArtifactIds: [] });
        return {};
      } catch { return { isError: true }; }
    },
    async snapshot() {
      const conversation = project.conversations.find(
        (c) => c.id === project.selectedId,
      )!;
      const state = live.get(project.selectedId);
      const controller = controllers.get(conversation.workbenchId);
      const operator = controller ? await controller.snapshot() : unavailable;
      const retained = await evidenceFor(conversation.id);
      return DesktopSnapshotSchema.parse({
        workspace: "Local workspace",
        conversations: project.conversations,
        workbenches: registry.workbenches,
        views: registry.views,
        selectedId: project.selectedId,
        signals: state?.signals ?? [],
        activity: retained.activity().map(result => result.outcome.status === 'ok'
          ? { ...result, outcome: { status: 'ok', text: result.outcome.text, value: result.outcome.value } } : result),
        pendingTools: retained.pending(),
        operator,
        ...(state?.active ? { activeOperation: state.active } : {}),
        controls: {
          steer: Boolean(state?.session.steer),
          interrupt: Boolean(state?.session.interrupt),
          reviewerModes: state?.session.reviewerModes ?? ['human'],
        },
        plugins: registry.plugins.map((p) => ({
          id: p.id,
          status: "ready",
          summary: "Registered at startup. Tool grants are separate.",
        })),
        notice,
        activeContext: viewContext.forConversation(conversation.id),
      });
    },
    async restore() {
      const c = project.conversations.find((c) => c.id === project.selectedId);
      if (c?.provider === "codex") {
        void connect(c.id).catch(async () => {
          await writer(c.id).unavailable();
          notice =
            "Codex unavailable. Check installation and sign-in, then restart the host. Synthetic mode is a separate choice.";
        });
      }
    },
    async command(raw: unknown) {
      const command = DesktopCommandSchema.parse(raw);
      if (command.kind === "create_conversation") {
        if (!registry.workbenches.some((w) => w.id === command.workbenchId))
          throw Error("Workbench unavailable");
        const id = crypto.randomUUID();
        project.conversations.push({
          id,
          title: "New conversation",
          workbenchId: command.workbenchId,
          provider: command.provider,
          reviewer: 'human',
        });
        project.selectedId = id;
        viewContext.clear();
        viewMount = undefined;
        await persist();
        if (command.provider === "codex") await this.restore();
      } else if (command.kind === "select_conversation") {
        if (!project.conversations.some((c) => c.id === command.conversationId))
          throw Error("Conversation unavailable");
        project.selectedId = command.conversationId;
        viewContext.clear();
        viewMount = undefined;
        await persist();
        await this.restore();
      } else if (command.kind === "operator") {
        const controller = controllers.get(command.workbenchId);
        if (!controller) throw Error("Controller unavailable");
        const result = OperatorResultSchema.parse(
          await controller.dispatch(command.command),
        );
        if (result.status === "rejected") throw Error(result.message);
        await refreshGrants(command.workbenchId);
      } else {
        const state = await connect(command.conversationId);
        const conversation = project.conversations.find(
          (c) => c.id === command.conversationId,
        )!;
        if (command.kind === 'set_reviewer') {
          if (state.active) throw Error('Review mode can change only while idle');
          if (!state.session.reviewerModes.includes(command.reviewer)) throw Error('This provider does not support the selected review mode');
          const previous = conversation.reviewer;
          conversation.reviewer = command.reviewer;
          try { await persist(); } catch (error) { conversation.reviewer = previous; throw error; }
        } else if (command.kind === "stop") {
          if (!state.active || !state.session.interrupt)
            throw Error("This provider does not support interruption");
          const result = await state.session.interrupt(state.active);
          if (result.status !== "ok") throw Error(result.failure.message);
        } else if (command.kind === "approval") {
          const result = await state.session.resolveApproval(
            command.resolution,
          );
          if (result.status !== "ok") throw Error(result.failure.message);
        } else if (command.kind === "input") {
          const result = await state.session.respondToInput(command.resolution);
          if (result.status !== "ok") throw Error(result.failure.message);
        } else {
          const op = state.active ?? crypto.randomUUID();
          const operator = await refreshGrants(conversation.workbenchId);
          const catalogue = command.selections.length ? await this.discover(conversation.id) : undefined;
          const selected = [...new Map(command.selections.map(s => [s.id, s])).values()].map(selection => {
            const entry = catalogue?.entries.find(e => e.id === selection.id && e.revision === selection.revision);
            if (!entry || !entry.selectable || entry.availability !== 'available') throw Error('Selection unavailable. Refresh the catalogue and select it again.');
            return entry;
          });
          const selectedInstructions = selected.filter(e => e.origin === 'drawloom').flatMap(e => {
            const contribution = registry.contributions.find(c => c.id === e.id && c.kind === 'skill');
            if (!contribution || registry.workbenches.find(w => w.id === conversation.workbenchId)!.skills.includes(contribution.contributionId)) return [];
            return registry.skills.filter(s => s.id === contribution.contributionId).map(s => s.instructions);
          });
          const attachments = command.attachmentKeys.map((key) => {
            const a = project.assets.find((a) => a.key === key);
            if (!a) throw Error("Attachment unavailable");
            return a;
          });
          const context = command.contextArtifactIds.map((id) => {
            const a = operator.artifacts.find((a) => a.id === id);
            if (!a || a.content.kind !== "text")
              throw Error("Only text documents can be attached as context");
            return a.content.text;
          });
          const selectedResources: NonNullable<HistoryEntry['resources']> = [];
          for (const selection of command.resourceSelections) {
            const entry = await history.get(conversation.id, selection.entryId);
            const resource = entry?.resources?.find(r => r.id === selection.resourceId);
            if (!resource?.asset || !['text/plain', 'text/markdown'].includes(resource.asset.mediaType)) throw Error('Only ready text resources can be selected as context');
            const bytes = await assets.read(resource.asset.key);
            if (bytes.length > 100_000) throw Error('Selected context is too large');
            context.push(new TextDecoder().decode(bytes));
            selectedResources.push(resource);
          }
          const imageAttachments: Asset[] = [];
          for (const attachment of attachments) {
            if (['text/plain', 'text/markdown'].includes(attachment.mediaType)) {
              const bytes = await assets.read(attachment.key);
              if (bytes.length > 100_000) throw Error('Selected context is too large');
              context.push(new TextDecoder().decode(bytes));
            } else if (attachment.mediaType.startsWith('image/')) imageAttachments.push(attachment);
            else throw Error('This file is viewable, but is not supported as direct model input. Use a suitable tool instead.');
          }
          // User-selected documents stay untrusted user content, never developer instructions.
          if (conversation.provider === 'synthetic' && imageAttachments.length) throw Error('Synthetic mode accepts text. Attachments remain available as artifacts; choose Codex to send images.');
          if (context.reduce((size, text) => size + text.length, 0) + command.text.length + viewContext.forConversation(conversation.id).length > 200_000) throw Error('Selected context is too large');
          const input = {
            operationId: op,
            reviewer: conversation.reviewer,
            text: [
              command.text,
              ...context.map(
                (t) => "\nSelected document (reference material):\n" + t,
              ),
            ].join("\n") + viewContext.forConversation(conversation.id),
            ...(imageAttachments.length ? { attachments: imageAttachments } : {}),
            ...(selectedInstructions.length ? { additionalContext: { text: selectedInstructions.join('\n') } } : {}),
            selections: selected.filter(e => e.origin !== 'drawloom').map(e => ({ id: e.id, revision: e.revision })),
          };
          if (conversation.provider === 'synthetic') await writer(conversation.id).write({
            id: crypto.randomUUID(), role: 'user', text: command.text, assets: attachments, operationId: op, state: 'complete',
            selections: selected.map(e => ({ id: e.id, title: e.name, source: e.origin })),
            resources: selectedResources,
          });
          const starting = !state.active;
          const submitted = { text: command.text, assets: attachments, selections: selected.map(e => ({ id: e.id, title: e.name, source: e.origin })), resources: selectedResources };
          if (conversation.provider === 'codex') {
            const pending = submissions.get(op) ?? []; pending.push(submitted); submissions.set(op, pending);
          }
          // Command serialization does not drain the asynchronous signal/history
          // pump. Lock the chosen reviewer before execute can accept this turn.
          if (starting) state.active = op;
          try {
            const result = starting
              ? await state.session.execute(input)
              : await (state.session.steer?.(input) ??
                  Promise.reject(Error("Steering unavailable")));
            if (result.status !== "ok") throw Error(result.failure.message);
          } catch (error) {
            const pending = submissions.get(op);
            if (pending) submissions.set(op, pending.filter(s => s !== submitted));
            if (starting && state.active === op) delete state.active;
            throw error;
          }
          if (
            conversation.title === "New conversation" ||
            conversation.title === "A clearer introduction"
          ) {
            const title = command.text.replace(/\s+/g, " ").trim();
            conversation.title =
              title.length > 64
                ? title.slice(0, 61).replace(/\s+\S*$/, "") + "…"
                : title;
            await persist();
          }
          if (conversation.provider === "synthetic")
            await syntheticInvoke.get(conversation.id)?.(op, command.text);
        }
      }
      return this.snapshot();
    },
    async importAsset(bytes: Uint8Array, mediaType: string, name: string, conversationId = project.selectedId) {
      const workbenchId = project.conversations.find(
        (c) => c.id === conversationId,
      )?.workbenchId;
      if (!workbenchId) throw Error('Conversation unavailable');
      if (
        bytes.length > browserImportByteLimit ||
        !browserImportTypes.has(mediaType)
      )
        throw Error("Unsupported or oversized file");
      const asset = await assets.put(bytes, mediaType);
      if (!project.assets.some((a) => a.key === asset.key))
        project.assets.push(asset);
      await persist();
      if (workbenchId === "text") await text.addAsset(asset, name);
      else if (workbenchId)
        await controllers.get(workbenchId)?.observeArtifact?.({
          operationId: `import-${crypto.randomUUID()}`,
          asset,
        });
      return asset;
    },
    async authorizedAsset(key: string): Promise<Asset> {
      const asset = project.assets.find((a) => a.key === key);
      if (!asset) throw Error("Asset unavailable");
      return asset;
    },
    async close() {
      await Promise.allSettled([...opening.values()]);
      await Promise.all([...live.values()].map((s) => s.close()));
      await Promise.all([...pumps]);
      await Promise.all([...mcpApps.values()].map(app => app.close()));
      await Promise.all([...writers.values()].map(w => w.close()));
      await projectWrites;
      await history.close();
    },
  };
}

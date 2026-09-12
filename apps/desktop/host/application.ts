import { basename, join } from "node:path";
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { createInstallationStore } from './plugin-installations.js';
import { createOrchestrationHost } from './orchestration-host.js';
import { createWorkflowAuthority } from './workflow-authority.js';
import { createWorkflowToolScope } from './workflow-tools.js';
import { createGrantRefresh } from './grant-refresh.js';
import type { createLocalTemporalManager } from '@drawloom/temporal-orchestration';
import { loadInstalledPackages } from './plugin-packages.js';
import { createElicitationPresenter } from './elicitation.js';
import { PackageActionSchema, PackageInspectionSchema, ResourceOriginSchema } from '../src/lib/package-protocol.js';
import { createPluginCredentialStore } from './plugin-credentials.js';
import { createPluginOAuthManager } from './plugin-oauth.js';
import { readClientRegistration } from './plugin-registration.js';
import { createDiscoveryCache } from './discovery-cache.js';
import { PackageOAuthActionSchema } from '../src/lib/package-protocol.js';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { HistoryPageOptionsSchema, HistoryChangeOptionsSchema, type HistoryEntry, type HistoryPageOptions, type HistoryChangeOptions } from '@drawloom/conversation-history';
import { createHistoryCoordinator } from './history-coordinator.js';
import { bindProjectDirectory, verifyProjectDirectory } from './projects.js';
import { createResourceRecovery } from './resource-recovery.js';
import {
  createNodeJsonStore,
  createNodeAssetStore,
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
  ResourceReadSchema,
  type DesktopCatalogue,
  type DesktopSnapshot,
  type DirectoryProject,
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
} from "./composition.js";
import { createDesktopEvidence } from "./evidence.js";
import type { ConnectedMcpApp } from './mcp-app.js';
import { createViewContext } from './view-context.js';
import { createResourceContent } from './resource-content.js';
import { createMediaPolicy, remoteMediaUrl } from './media-policy.js';
import { observed, observeOutcome, observedRpc, observedToolGateway, observedTools, observedAssets, instrumentApplication, createOperationTelemetry, observeCache } from './telemetry.js';
import { createManagedLocalKnowledgeClient } from '@drawloom/local-knowledge-runtime';
import { createKnowledgeHost, type KnowledgeService } from './knowledge-host.js';
import { createInstalledGitKnowledgeFeed } from './knowledge-source.js';
import { createKnowledgeNightloom, isNightloomKnowledgeService } from './knowledge-nightloom.js';
import { createKnowledgePlugin, KNOWLEDGE_RETRIEVAL_GUIDANCE, KNOWLEDGE_TOOL_IDS, knowledgeObservation } from './knowledge-tools.js';

type Live = {
  session: AgentSession;
  signals: DesktopSnapshot["signals"];
  active?: string;
  close: () => Promise<void>;
};
export async function retireCreatedRuntimes<T>(
  runtimes: ReadonlyMap<string, Promise<T>>,
  retire: (runtime: T) => Promise<void>,
) {
  const retired = new Map<string, Promise<T>>();
  while (true) {
    const created = [...runtimes].filter(([key, runtime]) => retired.get(key) !== runtime);
    if (!created.length) return;
    await Promise.all(created.map(async ([, runtime]) => retire(await runtime)));
    for (const [key, runtime] of created) retired.set(key, runtime);
  }
}
export async function createDesktopApplication(
  root: string,
  options: { experimentalPluginDiscovery?: boolean; mediaOrigins?: readonly string[];
    orchestration?: { temporalPath?: string; nodePath?: string; runtimeDirectory?: string; manager?: () => Promise<ReturnType<typeof createLocalTemporalManager>> };
    knowledge?: { service?: KnowledgeService; nodePath?: string; runtimeEntrypoint?: string; nightloomDirectory?: string } } = {},
) {
  const operationTelemetry = createOperationTelemetry();
  const mediaOrigins = z.array(ResourceOriginSchema).parse(options.mediaOrigins ?? []);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const history = createSqliteConversationHistory(join(root, 'history.sqlite'));
  const writers = new Map<string, ReturnType<typeof createHistoryCoordinator>>();
  function writer(id: string) {
    let found = writers.get(id);
    if (!found) { found = createHistoryCoordinator(history, id); writers.set(id, found); }
    return found;
  }
  const store = createNodeJsonStore(join(root, "state"));
  const mediaPolicy = await createMediaPolicy(store,mediaOrigins);
  const assets = observedAssets(createDesktopAssets(join(root, "assets")));
  let project = ProjectSchema.parse(
    (await store.get("project")) ?? {
      version: 1,
      conversations: [],
      selectedId: "",
      assets: [],
    },
  );
  if (project.selectedId === "pending")
    project.selectedId = project.conversations[0]?.id ?? '';
  const live = new Map<string, Live>();
  const discoveryConnections = new Map<string, ReturnType<typeof createDiscoveryCache<Live>>>();
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
        const tool = sink.toolFor(result.invocationId);
        const { packages } = await runtimeForConversation(id);
        const source = tool ? packages.toolSources.get(tool) ?? 'drawloom' : 'drawloom';
        await resourceCollector(id).capture({ id: 'tool-resource:' + result.invocationId, source,
          readable: () => packages.canReadSource(source),
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
  let notice = 'Conversation display is saved locally. Provider transcripts and execution remain with the provider.';
  let projectWrites: Promise<unknown> = Promise.resolve();
  const persist = () => {
    const copy = JSON.parse(JSON.stringify(project)) as JsonValue;
    const next = projectWrites.then(() => store.set('project', copy));
    projectWrites = next.catch(() => {}); return next;
  };
  await persist();
  function resourceCollector(conversationId: string) {
    return createResourceContent({
      assets: { ...assets, put: async (bytes, mediaType) => {
        const asset = await assets.put(bytes, mediaType);
        if (!project.assets.some(a => a.key === asset.key)) project.assets.push(asset);
        await persist(); return asset;
      } },
      knownAsset: key => project.assets.find(a => a.key === key),
      declaredMedia: (source,content) => mediaPolicy.capture(source,content),
      existing: id => history.get(conversationId, id),
      save: async entry => {
        await writer(conversationId).write(entry);
        if (!await history.get(conversationId, entry.id)) throw Error('Resource capture could not be persisted');
      },
    });
  }
  const compositionContext = {
          store: {
            get: (key: string) => store.get(key),
            set: (key: string, value: JsonValue) => store.set(key, value),
          },
          assets: {
            ...assets,
            putStream: async (chunks: AsyncIterable<Uint8Array>, mediaType: string, options?: { signal?: AbortSignal }) => {
              const asset = await assets.putStream(chunks, mediaType, options);
              if (!project.assets.some(a => a.key === asset.key)) project.assets.push(asset);
              await persist(); return asset;
            },
            put: async (bytes: Uint8Array, mediaType: string) => {
              const asset = await assets.put(bytes, mediaType);
              if (!project.assets.some((a) => a.key === asset.key))
                project.assets.push(asset);
              await persist();
              return asset;
            },
          },
        };
  const installations = await createInstallationStore(store);
  let oauthRedirect = '';
  const oauth = createPluginOAuthManager({ credentials: await createPluginCredentialStore(), redirectUrl: () => oauthRedirect });
  async function oauthConnection(id: string, serverName: string) {
    const { packages } = await selectedRuntime();
    const server = packages.activeServer(id, serverName);
    if (!server) throw Error('Activate this installation and restart before connecting');
    if (server.config.type !== 'streamable-http') throw Error('This server does not use Drawloom HTTP authentication');
    return oauth.connection({ installationId: id, serverName, serverUrl: server.config.url });
  }
  const elicitation = createElicitationPresenter(operationId => project.conversations.find(c => live.get(c.id)?.active === operationId)?.id);
  const runtimes = new Map<string, Promise<Awaited<ReturnType<typeof createRuntime>>>>();
  const workflowAuthority = createWorkflowAuthority();
  const createTemporalManager = options.orchestration?.manager ?? (async () => {
      const { createLocalTemporalManager } = await import('@drawloom/temporal-orchestration');
      return createLocalTemporalManager({ dataDirectory: root,
        ...(options.orchestration?.temporalPath ? { temporalPath: options.orchestration.temporalPath } : {}),
        ...(options.orchestration?.nodePath ? { nodePath: options.orchestration.nodePath } : {}),
        ...(options.orchestration?.runtimeDirectory ? { runtimeDirectory: options.orchestration.runtimeDirectory } : {}) });
    });
  let temporalManager: Promise<ReturnType<typeof createLocalTemporalManager>> | undefined;
  const manager = () => temporalManager ??= createTemporalManager();
  const orchestration = createOrchestrationHost({ dataDirectory: root,
    manager,
    ensureProject: async id => {
      const binding = project.projects.find(p => p.id === id);
      if (!binding) throw Error('Project unavailable');
      await verifyProjectDirectory(binding, root);
      await runtimeFor(binding);
    },
  });
  const knowledgeService = options.knowledge?.service ?? createManagedLocalKnowledgeClient({
    root: join(root, 'knowledge'), workingDirectory: root,
    ...(options.knowledge?.nodePath ? { nodePath: options.knowledge.nodePath } : {}),
    ...(options.knowledge?.runtimeEntrypoint ? { runtimeEntrypoint: options.knowledge.runtimeEntrypoint } : {}),
  });
  const knowledgePlugin = createKnowledgePlugin(knowledgeService);
  function runtimeFor(binding?: DirectoryProject) {
    const key = binding?.id ?? 'legacy';
    let runtime = runtimes.get(key);
    if (!runtime) { runtime = createRuntime(binding); runtimes.set(key, runtime); }
    const current = runtime;
    return current.then(async value => {
      if (!binding || value.activated || !await verifyProjectDirectory(binding, root).then(() => true, () => false)) return value;
      // An offline display placeholder has never activated installed code.
      // Activate it once the original directory returns, not by replacing an
      // already-running project. Concurrent callers share the same startup.
      const latest = runtimes.get(key)!;
      if (latest !== current) return latest;
      const starting = value.packages.close().then(() => createRuntime(binding));
      runtimes.set(key, starting);
      return starting;
    });
  }
  function selectedRuntime() { return runtimeFor(project.projects.find(p => p.id === project.selectedProjectId)); }
  async function disconnectPackageRuntimes(installationId: string, serverName: string) {
    await retireCreatedRuntimes(runtimes, runtime => runtime.packages.disconnect(installationId, serverName));
  }
  function runtimeForConversation(id: string) {
    const conversation = project.conversations.find(c => c.id === id);
    if (!conversation) throw Error('Conversation unavailable');
    return runtimeFor(project.projects.find(p => p.id === conversation.projectId));
  }
  async function requireProject(id: string) {
    const conversation = project.conversations.find(c => c.id === id);
    const binding = project.projects.find(p => p.id === conversation?.projectId);
    if (!binding) throw Error('Assign a project directory before continuing this conversation');
    await verifyProjectDirectory(binding, root);
    return binding;
  }
  async function createRuntime(binding?: DirectoryProject) {
    const runtimeRoot = binding ? join(root, 'projects', binding.id) : root;
    const runtimeStore = binding ? createNodeJsonStore(join(runtimeRoot, 'state')) : store;
    const text = await createTextController(runtimeStore);
    const controllers = new Map<string, OperatorController>([['text', text]]);
    const grants = new Map<string, Set<string>>();
    const knowledgeToolIds = new Set<string>(KNOWLEDGE_TOOL_IDS);
    const knowledgeGrants = z.record(z.string(), z.array(z.string())).parse((await runtimeStore.get('knowledge-tool-grants')) ?? {});
    const refreshWorkbenchGrants = createGrantRefresh(grants,
      async id => {
        const controller = controllers.get(id);
        if (!controller) throw Error('Workbench unavailable');
        return OperatorSnapshotSchema.parse(await controller.snapshot());
      },
      (snapshot, id) => new Set([...snapshot.grants.filter(g => g.allowed).map(g => g.toolName),
        ...(packageGrants[id] ?? []).filter(name => packageToolIds.has(name)),
        ...(knowledgeGrants[id] ?? []).filter(name => knowledgeToolIds.has(name))]));
    const workflowScopes = new Map<string, ReturnType<typeof createWorkflowToolScope>>();
    async function ready() {
      const pending = binding && runtimes.get(binding.id);
      if (!pending) throw Error('Project runtime unavailable');
      await pending;
    }
    // Installing remains global. Only connections and working state are scoped.
    const available = binding ? await verifyProjectDirectory(binding, root).then(() => true, () => false) : false;
    const packages = await loadInstalledPackages({ root: runtimeRoot, installations: available ? installations.startup : [],
    ...(binding ? { project: { id: binding.id, directory: binding.directory } } : {}),
    mediaPolicy,
    host: { ...compositionContext, store: runtimeStore },
    builtins: [{ plugin: textPlugin, config: {} }, knowledgePlugin],
    elicitation: elicitation.request,
    authProviderFor: installation => server => oauth.connection({ installationId: installation.id, serverName: server.name, serverUrl: server.config.url }).provider,
    ...(binding ? { prepareWorkflows: (installation, inventory) => orchestration.prepare(binding.id, installation, inventory,
      handlers => workflowAuthority.wrap({ projectId: binding.id, installationId: installation.id }, handlers, async () => {
        await ready(); await verifyProjectDirectory(binding, root);
        await workflowScopes.get(installation.id)?.refresh();
      })) } : {}),
    toolsFor: (installation, tools, workbenchIds) => {
      const ownedWorkbenchIds: string[] = [];
      const workflow = createWorkflowToolScope({ authority: workflowAuthority, projectId: binding?.id ?? '', installationId: installation.id,
        workbenchIds: ownedWorkbenchIds, grants, store: runtimeStore,
        refreshGrants: async () => {
          await ready();
          if (!binding) throw Error('Project unavailable');
          await verifyProjectDirectory(binding, root);
          // No task/workbench association exists: every owned workbench must grant.
          ownedWorkbenchIds.splice(0, ownedWorkbenchIds.length, ...registry.contributions.filter(c => c.kind === 'workbench' && c.pluginId === `package:${installation.id}:backend`).map(c => c.contributionId));
          await refreshWorkbenchGrants(ownedWorkbenchIds);
        },
      });
      workflowScopes.set(installation.id, workflow);
      return workflow.wrap(observedToolGateway(createLocalToolGateway({ tools: observedTools(tools),
      nextInvocationId: () => crypto.randomUUID(),
      policy: (operationId, name) => {
        if (workflowAuthority.current()) return workflow.allowed(operationId, name);
        const owner = project.conversations.find(c => live.get(c.id)?.active === operationId);
        return Boolean(owner && owner.projectId === binding?.id && workbenchIds.includes(owner.workbenchId) && grants.get(owner.workbenchId)?.has(name));
      },
      evidence: { record: async record => {
        const operationId = record.kind === 'started' ? record.operationId : record.result.operationId;
        if (workflowAuthority.current()) { await workflow.record(record); return; }
        const owner = project.conversations.find(c => live.get(c.id)?.active === operationId);
        if (!operationId || !owner || owner.projectId !== binding?.id || !workbenchIds.includes(owner.workbenchId)) throw Error('No active operation owns this tool invocation');
        await (await evidenceFor(owner.id)).record(record);
        if (record.kind === 'finished') await (await recoveryFor(owner.id)).record(record.result);
      } },
    }), operationTelemetry));
    },
  });
  const packageToolIds = packages.toolIds;
  const packageGrants = z.record(z.string(), z.array(z.string())).parse((await runtimeStore.get('package-grants')) ?? {});
  const registry = createPluginRegistry(
    [{ plugin: textPlugin, config: {} }, knowledgePlugin, ...packages.installs],
    ["agent", "host"],
  );
  for (const [key, controller] of packages.controllers) {
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
  const mcpApps = new Map<string, ConnectedMcpApp>();
  try {
    for (const view of registry.views) {
      const packaged = packages.mcpApps.get(view.workbenchId);
      if (packaged) { mcpApps.set(view.id, packaged); continue; }
      // Invalid or unavailable package views remain unavailable, never fall back
      // to arbitrary startup transports.
    }
  } catch (error) { await Promise.all([...mcpApps.values()].map(app => app.close())); throw error; }
    return { packages, packageToolIds, packageGrants, knowledgeToolIds, knowledgeGrants, registry, controllers, grants, refreshWorkbenchGrants, text, mcpApps, store: runtimeStore, activated: available };
  }
  const nightloom = isNightloomKnowledgeService(knowledgeService) ? createKnowledgeNightloom({ service: knowledgeService, store,
    packageDirectory: options.knowledge?.nightloomDirectory ?? join(import.meta.dir, '../../../packages/knowledge/nightloom'),
    settings: async () => (await knowledgeService.status()).configuration,
    prepareHost: owner => manager().then(instance => instance.prepareHost(owner)),
  }) : undefined;
  const knowledge = createKnowledgeHost({
    service: knowledgeService, store,
    selectedProjectId: () => project.selectedProjectId,
    sourceForProject: async projectId => {
      const binding = project.projects.find(candidate => candidate.id === projectId);
      if (!binding) throw Error('Configured knowledge source project is unavailable');
      await verifyProjectDirectory(binding, root);
      const runtime = await runtimeFor(binding);
      return createInstalledGitKnowledgeFeed({ projectId,
        tools: runtime.registry.tools.filter(tool => runtime.packageToolIds.has(tool.name)),
        presentation: runtime.packages.toolPresentation });
    }, ...(nightloom ? { nightloom } : {}),
  });
  async function viewTarget(raw: unknown) {
    const target = ViewTargetSchema.parse(raw);
    const conversation = project.conversations.find(c => c.id === project.selectedId);
    const { registry } = await runtimeForConversation(target.conversationId);
    const view = registry.views.find(v => v.id === target.viewId);
    if (target.conversationId !== conversation?.id || !view || view.workbenchId !== conversation.workbenchId)
      throw Error('View unavailable');
    return view;
  }
  async function refreshGrants(workbenchId: string, runtime: Awaited<ReturnType<typeof createRuntime>>) {
    return (await runtime.refreshWorkbenchGrants([workbenchId])).get(workbenchId)!;
  }
  async function connect(conversationId: string): Promise<Live> {
    const binding = await requireProject(conversationId);
    const existing = live.get(conversationId);
    if (existing) return existing;
    const pending = opening.get(conversationId);
    if (pending) return pending;
    const start = (async () => {
      const conversation = project.conversations.find(
        (c) => c.id === conversationId,
      );
      if (!conversation) throw Error("Conversation unavailable");
      const runtime = await runtimeForConversation(conversationId);
      const { registry, controllers, packageToolIds, knowledgeToolIds, grants, text } = runtime;
      const workbench = registry.workbenches.find(
        (w) => w.id === conversation.workbenchId,
      );
      if (!workbench || !controllers.has(workbench.id))
        throw Error("Workbench controller unavailable");
      if (conversation.provider === "synthetic" && workbench.id !== "text")
        throw Error(
          "Synthetic mode is available only in Text studio. Choose Codex for this workbench.",
        );
      await refreshGrants(workbench.id, runtime);
      const messages = new Map<string, Omit<HistoryEntry, 'position'>>();
      const signals: DesktopSnapshot["signals"] = [];
      const historyWriter = writer(conversationId);
      const operationBindings = new Map<string, ToolBinding>();
      const sink = await evidenceFor(conversationId);
      const resourceRecovery = await recoveryFor(conversationId);
      const gateway = observedToolGateway(createLocalToolGateway({
        tools: observedTools(registry.tools.filter((t) => workbench.tools.includes(t.name) || packageToolIds.has(t.name) || knowledgeToolIds.has(t.name))),
        policy: (operationId, name) =>
          operationBindings.has(operationId) &&
          Boolean(grants.get(workbench.id)?.has(name)),
        nextInvocationId: () => crypto.randomUUID(),
        evidence: { record: async record => {
          await sink.record(record);
          if (record.kind === 'finished') {
            try { await resourceRecovery.record(record.result); }
            catch { historyWriter.reportStorageFailure(); }
            try {
              const tool = sink.toolFor(record.result.invocationId);
              const presentation = tool ? runtime.packages.toolPresentation.get(tool) : undefined;
              const observation = tool ? knowledgeObservation({ toolName: tool,
                ...(presentation ? { registeredName: presentation.name } : {}),
                ...(runtime.packages.toolSources.get(tool) ? { producerOrigin: runtime.packages.toolSources.get(tool)! } : {}),
                invocationId: record.result.invocationId, outcome: record.result.outcome }) : undefined;
              if (observation) {
                const saved = await knowledgeService.ingest(observation);
                if (saved.kind !== 'accepted' && saved.kind !== 'duplicate') knowledge.reportObservationFailure();
              }
            } catch { knowledge.reportObservationFailure(); }
          }
        } },
      }), operationTelemetry);
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
              workingDirectory: binding.directory,
              experimentalPluginDiscovery: options.experimentalPluginDiscovery === true,
              onToolContent: async result => {
                // Our gateway already captured its correlated execution result.
                if (result.source === 'drawloom' || !result.content.some(c => c.type !== 'text')) return;
                try { return await resourceCollector(conversationId).capture({ ...result, source: `codex:${result.source}`, save: !result.deferHistoryCommit }); }
                catch { historyWriter.reportStorageFailure(); throw Error('Resource capture could not be persisted'); }
              },
              connect: async () =>
                observedRpc(createStdioTransport({
                  ...codexCommand(),
                  cwd: binding.directory,
                  maxMessageBytes: nativeRpcMessageByteLimit,
                })),
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
      const result = await observed('host.connect', {}, async () => {
        const result = await driver.openSession({
        sessionId: conversationId,
        context: {
          text: [registry.skills
            .filter((s) => workbench.skills.includes(s.id))
            .map((s) => s.instructions)
            .join("\n"), KNOWLEDGE_RETRIEVAL_GUIDANCE].filter(Boolean).join("\n\n"),
        },
        tools:
          conversation.provider === "synthetic"
            ? { id: "synthetic-no-agent-tools", tools: [] }
            : gateway.exposure,
        });
        if (result.status !== 'ok') observeOutcome('error');
        return result;
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
          if (state.active) operationTelemetry.end(state.active, 'unknown');
          for (const binding of operationBindings.values())
            gateway.revoke(binding);
          await session.close();
          await mcp?.close();
        },
      };
      live.set(conversationId, state);
      const pump = (async () => {
        for await (const signal of session.signals()) {
          operationTelemetry.signal(signal);
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
  const application = {
    installations,
    workflowOwners: orchestration.owners,
    workflowRuns: orchestration.list,
    workflowSteps: orchestration.steps,
    workflowCommand: orchestration.command,
    knowledgeCommand: knowledge.command,
    bindOAuthRedirect: (url: string) => { oauthRedirect = url; },
    oauthCallback: (url: URL) => oauth.callback(url),
    async packageOAuth(raw: unknown) {
      const { packages } = await selectedRuntime();
      const input = PackageOAuthActionSchema.parse(raw);
      const connection = await oauthConnection(input.id, input.server);
      if (input.action === 'configure-client') {
        if ([...live.values()].some(session => session.active)) throw Error('Wait for current work to finish before configuring authentication');
        const registration = await readClientRegistration(input.registrationFile);
        const disconnected = await connection.disconnect();
        await disconnectPackageRuntimes(input.id, input.server);
        if (disconnected.state === 'failed') throw Error('Disconnect existing credentials before replacing registration');
        return connection.configureClient(registration);
      }
      if (input.action === 'status') return connection.status();
      if (input.action === 'connect') return connection.login();
      if (input.action === 'cancel') return connection.cancel();
      if (input.action === 'disconnect') {
        // Drop the authenticated MCP session as well as credentials.
        try { return await connection.disconnect(); }
        finally { await disconnectPackageRuntimes(input.id, input.server); }
      }
      if ([...live.values()].some(session => session.active)) throw Error('Wait for current work to finish before reconnecting');
      return { ...connection.status(), ...await packages.reconnect(input.id, input.server) };
    },
    packageStatuses: async () => (await selectedRuntime()).packages.statuses,
    async installedPackages() {
      const { packages } = await selectedRuntime();
      return Promise.all(installations.list().map(async ({ configuration: _configuration, ...installation }) => {
        const current = packages.statuses.find(s => s.id === installation.id);
        let availableServers = installation.servers.map(name => ({ name, transport: 'unknown' }));
        try { availableServers = (await installations.inspect(installation.root)).servers.map(server => ({ name: server.name, transport: server.config.type })); }
        catch { /* Retain selected identities and existing readiness errors if metadata is inaccessible. */ }
        return { ...installation, pendingRestart: installations.pendingRestart(installation.id), status: current?.status ?? 'not-active',
          availableServers, diagnostics: current?.codes ?? [], connections: (current?.servers ?? []).map(s => ({ ...s, transport: packages.transportFor(installation.id, s.name) ?? 'unknown' })) };
      }));
    },
    async packageAction(raw: unknown) {
      const action = PackageActionSchema.parse(raw);
      if (action.action === 'inspect') {
        const inventory = await installations.inspect(action.root);
        return PackageInspectionSchema.parse({ root: inventory.root, name: inventory.name, version: inventory.version,
          backend: Boolean(inventory.drawloom?.backend), skills: inventory.skills.map(s => s.name),
          servers: inventory.servers.map(s => ({ name: s.name, transport: s.config.type })),
          diagnostics: inventory.diagnostics.map(d => `${d.component}: ${d.code}`) });
      }
      if (action.action === 'add') await installations.add(action.root);
      else {
        const current = installations.list().find(i => i.id === action.id);
        if (!current) throw Error('Installation unavailable');
        await orchestration.changeInstallation(action.id, () => installations.configure(action.id, { ...action.settings, configuration: action.settings.configuration ?? current.configuration }),()=>installations.pendingRestart(action.id));
      }
      return this.installedPackages();
    },
    async discover(conversationId: string, refresh = false, cursor?: string): Promise<DesktopCatalogue> {
      const { packages, registry, packageToolIds, knowledgeToolIds, mcpApps } = await runtimeForConversation(conversationId);
      const conversation = project.conversations.find(c => c.id === conversationId);
      if (!conversation) throw Error('Conversation unavailable');
      const workbench = registry.workbenches.find(w => w.id === conversation.workbenchId)!;
      const entries: DesktopCatalogue['entries'] = registry.plugins.map(p => ({ id: `drawloom:plugin:${p.id}`, origin: 'drawloom', kind: 'plugin', name: p.id,
        description: `Version ${p.version}. Registered at startup; permissions remain separate.`, scope: 'startup', availability: 'available', selectable: false, revision: localRevision }));
      for (const contribution of registry.contributions) {
        if (contribution.kind !== 'skill' && contribution.kind !== 'tool') continue;
        const presentation = packages.toolPresentation.get(contribution.contributionId);
        entries.push({ id: contribution.id, origin: presentation?.origin ?? 'drawloom', kind: contribution.kind, name: presentation?.name ?? contribution.title, description: presentation?.description ?? contribution.description,
          scope: contribution.kind === 'skill' && workbench.skills.includes(contribution.contributionId) ? 'required' : 'startup',
          availability: contribution.kind === 'tool' && !workbench.tools.includes(contribution.contributionId) && !packageToolIds.has(contribution.contributionId) && !knowledgeToolIds.has(contribution.contributionId) ? 'unavailable' : 'available',
          selectable: contribution.kind === 'skill', ownerId: `drawloom:plugin:${contribution.pluginId}`, revision: localRevision });
      }
      for (const [alias, tool] of packages.toolPresentation) {
        if (tool.available) continue;
        entries.push({ id: `package-tool:${alias}`, origin: tool.origin, ownerId: tool.ownerId, kind: 'tool', name: tool.name,
          description: tool.description, scope: tool.appOnly ? 'app-only' : 'unsupported', availability: tool.appOnly ? 'available' : 'unavailable',
          selectable: false, revision: localRevision });
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
      let nextCursor: string | undefined;
      if (conversation.provider === 'codex') {
        try {
          let connection = discoveryConnections.get(conversationId);
          if(!connection){connection=createDiscoveryCache(()=>connect(conversationId));discoveryConnections.set(conversationId,connection);}
          const read=connection.read(refresh,live.get(conversationId));
          if(read.status==='error')throw Error('Native discovery unavailable');
          const session=live.get(conversationId)?.session ?? read.value?.session;
          if(!session)categories=(['skill','tool','app'] as const).map(kind=>({kind,status:'loading',message:'Connecting to Codex. Registered contributions are ready.'}));
          else {
            const result=await session.discovery?.list({refresh,wait:false,...(cursor?{cursor}:{})});
            if(result?.status==='ok'){entries.push(...result.value.entries.map(e=>({...e,revision:result.value.revision})));categories=result.value.categories;nextCursor=result.value.nextCursor;}
            else categories=[{kind:'skill',status:result?'error':'unsupported',message:result?'Native discovery changed during loading. Refresh to try again; registered contributions remain visible.':'Native discovery is unavailable. Registered contributions remain visible.'}];
          }
        } catch { categories = (['skill', 'tool', 'app', 'resource'] as const).map(kind => ({ kind, status: 'error' as const, message: 'Codex discovery is unavailable. Registered contributions remain visible; refresh to retry.' })); }
      }
      const packageResources = await packages.discoverResources(refresh, false);
      entries.push(...packageResources.entries); categories.push(...packageResources.categories);
      return DesktopCatalogueSchema.parse({ entries, categories, ...(nextCursor?{nextCursor}:{}), experimentalPluginDiscovery: options.experimentalPluginDiscovery === true });
    },
    async authenticateIntegration(conversationId: string, selection: { id: string; revision: string }) {
      const conversation = project.conversations.find(c => c.id === conversationId);
      if (!conversation || conversation.provider !== 'codex') throw Error('Native sign-in is unavailable for this conversation');
      const result = await (await connect(conversationId)).session.discovery?.authenticate?.(selection);
      if (result?.status !== 'ok') throw Error('Native sign-in is unavailable. Refresh discovery and try again.');
      return result.value;
    },
    async readDiscoveredResource(conversationId: string, selection: { id: string; revision: string }) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const id = selection.id.startsWith('package-resource:')
        ? `native-listed:${selection.id}:${selection.revision}` : `native-listed:${selection.id}`;
      const cached = await history.get(conversationId, id);
      observeCache(Boolean(cached));
      if (cached) return cached;
      const catalogue = await this.discover(conversationId);
      const entry = catalogue.entries.find(e => e.id === selection.id && e.revision === selection.revision && e.kind === 'resource' && e.readable);
      if (!entry) throw Error('Resource unavailable');
      if (entry.id.startsWith('package-resource:')) {
        const { packages } = await runtimeForConversation(conversationId);
        const result = await packages.readDiscoveredResource(selection);
        return resourceCollector(conversationId).capture({ id, source: entry.origin, content: result.contents.map(resource => ({ type: 'resource' as const, resource })) });
      }
      const result = await (await connect(conversationId)).session.discovery?.readResource?.(selection);
      if (result?.status !== 'ok') throw Error('Resource unavailable');
      return resourceCollector(conversationId).capture({ id, source: entry.origin, content: result.value });
    },
    assets,
    async openWorkingFile(conversationId: string, path: string) {
      const binding = await requireProject(conversationId);
      // This is a read-only store operation; viewing never registers an asset.
      return createNodeAssetStore(binding.directory, binding).open(path);
    },
    async historyPage(conversationId: string, raw: HistoryPageOptions = {}) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const options = HistoryPageOptionsSchema.parse(raw);
      await recoverResources(conversationId);
      let page = await history.page(conversationId, options);
      let cacheHit = true;
      if (options.before && page.entries.length < (options.limit ?? 50) && page.status.hasOlder) {
        const session = live.get(conversationId)?.session;
        if (session?.history) { cacheHit = false; await synchronizeHistory(conversationId, session.history, 'older'); page = await history.page(conversationId, options); }
      }
      observeCache(cacheHit, page.entries.length);
      const error = writer(conversationId).error;
      return error ? { ...page, status: { ...page.status, sync: 'error' as const, message: error } } : writer(conversationId).syncing ? { ...page, status: { ...page.status, sync: 'syncing' as const } } : page;
    },
    async historyChanges(conversationId: string, raw: HistoryChangeOptions = {}) {
      if (!project.conversations.some(c => c.id === conversationId)) throw Error('Conversation unavailable');
      const changes = await history.changes(conversationId, HistoryChangeOptionsSchema.parse(raw));
      const error = writer(conversationId).error;
      return error ? { ...changes, status: { ...changes.status, sync: 'error' as const, message: error } } : writer(conversationId).syncing ? { ...changes, status: { ...changes.status, sync: 'syncing' as const } } : changes;
    },
    async viewSession(raw: unknown) {
      const input = DesktopViewSessionSchema.parse(raw);
      const target = { conversationId: input.conversationId, viewId: input.viewId };
      if (input.action === 'open') {
        await viewTarget(target);
        viewContext.clear();
        viewMount = { ...target, mountId: crypto.randomUUID() };
        return { mountId: viewMount.mountId, mediaRevision: mediaPolicy.snapshot().revision };
      }
      // A late teardown must not clear a replacement mount's reference material.
      if (viewMount?.mountId === input.mountId && viewMount.conversationId === input.conversationId && viewMount.viewId === input.viewId) {
        viewMount = undefined;
        viewContext.clear();
      }
      return {};
    },
    async viewHtml(raw: unknown) {
      const target = ViewTargetSchema.parse(raw);
      const view = await viewTarget(target);
      const { mcpApps } = await runtimeForConversation(target.conversationId);
      return mcpApps.get(view.id)!.html;
    },
    async viewPresentation(raw: unknown) {
      const target=ViewTargetSchema.parse(raw);
      const view=await viewTarget(target);
      if(!viewMount || viewMount.conversationId!==target.conversationId || viewMount.viewId!==target.viewId)throw Error('View unavailable');
      await requireProject(target.conversationId);
      const {mcpApps}=await runtimeForConversation(target.conversationId);
      const app=mcpApps.get(view.id);
      if(!app)throw Error('View unavailable');
      return {html:app.html,resourceDomains:mediaPolicy.snapshot().sources.map(s=>s.origin),styleDomains:app.resourceDomains,mountId:viewMount.mountId};
    },
    async remoteMedia(raw: unknown) {
      const input=ResourceReadSchema.parse(raw);
      if(!project.conversations.some(c=>c.id===input.conversationId))throw Error('Resource unavailable');
      const entry=await history.get(input.conversationId,input.entryId);
      const resource=entry?.resources?.find(r=>r.id===input.resourceId);
      if(!resource || resource.asset || !resource.uri)throw Error('Resource unavailable');
      const url=remoteMediaUrl(resource.uri,resource.mimeType);
      if(!url || !mediaPolicy.allows(url.href))throw Error('Resource unavailable');
      return {url:url.href,mediaType:resource.mimeType!,title:resource.title,resourceDomains:mediaPolicy.snapshot().sources.map(s=>s.origin)};
    },
    async viewRequest(raw: unknown) {
      const { request, ...target } = DesktopViewRequestSchema.parse(raw);
      await requireProject(target.conversationId);
      const view = await viewTarget(target);
      const { mcpApps } = await runtimeForConversation(target.conversationId);
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
      await viewTarget({ conversationId, viewId });
      const { mcpApps } = await runtimeForConversation(conversationId);
      return mcpApps.get(viewId)!.listResources(cursor);
    },
    async openListedResource(conversationId: string, viewId: string, uri: string) {
      await viewTarget({ conversationId, viewId });
      const { mcpApps } = await runtimeForConversation(conversationId);
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
      const { packages, mcpApps } = await runtimeForConversation(conversationId);
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
        await viewTarget({ conversationId, viewId });
        const result = await mcpApps.get(viewId)!.readResource(resource.uri, true);
        content = result.contents.filter(r => r.uri === resource.uri).map(r => ({ type: 'resource', resource: r }));
      } else if (resource.source.startsWith('package:')) {
        const result = await packages.readResource(resource.source, resource.uri);
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
      await viewTarget(target);
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
      const { packages, registry, controllers, packageToolIds, packageGrants, knowledgeToolIds, knowledgeGrants } = await selectedRuntime();
      const conversation = project.conversations.find(
        (c) => c.id === project.selectedId,
      );
      const state = live.get(project.selectedId);
      const controller = conversation ? controllers.get(conversation.workbenchId) : undefined;
      const original = controller ? await controller.snapshot() : unavailable;
      const operator = { ...original, grants: [...original.grants,
        ...[...knowledgeToolIds].map(toolName => ({ toolName, allowed: conversation ? knowledgeGrants[conversation.workbenchId]?.includes(toolName) ?? false : false })),
        ...[...packageToolIds].map(toolName => ({ toolName, allowed: conversation ? packageGrants[conversation.workbenchId]?.includes(toolName) ?? false : false }))] };
      const retained = conversation ? await evidenceFor(conversation.id) : undefined;
      return DesktopSnapshotSchema.parse({
        mediaPolicy: mediaPolicy.snapshot(),
        toolLabels: [...packages.toolPresentation].filter(([, tool]) => tool.available).map(([toolName, tool]) => ({ toolName, title: tool.name, origin: tool.origin })),
        workspace: project.projects.find(p => p.id === project.selectedProjectId)?.name ?? 'Choose a project',
        projects: await Promise.all(project.projects.map(async ({ device: _device, inode: _inode, ...p }) => ({ ...p,
          available: await verifyProjectDirectory({ ...p, device: _device, inode: _inode }, root).then(() => true, () => false) }))),
        ...(project.selectedProjectId ? { selectedProjectId: project.selectedProjectId } : {}),
        conversations: project.conversations,
        workbenches: registry.workbenches,
        views: registry.views,
        selectedId: project.selectedId,
        signals: state?.signals ?? [],
        activity: (retained?.activity() ?? []).map(result => result.outcome.status === 'ok'
          ? { ...result, outcome: { status: 'ok', text: result.outcome.text, value: result.outcome.value } } : result),
        pendingTools: retained?.pending() ?? [],
        elicitations: conversation ? elicitation.pending(conversation.id) : [],
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
        activeContext: conversation ? viewContext.forConversation(conversation.id) : '',
      });
    },
    async restore() {
      const workflowReadiness = await orchestration.restore();
      if (workflowReadiness?.message) notice = workflowReadiness.message;
      void nightloom?.initialize().catch(() => undefined);
      void knowledge.pollSource().catch(() => undefined);
      const c = project.conversations.find((c) => c.id === project.selectedId);
      if (c?.provider === "codex" && c.projectId) {
        void connect(c.id).catch(async () => {
          await writer(c.id).unavailable();
          notice =
            "Codex unavailable. Check installation and sign-in, then restart the host. Synthetic mode is a separate choice.";
        });
      }
    },
    async command(raw: unknown) {
      const command = DesktopCommandSchema.parse(raw);
      if (command.kind === 'add_project') {
        const binding = await bindProjectDirectory(command.directory, root);
        const existing = project.projects.find(p => p.directory === binding.directory && p.device === binding.device && p.inode === binding.inode);
        const selected = existing ?? { ...binding, id: crypto.randomUUID(), name: command.name ?? basename(binding.directory) };
        if (!existing) project.projects.push(selected);
        project.selectedProjectId = selected.id;
        project.selectedId = project.conversations.find(c => c.projectId === selected.id)?.id ?? '';
        viewContext.clear(); viewMount = undefined; await persist();
      } else if (command.kind === 'select_project') {
        if (!project.projects.some(p => p.id === command.projectId)) throw Error('Project unavailable');
        project.selectedProjectId = command.projectId;
        project.selectedId = project.conversations.find(c => c.projectId === command.projectId)?.id ?? '';
        viewContext.clear(); viewMount = undefined; await persist(); await this.restore();
      } else if (command.kind === 'assign_project') {
        const conversation = project.conversations.find(c => c.id === command.conversationId);
        const binding = project.projects.find(p => p.id === command.projectId);
        if (!conversation || conversation.projectId || !binding) throw Error('Only an unassigned conversation can be assigned');
        await verifyProjectDirectory(binding, root);
        // Assignment does not manufacture native continuity. The adapter checks
        // saved native cwd before any resume and confirms cwd on opening.
        conversation.projectId = binding.id;
        try { if (conversation.provider === 'codex') await connect(conversation.id); }
        catch(error) {delete conversation.projectId;throw error;}
        project.selectedId = conversation.id; project.selectedProjectId = binding.id;
        viewContext.clear(); viewMount = undefined; await persist();
      } else if (command.kind === "create_conversation") {
        const binding = project.projects.find(p => p.id === project.selectedProjectId);
        if (!binding) throw Error('Choose a project directory before starting a conversation');
        await verifyProjectDirectory(binding, root);
        const { registry } = await runtimeFor(binding);
        if (!registry.workbenches.some((w) => w.id === command.workbenchId))
          throw Error("Workbench unavailable");
        const id = crypto.randomUUID();
        project.conversations.push({
          id,
          title: "New conversation",
          workbenchId: command.workbenchId,
          projectId: binding.id,
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
        const selected = project.conversations.find(c => c.id === command.conversationId)!;
        if (selected.projectId) project.selectedProjectId = selected.projectId;
        else delete project.selectedProjectId;
        viewContext.clear();
        viewMount = undefined;
        await persist();
        await this.restore();
      } else if (command.kind === 'elicitation') {
        elicitation.resolve(command.conversationId, command.requestId, command.result);
      } else if (command.kind === "operator") {
        if(command.conversationId!==project.selectedId || project.conversations.find(c=>c.id===command.conversationId)?.workbenchId!==command.workbenchId)
          throw Error('Conversation unavailable');
        await requireProject(project.selectedId);
        const runtime = await selectedRuntime();
        const { controllers, packageToolIds, packageGrants, knowledgeToolIds, knowledgeGrants } = runtime;
        if (command.command.kind === 'set_tool_grant' && knowledgeToolIds.has(command.command.toolName)) {
          if (!controllers.has(command.workbenchId)) throw Error('Workbench unavailable');
          const selected = new Set(knowledgeGrants[command.workbenchId] ?? []);
          if (command.command.allowed) selected.add(command.command.toolName); else selected.delete(command.command.toolName);
          const next = { ...knowledgeGrants, [command.workbenchId]: [...selected] };
          await runtime.store.set('knowledge-tool-grants', next); Object.assign(knowledgeGrants, next);
          await refreshGrants(command.workbenchId, runtime); return this.snapshot();
        }
        if (command.command.kind === 'set_tool_grant' && packageToolIds.has(command.command.toolName)) {
          if (!controllers.has(command.workbenchId)) throw Error('Workbench unavailable');
          const selected = new Set(packageGrants[command.workbenchId] ?? []);
          if (command.command.allowed) selected.add(command.command.toolName); else selected.delete(command.command.toolName);
          const next = { ...packageGrants, [command.workbenchId]: [...selected] };
          await runtime.store.set('package-grants', next); Object.assign(packageGrants, next);
          await refreshGrants(command.workbenchId, runtime);
          return this.snapshot();
        }
        const controller = controllers.get(command.workbenchId);
        if (!controller) throw Error("Controller unavailable");
        const result = OperatorResultSchema.parse(
          await controller.dispatch(command.command),
        );
        if (result.status === "rejected") throw Error(result.message);
        await refreshGrants(command.workbenchId, runtime);
      } else {
        // Existing-operation controls must remain usable if a drive vanishes.
        // They never open a new session; new work still verifies the directory.
        const existingControl = command.kind === 'stop' || command.kind === 'approval' || command.kind === 'input';
        const state = existingControl ? live.get(command.conversationId) : await connect(command.conversationId);
        if (!state) throw Error('No active session for this conversation');
        const conversation = project.conversations.find(
          (c) => c.id === command.conversationId,
        )!;
        const runtime = await runtimeForConversation(conversation.id);
        const { registry } = runtime;
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
          const operator = await refreshGrants(conversation.workbenchId, runtime);
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
          if (starting) { state.active = op; operationTelemetry.begin(op); }
          try {
            const result = starting
              ? await operationTelemetry.run(op, () => observed('agent.submit', { 'drawloom.operation.id': op }, async () => {
                const result = await state.session.execute(input);
                if (result.status !== 'ok') observeOutcome('error');
                return result;
              }))
              : await (state.session.steer?.(input) ??
                  Promise.reject(Error("Steering unavailable")));
            if (result.status !== "ok") throw Error(result.failure.message);
          } catch (error) {
            const pending = submissions.get(op);
            if (pending) submissions.set(op, pending.filter(s => s !== submitted));
            if (starting && state.active === op) delete state.active;
            if (starting) operationTelemetry.end(op, 'unknown');
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
      async function* chunks() { yield bytes; }
      return this.importAssetStream(chunks(), mediaType, name, conversationId);
    },
    async importAssetStream(chunks: AsyncIterable<Uint8Array>, mediaType: string, name: string, conversationId: string, signal?: AbortSignal) {
      await requireProject(conversationId);
      const { text, controllers } = await runtimeForConversation(conversationId);
      const workbenchId = project.conversations.find(
        (c) => c.id === conversationId,
      )?.workbenchId;
      if (!workbenchId) throw Error('Conversation unavailable');
      if (
        !browserImportTypes.has(mediaType)
      )
        throw Error("Unsupported or oversized file");
      const asset = await assets.putStream(chunks, mediaType, { ...(signal ? { signal } : {}) });
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
      await orchestration.close();
      await knowledge.close();
      operationTelemetry.close();
      await Promise.allSettled([...opening.values()]);
      await Promise.all([...live.values()].map((s) => s.close()));
      await Promise.all([...pumps]);
      await Promise.all([...runtimes.values()].map(async pending => {
        const runtime = await pending;
        await Promise.all([...runtime.mcpApps.values()].map(app => app.close()));
        await runtime.packages.close();
      }));
      await Promise.all([...writers.values()].map(w => w.close()));
      await projectWrites;
      await history.close();
    },
  };
  return instrumentApplication(application);
}

import { basename, join } from "node:path";
import { cleanup } from "./cleanup.js";
import { createSessionSignalReader } from "./session-signals.js";
import { createApplicationLifecycle, guardDesktopApplication } from "./application-lifecycle.js";
import {
  createDesktopSessions,
  closeAgentSession,
  type DesktopSession as Live,
} from "./desktop-sessions.js";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { createInstallationStore } from "./plugin-installations.js";
import { createPluginSettingsHost } from "./plugin-settings.js";
import { createWorkflowAuthority } from "./workflow-authority.js";
import { createWorkflowToolScope } from "./workflow-tools.js";
import { createDesktopAuthorization } from "./authorization.js";
import type { Authorizer, AuthorizationEvaluationOptions } from "@drawloom/authorization";
import type { ContextAssembler } from "@drawloom/context/assembly";
import { createDefaultContextAssembler } from "@drawloom/default-context";
import { createDesktopContextAssembly } from "./context-assembly.js";
import type { ApprovalPresenter } from "@drawloom/agent/approval-presentation";
import { createApprovalPresentationHost } from "./approval-presentation.js";
import { createGrantRefresh } from "./grant-refresh.js";
import { LearningCommandSchema } from "../src/lib/learning-protocol.js";
import type {
  createLocalTemporalManager,
  LocalTemporalRegistration,
} from "@drawloom/temporal-orchestration";
import { loadInstalledPackages } from "./plugin-packages.js";
import { createElicitationPresenter } from "./elicitation.js";
import {
  PackageActionSchema,
  PackageInspectionSchema,
  ResourceOriginSchema,
} from "../src/lib/package-protocol.js";
import { createPluginCredentialStore } from "./plugin-credentials.js";
import { createPluginOAuthManager } from "./plugin-oauth.js";
import { readClientRegistration } from "./plugin-registration.js";
import { createDiscoveryCache } from "./discovery-cache.js";
import { PackageOAuthActionSchema } from "../src/lib/package-protocol.js";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import {
  HistoryPageOptionsSchema,
  HistoryChangeOptionsSchema,
  HistoryAroundOptionsSchema,
  HistoryStoreError,
  type HistoryEntry,
  type HistoryPageOptions,
  type HistoryChangeOptions,
  type HistoryAroundOptions,
} from "@drawloom/conversation-history";
import { bindProjectDirectory, verifyProjectDirectory } from "./projects.js";
import {
  createNodeJsonStore,
  createNodeAssetStore,
  createStdioTransport,
  codexCommand,
  createMcpToolServer,
} from "@drawloom/node-host";
import { createCodexDriver, createCodexToolBridge } from "@drawloom/codex-agent";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import { desktopModels } from "./models.js";
import { resolveTurnMaterial } from "./turn-preparation.js";
import { permitsModel } from "@drawloom/codex-agent";
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
import { textPlugin, mcpReviewConfiguration } from "./composition.js";
import type { ConnectedMcpApp } from "./mcp-app.js";
import { createViewContext } from "./view-context.js";
import { createMediaPolicy, remoteMediaUrl } from "./media-policy.js";
import {
  observed,
  observeOutcome,
  observedRpc,
  observedToolGateway,
  observedTools,
  observedAssets,
  instrumentApplication,
  createOperationTelemetry,
  observeCache,
} from "./telemetry.js";
import { createManagedLocalKnowledgeClient } from "@drawloom/local-knowledge-runtime";
import type { LearningService } from "@drawloom/knowledge/learning";
import type { ContextPreparer } from "@drawloom/context";
import type { LearningProcessingDeclaration } from "@drawloom/knowledge/consent";
import type { LocalLearningSetup } from "./local-learning.js";
import { createDesktopLearningConsent } from "./learning-migration.js";
import { DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";
import { createLearningPermission } from "./learning-permission.js";
import { createInstalledGitKnowledgeFeed } from "./knowledge-source.js";
import {
  KNOWLEDGE_RETRIEVAL_GUIDANCE,
  KNOWLEDGE_TOOL_IDS,
  createKnowledgeOutcomeCapture,
} from "./knowledge-tools.js";
import { toolOutcomeProjectors } from "./composition.js";
import { createDesktopAssessment } from "./evaluation-assessment.js";
import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";
import {
  createEvaluationAssessmentResolver,
  createInstalledEvaluationPreparation,
} from "./evaluation-composition.js";
import { createOrchestrationComposition } from "./orchestration-composition.js";
import { createKnowledgeComposition } from "./knowledge-composition.js";
import { createProjectPluginRuntimes } from "./project-plugin-runtimes.js";
import { createConversationResources } from "./conversation-resources.js";
import { createProjectToolGatewayAccess } from "./project-tool-gateway.js";

export async function createDesktopApplication(
  root: string,
  options: {
    /** Trusted startup replacement; never accepted from browser commands or packages. */
    authorizer?: Authorizer;
    contextAssembler?: ContextAssembler;
    approvalPresenter?: ApprovalPresenter;
    experimentalPluginDiscovery?: boolean;
    mediaOrigins?: readonly string[];
    /** Trusted host composition only; never browser/model configuration. */
    codex?: {
      connect(workingDirectory: string): Promise<import("@drawloom/host").RpcTransport>;
      store?: import("@drawloom/host").JsonStore;
    };
    evaluation?: { assessment?: EvaluationAssessmentProvider; model?: string };
    orchestration?: {
      temporalPath?: string;
      nodePath?: string;
      runtimeDirectory?: string;
      manager?: () => Promise<ReturnType<typeof createLocalTemporalManager>>;
    };
    knowledge?: {
      service?: LearningService;
      context?: ContextPreparer;
      setup?: LocalLearningSetup;
      /** Trusted default-composition dependency, distinct from a replacement facade. */
      local?: import("@drawloom/local-knowledge-runtime").LocalKnowledgeClient;
      declaration?: LearningProcessingDeclaration;
      nodePath?: string;
      runtimeEntrypoint?: string;
      nightloomDirectory?: string;
      /** Trusted host clock: returns a cancellation function, never browser configuration. */
      schedulePreparationDeadline?: (expire: () => void, milliseconds: number) => () => void;
      scheduleNightloomTick?: (tick: () => Promise<void>, milliseconds: number) => () => void;
    };
  } = {},
) {
  const authorization = createDesktopAuthorization(options.authorizer);
  const assemblyLifetime = new AbortController();
  const lifecycle = createApplicationLifecycle();
  let schedulingStopped: Promise<void> | undefined;
  const contextAssembly = createDesktopContextAssembly(
    options.contextAssembler ?? createDefaultContextAssembler(),
    assemblyLifetime.signal,
  );
  const operationTelemetry = createOperationTelemetry();
  // Do not load the assessment SDK for installations that never request it.
  const assessment = createEvaluationAssessmentResolver({
    dataDirectory: root,
    ...(options.evaluation?.assessment !== undefined
      ? { assessment: options.evaluation.assessment }
      : {}),
    ...(options.evaluation?.model !== undefined ? { model: options.evaluation.model } : {}),
    create: createDesktopAssessment,
  });
  const mediaOrigins = z.array(ResourceOriginSchema).parse(options.mediaOrigins ?? []);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const history = createSqliteConversationHistory(join(root, "history.sqlite"));
  const store = createNodeJsonStore(join(root, "state"));
  const mediaPolicy = await createMediaPolicy(store, mediaOrigins);
  const assets = observedAssets(createDesktopAssets(join(root, "assets")));
  let project = ProjectSchema.parse(
    (await store.get("project")) ?? {
      version: 1,
      conversations: [],
      selectedId: "",
      assets: [],
    },
  );
  if (project.selectedId === "pending") project.selectedId = project.conversations[0]?.id ?? "";
  const live = createDesktopSessions();
  const approvals = createApprovalPresentationHost({
    // The default surface reads the host snapshot; presenting does not resolve it.
    presenter: options.approvalPresenter ?? { present() {} },
    owns: (conversationId, operationId) => live.get(conversationId)?.active === operationId,
    async resolve(conversationId, resolution) {
      const session = live.get(conversationId)?.session;
      if (!session)
        return {
          status: "rejected",
          failure: {
            code: "invalid_interaction",
            message: "This approval is no longer available.",
          },
        };
      return session.resolveApproval(resolution);
    },
    async stop(conversationId, operationId) {
      const session = live.get(conversationId)?.session;
      if (!session?.interrupt)
        return {
          status: "rejected",
          failure: {
            code: "invalid_interaction",
            message: "This operation cannot be interrupted.",
          },
        };
      return session.interrupt(operationId);
    },
  });
  const discoveryConnections = new Map<string, ReturnType<typeof createDiscoveryCache<Live>>>();
  const submissions = new Map<
    string,
    {
      displayId: string;
      text: string;
      assets: Asset[];
      selections: NonNullable<HistoryEntry["selections"]>;
      resources: NonNullable<HistoryEntry["resources"]>;
    }[]
  >();
  const localRevision = crypto.randomUUID();
  const conversationSearchSchema = z.strictObject({
    query: z.string().trim().min(1).max(500),
    projectId: z.string().min(1).max(256).optional(),
    archived: z.enum(["active", "archived", "all"]).default("active"),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  });
  const viewContext = createViewContext();
  let viewMount: { conversationId: string; viewId: string; mountId: string } | undefined;
  let notice =
    "Conversation display is saved locally. Provider transcripts and execution remain with the provider.";
  let projectWrites: Promise<unknown> = Promise.resolve();
  const persist = () => {
    const copy = JSON.parse(JSON.stringify(project)) as JsonValue;
    const next = projectWrites.then(() => store.set("project", copy));
    projectWrites = next.catch(() => {});
    return next;
  };
  await persist();
  const conversationResources = createConversationResources({
    history,
    evidenceStore: store,
    assets,
    projectAssets: project.assets,
    persist,
    mediaPolicy,
    packagesForConversation: async (conversationId) =>
      (await runtimeForConversation(conversationId)).packages,
  });
  const {
    writer,
    evidenceFor,
    collector: resourceCollector,
    recoveryFor,
    recover: recoverResources,
    synchronize: synchronizeHistory,
  } = conversationResources;
  const compositionContext = {
    store: {
      get: (key: string) => store.get(key),
      set: (key: string, value: JsonValue) => store.set(key, value),
    },
    assets: {
      ...assets,
      putStream: async (
        chunks: AsyncIterable<Uint8Array>,
        mediaType: string,
        options?: { signal?: AbortSignal },
      ) => {
        const asset = await assets.putStream(chunks, mediaType, options);
        if (!project.assets.some((a) => a.key === asset.key)) project.assets.push(asset);
        await persist();
        return asset;
      },
      put: async (bytes: Uint8Array, mediaType: string) => {
        const asset = await assets.put(bytes, mediaType);
        if (!project.assets.some((a) => a.key === asset.key)) project.assets.push(asset);
        await persist();
        return asset;
      },
    },
  };
  const installations = await createInstallationStore(store);
  let oauthRedirect = "";
  const oauth = createPluginOAuthManager({
    credentials: await createPluginCredentialStore(),
    redirectUrl: () => oauthRedirect,
  });
  const pluginSettings = createPluginSettingsHost({
    root,
    installations: installations.list,
    authProviderFor: (installation) => (server) =>
      oauth.connection({
        installationId: installation.id,
        serverName: server.name,
        serverUrl: server.config.url,
      }).provider,
  });
  async function oauthConnection(id: string, serverName: string) {
    const { packages } = await selectedRuntime();
    const server = packages.activeServer(id, serverName);
    if (!server) throw Error("Activate this installation and restart before connecting");
    if (server.config.type !== "streamable-http")
      throw Error("This server does not use Drawloom HTTP authentication");
    return oauth.connection({ installationId: id, serverName, serverUrl: server.config.url });
  }
  const elicitation = createElicitationPresenter(
    (operationId) => project.conversations.find((c) => live.get(c.id)?.active === operationId)?.id,
  );
  function archiveBlocked(conversationId: string) {
    const state = live.get(conversationId);
    const pendingSignal = state?.signals.some(
      (signal, index, all) =>
        signal.kind === "input.requested" &&
        !all
          .slice(index + 1)
          .some(
            (next) => next.kind === "input.resolved" && next.requestId === signal.request.requestId,
          ),
    );
    return Boolean(
      state?.active ||
        pendingSignal ||
        approvals.pending(conversationId).length ||
        elicitation.pending(conversationId).length,
    );
  }
  const workflowAuthority = createWorkflowAuthority();
  const createTemporalManager =
    options.orchestration?.manager ??
    (async () => {
      const { createLocalTemporalManager } = await import("@drawloom/temporal-orchestration");
      return createLocalTemporalManager({
        dataDirectory: root,
        ...(options.orchestration?.temporalPath
          ? { temporalPath: options.orchestration.temporalPath }
          : {}),
        ...(options.orchestration?.nodePath ? { nodePath: options.orchestration.nodePath } : {}),
        ...(options.orchestration?.runtimeDirectory
          ? { runtimeDirectory: options.orchestration.runtimeDirectory }
          : {}),
      });
    });
  const orchestrationComposition = createOrchestrationComposition({
    dataDirectory: root,
    createManager: createTemporalManager,
    ensureProject: async (id) => {
      const binding = project.projects.find((p) => p.id === id);
      if (!binding) throw Error("Project unavailable");
      await verifyProjectDirectory(binding, root);
      await runtimeFor(binding);
    },
  });
  const { host: orchestration, manager } = orchestrationComposition;
  if (options.knowledge?.service && !options.knowledge.declaration)
    throw Error("A replacement learning service requires its trusted processing declaration");
  const learningPermission = createLearningPermission(
    createDesktopLearningConsent({
      root,
      store,
      declaration: options.knowledge?.declaration ?? DEFAULT_LOCAL_LEARNING_SCOPE,
    }),
  );
  if (options.knowledge?.service && options.knowledge.local)
    throw Error("Select either a replacement learning service or the local composition");
  const localKnowledge = options.knowledge?.service
    ? undefined
    : (options.knowledge?.local ??
      createManagedLocalKnowledgeClient({
        root: join(root, "knowledge"),
        workingDirectory: root,
        authority: authorization.knowledge(),
        ...(options.knowledge?.nodePath ? { nodePath: options.knowledge.nodePath } : {}),
        ...(options.knowledge?.runtimeEntrypoint
          ? { runtimeEntrypoint: options.knowledge.runtimeEntrypoint }
          : {}),
      }));
  const projectRuntimes = createProjectPluginRuntimes({
    available: (binding) =>
      verifyProjectDirectory(binding, root).then(
        () => true,
        () => false,
      ),
    create: createRuntime,
    replace: (runtime) => runtime.packages.close(),
    close: async (runtime) => {
      await cleanup([
        ...[...runtime.mcpApps.values()].map((app) => () => app.close()),
        () => runtime.packages.close(),
      ]);
    },
  });
  const runtimeFor = projectRuntimes.forProject;
  function selectedRuntime() {
    return runtimeFor(project.projects.find((p) => p.id === project.selectedProjectId));
  }
  async function disconnectPackageRuntimes(installationId: string, serverName: string) {
    await cleanup([
      () => pluginSettings.invalidate(installationId),
      () =>
        projectRuntimes.retire((runtime) =>
          runtime.packages.disconnect(installationId, serverName),
        ),
    ]);
  }
  function runtimeForConversation(id: string) {
    const conversation = project.conversations.find((c) => c.id === id);
    if (!conversation) throw Error("Conversation unavailable");
    return runtimeFor(project.projects.find((p) => p.id === conversation.projectId));
  }
  async function requireProject(id: string) {
    const conversation = project.conversations.find((c) => c.id === id);
    const binding = project.projects.find((p) => p.id === conversation?.projectId);
    if (!binding) throw Error("Assign a project directory before continuing this conversation");
    await verifyProjectDirectory(binding, root);
    return binding;
  }
  async function createRuntime(binding: DirectoryProject | undefined, available: boolean) {
    const runtimeRoot = binding ? join(root, "projects", binding.id) : root;
    const runtimeStore = binding ? createNodeJsonStore(join(runtimeRoot, "state")) : store;
    const text = await createTextController(runtimeStore);
    const controllers = new Map<string, OperatorController>([["text", text]]);
    const grants = new Map<string, Set<string>>();
    const knowledgeToolIds = new Set<string>(KNOWLEDGE_TOOL_IDS);
    const knowledgeGrants = z
      .record(z.string(), z.array(z.string()))
      .parse((await runtimeStore.get("knowledge-tool-grants")) ?? {});
    const refreshWorkbenchGrants = createGrantRefresh(
      grants,
      async (id) => {
        const controller = controllers.get(id);
        if (!controller) throw Error("Workbench unavailable");
        return OperatorSnapshotSchema.parse(await controller.snapshot());
      },
      (snapshot, id) =>
        new Set([
          ...snapshot.grants.filter((g) => g.allowed).map((g) => g.toolName),
          ...(packageGrants[id] ?? []).filter((name) => packageToolIds.has(name)),
          ...(knowledgeGrants[id] ?? []).filter((name) => knowledgeToolIds.has(name)),
        ]),
      authorization.invalidate,
    );
    const workflowScopes = new Map<string, ReturnType<typeof createWorkflowToolScope>>();
    async function ready() {
      const pending = binding && projectRuntimes.pending(binding.id);
      if (!pending) throw Error("Project runtime unavailable");
      await pending;
    }
    // Installing remains global. Only connections and working state are scoped.
    const packages = await loadInstalledPackages({
      root: runtimeRoot,
      installationRoot: root,
      installations: available ? installations.startup : [],
      ...(binding ? { project: { id: binding.id, directory: binding.directory } } : {}),
      mediaPolicy,
      host: { ...compositionContext, store: runtimeStore },
      builtins: [{ plugin: textPlugin, config: {} }, knowledgePlugin],
      elicitation: elicitation.request,
      authProviderFor: (installation) => (server) =>
        oauth.connection({
          installationId: installation.id,
          serverName: server.name,
          serverUrl: server.config.url,
        }).provider,
      ...(binding
        ? {
            prepareWorkflows: (installation, inventory) =>
              orchestration.prepare(binding.id, installation, inventory, (handlers) =>
                workflowAuthority.wrap(
                  { projectId: binding.id, installationId: installation.id },
                  handlers,
                  async () => {
                    await ready();
                    await verifyProjectDirectory(binding, root);
                    await workflowScopes.get(installation.id)?.refresh();
                  },
                ),
              ),
          }
        : {}),
      ...(binding
        ? {
            prepareEvaluation: createInstalledEvaluationPreparation({
              dataDirectory: root,
              project: binding,
              assessment,
            }),
          }
        : {}),
      toolsFor: (installation, tools, workbenchIds) => {
        const ownedWorkbenchIds: string[] = [];
        const workflow = createWorkflowToolScope({
          authority: workflowAuthority,
          projectId: binding?.id ?? "",
          installationId: installation.id,
          workbenchIds: ownedWorkbenchIds,
          grants,
          store: runtimeStore,
          refreshGrants: async () => {
            await ready();
            if (!binding) throw Error("Project unavailable");
            await verifyProjectDirectory(binding, root);
            // No task/workbench association exists: every owned workbench must grant.
            ownedWorkbenchIds.splice(
              0,
              ownedWorkbenchIds.length,
              ...registry.contributions
                .filter(
                  (c) =>
                    c.kind === "workbench" && c.pluginId === `package:${installation.id}:backend`,
                )
                .map((c) => c.contributionId),
            );
            const controllerBackedIds = ownedWorkbenchIds.filter((id) => controllers.has(id));
            for (const id of ownedWorkbenchIds)
              if (!controllers.has(id) && grants.delete(id)) authorization.invalidate();
            await refreshWorkbenchGrants(controllerBackedIds);
          },
        });
        workflowScopes.set(installation.id, workflow);
        const foreground = createProjectToolGatewayAccess({
          projectId: binding?.id ?? "",
          workbenchIds,
          grants,
          ownerForOperation: (operationId) => {
            const conversation = project.conversations.find(
              (candidate) => live.get(candidate.id)?.active === operationId,
            );
            return conversation
              ? {
                  conversationId: conversation.id,
                  ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
                  workbenchId: conversation.workbenchId,
                }
              : undefined;
          },
          evidenceFor,
          recoveryFor,
        });
        return workflow.wrap(
          observedToolGateway(
            createLocalToolGateway({
              tools: observedTools(tools),
              nextInvocationId: () => crypto.randomUUID(),
              authorization: authorization.tools({
                owns: (operationId) =>
                  workflowAuthority.current()
                    ? workflow.owns(operationId)
                    : foreground.owns(operationId),
                facts: (operationId, name) =>
                  workflowAuthority.current()
                    ? workflow.facts(operationId, name)
                    : foreground.facts(operationId, name),
                background: () => Boolean(workflowAuthority.current()),
              }),
              evidence: {
                record: async (record) => {
                  if (workflowAuthority.current()) {
                    await workflow.record(record);
                    return;
                  }
                  await foreground.record(record);
                },
              },
            }),
            operationTelemetry,
          ),
        );
      },
    });
    const packageToolIds = packages.toolIds;
    const packageGrants = z
      .record(z.string(), z.array(z.string()))
      .parse((await runtimeStore.get("package-grants")) ?? {});
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
        if (packaged) {
          mcpApps.set(view.id, packaged);
          continue;
        }
        // Invalid or unavailable package views remain unavailable, never fall back
        // to arbitrary startup transports.
      }
    } catch (error) {
      await Promise.all([...mcpApps.values()].map((app) => app.close()));
      throw error;
    }
    return {
      packages,
      packageToolIds,
      packageGrants,
      knowledgeToolIds,
      knowledgeGrants,
      registry,
      controllers,
      grants,
      refreshWorkbenchGrants,
      text,
      mcpApps,
      store: runtimeStore,
      activated: available,
    };
  }
  const outcomeCaptures = new Map<
    string,
    Promise<Awaited<ReturnType<typeof createKnowledgeOutcomeCapture>>>
  >();
  const knowledgeComposition = createKnowledgeComposition({
    ...(options.knowledge?.service ? { service: options.knowledge.service } : {}),
    ...(localKnowledge ? { local: localKnowledge } : {}),
    ...(options.knowledge?.context ? { context: options.knowledge.context } : {}),
    ...(options.knowledge?.setup ? { setup: options.knowledge.setup } : {}),
    permission: learningPermission,
    store,
    manager,
    nightloomDirectory:
      options.knowledge?.nightloomDirectory ??
      join(import.meta.dir, "../../../packages/knowledge/nightloom"),
    ...(options.knowledge?.scheduleNightloomTick
      ? { scheduleNightloomTick: options.knowledge.scheduleNightloomTick }
      : {}),
    host: {
      captureQueues: async () =>
        Promise.all(
          [...outcomeCaptures].map(async ([conversationId, pendingCapture]) => {
            try {
              return {
                conversationId,
                pendingObservations: (await pendingCapture).pending().length,
              };
            } catch {
              return { conversationId, pendingObservations: 0 };
            }
          }),
        ),
      ...(options.knowledge?.schedulePreparationDeadline
        ? { schedulePreparationDeadline: options.knowledge.schedulePreparationDeadline }
        : {}),
      selectedProjectId: () => project.selectedProjectId,
      sourceForProject: async (projectId) => {
        const binding = project.projects.find((candidate) => candidate.id === projectId);
        if (!binding) throw Error("Configured knowledge source project is unavailable");
        await verifyProjectDirectory(binding, root);
        const runtime = await runtimeFor(binding);
        return createInstalledGitKnowledgeFeed({
          projectId,
          tools: runtime.registry.tools.filter((tool) => runtime.packageToolIds.has(tool.name)),
          presentation: runtime.packages.toolPresentation,
        });
      },
    },
  });
  const {
    activity: knowledgeActivity,
    evidenceReadReceipts,
    host: knowledge,
    nightloom,
    plugin: knowledgePlugin,
    service: knowledgeService,
    setup: localLearningSetup,
  } = knowledgeComposition;
  async function viewTarget(raw: unknown) {
    const target = ViewTargetSchema.parse(raw);
    const conversation = project.conversations.find((c) => c.id === project.selectedId);
    const { registry } = await runtimeForConversation(target.conversationId);
    const view = registry.views.find((v) => v.id === target.viewId);
    if (
      target.conversationId !== conversation?.id ||
      !view ||
      view.workbenchId !== conversation.workbenchId
    )
      throw Error("View unavailable");
    return view;
  }
  async function refreshGrants(
    workbenchId: string,
    runtime: Awaited<ReturnType<typeof createRuntime>>,
  ) {
    return (await runtime.refreshWorkbenchGrants([workbenchId])).get(workbenchId)!;
  }
  function outcomeCaptureFor(conversationId: string) {
    let current = outcomeCaptures.get(conversationId);
    if (!current) {
      current = (async () => {
        const binding = await requireProject(conversationId);
        const runtime = await runtimeForConversation(conversationId);
        return createKnowledgeOutcomeCapture({
          store,
          conversationId,
          projectId: binding.id,
          evidence: await evidenceFor(conversationId),
          enabled: async () => !!(await learningPermission.lease("captureOutcomes")),
          permission: () => learningPermission.lease("captureOutcomes"),
          ingest: (input, operation) => knowledgeService.ingest(input, operation),
          projectors: toolOutcomeProjectors,
          registeredName: (tool) => runtime.packages.toolPresentation.get(tool)?.name ?? tool,
          producerOrigin: (tool) => runtime.packages.toolSources.get(tool),
        });
      })();
      outcomeCaptures.set(conversationId, current);
    }
    return current;
  }
  async function connect(conversationId: string): Promise<Live> {
    const binding = await requireProject(conversationId);
    const state = await live.connect(conversationId, async (own) => {
      const conversation = project.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw Error("Conversation unavailable");
      const runtime = await runtimeForConversation(conversationId);
      const { registry, controllers, packageToolIds, knowledgeToolIds, grants, text } = runtime;
      void lifecycle
        .run(() => {
          lifecycle.assertRunning();
          return knowledge.warmup();
        })
        .catch(() => {});
      const workbench = registry.workbenches.find((w) => w.id === conversation.workbenchId);
      if (!workbench || !controllers.has(workbench.id))
        throw Error("Workbench controller unavailable");
      if (conversation.provider === "synthetic" && workbench.id !== "text")
        throw Error(
          "Synthetic mode is available only in Text studio. Choose Codex for this workbench.",
        );
      await refreshGrants(workbench.id, runtime);
      const signals: DesktopSnapshot["signals"] = [];
      const historyWriter = writer(conversationId);
      const operationBindings = new Map<string, ToolBinding>();
      const turnOperations = new Map<string, string>();
      const sink = await evidenceFor(conversationId);
      const capture = await outcomeCaptureFor(conversationId);
      await capture.recover();
      knowledge.reportObservationRecovery(conversationId);
      const resourceRecovery = await recoveryFor(conversationId);
      const gateway = observedToolGateway(
        createLocalToolGateway({
          tools: observedTools(
            registry.tools.filter(
              (t) =>
                workbench.tools.includes(t.name) ||
                packageToolIds.has(t.name) ||
                knowledgeToolIds.has(t.name),
            ),
          ),
          authorization: authorization.tools({
            owns: (operationId) => operationBindings.has(operationId),
            facts: (operationId, name) => ({
              subject: {
                type: "operation",
                id: operationId,
                properties: {
                  granted: Boolean(grants.get(workbench.id)?.has(name)),
                  projectId: binding.id,
                  workbenchId: workbench.id,
                },
              },
              action: { name: "invoke" },
              resource: { type: "tool", id: name, properties: {} },
            }),
            background: () => false,
          }),
          nextInvocationId: () => crypto.randomUUID(),
          evidence: {
            record: async (record) => {
              if (record.kind === "started") await capture.started(record);
              await sink.record(record);
              if (record.kind === "finished") {
                try {
                  await resourceRecovery.record(record.result);
                } catch {
                  historyWriter.reportStorageFailure();
                }
                try {
                  await capture.finished(record.result);
                  knowledge.reportObservationRecovery(conversationId);
                } catch {
                  knowledge.reportObservationFailure(conversationId);
                }
              }
            },
          },
        }),
        operationTelemetry,
      );
      const bridge = createCodexToolBridge(gateway);
      const mcp =
        conversation.provider === "codex" && gateway.exposure.tools.length
          ? await createMcpToolServer({
              exposure: gateway.exposure,
              invoke: (metadata, name, args, signal) => bridge.call(metadata, name, args, signal),
            })
          : undefined;
      if (mcp) own(() => mcp.close());
      const driver =
        conversation.provider === "synthetic"
          ? createSyntheticDriver(async (input) => {
              await text.addText(input);
              return "Saved your text as a draft. You can edit, compare and review it in the artifact pane.";
            })
          : createCodexDriver({
              workingDirectory: binding.directory,
              experimentalPluginDiscovery: options.experimentalPluginDiscovery === true,
              onContextInvalidated: (operationId) => evidenceReadReceipts.invalidate(operationId),
              onToolResultDelivered: (delivery) => {
                if (delivery.server !== "drawloom" || delivery.tool !== "knowledge.evidence")
                  return;
                const parsed = z
                  .object({
                    _meta: z.object({
                      invocationId: z.string(),
                      operationId: z.string(),
                      evidence: z.literal("recorded"),
                    }),
                    content: z.unknown(),
                  })
                  .safeParse(delivery.result);
                if (!parsed.success || parsed.data._meta.operationId !== delivery.operationId)
                  return;
                const result = sink
                  .activity()
                  .find(
                    (result) =>
                      result.invocationId === parsed.data._meta.invocationId &&
                      result.operationId === delivery.operationId,
                  );
                if (
                  !result ||
                  result.evidence !== "recorded" ||
                  result.outcome.status !== "ok" ||
                  sink.toolFor(result.invocationId) !== "knowledge.evidence"
                )
                  return;
                const expected = result.outcome.content ?? [
                  { type: "text", text: result.outcome.text },
                ];
                if (JSON.stringify(parsed.data.content) !== JSON.stringify(expected)) return;
                evidenceReadReceipts.confirmDelivered(
                  delivery.operationId,
                  result.invocationId,
                  result.outcome.value,
                );
              },
              onToolContent: async (result) => {
                // Our gateway already captured its correlated execution result.
                if (result.source === "drawloom" || !result.content.some((c) => c.type !== "text"))
                  return;
                try {
                  return await resourceCollector(conversationId).capture({
                    ...result,
                    source: `codex:${result.source}`,
                    save: !result.deferHistoryCommit,
                  });
                } catch {
                  historyWriter.reportStorageFailure();
                  throw Error("Resource capture could not be persisted");
                }
              },
              connect: async () =>
                observedRpc(
                  options.codex
                    ? await options.codex.connect(binding.directory)
                    : createStdioTransport({
                        ...codexCommand(),
                        cwd: binding.directory,
                        maxMessageBytes: nativeRpcMessageByteLimit,
                      }),
                ),
              store: options.codex?.store ?? store,
              imageInput: assets.imageInput,
              captureImage: async (result) => {
                const asset = await assets.captureImage(result);
                if (!project.assets.some((existing) => existing.key === asset.key)) {
                  project.assets.push(asset);
                  await persist();
                }
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
                turnOperations.set(JSON.stringify([thread, turn]), operation);
                authorization.invalidate(operation);
                bridge.publish(thread, turn, binding);
              },
              onTurnFinished: (thread, turn) => {
                bridge.retire(thread, turn);
                const key = JSON.stringify([thread, turn]);
                const operationId = turnOperations.get(key);
                if (operationId) {
                  operationBindings.delete(operationId);
                  turnOperations.delete(key);
                  authorization.invalidate(operationId);
                  evidenceReadReceipts.invalidate(operationId);
                }
              },
            });
      // Tokens belong to isolated provider configuration, never model context.
      const result = await observed("host.connect", {}, async () => {
        const context = await contextAssembly.session({
          instructions: [],
          skills: registry.skills
            .filter((s) => workbench.skills.includes(s.id))
            .map((s) => ({ text: s.instructions, sources: [s.id] })),
          guidance: [{ text: KNOWLEDGE_RETRIEVAL_GUIDANCE, sources: ["host:knowledge-guidance"] }],
        });
        const result = await driver.openSession({
          sessionId: conversationId,
          context,
          tools:
            conversation.provider === "synthetic"
              ? { id: "synthetic-no-agent-tools", tools: [] }
              : gateway.exposure,
        });
        if (result.status !== "ok") observeOutcome("error");
        return result;
      });
      if (result.status !== "ok") {
        throw Error(result.failure.message);
      }
      const session = result.value;
      own(() => closeAgentSession(session));
      const state: Live = {
        session,
        signals,
        close: async () => {
          approvals.invalidate(conversationId);
          for (const operationId of operationBindings.keys())
            evidenceReadReceipts.invalidate(operationId);
          if (state.active) operationTelemetry.end(state.active, "unknown");
          for (const [operationId, binding] of operationBindings) {
            gateway.revoke(binding);
            authorization.invalidate(operationId);
          }
        },
      };
      // Start the reader only after connect publishes this session.
      const reader = createSessionSignalReader({
        conversationId,
        state,
        historyWriter,
        submissions,
        approvals,
        operationTelemetry,
        project,
        persist,
        controller: () => controllers.get(workbench.id),
        synchronizeHistory,
        notice: (message) => {
          notice = message;
        },
      });
      readers.set(state, () => live.watch(conversationId, state, reader.read, reader.unavailable));
      // Direct synthetic tool invocation is explicit local composition, not a second agent loop.
      syntheticInvoke.set(conversationId, async (operation, input) => {
        const binding = gateway.bind(operation);
        operationBindings.set(operation, binding);
        authorization.invalidate(operation);
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
          authorization.invalidate(operation);
        }
      });
      if (conversation.provider === "codex")
        void lifecycle
          .run(() => synchronizeHistory(conversationId, session.history))
          .catch(() => historyWriter.reportStorageFailure());
      return state;
    });
    const read = readers.get(state);
    if (read) {
      readers.delete(state);
      void read();
    }
    return state;
  }
  const readers = new WeakMap<Live, () => Promise<void>>();
  const syntheticInvoke = new Map<string, (operation: string, input: string) => Promise<void>>();
  const unavailable = {
    artifacts: [],
    candidates: [],
    reviews: [],
    readiness: "unavailable" as const,
    summary: "Install a matching trusted operator controller at startup.",
    configuration: [],
    grants: [],
  };
  const pendingKnowledgeRevocations = new Map<
    symbol,
    { conversationId: string; workbenchId: string; toolName: string }
  >();
  const learningOperation = (
    operation?: AuthorizationEvaluationOptions,
  ): AuthorizationEvaluationOptions => ({
    signal: operation
      ? AbortSignal.any([assemblyLifetime.signal, operation.signal])
      : assemblyLifetime.signal,
    remainingMs: operation?.remainingMs ?? (() => Number.MAX_SAFE_INTEGER),
  });
  const application = {
    settingsPages: pluginSettings.list,
    settingsOpen: pluginSettings.open,
    settingsPresentation: pluginSettings.presentation,
    settingsRequest: pluginSettings.request,
    settingsClose: pluginSettings.closeMount,
    installations,
    workflowOwners: orchestration.owners,
    knowledgeActivityOwner: knowledgeActivity.owner,
    knowledgeActivityRuns: knowledgeActivity.list,
    knowledgeActivityRun: knowledgeActivity.detail,
    knowledgeActivitySteps: knowledgeActivity.steps,
    workflowRuns: orchestration.list,
    workflowSteps: orchestration.steps,
    workflowCommand: orchestration.command,
    knowledgeCommand: (raw: unknown, operation?: AuthorizationEvaluationOptions) =>
      knowledge.command(raw, learningOperation(operation)),
    localLearningSetupCommand: (raw: unknown, operation?: AuthorizationEvaluationOptions) =>
      localLearningSetup.command(raw, learningOperation(operation)),
    admitKnowledgeCommand(raw: unknown) {
      const command = LearningCommandSchema.parse(raw);
      if (command.action === "preferences") {
        const releases = (["captureOutcomes", "automaticContext", "automaticCuration"] as const)
          .filter((feature) => !command.preferences[feature])
          .map((feature) => learningPermission.suppress(feature));
        return () => {
          for (const release of releases) release();
        };
      }
      if (command.action === "confirm") learningPermission.invalidate(command.feature, true);
    },
    async admitCommand(raw: unknown) {
      const command = DesktopCommandSchema.parse(raw);
      if (
        command.kind !== "operator" ||
        command.command.kind !== "set_tool_grant" ||
        command.command.allowed ||
        !KNOWLEDGE_TOOL_IDS.includes(
          command.command.toolName as (typeof KNOWLEDGE_TOOL_IDS)[number],
        )
      )
        return;
      const validTarget = () =>
        command.conversationId === project.selectedId &&
        project.conversations.find((c) => c.id === command.conversationId)?.workbenchId ===
          command.workbenchId;
      if (!validTarget()) throw Error("Conversation unavailable");
      await requireProject(command.conversationId);
      const runtime = await runtimeForConversation(command.conversationId);
      if (
        !validTarget() ||
        !runtime.controllers.has(command.workbenchId) ||
        !runtime.knowledgeToolIds.has(command.command.toolName)
      )
        throw Error("Workbench unavailable");
      const intent = Symbol();
      pendingKnowledgeRevocations.set(intent, {
        conversationId: command.conversationId,
        workbenchId: command.workbenchId,
        toolName: command.command.toolName,
      });
      knowledge.invalidatePreparation();
      return () => {
        pendingKnowledgeRevocations.delete(intent);
      };
    },
    bindOAuthRedirect: (url: string) => {
      oauthRedirect = url;
    },
    oauthCallback: (url: URL) => oauth.callback(url),
    async packageOAuth(raw: unknown) {
      const { packages } = await selectedRuntime();
      const input = PackageOAuthActionSchema.parse(raw);
      const connection = await oauthConnection(input.id, input.server);
      if (input.action === "configure-client") {
        if ([...live.values()].some((session) => session.active))
          throw Error("Wait for current work to finish before configuring authentication");
        const registration = await readClientRegistration(input.registrationFile);
        const disconnected = await connection.disconnect();
        await disconnectPackageRuntimes(input.id, input.server);
        if (disconnected.state === "failed")
          throw Error("Disconnect existing credentials before replacing registration");
        return connection.configureClient(registration);
      }
      if (input.action === "status") return connection.status();
      if (input.action === "connect") return connection.login();
      if (input.action === "cancel") return connection.cancel();
      if (input.action === "disconnect") {
        // Drop the authenticated MCP session as well as credentials.
        try {
          return await connection.disconnect();
        } finally {
          await disconnectPackageRuntimes(input.id, input.server);
        }
      }
      if ([...live.values()].some((session) => session.active))
        throw Error("Wait for current work to finish before reconnecting");
      return { ...connection.status(), ...(await packages.reconnect(input.id, input.server)) };
    },
    packageStatuses: async () => (await selectedRuntime()).packages.statuses,
    async installedPackages() {
      const { packages } = await selectedRuntime();
      return Promise.all(
        installations.list().map(async ({ configuration: _configuration, ...installation }) => {
          const current = packages.statuses.find((s) => s.id === installation.id);
          let availableServers = installation.servers.map((name) => ({
            name,
            transport: "unknown",
          }));
          try {
            availableServers = (await installations.inspect(installation.root)).servers.map(
              (server) => ({ name: server.name, transport: server.config.type }),
            );
          } catch {
            /* Retain selected identities and existing readiness errors if metadata is inaccessible. */
          }
          return {
            ...installation,
            pendingRestart: installations.pendingRestart(installation.id),
            status: current?.status ?? "not-active",
            availableServers,
            diagnostics: current?.codes ?? [],
            connections: (current?.servers ?? []).map((s) => ({
              ...s,
              transport: packages.transportFor(installation.id, s.name) ?? "unknown",
            })),
          };
        }),
      );
    },
    async packageAction(raw: unknown) {
      const action = PackageActionSchema.parse(raw);
      if (action.action === "inspect") {
        const inventory = await installations.inspect(action.root);
        return PackageInspectionSchema.parse({
          root: inventory.root,
          name: inventory.name,
          version: inventory.version,
          backend: Boolean(inventory.drawloom?.backend),
          skills: inventory.skills.map((s) => s.name),
          servers: inventory.servers.map((s) => ({ name: s.name, transport: s.config.type })),
          diagnostics: inventory.diagnostics.map((d) => `${d.component}: ${d.code}`),
        });
      }
      if (action.action === "add") await installations.add(action.root);
      else {
        const current = installations.list().find((i) => i.id === action.id);
        if (!current) throw Error("Installation unavailable");
        await orchestration.changeInstallation(
          action.id,
          () =>
            installations.configure(action.id, {
              ...action.settings,
              configuration: action.settings.configuration ?? current.configuration,
            }),
          () => installations.pendingRestart(action.id),
        );
        await pluginSettings.invalidate(action.id);
      }
      return this.installedPackages();
    },
    async discover(
      conversationId: string,
      refresh = false,
      cursor?: string,
    ): Promise<DesktopCatalogue> {
      const { packages, registry, packageToolIds, knowledgeToolIds, mcpApps } =
        await runtimeForConversation(conversationId);
      const conversation = project.conversations.find((c) => c.id === conversationId);
      if (!conversation) throw Error("Conversation unavailable");
      const workbench = registry.workbenches.find((w) => w.id === conversation.workbenchId)!;
      const entries: DesktopCatalogue["entries"] = registry.plugins.map((p) => ({
        id: `drawloom:plugin:${p.id}`,
        origin: "drawloom",
        kind: "plugin",
        name: p.id,
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
                ...result.value.entries.map((e) => ({ ...e, revision: result.value.revision })),
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
        experimentalPluginDiscovery: options.experimentalPluginDiscovery === true,
      });
    },
    async authenticateIntegration(
      conversationId: string,
      selection: { id: string; revision: string },
    ) {
      const conversation = project.conversations.find((c) => c.id === conversationId);
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
      if (!project.conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      const id = selection.id.startsWith("package-resource:")
        ? `native-listed:${selection.id}:${selection.revision}`
        : `native-listed:${selection.id}`;
      const cached = await history.get(conversationId, id);
      observeCache(Boolean(cached));
      if (cached) return cached;
      const catalogue = await this.discover(conversationId);
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
          content: result.contents.map((resource) => ({ type: "resource" as const, resource })),
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
    assets,
    async openWorkingFile(conversationId: string, path: string) {
      const binding = await requireProject(conversationId);
      // This is a read-only store operation; viewing never registers an asset.
      return createNodeAssetStore(binding.directory, binding).open(path);
    },
    async historyPage(conversationId: string, raw: HistoryPageOptions = {}) {
      if (!project.conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      const options = HistoryPageOptionsSchema.parse(raw);
      await recoverResources(conversationId);
      let page = await history.page(conversationId, options);
      let cacheHit = true;
      if (options.before && page.entries.length < (options.limit ?? 50) && page.status.hasOlder) {
        const session = live.get(conversationId)?.session;
        if (session?.history) {
          cacheHit = false;
          await synchronizeHistory(conversationId, session.history, "older");
          page = await history.page(conversationId, options);
        }
      }
      observeCache(cacheHit, page.entries.length);
      const error = writer(conversationId).error;
      return error
        ? { ...page, status: { ...page.status, sync: "error" as const, message: error } }
        : writer(conversationId).syncing
          ? { ...page, status: { ...page.status, sync: "syncing" as const } }
          : page;
    },
    async historyChanges(conversationId: string, raw: HistoryChangeOptions = {}) {
      if (!project.conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      const changes = await history.changes(conversationId, HistoryChangeOptionsSchema.parse(raw));
      const error = writer(conversationId).error;
      return error
        ? { ...changes, status: { ...changes.status, sync: "error" as const, message: error } }
        : writer(conversationId).syncing
          ? { ...changes, status: { ...changes.status, sync: "syncing" as const } }
          : changes;
    },
    async historyAround(conversationId: string, raw: HistoryAroundOptions) {
      if (!project.conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      return history.around(conversationId, HistoryAroundOptionsSchema.parse(raw));
    },
    async searchConversations(raw: unknown) {
      const input = conversationSearchSchema.parse(raw);
      const scope = JSON.stringify([
        project.metadataRevision,
        input.query,
        input.projectId ?? null,
        input.archived,
      ]);
      let titleOffset = 0,
        historyCursor: string | undefined;
      if (input.cursor)
        try {
          const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {
            scope: string;
            titleOffset: number;
            historyCursor?: string;
          };
          if (
            parsed.scope !== scope ||
            !Number.isSafeInteger(parsed.titleOffset) ||
            parsed.titleOffset < 0
          )
            throw Error();
          titleOffset = parsed.titleOffset;
          historyCursor = parsed.historyCursor;
        } catch {
          throw new HistoryStoreError(
            "invalid_cursor",
            "Conversation search cursor is invalid for this search",
          );
        }
      const eligible = project.conversations.filter(
        (c) =>
          (!input.projectId || c.projectId === input.projectId) &&
          (input.archived === "all" || (c.archived === true) === (input.archived === "archived")),
      );
      const titleMatches = eligible
        .filter((c) => c.title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
      const eligibleById = new Map(eligible.map((c) => [c.id, c]));
      const metadata = (conversationId: string) => {
        const c = eligibleById.get(conversationId)!;
        return {
          conversationId: c.id,
          title: c.title,
          projectId: c.projectId,
          projectName: project.projects.find((p) => p.id === c.projectId)?.name,
          workbenchId: c.workbenchId,
          provider: c.provider,
          archived: c.archived === true,
        };
      };
      const items: Array<Record<string, unknown>> = titleMatches
        .slice(titleOffset, titleOffset + input.limit)
        .map((c) => ({ ...metadata(c.id), match: "title" }));
      titleOffset += items.length;
      let messageHasMore = false,
        searchedMessages = false;
      if (items.length < input.limit && titleOffset >= titleMatches.length) {
        searchedMessages = true;
        const message = await history.search({
          query: input.query,
          conversationIds: eligible.map((c) => c.id),
          ...(historyCursor ? { cursor: historyCursor } : {}),
          limit: input.limit - items.length,
        });
        items.push(
          ...message.items.map((hit) => ({
            ...metadata(hit.conversationId),
            match: "message",
            entryId: hit.entryId,
            role: hit.role,
            snippet: hit.snippet,
            position: hit.position,
          })),
        );
        historyCursor = message.cursor;
        messageHasMore = message.hasMore;
      }
      const hasMore =
        titleOffset < titleMatches.length ||
        messageHasMore ||
        (!searchedMessages && items.length === input.limit && titleOffset === titleMatches.length);
      return {
        items,
        ...(hasMore
          ? {
              cursor: Buffer.from(
                JSON.stringify({ scope, titleOffset, ...(historyCursor ? { historyCursor } : {}) }),
              ).toString("base64url"),
            }
          : {}),
        hasMore,
      };
    },
    async viewSession(raw: unknown) {
      const input = DesktopViewSessionSchema.parse(raw);
      const target = { conversationId: input.conversationId, viewId: input.viewId };
      if (input.action === "open") {
        await viewTarget(target);
        viewContext.clear();
        viewMount = { ...target, mountId: crypto.randomUUID() };
        return { mountId: viewMount.mountId, mediaRevision: mediaPolicy.snapshot().revision };
      }
      // A late teardown must not clear a replacement mount's reference material.
      if (
        viewMount?.mountId === input.mountId &&
        viewMount.conversationId === input.conversationId &&
        viewMount.viewId === input.viewId
      ) {
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
      const target = ViewTargetSchema.parse(raw);
      const view = await viewTarget(target);
      if (
        !viewMount ||
        viewMount.conversationId !== target.conversationId ||
        viewMount.viewId !== target.viewId
      )
        throw Error("View unavailable");
      await requireProject(target.conversationId);
      const { mcpApps } = await runtimeForConversation(target.conversationId);
      const app = mcpApps.get(view.id);
      if (!app) throw Error("View unavailable");
      return {
        html: app.html,
        resourceDomains: mediaPolicy.snapshot().sources.map((s) => s.origin),
        styleDomains: app.resourceDomains,
        mountId: viewMount.mountId,
      };
    },
    async remoteMedia(raw: unknown) {
      const input = ResourceReadSchema.parse(raw);
      if (!project.conversations.some((c) => c.id === input.conversationId))
        throw Error("Resource unavailable");
      const entry = await history.get(input.conversationId, input.entryId);
      const resource = entry?.resources?.find((r) => r.id === input.resourceId);
      if (!resource || resource.asset || !resource.uri) throw Error("Resource unavailable");
      const url = remoteMediaUrl(resource.uri, resource.mimeType);
      if (!url || !mediaPolicy.allows(url.href)) throw Error("Resource unavailable");
      return {
        url: url.href,
        mediaType: resource.mimeType!,
        title: resource.title,
        resourceDomains: mediaPolicy.snapshot().sources.map((s) => s.origin),
      };
    },
    async viewRequest(raw: unknown) {
      const { request, ...target } = DesktopViewRequestSchema.parse(raw);
      await requireProject(target.conversationId);
      const view = await viewTarget(target);
      const { mcpApps } = await runtimeForConversation(target.conversationId);
      const app = mcpApps.get(view.id)!;
      const result = await app.callTool(request);
      if (result.content.some((b) => b.type !== "text")) {
        const identity = Bun.hash(JSON.stringify(result.content)).toString(16);
        try {
          await resourceCollector(target.conversationId).capture({
            id: `app-resource:${view.id}:${identity}`,
            source: "app:" + view.id,
            content: result.content,
            readable: (uri) => app.canRead(uri),
          });
        } catch {
          writer(target.conversationId).reportStorageFailure();
        }
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
      if (!app.canRead(uri)) throw Error("Resource unavailable");
      const id = `listed-resource:${Bun.hash(viewId + ":" + uri).toString(16)}`;
      const cached = await history.get(conversationId, id);
      if (cached) return cached;
      const result = await app.readResource(uri);
      return resourceCollector(conversationId).capture({
        id,
        source: "app:" + viewId,
        content: result.contents
          .filter((r) => r.uri === uri)
          .map((r) => ({ type: "resource", resource: r })),
      });
    },
    async readResource(conversationId: string, entryId: string, resourceId: string) {
      const { packages, mcpApps } = await runtimeForConversation(conversationId);
      if (!project.conversations.some((c) => c.id === conversationId))
        throw Error("Conversation unavailable");
      const entry = await history.get(conversationId, entryId);
      const resource = entry?.resources?.find((r) => r.id === resourceId);
      if (!resource || !entry) throw Error("Resource unavailable");
      if (resource.asset) return resource;
      if (!resource.uri) throw Error("Resource unavailable");
      let content: import("@drawloom/tools").ToolContent;
      if (resource.retrieval && resource.source.startsWith("codex:")) {
        const result = await (await connect(conversationId)).session.discovery?.readResource?.(
          resource.retrieval,
        );
        if (result?.status !== "ok") throw Error("Resource unavailable");
        content = result.value;
      } else if (resource.source.startsWith("app:")) {
        const viewId = resource.source.slice(4);
        await viewTarget({ conversationId, viewId });
        const result = await mcpApps.get(viewId)!.readResource(resource.uri, true);
        content = result.contents
          .filter((r) => r.uri === resource.uri)
          .map((r) => ({ type: "resource", resource: r }));
      } else if (resource.source.startsWith("package:")) {
        const result = await packages.readResource(resource.source, resource.uri);
        content = result.contents
          .filter((r) => r.uri === resource.uri)
          .map((r) => ({ type: "resource", resource: r }));
      } else throw Error("Resource unavailable");
      const captured = await resourceCollector(conversationId).capture({
        id: `${entryId}:read:${resourceId}`,
        source: resource.source,
        content,
      });
      const ready = captured.resources?.find((r) => r.asset && r.uri === resource.uri);
      if (!ready) throw Error("Resource unavailable");
      const updated = { ...resource, asset: ready.asset, status: "ready" as const };
      await writer(conversationId).write({
        ...entry,
        resources: entry.resources!.map((r) => (r.id === resourceId ? updated : r)),
      });
      return updated;
    },
    async viewInteraction(raw: unknown): Promise<{ isError?: boolean }> {
      const { request, mountId, ...target } = DesktopViewInteractionSchema.parse(raw);
      await viewTarget(target);
      if (
        viewMount?.mountId !== mountId ||
        viewMount.conversationId !== target.conversationId ||
        viewMount.viewId !== target.viewId
      )
        throw Error("View unavailable");
      if (request.method === "ui/update-model-context") {
        viewContext.set(target, request.params);
        return {};
      }
      // A plugin cannot choose another thread, impersonate the assistant or
      // silently steer an active turn. Standard ui/message permits rejection.
      if (request.params.role !== "user" || request.params.content.some((c) => c.type !== "text"))
        return { isError: true };
      const text = request.params.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
      if (!text.trim() || text.length > 100_000) return { isError: true };
      try {
        const state = await connect(target.conversationId);
        if (state.active) return { isError: true };
        await this.command({
          kind: "send",
          conversationId: target.conversationId,
          text,
          attachmentKeys: [],
          contextArtifactIds: [],
        });
        return {};
      } catch {
        return { isError: true };
      }
    },
    async snapshot() {
      const {
        packages,
        registry,
        controllers,
        packageToolIds,
        packageGrants,
        knowledgeToolIds,
        knowledgeGrants,
      } = await selectedRuntime();
      const conversation = project.conversations.find((c) => c.id === project.selectedId);
      const state = live.get(project.selectedId);
      const controller = conversation ? controllers.get(conversation.workbenchId) : undefined;
      const original = controller ? await controller.snapshot() : unavailable;
      const operator = {
        ...original,
        grants: [
          ...original.grants,
          ...[...knowledgeToolIds].map((toolName) => ({
            toolName,
            allowed: conversation
              ? (knowledgeGrants[conversation.workbenchId]?.includes(toolName) ?? false)
              : false,
          })),
          ...[...packageToolIds].map((toolName) => ({
            toolName,
            allowed: conversation
              ? (packageGrants[conversation.workbenchId]?.includes(toolName) ?? false)
              : false,
          })),
        ],
      };
      const retained = conversation ? await evidenceFor(conversation.id) : undefined;
      return DesktopSnapshotSchema.parse({
        mediaPolicy: mediaPolicy.snapshot(),
        toolLabels: [...packages.toolPresentation]
          .filter(([, tool]) => tool.available)
          .map(([toolName, tool]) => ({ toolName, title: tool.name, origin: tool.origin })),
        workspace:
          project.projects.find((p) => p.id === project.selectedProjectId)?.name ??
          "Choose a project",
        projects: await Promise.all(
          project.projects.map(async ({ device: _device, inode: _inode, ...p }) => ({
            ...p,
            available: await verifyProjectDirectory(
              { ...p, device: _device, inode: _inode },
              root,
            ).then(
              () => true,
              () => false,
            ),
          })),
        ),
        ...(project.selectedProjectId ? { selectedProjectId: project.selectedProjectId } : {}),
        conversations: project.conversations,
        workbenches: registry.workbenches,
        views: registry.views,
        selectedId: project.selectedId,
        signals: state?.signals ?? [],
        approvals: approvals.pending(project.selectedId).map((entry) => ({
          ...entry,
          presentation: options.approvalPresenter ? "external" : "desktop",
        })),
        activity: (retained?.activity() ?? []).map((result) =>
          result.outcome.status === "ok"
            ? {
                ...result,
                outcome: { status: "ok", text: result.outcome.text, value: result.outcome.value },
              }
            : result,
        ),
        pendingTools: retained?.pending() ?? [],
        elicitations: conversation ? elicitation.pending(conversation.id) : [],
        operator,
        ...(state?.active ? { activeOperation: state.active } : {}),
        archiveBlockedConversationIds: project.conversations
          .filter((c) => archiveBlocked(c.id))
          .map((c) => c.id),
        controls: {
          steer: Boolean(state?.session.steer),
          interrupt: Boolean(state?.session.interrupt),
          reviewerModes: state?.session.reviewerModes ?? ["human"],
        },
        plugins: registry.plugins.map((p) => ({
          id: p.id,
          status: "ready",
          summary: "Registered at startup. Tool grants are separate.",
        })),
        notice,
        activeContext: conversation ? viewContext.forConversation(conversation.id) : "",
      });
    },
    async restore() {
      for (const conversation of project.conversations) {
        const pending = await store.get(`knowledge-pending-outcomes:${conversation.id}`);
        if (!Array.isArray(pending) || !pending.length) continue;
        try {
          const capture = await outcomeCaptureFor(conversation.id);
          await capture.recover();
          knowledge.reportObservationRecovery(conversation.id);
        } catch {
          knowledge.reportObservationFailure(conversation.id);
        }
      }
      const workflowReadiness = await orchestration.restore();
      if (workflowReadiness?.message) notice = workflowReadiness.message;
      await knowledgeService.capabilities.curation?.setAutomatic(
        !!(await learningPermission.lease("automaticCuration")),
      );
      void nightloom?.initialize().catch(() => undefined);
      nightloom?.startScheduling();
      void lifecycle.run(() => knowledge.pollSource()).catch(() => undefined);
      const c = project.conversations.find((c) => c.id === project.selectedId);
      if (c?.provider === "codex" && c.projectId) {
        void lifecycle
          .run(async () => {
            try {
              await connect(c.id);
            } catch {
              notice =
                "Codex unavailable. Check installation and sign-in, then restart the host. Synthetic mode is a separate choice.";
              await writer(c.id).unavailable();
            }
          })
          .catch(() => {});
      }
    },
    async command(raw: unknown) {
      const command = DesktopCommandSchema.parse(raw);
      if (command.kind === "add_project") {
        const binding = await bindProjectDirectory(command.directory, root);
        const existing = project.projects.find(
          (p) =>
            p.directory === binding.directory &&
            p.device === binding.device &&
            p.inode === binding.inode,
        );
        const selected = existing ?? {
          ...binding,
          id: crypto.randomUUID(),
          name: command.name ?? basename(binding.directory),
        };
        if (!existing) project.projects.push(selected);
        project.selectedProjectId = selected.id;
        project.selectedId =
          project.conversations.find((c) => c.projectId === selected.id)?.id ?? "";
        viewContext.clear();
        viewMount = undefined;
        await persist();
      } else if (command.kind === "select_project") {
        if (!project.projects.some((p) => p.id === command.projectId))
          throw Error("Project unavailable");
        project.selectedProjectId = command.projectId;
        project.selectedId =
          project.conversations.find((c) => c.projectId === command.projectId)?.id ?? "";
        viewContext.clear();
        viewMount = undefined;
        await persist();
        await this.restore();
      } else if (command.kind === "assign_project") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        const binding = project.projects.find((p) => p.id === command.projectId);
        if (!conversation || conversation.projectId || !binding)
          throw Error("Only an unassigned conversation can be assigned");
        await verifyProjectDirectory(binding, root);
        // Assignment does not manufacture native continuity. The adapter checks
        // saved native cwd before any resume and confirms cwd on opening.
        const previous = {
          selectedId: project.selectedId,
          selectedProjectId: project.selectedProjectId,
          metadataRevision: project.metadataRevision,
        };
        conversation.projectId = binding.id;
        project.metadataRevision++;
        try {
          if (conversation.provider === "codex") await connect(conversation.id);
        } catch (error) {
          delete conversation.projectId;
          project.metadataRevision = previous.metadataRevision;
          throw error;
        }
        project.selectedId = conversation.id;
        project.selectedProjectId = binding.id;
        viewContext.clear();
        viewMount = undefined;
        try {
          await persist();
        } catch (error) {
          delete conversation.projectId;
          project.selectedId = previous.selectedId;
          project.metadataRevision = previous.metadataRevision;
          if (previous.selectedProjectId === undefined) delete project.selectedProjectId;
          else project.selectedProjectId = previous.selectedProjectId;
          throw error;
        }
      } else if (command.kind === "create_conversation") {
        const binding = project.projects.find((p) => p.id === project.selectedProjectId);
        if (!binding) throw Error("Choose a project directory before starting a conversation");
        await verifyProjectDirectory(binding, root);
        const { registry } = await runtimeFor(binding);
        if (!registry.workbenches.some((w) => w.id === command.workbenchId))
          throw Error("Workbench unavailable");
        const id = crypto.randomUUID(),
          previousSelectedId = project.selectedId;
        project.conversations.push({
          id,
          title: "New conversation",
          workbenchId: command.workbenchId,
          projectId: binding.id,
          provider: command.provider,
          reviewer: "human",
          archived: false,
        });
        project.metadataRevision++;
        project.selectedId = id;
        viewContext.clear();
        viewMount = undefined;
        try {
          await persist();
        } catch (error) {
          project.conversations = project.conversations.filter((c) => c.id !== id);
          project.selectedId = previousSelectedId;
          project.metadataRevision--;
          throw error;
        }
        if (command.provider === "codex") await this.restore();
      } else if (command.kind === "select_conversation") {
        if (!project.conversations.some((c) => c.id === command.conversationId))
          throw Error("Conversation unavailable");
        project.selectedId = command.conversationId;
        const selected = project.conversations.find((c) => c.id === command.conversationId)!;
        if (selected.projectId) project.selectedProjectId = selected.projectId;
        else delete project.selectedProjectId;
        viewContext.clear();
        viewMount = undefined;
        await persist();
        await this.restore();
      } else if (command.kind === "set_model") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        if (!conversation || conversation.provider !== "codex" || archiveBlocked(conversation.id))
          throw Error("Model selection unavailable");
        if (command.selection && !permitsModel(await desktopModels(), command.selection))
          throw Error("Selected model unavailable");
        if (archiveBlocked(conversation.id)) throw Error("Model selection unavailable");
        const previous = conversation.modelSelection;
        if (command.selection) conversation.modelSelection = command.selection;
        else delete conversation.modelSelection;
        try {
          await persist();
        } catch (error) {
          if (previous) conversation.modelSelection = previous;
          else delete conversation.modelSelection;
          throw error;
        }
      } else if (command.kind === "rename_conversation") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        if (!conversation) throw Error("Conversation unavailable");
        const previous = {
          title: conversation.title,
          manualTitle: conversation.manualTitle,
          metadataRevision: project.metadataRevision,
        };
        conversation.title = command.title;
        conversation.manualTitle = command.title;
        project.metadataRevision++;
        try {
          await persist();
        } catch (error) {
          conversation.title = previous.title;
          project.metadataRevision = previous.metadataRevision;
          if (previous.manualTitle === undefined) delete conversation.manualTitle;
          else conversation.manualTitle = previous.manualTitle;
          throw error;
        }
      } else if (command.kind === "set_conversation_pinned") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        if (!conversation) throw Error("Conversation unavailable");
        const previous = {
          pinned: conversation.pinned,
          metadataRevision: project.metadataRevision,
        };
        conversation.pinned = command.pinned;
        project.metadataRevision++;
        try {
          await persist();
        } catch (error) {
          conversation.pinned = previous.pinned;
          project.metadataRevision = previous.metadataRevision;
          throw error;
        }
      } else if (command.kind === "archive_conversation") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        if (!conversation) throw Error("Conversation unavailable");
        if (archiveBlocked(conversation.id))
          throw Error("Conversation cannot be archived while work or approval is active");
        const previous = {
          archived: conversation.archived,
          selectedId: project.selectedId,
          metadataRevision: project.metadataRevision,
        };
        conversation.archived = true;
        project.metadataRevision++;
        if (project.selectedId === conversation.id)
          project.selectedId =
            project.conversations.find((c) => !c.archived && c.projectId === conversation.projectId)
              ?.id ?? "";
        try {
          await persist();
        } catch (error) {
          conversation.archived = previous.archived;
          project.selectedId = previous.selectedId;
          project.metadataRevision = previous.metadataRevision;
          throw error;
        }
      } else if (command.kind === "restore_conversation") {
        const conversation = project.conversations.find((c) => c.id === command.conversationId);
        if (!conversation) throw Error("Conversation unavailable");
        const previous = {
          archived: conversation.archived,
          metadataRevision: project.metadataRevision,
        };
        conversation.archived = false;
        project.metadataRevision++;
        try {
          await persist();
        } catch (error) {
          conversation.archived = previous.archived;
          project.metadataRevision = previous.metadataRevision;
          throw error;
        }
      } else if (command.kind === "elicitation") {
        elicitation.resolve(command.conversationId, command.requestId, command.result);
      } else if (command.kind === "operator") {
        if (
          command.conversationId !== project.selectedId ||
          project.conversations.find((c) => c.id === command.conversationId)?.workbenchId !==
            command.workbenchId
        )
          throw Error("Conversation unavailable");
        await requireProject(project.selectedId);
        const runtime = await selectedRuntime();
        const { controllers, packageToolIds, packageGrants, knowledgeToolIds, knowledgeGrants } =
          runtime;
        if (
          command.command.kind === "set_tool_grant" &&
          knowledgeToolIds.has(command.command.toolName)
        ) {
          knowledge.invalidatePreparation();
          if (!controllers.has(command.workbenchId)) throw Error("Workbench unavailable");
          const selected = new Set(knowledgeGrants[command.workbenchId] ?? []);
          if (command.command.allowed) selected.add(command.command.toolName);
          else selected.delete(command.command.toolName);
          const next = { ...knowledgeGrants, [command.workbenchId]: [...selected] };
          await runtime.store.set("knowledge-tool-grants", next);
          Object.assign(knowledgeGrants, next);
          await refreshGrants(command.workbenchId, runtime);
          return this.snapshot();
        }
        if (
          command.command.kind === "set_tool_grant" &&
          packageToolIds.has(command.command.toolName)
        ) {
          if (!controllers.has(command.workbenchId)) throw Error("Workbench unavailable");
          const selected = new Set(packageGrants[command.workbenchId] ?? []);
          if (command.command.allowed) selected.add(command.command.toolName);
          else selected.delete(command.command.toolName);
          const next = { ...packageGrants, [command.workbenchId]: [...selected] };
          await runtime.store.set("package-grants", next);
          Object.assign(packageGrants, next);
          await refreshGrants(command.workbenchId, runtime);
          return this.snapshot();
        }
        const controller = controllers.get(command.workbenchId);
        if (!controller) throw Error("Controller unavailable");
        const result = OperatorResultSchema.parse(await controller.dispatch(command.command));
        if (result.status === "rejected") throw Error(result.message);
        await refreshGrants(command.workbenchId, runtime);
      } else {
        // Existing-operation controls must remain usable if a drive vanishes.
        // They never open a new session; new work still verifies the directory.
        const existingControl =
          command.kind === "stop" ||
          command.kind === "approval" ||
          command.kind === "approval_surface" ||
          command.kind === "input";
        const state = existingControl
          ? live.get(command.conversationId)
          : await connect(command.conversationId);
        if (!state) throw Error("No active session for this conversation");
        const conversation = project.conversations.find((c) => c.id === command.conversationId)!;
        const runtime = await runtimeForConversation(conversation.id);
        const { registry } = runtime;
        if (command.kind === "set_reviewer") {
          if (state.active) throw Error("Review mode can change only while idle");
          if (!state.session.reviewerModes.includes(command.reviewer))
            throw Error("This provider does not support the selected review mode");
          const previous = conversation.reviewer;
          conversation.reviewer = command.reviewer;
          try {
            await persist();
          } catch (error) {
            conversation.reviewer = previous;
            throw error;
          }
        } else if (command.kind === "stop") {
          if (!state.active || !state.session.interrupt)
            throw Error("This provider does not support interruption");
          const result = await state.session.interrupt(state.active);
          if (result.status !== "ok") throw Error(result.failure.message);
        } else if (command.kind === "approval") {
          const result = await approvals.choose(
            command.conversationId,
            command.resolution.approvalId,
            command.resolution.optionId,
            command.presentationId,
          );
          if (result.status !== "ok") throw Error(result.failure.message);
        } else if (command.kind === "approval_surface") {
          if (command.action === "dismiss")
            approvals.dismiss(command.conversationId, command.approvalId, command.presentationId);
          else if (command.action === "reopen")
            approvals.represent(command.conversationId, command.approvalId, command.presentationId);
          else {
            const result = await approvals.stop(
              command.conversationId,
              command.approvalId,
              command.presentationId,
            );
            if (result.status !== "ok") throw Error(result.failure.message);
          }
        } else if (command.kind === "input") {
          const result = await state.session.respondToInput(command.resolution);
          if (result.status !== "ok") throw Error(result.failure.message);
        } else {
          let op = state.active ?? crypto.randomUUID();
          let preparationTarget = state.active;
          const operator = await refreshGrants(conversation.workbenchId, runtime);
          const catalogue = command.selections.length
            ? await this.discover(conversation.id)
            : undefined;
          const material = await resolveTurnMaterial({
            command,
            conversation,
            project,
            registry,
            operator,
            history,
            assets,
            viewContext,
            catalogue,
          });
          const {
            selected,
            selectedInstructions,
            attachments,
            context,
            selectedResources,
            imageAttachments,
          } = material;
          const input = {
            operationId: op,
            originalDisplayText: command.text,
            displayId: crypto.randomUUID(),
            referenceSignal: knowledge.referenceSignal,
            reviewer: conversation.reviewer,
            ...(!state.active && conversation.modelSelection
              ? { modelSelection: conversation.modelSelection }
              : {}),
            text:
              [
                command.text,
                ...context.map((t) => "\nSelected document (reference material):\n" + t),
              ].join("\n") + viewContext.forConversation(conversation.id),
            ...(imageAttachments.length ? { attachments: imageAttachments } : {}),
            ...(selectedInstructions.length
              ? { additionalContext: { text: selectedInstructions.join("\n") } }
              : {}),
            selections: selected
              .filter((e) => e.origin !== "drawloom")
              .map((e) => ({ id: e.id, revision: e.revision })),
          };
          const preparationEpoch = knowledge.preparationEpoch;
          if (input.text.length + selectedInstructions.join("\n").length + 512 > 200_000)
            throw Error("Selected context is too large");
          const preparationAllowed = () =>
            live.get(conversation.id) === state &&
            ![...pendingKnowledgeRevocations.values()].some(
              (intent) =>
                intent.conversationId === conversation.id &&
                intent.workbenchId === conversation.workbenchId,
            ) &&
            Boolean(
              runtime.grants.get(conversation.workbenchId)?.has("knowledge.search") &&
                runtime.grants.get(conversation.workbenchId)?.has("knowledge.evidence"),
            );
          const refreshCompletedTarget = () => {
            if (!preparationTarget || state.active === preparationTarget) return false;
            if (state.active) throw Error("Conversation execution changed during preparation");
            preparationTarget = undefined;
            op = crypto.randomUUID();
            input.operationId = op;
            if (conversation.modelSelection)
              Object.assign(input, { modelSelection: conversation.modelSelection });
            return true;
          };
          let prepared: Awaited<ReturnType<typeof knowledge.prepare>>;
          let assembled: Awaited<ReturnType<typeof contextAssembly.turn>>;
          for (;;) {
            prepared = await material.prepareKnowledge(
              knowledge,
              op,
              input.text,
              preparationAllowed,
            );
            // No wire submission has occurred. A completed steering target needs
            // a fresh operation and freshly scoped preparation, never a retry of
            // the already completed identity.
            if (refreshCompletedTarget()) continue;
            assembled = await material.assemble(contextAssembly, prepared);
            // Assembly is replaceable asynchronous work too. Its references must
            // be prepared again if the steering operation finished while it waited.
            if (!refreshCompletedTarget()) break;
          }
          input.text = assembled.text;
          if (assembled.additionalContext)
            Object.assign(input, { additionalContext: assembled.additionalContext });
          else delete input.additionalContext;
          if (
            input.text.length +
              (input.additionalContext?.text.length ?? 0) +
              (prepared.references?.text.length ?? 0) >
            200_000
          )
            throw Error("Selected context is too large");
          const preparedInput = () =>
            preparationEpoch === knowledge.preparationEpoch &&
            (!prepared.references || preparationAllowed())
              ? {
                  ...input,
                  preparation: prepared.summary,
                  ...(prepared.references ? { references: prepared.references } : {}),
                }
              : { ...input, preparation: { kind: "cancelled" as const, references: [] } };
          lifecycle.assertRunning();
          const starting = !state.active;
          const submitted = {
            displayId: input.displayId,
            text: command.text,
            assets: attachments,
            selections: selected.map((e) => ({ id: e.id, title: e.name, source: e.origin })),
            resources: selectedResources,
          };
          if (conversation.provider === "codex") {
            const pending = submissions.get(op) ?? [];
            pending.push(submitted);
            submissions.set(op, pending);
          }
          // Command serialization does not drain the asynchronous signal/history
          // pump. Lock the chosen reviewer before execute can accept this turn.
          if (starting) {
            state.active = op;
            operationTelemetry.begin(op);
          }
          try {
            const result = starting
              ? await operationTelemetry.run(op, () =>
                  observed("agent.submit", { "drawloom.operation.id": op }, async () => {
                    const result = await state.session.execute(preparedInput());
                    if (result.status !== "ok") observeOutcome("error");
                    return result;
                  }),
                )
              : await (state.session.steer?.(preparedInput()) ??
                  Promise.reject(Error("Steering unavailable")));
            if (result.status !== "ok") throw Error(result.failure.message);
            if (conversation.provider === "synthetic")
              await writer(conversation.id).write({
                id: crypto.randomUUID(),
                role: "user",
                text: command.text,
                assets: attachments,
                operationId: op,
                state: "complete",
                preparation: preparedInput().preparation,
                selections: selected.map((e) => ({ id: e.id, title: e.name, source: e.origin })),
                resources: selectedResources,
              });
          } catch (error) {
            const pending = submissions.get(op);
            if (pending)
              submissions.set(
                op,
                pending.filter((s) => s !== submitted),
              );
            if (starting && state.active === op) delete state.active;
            if (starting) operationTelemetry.end(op, "unknown");
            throw error;
          }
          if (
            !conversation.manualTitle &&
            (conversation.title === "New conversation" ||
              conversation.title === "A clearer introduction")
          ) {
            const previousTitle = conversation.title,
              previousRevision = project.metadataRevision;
            const title = command.text.replace(/\s+/g, " ").trim();
            conversation.title =
              title.length > 64 ? title.slice(0, 61).replace(/\s+\S*$/, "") + "…" : title;
            project.metadataRevision++;
            try {
              await persist();
            } catch (error) {
              conversation.title = previousTitle;
              project.metadataRevision = previousRevision;
              throw error;
            }
          }
          if (conversation.provider === "synthetic")
            await syntheticInvoke.get(conversation.id)?.(op, command.text);
        }
      }
      return this.snapshot();
    },
    async importAsset(
      bytes: Uint8Array,
      mediaType: string,
      name: string,
      conversationId = project.selectedId,
    ) {
      async function* chunks() {
        yield bytes;
      }
      return this.importAssetStream(chunks(), mediaType, name, conversationId);
    },
    async importAssetStream(
      chunks: AsyncIterable<Uint8Array>,
      mediaType: string,
      name: string,
      conversationId: string,
      signal?: AbortSignal,
    ) {
      await requireProject(conversationId);
      const { text, controllers } = await runtimeForConversation(conversationId);
      const workbenchId = project.conversations.find((c) => c.id === conversationId)?.workbenchId;
      if (!workbenchId) throw Error("Conversation unavailable");
      if (!browserImportTypes.has(mediaType)) throw Error("Unsupported or oversized file");
      const asset = await assets.putStream(chunks, mediaType, { ...(signal ? { signal } : {}) });
      if (!project.assets.some((a) => a.key === asset.key)) project.assets.push(asset);
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
    close() {
      return lifecycle.close(
        () => {
          live.stopAdmission();
          projectRuntimes.stopAdmission();
          assemblyLifetime.abort();
          knowledge.invalidatePreparation();
          authorization.shutdown();
          schedulingStopped = nightloom?.stopScheduling();
          void schedulingStopped?.catch(() => {});
        },
        () =>
          cleanup([
            () => pluginSettings.close(),
            () => approvals.close(),
            () => schedulingStopped,
            () => nightloom?.close(),
            () => orchestration.close(),
            () => live.close(),
            () => projectRuntimes.close(),
            // All consumers release their registrations before their shared manager.
            () => orchestrationComposition.closeManager(),
            () => knowledge.close(),
            () => operationTelemetry.close(),
            () => conversationResources.drainWriters(),
            () => projectWrites,
            () => conversationResources.closeHistory(),
          ]),
      );
    },
  };
  return instrumentApplication(guardDesktopApplication(application, lifecycle));
}

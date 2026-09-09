import { join } from "node:path";
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
  type DesktopExtension,
  type DesktopExtensionFactory,
} from "./composition.js";
import { createDesktopEvidence } from "./evidence.js";

type Live = {
  session: AgentSession;
  messages: DesktopSnapshot["messages"];
  historyTruncated: boolean;
  signals: DesktopSnapshot["signals"];
  active?: string;
  close: () => Promise<void>;
};
export async function createDesktopApplication(
  root: string,
  external?: DesktopExtension | DesktopExtensionFactory,
) {
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
  const opening = new Map<string, Promise<Live>>();
  const grants = new Map<string, Set<string>>();
  let notice =
    "Synthetic mode keeps artifacts and reviews. Conversation display lasts for this host session; Codex restores its native history.";
  const persist = () => store.set("project", project);
  await persist();
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
      const messages: DesktopSnapshot["messages"] = [],
        signals: DesktopSnapshot["signals"] = [];
      const operationBindings = new Map<string, ToolBinding>();
      const sink = await evidenceFor(conversationId);
      const gateway = createLocalToolGateway({
        tools: registry.tools.filter((t) => workbench.tools.includes(t.name)),
        policy: (operationId, name) =>
          operationBindings.has(operationId) &&
          Boolean(grants.get(workbench.id)?.has(name)),
        nextInvocationId: () => crypto.randomUUID(),
        evidence: sink,
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
              connect: async () =>
                createStdioTransport({
                  ...codexCommand(),
                  cwd: root,
                  maxMessageBytes: nativeRpcMessageByteLimit,
                }),
              store,
              imageInput: assets.imageInput,
              captureImage: assets.captureImage,
              projection: (): JsonValue =>
                mcp
                  ? {
                      drawloom: {
                        url: mcp.url,
                        http_headers: { Authorization: "Bearer " + mcp.token },
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
        messages,
        historyTruncated: false,
        signals,
        close: async () => {
          for (const binding of operationBindings.values())
            gateway.revoke(binding);
          await session.close();
          await mcp?.close();
        },
      };
      if (session.readHistory) {
        const history = await session.readHistory();
        if (history.status === "ok") {
          messages.push(...history.value.entries);
          state.historyTruncated = history.value.truncated;
          for (const entry of history.value.entries)
            for (const asset of entry.assets) {
              if (!project.assets.some((a) => a.key === asset.key))
                project.assets.push(asset);
              if (entry.operationId)
                await controllers.get(workbench.id)?.observeArtifact?.({
                  operationId: entry.operationId,
                  asset,
                });
            }
          await persist();
        } else
          notice =
            "Native history is unavailable. New work is not retried automatically.";
      }
      live.set(conversationId, state);
      void (async () => {
        for await (const signal of session.signals()) {
          if (
            signal.kind === "message.delta" ||
            signal.kind === "message.completed"
          ) {
            const key = signal.operationId + ":" + signal.messageId;
            let message = messages.find((m) => m.id === key);
            if (!message) {
              message = {
                id: key,
                role: "assistant",
                text: "",
                assets: [],
                operationId: signal.operationId,
              };
              messages.push(message);
            }
            message.text =
              signal.kind === "message.delta"
                ? message.text + signal.delta
                : signal.text;
          } else if (signal.kind === "artifact.available") {
            if (!project.assets.some((a) => a.key === signal.asset.key)) {
              project.assets.push(signal.asset);
              await persist();
            }
            messages.push({
              id: crypto.randomUUID(),
              role: "assistant",
              text: "Image result",
              assets: [signal.asset],
              operationId: signal.operationId,
            });
            await controllers.get(workbench.id)?.observeArtifact?.({
              operationId: signal.operationId,
              asset: signal.asset,
            });
          } else {
            signals.push(signal);
            if (signal.kind === "operation.started")
              state.active = signal.operationId;
            if (
              [
                "operation.completed",
                "operation.failed",
                "operation.interrupted",
              ].includes(signal.kind)
            ) {
              delete state.active;
            }
          }
        }
      })().catch(async () => {
        delete state.active;
        notice = "Session connection failed. Restart the host to reconnect.";
        await state.close();
        live.delete(conversationId);
      });
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
    assets,
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
        selectedId: project.selectedId,
        messages: state?.messages ?? [],
        historyTruncated: state?.historyTruncated ?? false,
        signals: state?.signals ?? [],
        activity: retained.activity(),
        pendingTools: retained.pending(),
        operator,
        ...(state?.active ? { activeOperation: state.active } : {}),
        controls: {
          steer: Boolean(state?.session.steer),
          interrupt: Boolean(state?.session.interrupt),
        },
        plugins: registry.plugins.map((p) => ({
          id: p.id,
          status: "ready",
          summary: "Registered at startup. Tool grants are separate.",
        })),
        notice,
      });
    },
    async restore() {
      const c = project.conversations.find((c) => c.id === project.selectedId);
      if (c?.provider === "codex") {
        try {
          await connect(c.id);
        } catch {
          notice =
            "Codex unavailable. Check installation and sign-in, then restart the host. Synthetic mode is a separate choice.";
        }
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
        });
        project.selectedId = id;
        await persist();
        if (command.provider === "codex") await connect(id);
      } else if (command.kind === "select_conversation") {
        if (!project.conversations.some((c) => c.id === command.conversationId))
          throw Error("Conversation unavailable");
        project.selectedId = command.conversationId;
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
        if (command.kind === "stop") {
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
          const attachments = command.attachmentKeys.map((key) => {
            const a = project.assets.find((a) => a.key === key);
            if (!a) throw Error("Attachment unavailable");
            return a;
          });
          if (conversation.provider === "synthetic" && attachments.length)
            throw Error(
              "Synthetic mode accepts text. Attachments remain available as artifacts; choose Codex to send images.",
            );
          const context = command.contextArtifactIds.map((id) => {
            const a = operator.artifacts.find((a) => a.id === id);
            if (!a || a.content.kind !== "text")
              throw Error("Only text documents can be attached as context");
            return a.content.text;
          });
          // User-selected documents stay untrusted user content, never developer instructions.
          const input = {
            operationId: op,
            text: [
              command.text,
              ...context.map(
                (t) => "\nSelected document (reference material):\n" + t,
              ),
            ].join("\n"),
            ...(attachments.length ? { attachments } : {}),
          };
          const result = state.active
            ? await (state.session.steer?.(input) ??
                Promise.reject(Error("Steering unavailable")))
            : await state.session.execute(input);
          if (result.status !== "ok") throw Error(result.failure.message);
          state.messages.push({
            id: crypto.randomUUID(),
            role: "user",
            text: command.text,
            assets: attachments,
            operationId: op,
          });
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
    async importAsset(bytes: Uint8Array, mediaType: string, name: string) {
      const workbenchId = project.conversations.find(
        (c) => c.id === project.selectedId,
      )?.workbenchId;
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
      await Promise.all([...live.values()].map((s) => s.close()));
    },
  };
}

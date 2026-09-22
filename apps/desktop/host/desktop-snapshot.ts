import { z } from "zod";
import { OperatorSnapshotSchema } from "@drawloom/workbench";
import {
  DesktopSnapshotSchema,
  ProjectSchema,
  type DesktopSnapshot,
} from "../src/lib/protocol.js";
import type { createDesktopSessions } from "./desktop-sessions.js";
import type { createMediaPolicy } from "./media-policy.js";
import type { createDesktopEvidence } from "./evidence.js";
import type { createApprovalPresentationHost } from "./approval-presentation.js";
import type { createElicitationPresenter } from "./elicitation.js";

type Project = z.infer<typeof ProjectSchema>;
type Runtime = {
  packages: {
    toolPresentation: ReadonlyMap<
      string,
      { available: boolean; name: string; origin: string }
    >;
  };
  registry: {
    workbenches: ReadonlyArray<DesktopSnapshot["workbenches"][number]>;
    views: ReadonlyArray<DesktopSnapshot["views"][number]>;
    plugins: ReadonlyArray<{ id: string }>;
  };
  controllers: ReadonlyMap<
    string,
    { snapshot(): Promise<z.infer<typeof OperatorSnapshotSchema>> }
  >;
  packageToolIds: ReadonlySet<string>;
  packageGrants: Record<string, readonly string[] | undefined>;
  knowledgeToolIds: ReadonlySet<string>;
  knowledgeGrants: Record<string, readonly string[] | undefined>;
};

export const unavailable = {
  artifacts: [],
  candidates: [],
  reviews: [],
  readiness: "unavailable" as const,
  summary: "Install a matching trusted operator controller at startup.",
  configuration: [],
  grants: [],
};

export function createDesktopSnapshot(options: {
  runtime(): Promise<Runtime>;
  project(): Project;
  live: ReturnType<typeof createDesktopSessions>;
  mediaPolicy: Awaited<ReturnType<typeof createMediaPolicy>>;
  evidenceFor(
    conversationId: string,
  ): Promise<Awaited<ReturnType<typeof createDesktopEvidence>>>;
  approvals: ReturnType<typeof createApprovalPresentationHost>;
  elicitation: ReturnType<typeof createElicitationPresenter>;
  archiveBlocked(conversationId: string): boolean;
  verifyProject(project: Project["projects"][number]): Promise<void>;
  notice(): string;
  activeContext(conversationId: string): string;
  approvalPresentation: "external" | "desktop";
}) {
  return async function snapshot() {
    const {
      packages,
      registry,
      controllers,
      packageToolIds,
      packageGrants,
      knowledgeToolIds,
      knowledgeGrants,
    } = await options.runtime();
    const project = options.project();
    const conversation = project.conversations.find(
      (entry) => entry.id === project.selectedId,
    );
    const state = options.live.get(project.selectedId);
    const controller = conversation
      ? controllers.get(conversation.workbenchId)
      : undefined;
    const original = controller ? await controller.snapshot() : unavailable;
    const operator = {
      ...original,
      grants: [
        ...original.grants,
        ...[...knowledgeToolIds].map((toolName) => ({
          toolName,
          allowed: conversation
            ? (knowledgeGrants[conversation.workbenchId]?.includes(toolName) ??
              false)
            : false,
        })),
        ...[...packageToolIds].map((toolName) => ({
          toolName,
          allowed: conversation
            ? (packageGrants[conversation.workbenchId]?.includes(toolName) ??
              false)
            : false,
        })),
      ],
    };
    const retained = conversation
      ? await options.evidenceFor(conversation.id)
      : undefined;
    return DesktopSnapshotSchema.parse({
      mediaPolicy: options.mediaPolicy.snapshot(),
      toolLabels: [...packages.toolPresentation]
        .filter(([, tool]) => tool.available)
        .map(([toolName, tool]) => ({
          toolName,
          title: tool.name,
          origin: tool.origin,
        })),
      workspace:
        project.projects.find((entry) => entry.id === project.selectedProjectId)
          ?.name ?? "Choose a project",
      projects: await Promise.all(
        project.projects.map(
          async ({ device: _device, inode: _inode, ...entry }) => ({
            ...entry,
            available: await options
              .verifyProject({ ...entry, device: _device, inode: _inode })
              .then(
                () => true,
                () => false,
              ),
          }),
        ),
      ),
      ...(project.selectedProjectId
        ? { selectedProjectId: project.selectedProjectId }
        : {}),
      conversations: project.conversations,
      workbenches: registry.workbenches,
      views: registry.views,
      selectedId: project.selectedId,
      signals: state?.signals ?? [],
      modes: [...(state?.session.modes ?? [])],
      goal: {
        supported: state
          ? !!state.session.goals
          : conversation?.provider === "codex",
        ...(state?.goal !== undefined ? { snapshot: state.goal } : {}),
        ...(state?.goalError ? { error: state.goalError } : {}),
      },
      delegation: {
        supported: Boolean(
          state?.session.delegations && !state.delegationError,
        ),
        children: [...(state?.delegations?.values() ?? [])],
        ...(state?.delegationError ? { error: state.delegationError } : {}),
      },
      forking: { supported: Boolean(state?.session.forks) },
      approvals: options.approvals.pending(project.selectedId).map((entry) => ({
        ...entry,
        presentation: options.approvalPresentation,
      })),
      activity: (retained?.activity() ?? []).map((result) => ({
        toolName: retained?.toolFor(result.invocationId),
        ...(result.outcome.status === "ok"
          ? {
              ...result,
              outcome: {
                status: "ok",
                text: result.outcome.text,
                value: result.outcome.value,
              },
            }
          : result),
      })),
      pendingTools: retained?.pending() ?? [],
      elicitations: conversation
        ? options.elicitation.pending(conversation.id)
        : [],
      operator,
      ...(state?.active ? { activeOperation: state.active } : {}),
      archiveBlockedConversationIds: project.conversations
        .filter((entry) => options.archiveBlocked(entry.id))
        .map((entry) => entry.id),
      controls: {
        steer: Boolean(state?.session.steer),
        interrupt: Boolean(state?.session.interrupt),
        reviewerModes: state?.session.reviewerModes ?? ["human"],
      },
      plugins: registry.plugins.map((plugin) => ({
        id: plugin.id,
        status: "ready",
        summary: "Registered at startup. Tool grants are separate.",
      })),
      notice: options.notice(),
      activeContext: conversation ? options.activeContext(conversation.id) : "",
    });
  };
}

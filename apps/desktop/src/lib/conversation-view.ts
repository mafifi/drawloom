import type { DesktopSnapshot } from "./protocol.js";
import type { DesktopViewModel } from "./view-model.svelte.js";
import { conversationTurns } from "./conversation-scroll.js";
import { projectConversation } from "./conversation-presentation.js";
import { groupToolActivity } from "./tool-outcome.js";
import { elicitationFormActions, elicitationFormPresentation } from "./elicitation-form.js";
import { goalControlsActions, goalControlsPresentation } from "./goal-controls.js";

type State = Pick<
  DesktopSnapshot,
  | "activity"
  | "toolLabels"
  | "views"
  | "projects"
  | "workbenches"
  | "activeOperation"
  | "modes"
  | "elicitations"
  | "signals"
  | "selectedId"
>;
type ReadFields = Pick<
  DesktopViewModel,
  | "conversation"
  | "conversationProject"
  | "selectedProject"
  | "history"
  | "busy"
  | "pendingCommand"
  | "canCreate"
  | "canSend"
  | "creationSource"
  | "detailsOpen"
  | "artifact"
  | "candidate"
  | "approvals"
>;
export type ConversationPresentation = Readonly<
  ReadFields & {
    state?: State;
    turns: ReturnType<typeof conversationTurns>;
    nodes: ReturnType<typeof projectConversation>;
    activity: ReturnType<typeof groupToolActivity>;
    workbenchView: NonNullable<DesktopSnapshot["views"]>[number] | undefined;
    goal: ReturnType<typeof goalControlsPresentation>;
    elicitations: ReadonlyArray<{
      request: DesktopSnapshot["elicitations"][number];
      presentation: ReturnType<typeof elicitationFormPresentation>;
      actions: ReturnType<typeof elicitationFormActions>;
    }>;
  }
>;
type Commands = Pick<
  DesktopViewModel,
  | "assignProject"
  | "loadEarlier"
  | "loadLatest"
  | "create"
  | "implementPlan"
  | "attachmentName"
  | "resourceCardPresentation"
  | "openResourceWorkspace"
  | "readResource"
  | "toggleResource"
  | "delegationCard"
  | "inspectDelegation"
  | "prepareDelegation"
  | "interruptDelegation"
  | "openArtifactWorkspace"
  | "submitInput"
>;
export type ConversationActions = Readonly<
  Commands & {
    setDetailsOpen(open: boolean): void;
    openWorkbench(): void;
    openProjects(): void;
    setDraft(value: string): void;
    cancelInput(requestId: string): Promise<boolean>;
    goal: ReturnType<typeof goalControlsActions>;
  }
>;

export function conversationPresentation(vm: DesktopViewModel): ConversationPresentation {
  const state = vm.state;
  return {
    conversation: vm.conversation,
    conversationProject: vm.conversationProject,
    selectedProject: vm.selectedProject,
    history: vm.history,
    busy: vm.busy,
    pendingCommand: vm.pendingCommand,
    canCreate: vm.canCreate,
    canSend: vm.canSend,
    creationSource: vm.creationSource,
    detailsOpen: vm.detailsOpen,
    artifact: vm.artifact,
    candidate: vm.candidate,
    approvals: vm.approvals,
    state: state
      ? {
          activity: state.activity,
          toolLabels: state.toolLabels,
          views: state.views,
          projects: state.projects,
          workbenches: state.workbenches,
          activeOperation: state.activeOperation,
          modes: state.modes,
          elicitations: state.elicitations,
          signals: state.signals,
          selectedId: state.selectedId,
        }
      : undefined,
    turns: conversationTurns(vm.history.entries),
    nodes: projectConversation(vm.history.entries, vm.history.anchorId),
    activity: groupToolActivity(state?.activity ?? [], vm.history.entries),
    workbenchView: state?.views.find((view) => view.workbenchId === vm.conversation?.workbenchId),
    goal: goalControlsPresentation(vm),
    elicitations: (state?.elicitations ?? []).map((request) => ({
      request,
      presentation: elicitationFormPresentation(vm, request.requestId),
      actions: elicitationFormActions(vm, request.requestId),
    })),
  };
}

export function conversationActions(vm: DesktopViewModel): ConversationActions {
  return {
    assignProject: vm.assignProject,
    loadEarlier: vm.loadEarlier,
    loadLatest: vm.loadLatest,
    create: vm.create,
    implementPlan: vm.implementPlan,
    attachmentName: vm.attachmentName,
    resourceCardPresentation: vm.resourceCardPresentation,
    openResourceWorkspace: vm.openResourceWorkspace,
    readResource: vm.readResource,
    toggleResource: vm.toggleResource,
    delegationCard: vm.delegationCard,
    inspectDelegation: vm.inspectDelegation,
    prepareDelegation: vm.prepareDelegation,
    interruptDelegation: vm.interruptDelegation,
    openArtifactWorkspace: vm.openArtifactWorkspace,
    submitInput: vm.submitInput,
    setDetailsOpen: (open) => {
      if (open) vm.workspaceMode = "plugin";
      vm.detailsOpen = open;
    },
    openWorkbench: () => {
      vm.workspaceMode = "plugin";
      vm.detailsOpen = true;
    },
    openProjects: () => {
      vm.primaryView = "projects";
    },
    setDraft: (value) => {
      vm.draft = value;
    },
    cancelInput: (requestId) =>
      vm.command({
        kind: "input",
        conversationId: vm.state!.selectedId,
        resolution: { requestId, action: "cancel" },
      }),
    goal: goalControlsActions(vm),
  };
}

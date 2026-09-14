import type { RegisteredWorkbenchView } from "@drawloom/plugins";
import type { ToolResult } from "@drawloom/tools";
import type {
  OperatorCommand,
  Artifact,
  Candidate,
  Review,
} from "@drawloom/workbench";
import type { DesktopSnapshot, DesktopCommand } from "./protocol.js";
import type { DesktopViewModel } from "./view-model.svelte.js";

type OperatorGroup = NonNullable<DesktopSnapshot["operator"]["groups"]>[number];
type ToolStart = DesktopSnapshot["pendingTools"][number];

export type DetailsPanePresentation = Readonly<{
  artifact?: Artifact;
  artifacts: Artifact[];
  candidate?: Candidate;
  candidates: Candidate[];
  comparableCandidates: Candidate[];
  workspaceResource?: DesktopViewModel["workspaceResource"];
  pluginView?: RegisteredWorkbenchView;
  conversationId: string;
  provider?: "synthetic" | "codex";
  mediaRevision: string;
  groups: OperatorGroup[];
  operatorArtifacts: Artifact[];
  reviews: Review[];
  selectedCandidateId?: string;
  operatorSummary: string;
  readiness: DesktopSnapshot["operator"]["readiness"];
  spendingSummary?: string;
  notice: string;
  pendingTools: ToolStart[];
  activity: ToolResult[];
  busy: boolean;
  pendingCommand?: DesktopCommand;
  pane: "preview" | "details";
  groupId: string;
  artifactId: string;
  candidateId: string;
  compare: boolean;
  editing: boolean;
  editText: string;
  reviewSummary: string;
  detailsOpen: boolean;
  detailsWidth: number;
  detailsExpanded: boolean;
  workspaceMode: "shared" | "plugin";
  narrow: boolean;
}>;

export type DetailsPaneActions = Readonly<{
  close(): void;
  setWidth(value: number): void;
  setExpanded(value: boolean): void;
  setWorkspaceMode(value: "shared" | "plugin"): void;
  setPane(value: "preview" | "details"): void;
  setGroup(value: string): void;
  setArtifact(value: string): void;
  setCandidate(value: string): void;
  setCompare(value: boolean): void;
  setEditing(value: boolean): void;
  setEditText(value: string): void;
  setReviewSummary(value: string): void;
  saveRevision(): Promise<void>;
  operator(command: OperatorCommand): Promise<boolean>;
}>;

export function detailsPanePresentation(
  vm: DesktopViewModel,
  visible = true,
  narrow = false,
): DetailsPanePresentation {
  const operator = vm.state?.operator;
  return {
    artifact: vm.artifact,
    artifacts: vm.artifacts,
    candidate: vm.candidate,
    candidates: vm.candidates,
    comparableCandidates: vm.comparableCandidates,
    workspaceResource: vm.workspaceResource,
    pluginView: vm.state?.views.find(
      (view) => view.workbenchId === vm.conversation?.workbenchId,
    ),
    conversationId: vm.state?.selectedId ?? "",
    provider: vm.conversation?.provider,
    mediaRevision: vm.state?.mediaPolicy.revision ?? "",
    groups: operator?.groups ?? [],
    operatorArtifacts: operator?.artifacts ?? [],
    reviews: operator?.reviews ?? [],
    selectedCandidateId: operator?.selectedCandidateId,
    operatorSummary: operator?.summary ?? "",
    readiness: operator?.readiness ?? "unavailable",
    spendingSummary: operator?.spending?.summary,
    notice: vm.state?.notice ?? "",
    pendingTools: vm.state?.pendingTools ?? [],
    activity: vm.state?.activity ?? [],
    busy: vm.busy,
    pendingCommand: vm.pendingCommand,
    pane: vm.pane,
    groupId: vm.groupId,
    artifactId: vm.artifactId,
    candidateId: vm.candidateId,
    compare: vm.compare,
    editing: vm.editing,
    editText: vm.editText,
    reviewSummary: vm.reviewSummary,
    detailsOpen: visible && vm.detailsOpen,
    detailsWidth: vm.detailsWidth,
    detailsExpanded: vm.detailsExpanded,
    workspaceMode: vm.workspaceMode,
    narrow,
  };
}

export function detailsPaneActions(vm: DesktopViewModel): DetailsPaneActions {
  return {
    close: () => {
      vm.detailsOpen = false;
    },
    setWidth: (value) => {
      vm.detailsWidth = value;
    },
    setExpanded: (value) => {
      vm.detailsExpanded = value;
    },
    setWorkspaceMode: (value) => {
      vm.workspaceMode = value;
    },
    setPane: (value) => {
      vm.pane = value;
    },
    setGroup: (value) => {
      vm.groupId = value;
    },
    setArtifact: (value) => {
      vm.artifactId = value;
    },
    setCandidate: (value) => {
      vm.candidateId = value;
    },
    setCompare: (value) => {
      vm.compare = value;
    },
    setEditing: (value) => {
      vm.editing = value;
    },
    setEditText: (value) => {
      vm.editText = value;
    },
    setReviewSummary: (value) => {
      vm.reviewSummary = value;
    },
    saveRevision: () => vm.saveRevision(),
    operator: (command) => vm.operator(command),
  };
}

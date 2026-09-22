import type { DesktopSnapshot } from "./protocol.js";
import type { DesktopViewModel } from "./view-model.svelte.js";

type Conversation = DesktopSnapshot["conversations"][number];

export type SidebarPresentation = Readonly<{
  primaryView: DesktopViewModel["primaryView"];
  settingsSection: DesktopViewModel["settingsSection"];
  pluginSettingsGroups: DesktopViewModel["pluginSettingsGroups"];
  pluginSettingsLoading: boolean;
  pluginSettingsError: string;
  busy: boolean;
  error: string;
  pendingCommand: DesktopViewModel["pendingCommand"];
  conversation: DesktopViewModel["conversation"];
  selectedId: string;
  workbenches: DesktopSnapshot["workbenches"];
  projects: DesktopSnapshot["projects"];
  conversations: DesktopSnapshot["conversations"];
  archiveBlockedConversationIds: DesktopSnapshot["archiveBlockedConversationIds"];
}>;

export type SidebarActions = Readonly<{
  setPrimaryView(value: DesktopViewModel["primaryView"]): void;
  setSettingsSection(value: DesktopViewModel["settingsSection"]): void;
  closeSettings(): void;
  openSearch(): void;
  beginRename(conversation: Conversation): void;
  openWorkbench(id: string): void;
  newConversationInProject(id: string): Promise<boolean>;
  selectProject(id: string): Promise<boolean>;
  selectConversation(id: string): Promise<boolean>;
  setConversationPinned(id: string, pinned: boolean): Promise<boolean>;
  archiveConversation(id: string): Promise<boolean>;
  renameProject(projectId: string, name: string): Promise<boolean>;
}>;

export function sidebarPresentation(vm: DesktopViewModel): SidebarPresentation {
  return {
    primaryView: vm.primaryView,
    settingsSection: vm.settingsSection,
    pluginSettingsGroups: vm.pluginSettingsGroups,
    pluginSettingsLoading: vm.pluginSettingsLoading,
    pluginSettingsError: vm.pluginSettingsError,
    busy: vm.busy,
    error: vm.error,
    pendingCommand: vm.pendingCommand,
    conversation: vm.conversation,
    selectedId: vm.state?.selectedId ?? "",
    workbenches: vm.state?.workbenches ?? [],
    projects: vm.state?.projects ?? [],
    conversations: vm.state?.conversations ?? [],
    archiveBlockedConversationIds: vm.state?.archiveBlockedConversationIds ?? [],
  };
}

export function sidebarActions(vm: DesktopViewModel): SidebarActions {
  return {
    setPrimaryView: (value) => {
      vm.primaryView = value;
    },
    setSettingsSection: (value) => {
      vm.settingsSection = value;
    },
    closeSettings: () => vm.closeSettings(),
    openSearch: () => vm.navigation.openSearch(),
    beginRename: (conversation) => vm.navigation.beginRename(conversation),
    openWorkbench: (id) => vm.openWorkbench(id),
    newConversationInProject: (id) => vm.newConversationInProject(id),
    selectProject: (id) => vm.selectProject(id),
    selectConversation: (id) => vm.select(id),
    setConversationPinned: (id, pinned) =>
      vm.command({ kind: "set_conversation_pinned", conversationId: id, pinned }),
    archiveConversation: (id) => vm.command({ kind: "archive_conversation", conversationId: id }),
    renameProject: (projectId, name) => vm.command({ kind: "rename_project", projectId, name }),
  };
}

import type { DesktopCommand, DesktopSnapshot } from "./protocol.js";
import type { DesktopViewModel } from "./view-model.svelte.js";
import {
  discoveryInventoryActions,
  discoveryInventoryPresentation,
  type DiscoveryInventoryActions,
  type DiscoveryInventoryPresentation,
} from "./discovery-inventory.js";

type OperatorConfigField = DesktopSnapshot["operator"]["configuration"][number];

export type PrimaryViewPresentation = Readonly<{
  primaryView: DesktopViewModel["primaryView"];
  settingsSection: DesktopViewModel["settingsSection"];
  selectedSettingsPage: DesktopViewModel["selectedSettingsPage"];
  pluginSettingsGroups: DesktopViewModel["pluginSettingsGroups"];
  pluginSettingsLoading: boolean;
  pluginSettingsError: string;
  selectedProject: DesktopViewModel["selectedProject"];
  selectedWorkbench: DesktopViewModel["selectedWorkbench"];
  selectedWorkbenchReadiness: DesktopViewModel["selectedWorkbenchReadiness"];
  conversation: DesktopViewModel["conversation"];
  conversationProject: DesktopViewModel["conversationProject"];
  conversations: DesktopSnapshot["conversations"];
  workbenches: DesktopSnapshot["workbenches"];
  projects: DesktopSnapshot["projects"];
  busy: boolean;
  pendingCommand: DesktopViewModel["pendingCommand"];
  creationSource: DesktopViewModel["creationSource"];
  error: string;
  projectDirectoryPending: boolean;
  projectDirectoryNote: string;
  mediaSources: DesktopSnapshot["mediaPolicy"]["sources"];
  operatorConfiguration: DesktopSnapshot["operator"]["configuration"];
  operatorGrants: DesktopSnapshot["operator"]["grants"];
  toolLabels: DesktopSnapshot["toolLabels"];
  activeOperation: DesktopSnapshot["activeOperation"];
  browser: { snapshot: DesktopViewModel["browser"]["snapshot"]; pending: string; error: string };
  discoveryInventory: DiscoveryInventoryPresentation;
}>;

export type PrimaryViewActions = Readonly<{
  setPrimaryView(value: DesktopViewModel["primaryView"]): void;
  setSettingsSection(value: DesktopViewModel["settingsSection"]): void;
  openWorkbench(id: string): void;
  selectConversation(id: string): Promise<boolean>;
  createConversation(workbenchId: string, provider: "synthetic" | "codex"): Promise<boolean>;
  chooseProjectDirectory(): Promise<string | undefined>;
  addProject(directory: string, name: string): Promise<boolean>;
  restoreConversation(id: string): Promise<boolean>;
  setModel(
    conversationId: string,
    selection?: NonNullable<DesktopViewModel["conversation"]>["modelSelection"],
  ): Promise<boolean>;
  /**
   * Coerces a submitted form value to the workbench configuration field's
   * declared type before dispatching it. This used to happen inline in
   * PrimaryView.svelte's onsubmit handler.
   */
  configureField(field: OperatorConfigField, form: FormData): Promise<boolean>;
  setToolGrant(toolName: string, allowed: boolean): Promise<boolean>;
  browserForget(origin: string, permission: "camera" | "microphone"): Promise<boolean>;
  discoveryInventory: DiscoveryInventoryActions;
}>;

export function primaryViewPresentation(vm: DesktopViewModel): PrimaryViewPresentation {
  return {
    primaryView: vm.primaryView,
    settingsSection: vm.settingsSection,
    selectedSettingsPage: vm.selectedSettingsPage,
    pluginSettingsGroups: vm.pluginSettingsGroups,
    pluginSettingsLoading: vm.pluginSettingsLoading,
    pluginSettingsError: vm.pluginSettingsError,
    selectedProject: vm.selectedProject,
    selectedWorkbench: vm.selectedWorkbench,
    selectedWorkbenchReadiness: vm.selectedWorkbenchReadiness,
    conversation: vm.conversation,
    conversationProject: vm.conversationProject,
    conversations: vm.state?.conversations ?? [],
    workbenches: vm.state?.workbenches ?? [],
    projects: vm.state?.projects ?? [],
    busy: vm.busy,
    pendingCommand: vm.pendingCommand,
    creationSource: vm.creationSource,
    error: vm.error,
    projectDirectoryPending: vm.projectDirectoryPending,
    projectDirectoryNote: vm.projectDirectoryNote,
    mediaSources: vm.state?.mediaPolicy.sources ?? [],
    operatorConfiguration: vm.state?.operator.configuration ?? [],
    operatorGrants: vm.state?.operator.grants ?? [],
    toolLabels: vm.state?.toolLabels ?? [],
    activeOperation: vm.state?.activeOperation,
    browser: {
      snapshot: vm.browser.snapshot,
      pending: vm.browser.pendingKey,
      error: vm.browser.error,
    },
    discoveryInventory: discoveryInventoryPresentation(vm),
  };
}

export function primaryViewActions(vm: DesktopViewModel): PrimaryViewActions {
  return {
    setPrimaryView: (value) => {
      vm.primaryView = value;
    },
    setSettingsSection: (value) => {
      vm.settingsSection = value;
    },
    openWorkbench: (id) => vm.openWorkbench(id),
    selectConversation: (id) => vm.select(id),
    createConversation: (workbenchId, provider) => vm.create(workbenchId, provider, "workbench"),
    chooseProjectDirectory: () => vm.chooseProjectDirectory(),
    addProject: (directory, name) => vm.addProject(directory, name),
    restoreConversation: (id) => vm.command({ kind: "restore_conversation", conversationId: id }),
    setModel: (conversationId, selection) =>
      vm.command({
        kind: "set_model",
        conversationId,
        ...(selection ? { selection } : {}),
      } as Extract<DesktopCommand, { kind: "set_model" }>),
    configureField: (field, form) => {
      const raw = form.get("value");
      const value =
        typeof field.value === "boolean"
          ? raw === "on"
          : typeof field.value === "number"
            ? Number(raw)
            : String(raw ?? "");
      return vm.operator({ kind: "configure", key: field.key, value });
    },
    setToolGrant: (toolName, allowed) => vm.operator({ kind: "set_tool_grant", toolName, allowed }),
    browserForget: (origin, permission) =>
      vm.browser.command({ kind: "forget", origin, permission }),
    discoveryInventory: discoveryInventoryActions(vm),
  };
}

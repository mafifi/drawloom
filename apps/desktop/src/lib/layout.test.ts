import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const source = async (name: string) => readFile(new URL(name, import.meta.url), "utf8");

test("utility menu describes its actions without implying a user account", async () => {
  const sidebar = await source("./Sidebar.svelte");
  expect(sidebar).toContain('aria-label="Settings and more"');
  expect(sidebar).not.toContain("Local profile");
  expect(sidebar).toContain("Archived conversations");
});

test("composer keeps one toolbar and moves secondary entry points into Add", async () => {
  const composer = await source("./Composer.svelte");
  expect(composer.match(/<PromptInput.Actions/g)).toHaveLength(1);
  expect(composer).toContain('class="composer-toolbar gap-1"');
  expect(composer).toContain('aria-label="Add to message"');
  expect(composer).toContain("onclick={()=>void openAdd()}");
  expect(composer).toContain("<DiscoveryPicker");
  expect(composer).not.toContain('aria-label="Agent provider"');
  expect(composer).not.toContain(">$ Skills</Button>");
  expect(composer).not.toContain(">@ Context</Button>");
  expect(composer).toContain("oninput={typedReference}");
});

test("conversation actions share commands across context menu and inline controls", async () => {
  const row = await source("./ConversationNavItem.svelte");
  expect(row).toContain("<ContextMenu.Root>");
  expect(row).toContain("onclick={a.pin}");
  expect(row).toContain("onclick={a.archive}");
  expect(row).toContain("p.busy || p.archiveBlocked");
  expect(row).not.toContain("DropdownMenu");
  expect(row).not.toContain("MoreIcon");
});

test("sidebar keeps compact reference hierarchy and keyboard-reachable hover actions", async () => {
  const sidebar = await source("./Sidebar.svelte");
  expect(sidebar.indexOf(">Workbenches</")).toBeLessThan(sidebar.indexOf(">Projects</"));
  expect(sidebar).toContain("<FolderOpenIcon");
  expect(sidebar).toContain("border-0 px-0");
  expect(sidebar).toContain('aria-label="Search conversations"');
  expect(sidebar).toContain('aria-label="Add project"');
  expect(sidebar).not.toContain("<span>Add project</span>");
  expect(sidebar).toContain(".sidebar-reveal:focus-visible");
  expect(sidebar).toContain("(hover: hover) and (pointer: fine)");
});

test("conversation search composes the shared command palette without hand-built arrow navigation", async () => {
  const search = await source("./ConversationSearch.svelte");
  expect(search).toContain("<Command.Root shouldFilter={false}");
  expect(search).toContain("<Command.Input");
  expect(search).toContain("<Command.Item");
  expect(search).toContain("presentation.recent");
  expect(search).toContain('heading="Quick actions"');
  expect(search).not.toContain("moveResult");
});

test("native media load failures have shared, actionable feedback without fetching a blob", async () => {
  const viewer = await source("./FileViewer.svelte");
  expect(viewer).toContain("onerror={failed}");
  expect(viewer).toContain("This file could not be loaded");
  expect(viewer).toContain("<Alert.Root");
  expect(viewer).not.toContain("arrayBuffer");
});

test("projects use shared sidebar controls and a compact main-view directory form", async () => {
  const sidebar = await source("./Sidebar.svelte");
  const primary = await source("./PrimaryView.svelte");
  const projects = await source("./Projects.svelte").catch(() => "");
  const conversation = await source("./Conversation.svelte");
  expect(sidebar).toContain("<Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>");
  expect(sidebar).toContain("vm.selectProject(");
  expect(primary).toContain(
    "<Projects presentation={projectPresentation} actions={projectActions}",
  );
  expect(primary).toContain("vm.addProject(");
  expect(projects).toContain("a.add(directory, name)");
  expect(projects).toContain("<Input");
  expect(projects).not.toContain("Sheet.Root");
  expect(conversation).toContain("vm.assignProject(");
  expect(conversation).toContain("Select a project");
});

test("the native folder action only populates the editable directory form", async () => {
  const projects = await source("./Projects.svelte");
  expect(projects).toContain("a.chooseDirectory()");
  expect(projects).toContain("pending={p.choosing}");
  expect(projects).toContain("p.note");
  expect(projects).toContain("bind:value={directory}");
});

test("package media seeds explain shared activation and the narrow permission boundary", async () => {
  const packages = await source("./PackageInstallations.svelte");
  expect(packages).toContain("Shared media declaration seeds");
  expect(packages).toContain("approvedResourceOrigins");
  expect(packages).toContain("shared host media policy for all workbenches");
  expect(packages).toContain("scripts or general network access");
  expect(packages).toContain("Restart");
  expect(packages).not.toContain("Approved media origins");
});

test("changing an artifact replaces native viewers and releases inactive sources", async () => {
  const viewer = await source("./FileViewer.svelte").catch(() => "");
  expect(viewer).toContain("{#key url}");
  expect(viewer.match(/use:releaseMedia/g)).toHaveLength(2);
  expect(viewer.match(/use:releaseSource/g)).toHaveLength(3);
});

test("working files load only from an explicit preview with original provenance retained", async () => {
  const card = await source("./ResourceCard.svelte");
  const workspace = await source("./WorkspaceResourceViewer.svelte");
  expect(card).toContain("presentation.isWorkingFile");
  expect(card).toContain("Open in workspace");
  expect(card).toContain("Current project file; viewing does not import");
  expect(card).toContain("{resource.uri}");
  expect(workspace).toContain("<FileViewer");
});

test("discovery suggestions stay anchored to the composer instead of opening a dialog", async () => {
  const picker = await source("./DiscoveryPicker.svelte");
  const composer = await source("./Composer.svelte");

  expect(picker).not.toContain("Dialog.Root");
  expect(picker).toContain("<MentionPicker");
  expect(picker).not.toContain('class="discovery-suggestions"');
  expect(composer).toContain("<DiscoveryPicker");
  expect(composer.indexOf("<DiscoveryPicker")).toBeGreaterThan(
    composer.indexOf("<InputGroup.Textarea"),
  );
});

test("primary destinations are main-content views while artifact details remain independently docked", async () => {
  const page = await source("../routes/+page.svelte");
  const details = await source("./DetailsPane.svelte");

  expect(page).toContain("<PrimaryView {vm}");
  expect(page).toContain("vm.primaryView === 'conversation'");
  expect(page).toContain("class:workspace-pane-full={drawer || vm.detailsExpanded}");
  expect(page).toContain("bind:clientWidth={availableWidth}");
  expect(page).toContain("workspaceNeedsFullWidth(availableWidth)");
  expect(page).toContain("class:workspace-conversation-hidden={vm.primaryView !== 'conversation'");
  expect(page).not.toContain("{#if vm.primaryView === 'conversation'}");
  expect(page).toContain("detailsPanePresentation(vm, vm.primaryView === 'conversation', drawer)");
  expect(page).not.toContain("<Sheet.Root bind:open={vm.detailsOpen}");
  expect(details).not.toContain('vm.pane === "plugins"');
  expect(details).not.toContain('vm.pane === "settings"');
});

test("workspace presentation keeps one pane mounted across ordinary layout changes", async () => {
  const page = await source("../routes/+page.svelte");
  const details = await source("./DetailsPane.svelte");

  expect(page).toContain(
    "class:workspace-pane-hidden={vm.primaryView !== 'conversation' || !vm.detailsOpen}",
  );
  expect(page).toContain("class:workspace-pane-full={drawer || vm.detailsExpanded}");
  expect(details).toContain("Back to conversation");
  expect(details).not.toContain('type="range"');
  expect(details).toContain('class="workspace-toolbar"');
  expect(details).toContain("ExpandIcon");
  expect(details).toContain("aria-pressed={presentation.detailsExpanded}");
  expect(details.match(/<PluginView /g)).toHaveLength(1);
  expect(details).toContain(
    "class:workspace-content-hidden={!presentation.detailsOpen || !showPluginView}",
  );
});

test("result resources open in the workspace and never eagerly mount media", async () => {
  const resource = await source("./ResourceCard.svelte");

  expect(resource).toContain("Open in workspace");
  expect(resource).not.toContain("<ArtifactViewer");
  expect(resource).not.toContain("<FileViewer");
  expect(resource).not.toContain("<iframe");
});

test("sent non-image references use compact closed previews and selection badges stay outside the bubble", async () => {
  const conversation = await source("./Conversation.svelte");
  const resource = await source("./ResourceCard.svelte");
  const attachment = await source("./AttachmentCard.svelte");

  expect(conversation).toContain("<AttachmentCard");
  expect(conversation).toContain("<ChatMessage.Actions");
  expect(conversation.indexOf("<ChatMessage.Actions")).toBeGreaterThan(
    conversation.indexOf("</ChatMessage.Content>"),
  );
  expect(attachment).toContain("<Collapsible.Root>");
  expect(attachment).toContain("Preview attachment");
  expect(resource).toContain("Open in workspace");
  expect(resource).not.toContain("<ArtifactViewer");
});

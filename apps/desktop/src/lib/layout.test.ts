import { expect, test } from "bun:test";

const source = async (name: string) =>
  Bun.file(new URL(name, import.meta.url)).text();

test('native media load failures have shared, actionable feedback without fetching a blob',async()=>{
  const viewer=await source('./FileViewer.svelte');
  expect(viewer).toContain('onerror={failed}');
  expect(viewer).toContain('This file could not be loaded');
  expect(viewer).toContain('<Alert.Root');
  expect(viewer).not.toContain('arrayBuffer');
});

test('projects use shared sidebar controls and a compact main-view directory form', async () => {
  const sidebar = await source('./Sidebar.svelte');
  const primary = await source('./PrimaryView.svelte');
  const projects = await source('./Projects.svelte').catch(() => '');
  const conversation = await source('./Conversation.svelte');
  expect(sidebar).toContain('<Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>');
  expect(sidebar).toContain('vm.selectProject(');
  expect(primary).toContain('<Projects {vm}');
  expect(projects).toContain('vm.addProject(');
  expect(projects).toContain('<Input');
  expect(projects).not.toContain('Sheet.Root');
  expect(conversation).toContain('vm.assignProject(');
  expect(conversation).toContain('Select a project');
});

test('the native folder action only populates the editable directory form', async () => {
  const projects = await source('./Projects.svelte');
  expect(projects).toContain('vm.chooseProjectDirectory()');
  expect(projects).toContain('pending={vm.projectDirectoryPending}');
  expect(projects).toContain('vm.projectDirectoryNote');
  expect(projects).toContain('bind:value={directory}');
});

test('package media seeds explain shared activation and the narrow permission boundary', async () => {
  const packages = await source('./PackageInstallations.svelte');
  expect(packages).toContain('Shared media declaration seeds');
  expect(packages).toContain('approvedResourceOrigins');
  expect(packages).toContain('shared host media policy for all workbenches');
  expect(packages).toContain('scripts or general network access');
  expect(packages).toContain('Restart');
  expect(packages).not.toContain('Approved media origins');
});

test('changing an artifact replaces native viewers and releases inactive sources', async () => {
  const viewer = await source('./FileViewer.svelte').catch(() => '');
  expect(viewer).toContain('{#key url}');
  expect(viewer.match(/use:releaseMedia/g)).toHaveLength(2);
  expect(viewer.match(/use:releaseSource/g)).toHaveLength(3);
});

test('working files load only from an explicit preview with original provenance retained', async () => {
  const card = await source('./ResourceCard.svelte');
  const artifact = await source('./ArtifactViewer.svelte');
  expect(card).toContain('vm.workingFile(resource)');
  expect(card).toContain('Preview working file');
  expect(card).toContain('{#if workingFileOpen}<FileViewer');
  expect(card).toContain('Current project file; viewing does not import');
  expect(card).toContain('{resource.uri}');
  expect(artifact).toContain('<FileViewer');
});

test("discovery suggestions stay anchored to the composer instead of opening a dialog", async () => {
  const picker = await source("./DiscoveryPicker.svelte");
  const composer = await source("./Composer.svelte");

  expect(picker).not.toContain("Dialog.Root");
  expect(picker).toContain('role="listbox"');
  expect(picker).toContain('class="discovery-suggestions"');
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
  expect(page).toContain("drawer.current && vm.detailsOpen");
  expect(page).not.toContain("<Sheet.Root bind:open={vm.detailsOpen}");
  expect(details).not.toContain('vm.pane === "plugins"');
  expect(details).not.toContain('vm.pane === "settings"');
});

test("sent non-image references use compact closed previews and selection badges stay outside the bubble", async () => {
  const conversation = await source("./Conversation.svelte");
  const resource = await source("./ResourceCard.svelte");
  const attachment = await source("./AttachmentCard.svelte");

  expect(conversation).toContain("<AttachmentCard");
  expect(conversation).toContain("<Message.Footer");
  expect(conversation.indexOf("<Message.Footer")).toBeGreaterThan(conversation.indexOf("</Bubble.Root>"));
  expect(attachment).toContain("<Collapsible.Root>");
  expect(attachment).toContain("Preview attachment");
  expect(resource).toContain("Preview resource");
  expect(resource).toContain("<Collapsible.Content><ArtifactViewer");
});

import { expect, test } from "bun:test";

const source = async (name: string) =>
  Bun.file(new URL(name, import.meta.url)).text();

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

test("sent non-image references use compact closed previews and user badges keep bubble contrast", async () => {
  const conversation = await source("./Conversation.svelte");
  const resource = await source("./ResourceCard.svelte");
  const attachment = await source("./AttachmentCard.svelte");

  expect(conversation).toContain("<AttachmentCard");
  expect(conversation).toContain("text-primary-foreground");
  expect(attachment).toContain("<Collapsible.Root>");
  expect(attachment).toContain("Preview attachment");
  expect(resource).toContain("Preview resource");
  expect(resource).toContain("<Collapsible.Content><ArtifactViewer");
});

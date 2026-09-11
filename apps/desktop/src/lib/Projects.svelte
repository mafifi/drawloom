<script lang="ts">
  import { Alert, Button, Field, Input, StatefulButton } from '@drawloom/ui';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm }: { vm: DesktopViewModel } = $props();
  let directory = $state(''), name = $state('');
</script>

<section class="primary-view-content preview">
  <h2>Add a project</h2>
  <p class="text-muted-foreground">Choose a folder on the computer running Drawloom. Conversations and workbenches use that project’s files.</p>
  <StatefulButton variant="outline" class="w-fit" disabled={vm.busy} pending={vm.projectDirectoryPending} pendingLabel="Choosing folder" onclick={async () => {
    const previous = directory;
    const chosen = await vm.chooseProjectDirectory();
    if (chosen && directory === previous) directory = chosen;
  }}>Choose folder</StatefulButton>
  {#if vm.projectDirectoryNote}<p role="status" class="text-muted-foreground">{vm.projectDirectoryNote}</p>{/if}
  {#if vm.error}<Alert.Root variant="destructive"><Alert.Description>{vm.error}</Alert.Description></Alert.Root>{/if}
  <form class="flex max-w-xl flex-col gap-4" onsubmit={async event => {
    event.preventDefault();
    if (await vm.addProject(directory, name)) { directory = ''; name = ''; }
  }}>
    <Field.Group>
      <Field.Field><Field.Label for="project-directory">Project folder</Field.Label><Input id="project-directory" bind:value={directory} placeholder="/Users/you/Projects/my-project" required /><Field.Description>Enter the full path to an existing folder on the host computer.</Field.Description></Field.Field>
      <Field.Field><Field.Label for="project-name">Name (optional)</Field.Label><Input id="project-name" bind:value={name} maxlength={120} placeholder="Use the folder name" /></Field.Field>
    </Field.Group>
    <StatefulButton type="submit" class="w-fit" disabled={vm.busy || !directory.trim()} pending={vm.pendingCommand?.kind === 'add_project'} pendingLabel="Adding project">Add project</StatefulButton>
  </form>
  {#if vm.selectedProject}
    <div class="flex flex-col items-start gap-2">
      <h2>{vm.selectedProject.name}</h2>
      <p class="break-all text-muted-foreground">{vm.selectedProject.directory}</p>
      {#if !vm.selectedProject.available}<p role="status" class="text-muted-foreground">This folder is unavailable. Saved conversations remain readable.</p>{/if}
      <StatefulButton disabled={vm.busy || !vm.canCreate} pending={vm.creationSource === 'new'} onclick={() => vm.create()}>New conversation</StatefulButton>
      <Button variant="ghost" onclick={() => { vm.primaryView = 'conversation'; }}>Back to conversation</Button>
    </div>
  {/if}
</section>

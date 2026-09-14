<script lang="ts">
  import { Alert, Button, Field, Input, StatefulButton } from '@drawloom/ui';
  export interface ProjectEntryPresentation { busy: boolean; choosing: boolean; saving: boolean; note: string; error: string; }
  export interface ProjectEntryActions { chooseDirectory(): Promise<string | undefined>; add(directory: string, name: string): Promise<boolean>; cancel(): void; }
  let { presentation: p, actions: a }: { presentation: ProjectEntryPresentation; actions: ProjectEntryActions } = $props();
  let directory = $state(''), name = $state('');
</script>

<section class="primary-view-content project-entry">
  <header class="screen-intro">
  <h2>Add a project</h2>
  <p class="text-muted-foreground">A folder for your conversations and workbenches.</p>
  </header>
  <form class="project-entry-form" onsubmit={async event => {
    event.preventDefault();
    if (await a.add(directory, name)) { directory = ''; name = ''; }
  }}>
    <Field.Group>
      <Field.Field><Field.Label for="project-name">Name (optional)</Field.Label><Input id="project-name" bind:value={name} maxlength={120} placeholder="Use the folder name" /></Field.Field>
      <Field.Field><Field.Label for="project-directory">Project folder</Field.Label>
        <div class="folder-input-row"><Input id="project-directory" bind:value={directory} placeholder="/Users/you/Projects/my-project" required />
          <StatefulButton type="button" variant="outline" disabled={p.busy} pending={p.choosing} pendingLabel="Choosing folder" onclick={async () => { const previous=directory; const chosen=await a.chooseDirectory(); if(chosen && directory===previous) directory=chosen; }}>Choose folder</StatefulButton>
        </div>
        <Field.Description>Choose an existing folder, or enter its full path. Files stay where they are.</Field.Description>
      </Field.Field>
    </Field.Group>
    {#if p.note}<p role="status" class="text-sm text-muted-foreground">{p.note}</p>{/if}
    {#if p.error}<Alert.Root variant="destructive"><Alert.Description>{p.error}</Alert.Description></Alert.Root>{/if}
    <footer class="form-footer"><Button type="button" variant="ghost" disabled={p.saving} onclick={a.cancel}>Cancel</Button><StatefulButton type="submit" disabled={p.busy || !directory.trim()} pending={p.saving} pendingLabel="Adding project">Add project</StatefulButton></footer>
  </form>
</section>

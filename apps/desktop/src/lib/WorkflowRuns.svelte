<script lang="ts">
  import { onMount } from 'svelte';
  import { StatefulButton, WorkflowRun, Textarea, Field, Separator } from '@drawloom/ui';
  import { createOrchestrationViewModel } from './orchestration-view-model.svelte.js';

  let { projectId }: { projectId?: string } = $props();
  const vm = createOrchestrationViewModel();
  $effect(() => { void vm.open(projectId ?? ''); return () => vm.close(); });
  onMount(() => {
    const timer = setInterval(() => { if (!vm.error) void vm.refresh(); }, 2000);
    return () => clearInterval(timer);
  });
</script>

<section class="flex flex-col gap-3" aria-label="Local workflows">
  <h2>Local workflows</h2>
  <p class="text-muted-foreground">Work continues while you change views. Quitting Drawloom stops local execution; reopening recovers saved work where its outcome is known.</p>
  {#if !projectId}
    <p class="text-muted-foreground">Select a project to inspect its workflows.</p>
  {:else}
    <div class="flex flex-wrap gap-2">
      {#each vm.owners as owner (owner.installationId)}
        <StatefulButton variant={vm.installationId === owner.installationId ? 'secondary' : 'ghost'} pending={vm.loadingAction === 'owner' && vm.installationId === owner.installationId} pendingLabel="Opening workflows" onclick={() => vm.selectOwner(owner.installationId)}>{owner.title}</StatefulButton>
      {/each}
      <StatefulButton variant="ghost" pending={vm.loadingAction === 'refresh' || vm.loadingAction === 'owners'} pendingLabel="Refreshing" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.installationId ? vm.refresh() : vm.open(projectId)}>Refresh workflows</StatefulButton>
    </div>
    {#each vm.owners.filter(owner => !vm.installationId || owner.installationId === vm.installationId) as owner}
      <p class="text-muted-foreground">{owner.title}: {owner.readiness.message ?? (owner.readiness.status === 'ready' ? 'Ready' : 'Orchestration unavailable; other work remains available.')}</p>
    {/each}
    {#if !vm.loading && !vm.error && !vm.owners.length}<p class="text-muted-foreground">No installed workflow packages in this project.</p>{/if}
    {#if vm.error}<p role="alert" class="text-destructive">{vm.error}</p>{/if}
    {#each vm.runs as run (run.runId)}
      {@const stepPage = vm.stepPage?.runId === run.runId ? vm.stepPage : undefined}
      <Separator />
      <WorkflowRun run={stepPage ? { ...run, steps: stepPage.steps, stepsTruncated: Boolean(stepPage.cursor) } : run} title={run.workflow} oncancel={() => vm.cancel(run.runId)} cancelPending={vm.pendingAction?.action === 'cancel' && vm.pendingAction.runId === run.runId}>
        {#snippet input()}
          <p class="text-muted-foreground">Use the workbench's review controls when available. The values below must match this workflow's requested input.</p>
          {#each run.pendingInputs as requestId (requestId)}
            {@const inputId = 'workflow-input-' + encodeURIComponent(run.runId + ':' + requestId)}
            <form onsubmit={event => { event.preventDefault(); void vm.respond(run.runId, requestId, String(new FormData(event.currentTarget).get('value') ?? '')); }}>
              <Field.Field>
                <Field.Label for={inputId}>{requestId}</Field.Label>
                <Textarea id={inputId} name="value" placeholder="JSON response" required disabled={Boolean(vm.pendingAction)} />
                <StatefulButton type="submit" class="w-fit" variant="outline" pending={vm.pendingAction?.action === 'respond' && vm.pendingAction.runId === run.runId && vm.pendingAction.requestId === requestId} pendingLabel="Submitting" disabled={Boolean(vm.pendingAction)}>Submit input</StatefulButton>
              </Field.Field>
            </form>
          {/each}
        {/snippet}
      </WorkflowRun>
      {#if run.stepsTruncated || stepPage}
        <div class="flex flex-wrap gap-2" aria-label={'Step pages for ' + run.workflow}>
          <StatefulButton variant="ghost" pending={vm.stepAction?.runId === run.runId && vm.stepAction.kind === 'first'} pendingLabel="Loading steps" disabled={vm.loading || Boolean(vm.pendingAction) || vm.stepLoading} onclick={() => vm.browseSteps(run.runId)}>{stepPage ? 'First steps' : 'Browse all steps'}</StatefulButton>
          {#if stepPage?.cursor}<StatefulButton variant="ghost" pending={vm.stepAction?.runId === run.runId && vm.stepAction.kind === 'more'} pendingLabel="Loading steps" disabled={vm.loading || vm.stepLoading || Boolean(vm.pendingAction)} onclick={() => vm.browseSteps(run.runId, true)}>More steps</StatefulButton>{/if}
        </div>
      {/if}
    {/each}
    {#if vm.installationId && !vm.loading && !vm.error && !vm.runs.length}<p class="text-muted-foreground">No runs on this page.</p>{/if}
    <div class="flex gap-2">
      {#if !vm.isFirstPage}<StatefulButton variant="ghost" pending={vm.loadingAction === 'latest'} pendingLabel="Loading latest runs" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.latest()}>Latest runs</StatefulButton>{/if}
      {#if vm.cursor}<StatefulButton variant="ghost" pending={vm.loadingAction === 'more'} pendingLabel="Loading more runs" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.more()}>More runs</StatefulButton>{/if}
    </div>
  {/if}
</section>

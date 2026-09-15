<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Badge, Empty, ActivityIcon, ChevronRightIcon, StatefulButton, WorkflowRun, Textarea, Field, Separator, Collapsible } from '@drawloom/ui';
  import { createOrchestrationViewModel } from './orchestration-view-model.svelte.js';

  let { projectId }: { projectId?: string } = $props();
  const vm = createOrchestrationViewModel();
  let selectedRunId=$state('');
  $effect(() => { void vm.openActivity(projectId ?? ''); return () => vm.close(); });
  $effect(() => { vm.installationId; vm.knowledgeSelected; selectedRunId = ''; });
  const knowledgeStepLabel = (id: string) => {
    const step = id.split('/').at(-1) ?? '';
    return step.startsWith('pending-') ? 'Find pending knowledge' : step.startsWith('assess-') ? 'Assess evidence'
      : step.startsWith('release-') ? 'Release reserved work' : step === 'publish' ? 'Update knowledge' : 'Maintenance step';
  };
  onMount(() => {
    const timer = setInterval(() => { if (!vm.error) void vm.refresh(); }, 2000);
    return () => clearInterval(timer);
  });
</script>

<section class="flex flex-col gap-3" aria-label="Local workflows">
    <div class="flex flex-wrap gap-2">
      {#if vm.knowledgeOwner}<StatefulButton variant={vm.knowledgeSelected ? 'secondary' : 'ghost'} pending={vm.loadingAction === 'owner' && vm.knowledgeSelected} pendingLabel="Opening maintenance" onclick={() => vm.selectKnowledge()}>{vm.knowledgeOwner.title}</StatefulButton>{/if}
      {#each vm.owners as owner (owner.installationId)}
        <StatefulButton variant={vm.installationId === owner.installationId ? 'secondary' : 'ghost'} pending={vm.loadingAction === 'owner' && vm.installationId === owner.installationId} pendingLabel="Opening workflows" onclick={() => vm.selectOwner(owner.installationId)}>{owner.title}</StatefulButton>
      {/each}
      <StatefulButton variant="ghost" pending={vm.knowledgeOwnerLoading || vm.loadingAction === 'refresh' || vm.loadingAction === 'owners'} pendingLabel="Refreshing" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.installationId || vm.knowledgeSelected ? vm.refresh() : vm.openActivity(projectId ?? '')}>Refresh workflows</StatefulButton>
    </div>
    {#if vm.knowledgeSelected}<p class="text-muted-foreground">{vm.knowledgeOwner?.context}</p>{/if}
    {#if !projectId && !vm.knowledgeSelected}<p class="text-muted-foreground">Select Knowledge maintenance to inspect work across all projects.</p>{/if}
    {#each vm.owners.filter(owner => !vm.knowledgeSelected && (!vm.installationId || owner.installationId === vm.installationId) && owner.readiness.status !== 'ready') as owner}
      <p class="text-muted-foreground">{owner.title}: {owner.readiness.message ?? (owner.readiness.status === 'ready' ? 'Ready' : 'Orchestration unavailable; other work remains available.')}</p>
    {/each}
    {#if !vm.loading && !vm.knowledgeOwnerLoading && !vm.error && !vm.owners.length && !vm.knowledgeOwner}<Empty.Root class="py-12"><Empty.Header><Empty.Media variant="icon"><ActivityIcon /></Empty.Media><Empty.Title>No activity yet</Empty.Title><Empty.Description>Runs from your workbenches will appear here.</Empty.Description></Empty.Header></Empty.Root>{/if}
    {#if vm.error}<p role="alert" class="text-destructive">{vm.error}</p>{/if}
    {#each vm.runs as run (run.runId)}
      {@const stepPage = vm.stepPage?.runId === run.runId ? vm.stepPage : undefined}
      <Button class="collection-row" variant="ghost" aria-expanded={selectedRunId===run.runId} onclick={()=>selectedRunId=selectedRunId===run.runId?'':run.runId}><ActivityIcon class="size-4 shrink-0" /><span class="min-w-0 flex-1 truncate text-left">{run.workflow}</span><Badge variant="outline">{'displayStatus' in run ? run.displayStatus : run.unresolvedEffects.length?'Needs checking':run.cancellationRequested?'Cancelling':run.pendingInputs.length?'Waiting for input':run.status}</Badge><ChevronRightIcon class="size-4 shrink-0" /></Button>
      {#if selectedRunId===run.runId}
      <div class="selected-detail">
      <WorkflowRun run={stepPage ? { ...run, steps: stepPage.steps, stepsTruncated: Boolean(stepPage.cursor) } : run} title={run.workflow} statusLabel={'displayStatus' in run ? run.displayStatus : undefined} stepLabel={vm.knowledgeSelected ? knowledgeStepLabel : undefined} oncancel={vm.knowledgeSelected ? undefined : () => vm.cancel(run.runId)} cancelPending={vm.pendingAction?.action === 'cancel' && vm.pendingAction.runId === run.runId}>
        {#snippet input()}
          {#if !vm.knowledgeSelected}
          <Collapsible.Root><Collapsible.Trigger>Advanced input</Collapsible.Trigger><Collapsible.Content><p class="text-muted-foreground">Use the workbench's review controls when available. The JSON below is the advanced fallback and must match this workflow's requested input.</p>
          {#each run.pendingInputs as requestId (requestId)}
            {@const inputId = 'workflow-input-' + encodeURIComponent(run.runId + ':' + requestId)}
            <form onsubmit={event => { event.preventDefault(); void vm.respond(run.runId, requestId, String(new FormData(event.currentTarget).get('value') ?? '')); }}>
              <Field.Field>
                <Field.Label for={inputId}>{requestId}</Field.Label>
                <Textarea id={inputId} name="value" placeholder="JSON response" required disabled={Boolean(vm.pendingAction)} />
                <StatefulButton type="submit" class="w-fit" variant="outline" pending={vm.pendingAction?.action === 'respond' && vm.pendingAction.runId === run.runId && vm.pendingAction.requestId === requestId} pendingLabel="Submitting" disabled={Boolean(vm.pendingAction)}>Submit input</StatefulButton>
              </Field.Field>
            </form>
          {/each}</Collapsible.Content></Collapsible.Root>
          {/if}
        {/snippet}
      </WorkflowRun>
      {#if 'message' in run && run.message}<p role="status" class="text-muted-foreground">{run.message}</p>{/if}
      {#if run.stepsTruncated || stepPage}
        <div class="flex flex-wrap gap-2" aria-label={'Step pages for ' + run.workflow}>
          <StatefulButton variant="ghost" pending={vm.stepAction?.runId === run.runId && vm.stepAction.kind === 'first'} pendingLabel="Loading steps" disabled={vm.loading || Boolean(vm.pendingAction) || vm.stepLoading} onclick={() => vm.browseSteps(run.runId)}>{stepPage ? 'First steps' : 'Browse all steps'}</StatefulButton>
          {#if stepPage?.cursor}<StatefulButton variant="ghost" pending={vm.stepAction?.runId === run.runId && vm.stepAction.kind === 'more'} pendingLabel="Loading steps" disabled={vm.loading || vm.stepLoading || Boolean(vm.pendingAction)} onclick={() => vm.browseSteps(run.runId, true)}>More steps</StatefulButton>{/if}
        </div>
      {/if}
      </div>
      {/if}
    {/each}
    {#if (vm.installationId || vm.knowledgeSelected) && !vm.loading && !vm.error && !vm.runs.length}<p class="text-muted-foreground">{vm.knowledgeSelected && vm.isFirstPage ? 'No knowledge maintenance runs yet.' : 'No runs on this page.'}</p>{/if}
    <div class="flex gap-2">
      {#if !vm.isFirstPage}<StatefulButton variant="ghost" pending={vm.loadingAction === 'latest'} pendingLabel="Loading latest runs" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.latest()}>Latest runs</StatefulButton>{/if}
      {#if vm.cursor}<StatefulButton variant="ghost" pending={vm.loadingAction === 'more'} pendingLabel="Loading more runs" disabled={vm.loading || Boolean(vm.pendingAction)} onclick={() => vm.more()}>More runs</StatefulButton>{/if}
    </div>
</section>

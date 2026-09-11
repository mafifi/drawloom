<script lang="ts" module>
  import type { Snippet } from 'svelte';
  import type { RunSnapshot } from '@drawloom/orchestration';

  export interface WorkflowRunProps {
    run: RunSnapshot;
    title: string;
    oncancel?: () => void;
    cancelPending?: boolean;
    error?: string;
    input?: Snippet;
  }
</script>

<script lang="ts">
  import { Badge } from '../badge/index.js';
  import { StatefulButton } from '../stateful-button/index.js';
  import * as Marker from '../marker/index.js';
  import * as Collapsible from '../collapsible/index.js';
  import { Button } from '../button/index.js';

  let { run, title, oncancel, cancelPending = false, error = '', input }: WorkflowRunProps = $props();
  const stepLabel = (id: string) => id.startsWith(run.runId + '/') ? id.slice(run.runId.length + 1) : id;
  const label = $derived(run.status === 'running'
    ? run.cancellationRequested ? 'Cancellation requested' : run.pendingInputs.length ? 'Waiting for input' : 'Running'
    : run.status === 'completed' ? 'Completed' : run.status === 'cancelled' ? 'Cancelled' : 'Failed');
</script>

<section class="flex flex-col gap-3 py-3 text-chrome" aria-label={title}>
  <header class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="font-normal">{title}</h3>
    <Badge variant="secondary">{label}</Badge>
  </header>
  {#if run.unresolvedEffects.length}
    <Marker.Root role="status" variant="border">
      <Marker.Content>
        <p>Outcome needs checking</p>
        <p class="text-muted-foreground">These actions may have taken effect. They will not be repeated automatically.</p>
        <ul>{#each run.unresolvedEffects as step}<li class="break-all" title={step}>{stepLabel(step)}</li>{/each}</ul>
      </Marker.Content>
    </Marker.Root>
  {/if}
  {#if run.steps.length || run.stepsTruncated}
    <Collapsible.Root open>
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Steps and attempts</Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content>
        <ol class="flex flex-col gap-2 py-2">
          {#each run.steps as step (step.stepId)}
            <li class="flex flex-wrap justify-between gap-2">
              <span class="break-all" title={step.stepId}>{stepLabel(step.stepId)}</span>
              <span class="text-muted-foreground">{step.status} · {step.attempts} {step.attempts === 1 ? 'attempt' : 'attempts'}</span>
            </li>
          {/each}
        </ol>
        {#if run.stepsTruncated}<p class="text-muted-foreground">More steps are available.</p>{/if}
      </Collapsible.Content>
    </Collapsible.Root>
  {/if}
  {#if run.status === 'running' && !run.cancellationRequested && run.pendingInputs.length}
    {@render input?.()}
  {/if}
  {#if error}<p role="alert" class="text-destructive">{error}</p>{/if}
  {#if run.status === 'running' && !run.cancellationRequested && oncancel}
    <StatefulButton class="w-fit" variant="outline" size="sm" pending={cancelPending} pendingLabel="Cancelling" onclick={oncancel}>Cancel run</StatefulButton>
  {/if}
</section>

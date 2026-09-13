<script lang="ts" module>
  import type { EvaluationActions, EvaluationPresentation } from '@drawloom/evaluation-presentation';

  export interface EvaluationWorkbenchProps {
    presentation: EvaluationPresentation;
    actions: EvaluationActions;
  }
  type Detail = NonNullable<EvaluationPresentation['detail']>;
  type TargetCheckpoint = NonNullable<Detail['target']>;
  type ScorerCheckpoint = Detail['scorers'][number];
  type EvidenceReference = ScorerCheckpoint['findings'][number]['references'][number];
</script>

<script lang="ts">
  import { Badge } from '../badge/index.js';
  import { Button } from '../button/index.js';
  import { StatefulButton } from '../stateful-button/index.js';
  import { Input } from '../input/index.js';
  import { Textarea } from '../textarea/index.js';
  import * as Select from '../select/index.js';
  import * as Field from '../field/index.js';
  import * as Alert from '../alert/index.js';
  import * as Empty from '../empty/index.js';
  import * as Collapsible from '../collapsible/index.js';

  let { presentation, actions }: EvaluationWorkbenchProps = $props();
  const refLabel = (value: { id: string; revision: string }) => `${value.id}@${value.revision}`;
  const comparisonFindingKey = (value: { scorer: { id: string; revision: string }; findingId: string }) => JSON.stringify([value.scorer.id, value.scorer.revision, value.findingId]);
  const executionLabel = $derived(presentation.execution?.kind === 'running' && presentation.execution.cancellationRequested
    ? presentation.copy.executionLabels.cancellationRequested
    : presentation.execution ? presentation.copy.executionLabels[presentation.execution.kind] : 'Saved results');
  const usage = (value?: { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; totalTokens?: number; cost?: { amount: number; currency: string } }) => {
    if (!value) return presentation.copy.usageUnknown;
    const parts = [];
    if (value.inputTokens !== undefined) parts.push(`${value.inputTokens} input tokens`);
    if (value.cachedInputTokens !== undefined) parts.push(`${value.cachedInputTokens} cached input`);
    if (value.outputTokens !== undefined) parts.push(`${value.outputTokens} output tokens`);
    if (value.reasoningTokens !== undefined) parts.push(`${value.reasoningTokens} reasoning tokens`);
    if (value.totalTokens !== undefined) parts.push(`${value.totalTokens} total tokens`);
    if (value.cost) parts.push(`${value.cost.amount} ${value.cost.currency}`);
    return parts.join(' · ') || presentation.copy.usageUnknown;
  };
</script>

{#snippet evidenceReferences(references: readonly EvidenceReference[], label: string)}
  {#if references.length}
    <details class="mt-2 text-chrome">
      <summary class="cursor-pointer text-muted-foreground">{label}</summary>
      <ul class="mt-1 flex flex-col gap-1">
        {#each references as reference}
          <li class="break-all">{reference.source}: {reference.uri}{reference.revision ? ` @ ${reference.revision}` : ''}</li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}

{#snippet targetCheckpoint(checkpoint: TargetCheckpoint)}
  <article class="min-w-0 rounded-lg border p-3">
    <header class="flex min-w-0 flex-wrap items-center justify-between gap-2"><h4 class="min-w-0 break-all font-normal">Target · {refLabel(checkpoint.target)}</h4><Badge variant="secondary">{checkpoint.outcome}</Badge></header>
    <p class="text-chrome text-muted-foreground">{usage(checkpoint.usage)}</p>
    {#if checkpoint.model}<p class="text-chrome text-muted-foreground">Model requested {checkpoint.model.requested ?? 'not reported'} · actual {checkpoint.model.actual ?? 'not reported'}</p>{/if}
    {#if checkpoint.error}<p class="mt-2 text-chrome text-destructive">{checkpoint.error.message}</p>{/if}
    {@render evidenceReferences(checkpoint.references, 'Target evidence references')}
  </article>
{/snippet}

{#snippet scorerCheckpoint(checkpoint: ScorerCheckpoint)}
  <article class="min-w-0 rounded-lg border p-3">
    <header class="flex min-w-0 flex-wrap items-center justify-between gap-2"><h4 class="min-w-0 break-all font-normal">{refLabel(checkpoint.scorer)}</h4><Badge variant="secondary">{checkpoint.outcome}</Badge></header>
    <p class="text-chrome text-muted-foreground">{usage(checkpoint.usage)}</p>
    {#if checkpoint.model}<p class="text-chrome text-muted-foreground">Model requested {checkpoint.model.requested ?? 'not reported'} · actual {checkpoint.model.actual ?? 'not reported'}</p>{/if}
    {#if checkpoint.findings.length}
      <ul class="mt-2 flex flex-col gap-2">
        {#each checkpoint.findings as finding (finding.id)}
          <li>
            <p>{finding.name}: {finding.outcome}{finding.score === undefined ? '' : ` · ${finding.score}`}</p>
            {#if finding.explanation}<p class="text-chrome text-muted-foreground">{finding.explanation}</p>{/if}
            {#if finding.error}<p class="text-chrome text-destructive">{finding.error.message}</p>{/if}
            {@render evidenceReferences(finding.references, `${finding.name} evidence references`)}
          </li>
        {/each}
      </ul>
    {:else}<p class="mt-2 text-chrome text-muted-foreground">No findings were reported.</p>{/if}
  </article>
{/snippet}

<section class="flex min-w-0 flex-col gap-6 text-body" aria-labelledby="evaluation-title">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div class="min-w-0"><h2 id="evaluation-title" class="text-heading">{presentation.copy.title}</h2><p class="text-chrome text-muted-foreground">Checks are advisory. Completion does not accept or publish work.</p></div>
    {#if presentation.execution}<Badge variant="secondary">{executionLabel}</Badge>{/if}
  </header>

  {#if presentation.error}<Alert.Root variant="destructive"><Alert.Title>Evaluation action needs attention</Alert.Title><Alert.Description>{presentation.error}</Alert.Description></Alert.Root>{/if}

  <div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)]">
    <div class="flex min-w-0 flex-col gap-6">
      <section class="flex flex-col gap-3" aria-labelledby="evaluation-definitions-heading">
        <header class="flex items-center justify-between gap-2"><h3 id="evaluation-definitions-heading" class="text-heading">{presentation.copy.definitionsHeading}</h3><Button variant="ghost" size="sm" disabled={presentation.definitionsLoading} onclick={() => actions.latestDefinitions()}>Refresh setup</Button></header>
        {#if presentation.definitionsLoading && !presentation.definitions.length}<p role="status" class="text-chrome text-muted-foreground">Loading saved checks</p>
        {:else if !presentation.definitions.length}<Empty.Root><Empty.Header><Empty.Title>{presentation.copy.emptyDefinitions}</Empty.Title></Empty.Header></Empty.Root>
        {:else}<nav aria-label="Saved checks"><ul class="flex flex-col gap-1">{#each presentation.definitions as item (refLabel(item.ref))}<li><Button class="h-auto w-full justify-start whitespace-normal text-left" variant={presentation.selectedDefinition && refLabel(presentation.selectedDefinition.ref) === refLabel(item.ref) ? 'secondary' : 'ghost'} onclick={() => actions.selectDefinition(item.ref)}><span class="flex min-w-0 flex-col"><span>{item.name}</span><span class="text-muted-foreground">{item.mode === 'assess_existing' ? 'Check saved work' : 'Run experiment'} · {item.caseCount} cases · {item.scorerCount} criteria</span></span></Button></li>{/each}</ul></nav>{/if}
        <div class="flex flex-wrap gap-2">
          <StatefulButton pending={presentation.startPending} pendingLabel={presentation.copy.starting} disabled={!presentation.selectedDefinition || presentation.startReadiness.status !== 'ready'} onclick={() => actions.start()}>{presentation.copy.start}</StatefulButton>
          {#if presentation.hasMoreDefinitions}<Button variant="outline" onclick={() => actions.moreDefinitions()}>More checks</Button>{/if}
        </div>
        {#if presentation.startReadiness.status === 'unavailable'}<p class="text-chrome text-muted-foreground">{presentation.startReadiness.reason ?? 'Evaluation starts are not configured.'}</p>{/if}
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="evaluation-runs-heading">
        <header class="flex items-center justify-between gap-2"><h3 id="evaluation-runs-heading" class="text-heading">{presentation.copy.runsHeading}</h3><Button variant="ghost" size="sm" disabled={presentation.runsLoading} onclick={() => actions.latestRuns()}>Latest</Button></header>
        {#if presentation.runsLoading && !presentation.runs.length}<p role="status" class="text-chrome text-muted-foreground">Loading saved runs</p>
        {:else if !presentation.runs.length}<p class="text-chrome text-muted-foreground">{presentation.copy.emptyRuns}</p>
        {:else}<nav aria-label="Saved evaluation runs"><ul class="flex flex-col gap-1">{#each presentation.runs as item (item.id)}<li><Button class="h-auto w-full justify-start whitespace-normal text-left" variant={presentation.selectedRun?.id === item.id ? 'secondary' : 'ghost'} onclick={() => actions.selectRun(item.id)}><span class="min-w-0 break-all">{refLabel(item.definition)} · {item.id}</span></Button></li>{/each}</ul></nav>{/if}
        {#if presentation.hasMoreRuns}<Button class="w-fit" variant="outline" onclick={() => actions.moreRuns()}>More runs</Button>{/if}
      </section>
    </div>

    <div class="flex min-w-0 flex-col gap-6">
      {#if presentation.selectedRun}
        <section class="flex flex-col gap-3" aria-labelledby="evaluation-results-heading">
          <header class="flex flex-wrap items-center justify-between gap-2"><h3 id="evaluation-results-heading" class="text-heading">{presentation.copy.resultsHeading}</h3><div class="flex gap-2"><Button variant="ghost" size="sm" disabled={presentation.resultLoading} onclick={() => actions.refreshRun()}>Refresh status</Button><Button variant="ghost" size="sm" disabled={presentation.resultLoading} onclick={() => actions.latestResults()}>Latest cases</Button></div></header>
          {#if presentation.execution?.kind === 'unavailable'}<Alert.Root><Alert.Title>Saved results are available</Alert.Title><Alert.Description>{presentation.execution.reason}</Alert.Description></Alert.Root>{/if}
          {#if presentation.execution?.kind === 'start_uncertain' || presentation.execution?.kind === 'uncertain'}<Alert.Root variant="destructive"><Alert.Title>Outcome needs checking</Alert.Title><Alert.Description>The run outcome is uncertain. Drawloom will not submit it again automatically.</Alert.Description></Alert.Root>{/if}
          {#if presentation.execution?.kind === 'running' && !presentation.execution.cancellationRequested}<StatefulButton class="w-fit" variant="outline" pending={presentation.cancelPending} pendingLabel={presentation.copy.cancelling} onclick={() => actions.cancel()}>{presentation.copy.cancel}</StatefulButton>{/if}
          {#if presentation.resultLoading && !presentation.results.length}<p role="status" class="text-chrome text-muted-foreground">Loading case summaries</p>
          {:else if !presentation.results.length}<p class="text-chrome text-muted-foreground">{presentation.copy.emptyResults}</p>
          {:else}<nav class="min-w-0" aria-label="Case results"><ul class="grid min-w-0 gap-2 sm:grid-cols-2">{#each presentation.results as item (item.id)}<li class="min-w-0"><Button class="h-auto min-w-0 w-full justify-start whitespace-normal text-left" variant={presentation.selectedResult?.id === item.id ? 'secondary' : 'outline'} onclick={() => actions.selectResult(item.id)}><span class="flex min-w-0 flex-col"><span class="min-w-0 break-all">{item.caseId}@{item.caseRevision} · trial {item.trial + 1}</span><span class="min-w-0 break-all text-muted-foreground">{item.status} · {item.findingCount} findings</span></span></Button></li>{/each}</ul></nav>{/if}
          {#if presentation.hasMoreResults}<Button class="w-fit" variant="outline" onclick={() => actions.moreResults()}>More cases</Button>{/if}
        </section>
      {/if}

      {#if presentation.selectedResult}
        <section class="flex min-w-0 flex-col gap-4" aria-labelledby="evaluation-selected-heading">
          <header class="min-w-0"><h3 id="evaluation-selected-heading" class="min-w-0 break-all text-heading">{presentation.selectedResult.caseId}@{presentation.selectedResult.caseRevision}</h3><p class="break-all text-chrome text-muted-foreground">Result {presentation.selectedResult.id} · {presentation.selectedResult.status}</p></header>
          {#if presentation.selectedCase?.references.length}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Evidence references</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><ul class="flex flex-col gap-1 text-chrome">{#each presentation.selectedCase.references as reference}<li class="break-all">{reference.source}: {reference.uri}{reference.revision ? ` @ ${reference.revision}` : ''}</li>{/each}</ul></Collapsible.Content></Collapsible.Root>{/if}
          {#if presentation.detailError}<Alert.Root><Alert.Title>Combined detail is unavailable</Alert.Title><Alert.Description>{presentation.detailError}</Alert.Description></Alert.Root>{/if}
          {#if presentation.detail}
            <div class="flex flex-col gap-3">
              {#if presentation.detail.target}{@render targetCheckpoint(presentation.detail.target)}{/if}
              {#each presentation.detail.scorers as checkpoint (checkpoint.invocationId)}{@render scorerCheckpoint(checkpoint)}{/each}
            </div>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#if presentation.selectedResult.targetInvocationId}<Button variant="outline" disabled={presentation.targetLoading} onclick={() => actions.selectTarget()}>Inspect target {presentation.selectedResult.targetInvocationId}</Button>{/if}
              {#each presentation.selectedResult.scorerInvocationIds as invocationId}<Button variant="outline" disabled={presentation.scorerLoading} onclick={() => actions.selectScorer(invocationId)}>Inspect scorer {invocationId}</Button>{/each}
            </div>
          {/if}
          {#if presentation.selectedTarget}{@render targetCheckpoint(presentation.selectedTarget)}{/if}
          {#if presentation.selectedScorer}{@render scorerCheckpoint(presentation.selectedScorer)}{/if}

          <Field.Field><Field.Label for="evaluation-baseline-result">Baseline result ID</Field.Label><div class="flex flex-wrap gap-2"><Input id="evaluation-baseline-result" value={presentation.baselineResultId} oninput={(event) => actions.setBaselineResultId(event.currentTarget.value)} /><Button variant="outline" disabled={!presentation.baselineResultId || presentation.resultLoading} onclick={() => actions.selectBaseline(presentation.baselineResultId)}>Compare baseline</Button></div><Field.Description>Comparison requires matching case input, expected material, and criterion revisions and configuration. Different saved outputs and targets may be compared.</Field.Description></Field.Field>
          {#if presentation.comparison?.kind === 'incomparable'}<Alert.Root><Alert.Title>Results are not comparable</Alert.Title><Alert.Description>{presentation.comparison.reason}</Alert.Description></Alert.Root>
          {:else if presentation.comparison?.kind === 'comparable'}<section aria-labelledby="evaluation-comparison-heading"><h4 id="evaluation-comparison-heading" class="font-normal">Exact baseline comparison</h4><ul class="mt-2 flex flex-col gap-2">{#each presentation.comparison.findings as finding (comparisonFindingKey(finding))}<li><span>{finding.name}</span><span class="text-chrome text-muted-foreground"> · current {finding.current?.score ?? finding.current?.outcome ?? 'missing'} · baseline {finding.baseline?.score ?? finding.baseline?.outcome ?? 'missing'}</span></li>{/each}</ul></section>{/if}

          <section class="flex flex-col gap-3" aria-labelledby="evaluation-feedback-heading"><h4 id="evaluation-feedback-heading" class="font-normal">{presentation.copy.feedbackHeading}</h4>
            <Field.Field><Field.Label for="evaluation-feedback-attribution">Attribution</Field.Label><Input id="evaluation-feedback-attribution" maxlength={256} value={presentation.feedbackDraft.attribution} oninput={(event) => actions.setFeedback({ attribution: event.currentTarget.value })} /></Field.Field>
            <Field.Field><Field.Label for="evaluation-feedback-rating">Rating</Field.Label><Select.Root type="single" value={presentation.feedbackDraft.rating} onValueChange={(value) => actions.setFeedback({ rating: value as 'correct' | 'incorrect' | 'uncertain' })}><Select.Trigger id="evaluation-feedback-rating" class="w-full">{presentation.feedbackDraft.rating ?? 'Choose a rating'}</Select.Trigger><Select.Content><Select.Item value="correct" label="Correct" /><Select.Item value="incorrect" label="Incorrect" /><Select.Item value="uncertain" label="Uncertain" /></Select.Content></Select.Root></Field.Field>
            <Field.Field><Field.Label for="evaluation-feedback-correction">Correction (optional)</Field.Label><Textarea id="evaluation-feedback-correction" maxlength={8192} value={presentation.feedbackDraft.correction} oninput={(event) => actions.setFeedback({ correction: event.currentTarget.value })} /><Field.Description>Feedback is attached to this exact result. It does not change scores or accept work.</Field.Description></Field.Field>
            {#if presentation.feedbackError}<p role="alert" class="text-chrome text-destructive">{presentation.feedbackError}</p>{/if}
            <div class="flex flex-wrap gap-2"><StatefulButton pending={presentation.feedbackPending} pendingLabel={presentation.copy.savingFeedback} onclick={() => actions.saveFeedback()}>{presentation.copy.saveFeedback}</StatefulButton><Button variant="outline" disabled={presentation.feedbackLoading || presentation.feedbackPending} onclick={() => actions.reloadFeedback()}>Reload feedback</Button></div>
            {#if presentation.feedback.length}<ul class="flex flex-col gap-2">{#each presentation.feedback as item (item.id)}<li class="rounded-lg border p-3"><p>{item.attribution} · {item.rating}</p>{#if item.correction}<p class="text-chrome text-muted-foreground">{item.correction}</p>{/if}</li>{/each}</ul>{/if}
          </section>
        </section>
      {/if}
    </div>
  </div>
</section>

<script lang="ts">
  import { Alert, Badge, Button, Input, Label, Separator, StatefulButton, Textarea } from "@drawloom/ui";
  import type { InspectionActions, InspectionPresentation } from "./inspection-view-model.ts";

  let { presentation: p, actions: a }: { presentation: InspectionPresentation; actions: InspectionActions } = $props();
  const percentage = (value: number | undefined) => value === undefined ? p.copy.notScored : `${Math.round(value * 100)}%`;
</script>

<main class="mx-auto flex min-h-full max-w-6xl flex-col gap-4 p-4 text-foreground sm:p-6">
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <h1 class="text-body font-medium tracking-tight">{p.document?.title ?? p.copy.defaultTitle}</h1>
      <p class="max-w-3xl text-sm text-muted-foreground">{p.document?.description ?? p.copy.defaultDescription}</p>
    </div>
    <Button variant="outline" onclick={() => a.retry()} disabled={p.phase === "loading" || p.pending}>{p.copy.reload}</Button>
  </header>

  {#if p.phase === "loading"}<p role="status" class="text-sm text-muted-foreground">{p.copy.loading}</p>{/if}
  {#if p.phase === "error"}
    <Alert.Root variant="destructive"><Alert.Title>{p.copy.findingsUnavailable}</Alert.Title><Alert.Description>{p.loadError}</Alert.Description></Alert.Root>
  {/if}

  {#if p.document}
    <section aria-label={p.copy.inspectionProvenance} class="grid gap-2 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3">
      <div><span class="block text-xs text-muted-foreground">{p.copy.corpus}</span>{p.document.corpus.version}</div>
      <div><span class="block text-xs text-muted-foreground">{p.copy.records}</span>{p.document.corpus.records.toLocaleString()}</div>
      <div><span class="block text-xs text-muted-foreground">{p.copy.execution}</span>{p.document.execution.adapter} · {p.document.execution.mode} · {p.document.execution.targetCalls} target calls · {p.document.execution.modelCalls} model calls</div>
    </section>

    <div class="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={p.copy.comparisonModes}>
      <Button size="sm" variant={p.mode === "all" ? "secondary" : "ghost"} aria-pressed={p.mode === "all"} disabled={p.pending} onclick={() => a.selectMode("all")}>{p.copy.allModes}</Button>
      {#each p.modes as mode}
        <Button size="sm" variant={p.mode === mode ? "secondary" : "ghost"} aria-pressed={p.mode === mode} disabled={p.pending} onclick={() => a.selectMode(mode)}>{mode}</Button>
      {/each}
    </div>

    {#if p.visibleResults.length === 0}
      <p class="rounded-lg border p-6 text-sm text-muted-foreground">{p.copy.empty}</p>
    {:else}
      <div class="grid min-w-0 gap-4 md:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
        <nav aria-label={p.copy.cases} class="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 md:max-h-[38rem]">
          {#each p.visibleResults as result}
            <Button
              variant={p.selected?.evaluation.id === result.evaluation.id ? "secondary" : "ghost"}
              class="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
              aria-current={p.selected?.evaluation.id === result.evaluation.id ? "true" : undefined}
              disabled={p.pending}
              onclick={() => a.selectResult(result.evaluation.id)}
            >
              <span class="min-w-0"><span class="block">{result.question.id} · {result.question.category}</span><span class="block text-xs text-muted-foreground">{result.provenance.mode} · {result.provenance.classification}</span></span>
            </Button>
          {/each}
        </nav>

        {#if p.selected}
          {@const selected = p.selected}
          <article class="min-w-0 space-y-5 rounded-lg border bg-card p-4 sm:p-5">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2"><Badge variant="outline">{selected.question.category}</Badge><Badge variant={selected.provenance.classification === "synthetic-regression" ? "destructive" : "secondary"}>{selected.provenance.classification}</Badge></div>
              <h2 class="text-body font-medium">{selected.question.id}</h2>
              <p>{selected.question.text}</p>
            </div>

            <section aria-labelledby="provenance-heading" class="space-y-2">
              <h3 id="provenance-heading" class="text-sm font-medium">{p.copy.provenance}</h3>
              <dl class="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt class="text-xs text-muted-foreground">{p.copy.mode}</dt><dd class="break-words">{selected.provenance.mode}</dd></div>
                <div><dt class="text-xs text-muted-foreground">{p.copy.source}</dt><dd>{selected.provenance.sourceId}</dd></div>
                <div class="sm:col-span-2"><dt class="text-xs text-muted-foreground">{p.copy.method}</dt><dd>{selected.provenance.method}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="output-heading" class="space-y-2">
              <h3 id="output-heading" class="text-sm font-medium">{p.copy.savedOutput}</h3>
              {#if selected.details.kind === "retrieval"}
                <ol class="space-y-1 text-sm">{#each selected.details.retrieved as reference}<li class="break-all rounded bg-muted px-2 py-1">{reference}</li>{/each}</ol>
              {:else}
                <p class="rounded bg-muted p-3 text-sm">{selected.details.answer}</p>
                <p class="text-xs text-muted-foreground">{selected.details.abstained ? p.copy.abstained : p.copy.answered} · {p.copy.citations}: {selected.details.citations.join(", ") || p.copy.none}</p>
              {/if}
            </section>

            <section aria-labelledby="findings-heading" class="space-y-2">
              <h3 id="findings-heading" class="text-sm font-medium">{p.copy.findings}</h3>
              <ul class="space-y-2">
                {#each selected.evaluation.findings as finding}
                  <li class="rounded-lg border p-3 text-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2"><span class="font-medium">{finding.scorerId}</span>{#if finding.error}<Badge variant="destructive">{p.copy.findingError}</Badge>{:else}<Badge variant="outline">{percentage(finding.score)}</Badge>{/if}</div>
                    {#if finding.error}<p role="status" class="mt-1 text-destructive">{finding.error}</p>{:else if finding.explanation}<p class="mt-1 text-muted-foreground">{finding.explanation}</p>{/if}
                  </li>
                {/each}
              </ul>
            </section>

            {#if p.baseline}
              <section aria-labelledby="comparison-heading" class="space-y-2">
                <h3 id="comparison-heading" class="text-sm font-medium">{p.copy.comparisons}</h3>
                <p class="text-sm text-muted-foreground">{p.copy.controlledComparison} {p.baseline.question.id} · {p.baseline.provenance.mode}.</p>
                <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b"><th class="py-2 pr-3">{p.copy.findingColumn}</th><th class="py-2 pr-3">{p.copy.baselineColumn}</th><th class="py-2">{p.copy.selectedColumn}</th></tr></thead><tbody>
                  {#each selected.evaluation.findings as finding}
                    {@const prior = p.baseline.evaluation.findings.find(candidate => candidate.scorerId === finding.scorerId)}
                    <tr class="border-b"><th class="py-2 pr-3 font-normal">{finding.scorerId}</th><td class="py-2 pr-3">{percentage(prior?.score)}</td><td class="py-2">{percentage(finding.score)}</td></tr>
                  {/each}
                </tbody></table></div>
              </section>
            {/if}

            {#if p.comparisonResults.length}
              <section aria-labelledby="related-comparison-heading" class="space-y-2">
                <h3 id="related-comparison-heading" class="text-sm font-medium">{p.copy.otherModes} {selected.question.id}</h3>
                <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b"><th class="py-2 pr-3">{p.copy.mode}</th><th class="py-2 pr-3">{p.copy.provenanceColumn}</th><th class="py-2">{p.copy.findingsColumn}</th></tr></thead><tbody>
                  {#each p.comparisonResults as related}
                    <tr class="border-b"><td class="py-2 pr-3">{related.provenance.mode}</td><td class="py-2 pr-3">{related.provenance.classification}</td><td class="py-2">{related.evaluation.findings.map(finding => `${finding.scorerId}: ${finding.error ? p.copy.findingError : percentage(finding.score)}`).join(" · ")}</td></tr>
                  {/each}
                </tbody></table></div>
              </section>
            {/if}

            <Separator />
            <section aria-labelledby="feedback-heading" class="space-y-3">
              <div><h3 id="feedback-heading" class="text-sm font-medium">{p.copy.feedback}</h3><p class="text-xs text-muted-foreground">{p.copy.feedbackTargetPrefix} <span class="break-all">{selected.evaluation.id}</span>. {p.copy.feedbackTargetSuffix}</p></div>
              {#if p.selectedFeedback.length}
                <ul aria-label={p.copy.savedFeedback} class="space-y-2 text-sm">{#each p.selectedFeedback as feedback}<li class="rounded border p-2"><span class="font-medium">{feedback.rating}</span> · {feedback.attribution} · {p.copy.savedSequence}{feedback.sequence}{#if feedback.correction}<span class="block text-muted-foreground">{feedback.correction}</span>{/if}</li>{/each}</ul>
              {/if}
              <div class="space-y-3">
                <div class="space-y-1"><Label for="feedback-attribution">{p.copy.attribution}</Label><Input id="feedback-attribution" value={p.draft.attribution} maxlength={120} disabled={p.pending || p.phase === "loading"} aria-describedby="attribution-help" oninput={(event) => a.editAttribution(event.currentTarget.value)} /><p id="attribution-help" class="text-xs text-muted-foreground">{p.copy.attributionHelp}</p></div>
                <fieldset class="space-y-1" disabled={p.pending || p.phase === "loading"}><legend class="text-sm">{p.copy.rating}</legend><div class="flex flex-wrap gap-2">
                  {#each p.ratingOptions as rating}
                    <Button type="button" size="sm" variant={p.draft.rating === rating.value ? "secondary" : "outline"} aria-pressed={p.draft.rating === rating.value} onclick={() => a.editRating(rating.value)}>{rating.label}</Button>
                  {/each}
                </div></fieldset>
                <div class="space-y-1"><Label for="feedback-correction">{p.copy.correction}</Label><Textarea id="feedback-correction" value={p.draft.correction} maxlength={2000} disabled={p.pending || p.phase === "loading"} oninput={(event) => a.editCorrection(event.currentTarget.value)} /></div>
                {#if p.error}<Alert.Root variant="destructive"><Alert.Description>{p.error}</Alert.Description></Alert.Root>{/if}
                {#if p.saveState === "saved"}<p role="status" class="text-sm text-muted-foreground">{p.copy.saved}</p>{/if}
                <StatefulButton type="button" pending={p.pending} pendingLabel={p.copy.saving} disabled={p.pending || p.phase !== "ready"} onclick={() => a.saveFeedback()}>{p.copy.save}</StatefulButton>
              </div>
            </section>
          </article>
        {/if}
      </div>
    {/if}

    <section aria-labelledby="limits-heading" class="space-y-3 rounded-lg border p-4">
      <h2 id="limits-heading" class="text-body font-medium">{p.copy.sourcesAndLimits}</h2>
      {#each p.document.sources as source}
        <div class="space-y-1"><p class="text-sm font-medium">{source.label}</p><p class="break-all text-xs text-muted-foreground">{source.path} · sha256 {source.sha256}</p><ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{#each source.limitations as limitation}<li>{limitation}</li>{/each}</ul></div>
      {/each}
      <ul class="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{#each p.document.limitations as limitation}<li>{limitation}</li>{/each}</ul>
    </section>
  {/if}
</main>

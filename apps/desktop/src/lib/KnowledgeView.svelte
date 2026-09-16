<script lang="ts">
  import { Button, Checkbox, Field, Input, Separator, StatefulButton, Tabs, Collapsible, Empty, SearchIcon, ChevronRightIcon } from '@drawloom/ui';
  import type { Snippet } from 'svelte';
  import type { KnowledgePresentation, KnowledgeActions } from './knowledge-presentation.js';
  let { presentation: p, actions: a, localSetup }: { presentation: KnowledgePresentation; actions: KnowledgeActions; localSetup?: Snippet | undefined } = $props();
  let selectedTab=$state('search');
</script>

<div class="primary-view-content knowledge-content">
  <Tabs.Root bind:value={selectedTab} class="space-y-8">
  <Tabs.List aria-label="Knowledge sections"><Tabs.Trigger value="search">Search</Tabs.Trigger><Tabs.Trigger value="sources">Sources</Tabs.Trigger><Tabs.Trigger value="settings">Settings</Tabs.Trigger></Tabs.List>
  {#if p.error}<p role="alert" class="text-destructive">{p.error}</p>{/if}
  {#if p.status?.capture.state === 'pending'}<p role="alert" class="text-sm text-destructive">{p.status.capture.message}</p>{/if}
  {#each p.recoveryNotices as message}<p role="alert" class="text-sm text-destructive">{message}</p>{/each}
  {#if p.notice}<p role="status" class="text-sm text-muted-foreground">{p.notice}</p>{/if}
  <Tabs.Content value="search" class="space-y-8">
  <form class="screen-toolbar" onsubmit={event => { event.preventDefault(); void a.search(); }}>
    <Field.Field><Field.Label class="sr-only" for="knowledge-query">{p.copy.searchLabel}</Field.Label>
      <Input id="knowledge-query" value={p.query} oninput={event => a.setQuery(event.currentTarget.value)} placeholder={p.copy.searchPlaceholder} />
    </Field.Field>
    <StatefulButton type="submit" class="w-fit" pending={p.searchPending} pendingLabel={p.copy.searching} disabled={!p.query.trim()}>{p.copy.search}</StatefulButton>
  </form>
  {#if p.searchStatus}<p role="status" class="text-muted-foreground">{p.searchStatus}</p>{/if}
  {#if !p.searched && !p.searchPending && !p.selected}<Empty.Root class="py-12"><Empty.Header><Empty.Media variant="icon"><SearchIcon /></Empty.Media><Empty.Title>What would you like to find?</Empty.Title><Empty.Description>{p.copy.introduction}</Empty.Description></Empty.Header></Empty.Root>{/if}
  {#if p.searched || p.searchPending || p.selected}
  <div class="knowledge-columns">
    <section class="flex flex-col gap-4" aria-label={p.copy.searchLabel}>
      {#if p.searched && !p.results.length && !p.searchPending}<Empty.Root class="py-8"><Empty.Header><Empty.Media variant="icon"><SearchIcon /></Empty.Media><Empty.Title>No matches yet</Empty.Title><Empty.Description>{p.copy.empty}</Empty.Description></Empty.Header></Empty.Root>{/if}
      {#each p.results as item (JSON.stringify(item.record.ref))}
        <article class="knowledge-record">
          <p class="whitespace-pre-wrap break-words line-clamp-4">{item.record.body}</p>
          <p class="text-sm text-muted-foreground">{item.record.status}{'freshness' in item.record ? ` · ${item.record.freshness}` : ''}</p>
          <StatefulButton variant="ghost" class="w-fit" pending={p.evidencePending && JSON.stringify(p.selected) === JSON.stringify(item.record.ref)} pendingLabel={p.copy.loading} onclick={() => a.inspect(item.record.ref)}>{p.copy.inspect}</StatefulButton>
        </article>
      {/each}
      {#if p.hasMoreResults}<StatefulButton variant="outline" class="w-fit" pending={p.searchPending} onclick={() => a.search(true)}>{p.copy.more}</StatefulButton>{/if}
    </section>
    {#if p.selected}
      <section class="flex flex-col gap-4 min-w-0" aria-label={p.copy.evidence}>
        <h2>{p.copy.evidence}</h2>
        {#each p.evidence?.records ?? [] as record (JSON.stringify(record.ref))}
          <article class="knowledge-record">
            <p class="text-sm text-muted-foreground">{record.ref.type} · {record.status}{'freshness' in record ? ` · ${record.freshness}` : ''}</p>
            <p class="whitespace-pre-wrap break-words">{record.body}</p>
            <Collapsible.Root><Collapsible.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="sm">Source & confidence <ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger><Collapsible.Content class="py-3 space-y-2"><p class="text-sm text-muted-foreground break-all">{record.ref.origin} · {record.ref.id} · {record.ref.revision}</p><p class="text-sm break-words">{p.copy.confidence}: {JSON.stringify(record.confidence)}</p></Collapsible.Content></Collapsible.Root>
            <Button variant="ghost" class="w-fit" onclick={() => a.inspect(record.ref)}>{p.copy.inspect}</Button>
          </article>
        {/each}
        {#if p.evidence?.links.length}
          <h3>{p.copy.relationships}</h3>
          {#each p.evidence.links as link}
            <div class="flex flex-col gap-1 break-all text-sm">
              <Button variant="ghost" class="h-auto whitespace-normal justify-start text-left" onclick={() => a.inspect(link.from)}>{link.from.type} · {link.from.origin} · {link.from.id} · {link.from.revision}</Button>
              <p class="text-muted-foreground">{link.relation} →</p>
              <Button variant="ghost" class="h-auto whitespace-normal justify-start text-left" onclick={() => a.inspect(link.to)}>{link.to.type} · {link.to.origin} · {link.to.id} · {link.to.revision}</Button>
            </div>
          {/each}
        {/if}
        {#if p.hasMoreEvidence}<p class="text-muted-foreground">{p.copy.partial}</p>{/if}
        <div class="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={p.evidencePending} onclick={() => p.selected && a.inspect(p.selected)}>{p.copy.firstEvidence}</Button>
          {#if p.hasMoreEvidence}<StatefulButton variant="outline" pending={p.evidencePending} onclick={() => p.selected && a.inspect(p.selected, true)}>{p.copy.moreEvidence}</StatefulButton>{/if}
          <StatefulButton variant="outline" pending={p.pendingAction === 'export'} disabled={!p.evidence?.records.length} onclick={() => a.export()}>{p.copy.export}</StatefulButton>
        </div>
      </section>
    {/if}
  </div>
  {/if}
  </Tabs.Content>
  <Tabs.Content value="sources" class="space-y-8">
  <section class="flex flex-col gap-3" aria-label={p.copy.source}>
    <h2>{p.copy.source}</h2><p class="text-muted-foreground">{p.copy.sourceHelp}</p>
    {#if p.status?.source}<p>{p.sourceName ?? p.copy.sourceProject} · {p.status.source.state === 'unavailable' ? 'Collection unavailable' : p.status.source.state === 'ready' ? 'Collecting updates' : 'Collection stopped'}</p>{/if}
    <div class="flex flex-wrap gap-2">
      <StatefulButton variant="outline" pending={p.pendingAction === 'source:start'} disabled={Boolean(p.pendingAction)} onclick={() => a.source(true)}>{p.copy.sourceStart}</StatefulButton>
      {#if p.status?.source?.enabled}<StatefulButton variant="ghost" pending={p.pendingAction === 'source:stop'} disabled={Boolean(p.pendingAction)} onclick={() => a.source(false)}>{p.copy.sourceStop}</StatefulButton>{/if}
    </div>
  </section>
  </Tabs.Content>
  <Tabs.Content value="settings" class="space-y-10">
  <div class="flex flex-wrap items-center justify-between gap-3"><p role="status">{p.status?.message ?? p.copy.loading}</p><StatefulButton variant="ghost" pending={p.statusPending} onclick={() => a.refresh()}>{p.copy.refresh}</StatefulButton></div>
  {#if p.status}
    <section class="space-y-6" aria-label={p.copy.learning}>
      <h2>{p.copy.learning}</h2>
      <div class="space-y-2">
        <Field.Field orientation="horizontal">
          <Checkbox id="knowledge-capture" checked={p.learning.captureOutcomes} onCheckedChange={value => a.setLearning('captureOutcomes', value)} disabled={Boolean(p.pendingAction)} aria-describedby="knowledge-capture-help" />
          <Field.Label for="knowledge-capture">{p.copy.capture}</Field.Label>
        </Field.Field>
        <p id="knowledge-capture-help" class="text-sm text-muted-foreground">{p.copy.captureHelp}</p>
      </div>
      <div class="space-y-2">
        <Field.Field orientation="horizontal">
          <Checkbox id="knowledge-automatic-context" checked={p.learning.automaticContext} onCheckedChange={value => a.setLearning('automaticContext', value)} disabled={Boolean(p.pendingAction)} aria-describedby="knowledge-context-help knowledge-context-disable" />
          <Field.Label for="knowledge-automatic-context">{p.copy.automaticContext}</Field.Label>
        </Field.Field>
        <p id="knowledge-context-help" class="text-sm text-muted-foreground">{p.copy.automaticContextHelp}</p>
        <p id="knowledge-context-disable" class="text-sm text-muted-foreground">{p.copy.disableHelp}</p>
      </div>
      <div class="space-y-2">
        <Field.Field orientation="horizontal">
          <Checkbox id="knowledge-automatic-curation" checked={p.learning.automaticCuration} onCheckedChange={value => a.setLearning('automaticCuration', value)} disabled={Boolean(p.pendingAction) || !p.status?.curation} aria-describedby="knowledge-curation-help knowledge-curation-disable" />
          <Field.Label for="knowledge-automatic-curation">{p.copy.automaticCuration}</Field.Label>
        </Field.Field>
        <p id="knowledge-curation-help" class="text-sm text-muted-foreground">{p.copy.automaticCurationHelp}</p>
        <p id="knowledge-curation-disable" class="text-sm text-muted-foreground">{p.copy.curationDisableHelp}</p>
      </div>
      <StatefulButton variant="outline" pending={p.pendingAction === 'preferences'} disabled={Boolean(p.pendingAction) || !p.learning.dirty} onclick={() => a.saveLearning()}>{p.copy.save}</StatefulButton>
    </section>
  {/if}
  {#each p.consentRequests as request (request.feature)}
    <section class="space-y-4" aria-label={request.title}>
      <h3>{request.title}: {p.copy.permissionNeeded}</h3>
      <p class="text-sm text-muted-foreground">{p.copy.permissionHelp}</p>
      <dl class="consent-facts text-sm">
        <dt>{p.copy.permissionPurpose}</dt><dd>{request.purpose}</dd>
        <dt>{p.copy.permissionData}</dt><dd>{request.data}</dd>
        <dt>{p.copy.permissionDestination}</dt><dd>{request.destinations}</dd>
        <dt>{p.copy.permissionBoundaries}</dt><dd>{request.boundaries}</dd>
      </dl>
      <StatefulButton variant="outline" pending={p.pendingAction === 'confirm:' + request.feature} disabled={Boolean(p.pendingAction)} onclick={() => a.confirmConsent(request.feature, request.scope)}>{p.copy.permissionAllow}</StatefulButton>
    </section>
  {/each}
  <Separator />
  <section class="flex flex-col gap-3" aria-label={p.copy.maintenance}>
    <h2>{p.copy.maintenance}</h2><p class="text-muted-foreground">{p.copy.maintenanceHelp}</p>
    {#if p.status?.curation}
      {#if !p.recoveryNotices.includes(p.status.curation.message)}<p role="status">{p.status.curation.message}</p>{/if}
      <div class="flex flex-wrap gap-2">
        <StatefulButton pending={p.pendingAction === 'run'} disabled={Boolean(p.pendingAction) || (p.status.curation.active && p.status.curation.state !== 'idle') || p.status.curation.paused || ['running', 'uncertain', 'unavailable', 'paused'].includes(p.status.curation.state)} onclick={() => a.run(p.status?.curation?.state === 'budget_exhausted')}>{p.status.curation.state === 'budget_exhausted' ? p.copy.override : p.copy.run}</StatefulButton>
        <StatefulButton variant="outline" pending={p.pendingAction === 'pause'} disabled={Boolean(p.pendingAction)} onclick={() => a.pause(!p.status?.curation?.paused)}>{p.status.curation.paused ? p.copy.resume : p.copy.pause}</StatefulButton>
      </div>
    {:else}<p role="status" class="text-sm text-muted-foreground">{p.copy.unsupportedCuration}</p>{/if}

  </section>
  {#if localSetup}<Separator />{@render localSetup()}{/if}
  </Tabs.Content>
  </Tabs.Root>
</div>

<style>
  .consent-facts { display: grid; grid-template-columns: minmax(80px, 120px) minmax(0,1fr); gap: 8px 16px; }
  .consent-facts dt { color: var(--muted-foreground); }
  .consent-facts dd { margin:0; overflow-wrap:anywhere; }
  .knowledge-content { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
  .knowledge-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 2rem; }
  .knowledge-record { display: flex; flex-direction: column; gap: .65rem; border-bottom: 1px solid var(--border); padding-block: .75rem; }
</style>

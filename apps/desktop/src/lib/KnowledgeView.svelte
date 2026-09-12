<script lang="ts">
  import { Button, Field, Input, Separator, StatefulButton } from '@drawloom/ui';
  import type { KnowledgePresentation, KnowledgeActions } from './knowledge-presentation.js';
  let { presentation: p, actions: a }: { presentation: KnowledgePresentation; actions: KnowledgeActions } = $props();
</script>

<div class="knowledge-content">
  <p class="text-muted-foreground">{p.copy.introduction}</p>
  <form class="flex flex-col gap-3" onsubmit={event => { event.preventDefault(); void a.search(); }}>
    <Field.Field><Field.Label for="knowledge-query">{p.copy.searchLabel}</Field.Label>
      <Input id="knowledge-query" value={p.query} oninput={event => a.setQuery(event.currentTarget.value)} placeholder={p.copy.searchPlaceholder} />
    </Field.Field>
    <StatefulButton type="submit" class="w-fit" pending={p.searchPending} pendingLabel={p.copy.searching} disabled={!p.query.trim()}>{p.copy.search}</StatefulButton>
  </form>
  {#if p.error}<p role="alert" class="text-destructive">{p.error}</p>{/if}
  <p role="status" class="text-muted-foreground">{p.searchStatus}</p>
  <div class="knowledge-columns">
    <section class="flex flex-col gap-4" aria-label={p.copy.searchLabel}>
      {#if p.searched && !p.results.length && !p.searchPending}<p>{p.copy.empty}</p>{/if}
      {#each p.results as item (JSON.stringify(item.record.ref))}
        <article class="knowledge-record">
          <p class="text-muted-foreground text-sm break-all">{item.record.ref.origin} · {item.record.ref.id} · {item.record.ref.revision}</p>
          <p class="whitespace-pre-wrap break-words">{item.record.body}</p>
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
            <h3 class="break-all">{record.ref.id}</h3>
            <p class="text-sm text-muted-foreground break-all">{record.ref.origin} · {record.ref.revision} · {record.status}{'freshness' in record ? ` · ${record.freshness}` : ''}</p>
            <p class="whitespace-pre-wrap break-words">{record.body}</p>
            <p class="text-sm break-words">{p.copy.confidence}: {JSON.stringify(record.confidence)}</p>
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
  <Separator />
  <section class="flex flex-col gap-3" aria-label={p.copy.source}>
    <h2>{p.copy.source}</h2><p class="text-muted-foreground">{p.copy.sourceHelp}</p>
    {#if p.status?.source}<p class="break-all">{p.copy.sourceProject}: {p.status.source.projectId} · {p.status.source.enabled ? 'collecting' : 'stopped'}</p>{/if}
    <div class="flex flex-wrap gap-2">
      <StatefulButton variant="outline" pending={p.pendingAction === 'source:start'} disabled={Boolean(p.pendingAction)} onclick={() => a.source(true)}>{p.copy.sourceStart}</StatefulButton>
      {#if p.status?.source?.enabled}<StatefulButton variant="ghost" pending={p.pendingAction === 'source:stop'} disabled={Boolean(p.pendingAction)} onclick={() => a.source(false)}>{p.copy.sourceStop}</StatefulButton>{/if}
    </div>
  </section>
  <Separator />
  <section class="flex flex-col gap-3" aria-label={p.copy.setup}>
    <h2>{p.copy.setup}</h2><p class="text-muted-foreground">{p.copy.setupHelp}</p>
    <StatefulButton variant="ghost" class="w-fit" pending={p.statusPending} onclick={() => a.refresh()}>{p.copy.refresh}</StatefulButton>
    {#if p.status}<p role="status">{p.status.message}</p>{/if}
    {#each p.status?.models ?? [] as model (model.id)}
      <article class="knowledge-record">
        <h3>{model.title}</h3><p class="text-muted-foreground">{model.licence} · {model.state.replace('_', ' ')}</p>
        <p><strong>{p.copy.modelWeights}:</strong> {(model.weightsBytes / 1048576).toFixed(1)} MiB</p>
        <p><strong>{p.copy.runtimeExtra}:</strong> {model.runtime.package} {model.runtime.version} · {model.runtime.licence} · size varies by platform</p>
        <p class="break-all"><strong>{p.copy.location}:</strong> {model.modelDirectory}<br />{model.runtimeDirectory}</p>
        <p><strong>{p.copy.prerequisites}:</strong> {model.prerequisites}</p>
        <p class="break-all"><strong>{p.copy.sourceLabel}:</strong> <a class="underline" href={model.source} target="_blank" rel="noreferrer">{model.source}</a></p>
        {#if model.message}<p>{model.message}</p>{/if}
        <p class="text-sm text-muted-foreground">{p.copy.selectedModel}</p>
        {#if model.receivedBytes !== undefined && model.expectedBytes !== undefined}<p role="status">Current file: {(model.receivedBytes / 1048576).toFixed(1)} / {(model.expectedBytes / 1048576).toFixed(1)} MiB</p>{/if}
        {#if ['installing_runtime', 'downloading', 'verifying'].includes(model.state) || p.pendingAction === 'download:' + model.id}
          <StatefulButton variant="outline" class="w-fit" pending={p.pendingAction === 'cancel_download:' + model.id} onclick={() => a.cancelDownload(model.id)}>{p.copy.cancel}</StatefulButton>
        {:else if model.state !== 'ready'}
          <StatefulButton variant="outline" class="w-fit" pending={p.pendingAction === 'download:' + model.id} disabled={Boolean(p.pendingAction)} onclick={() => a.download(model.id)}>{model.state === 'failed' || model.state === 'cancelled' ? p.copy.retry : p.copy.download}</StatefulButton>
        {/if}
      </article>
    {/each}
  </section>
  <Separator />
  <section class="flex flex-col gap-3" aria-label={p.copy.maintenance}>
    <h2>{p.copy.maintenance}</h2><p class="text-muted-foreground">{p.copy.maintenanceHelp}</p>
    {#if p.status}
      <p role="status">{p.status.maintenance.message}</p>
      <div class="flex flex-wrap gap-2">
        <StatefulButton pending={p.pendingAction === 'run'} disabled={Boolean(p.pendingAction) || ['running', 'uncertain', 'unavailable', 'paused'].includes(p.status.maintenance.state)} onclick={() => a.run(p.status?.maintenance.state === 'budget_exhausted')}>{p.status.maintenance.state === 'budget_exhausted' ? p.copy.override : p.copy.run}</StatefulButton>
        <StatefulButton variant="outline" pending={p.pendingAction === 'pause'} disabled={Boolean(p.pendingAction)} onclick={() => a.pause(p.status?.maintenance.state !== 'paused')}>{p.status.maintenance.state === 'paused' ? p.copy.resume : p.copy.pause}</StatefulButton>
      </div>
    {/if}
    {#if p.configuration}
      <form class="flex flex-col gap-4 max-w-xl" onsubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        if (p.configuration) void a.configure({ ...p.configuration, assessmentModel: String(data.get('assessmentModel')), assessmentTimeoutMs: Number(data.get('timeout')) * 1000, maxAutomaticStartsPerDay: Number(data.get('starts')), maxAutomaticMillisecondsPerDay: Number(data.get('minutes')) * 60000 });
      }}>
        <h3>{p.copy.settings}</h3>
        <Field.Field><Field.Label for="knowledge-assessor">{p.copy.assessmentModel}</Field.Label><Input id="knowledge-assessor" name="assessmentModel" value={p.configuration.assessmentModel} required /></Field.Field>
        <Field.Field><Field.Label for="knowledge-timeout">{p.copy.timeout}</Field.Label><Input id="knowledge-timeout" name="timeout" type="number" min="1" max="300" value={p.configuration.assessmentTimeoutMs / 1000} required /></Field.Field>
        <Field.Field><Field.Label for="knowledge-starts">{p.copy.starts}</Field.Label><Input id="knowledge-starts" name="starts" type="number" min="1" max="100" value={p.configuration.maxAutomaticStartsPerDay} required /></Field.Field>
        <Field.Field><Field.Label for="knowledge-minutes">{p.copy.minutes}</Field.Label><Input id="knowledge-minutes" name="minutes" type="number" min="1" max="1440" value={p.configuration.maxAutomaticMillisecondsPerDay / 60000} required /></Field.Field>
        <p class="text-muted-foreground">{p.copy.confidentiality}</p>
        <StatefulButton type="submit" variant="outline" class="w-fit" pending={p.pendingAction === 'configure'} disabled={Boolean(p.pendingAction)}>{p.copy.save}</StatefulButton>
      </form>
    {/if}
  </section>
</div>

<style>
  .knowledge-content { display: flex; flex-direction: column; gap: 1.5rem; padding: 1.5rem; min-width: 0; }
  .knowledge-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 2rem; }
  .knowledge-record { display: flex; flex-direction: column; gap: .65rem; border-bottom: 1px solid var(--border); padding-block: .75rem; }
</style>

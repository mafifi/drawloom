<script lang="ts">
  import { Button, Field, Input, StatefulButton, Collapsible, ChevronRightIcon, Badge, DownloadProgress, ModelSelector, Dialog } from '@drawloom/ui';
  import CodexModelSelector from './CodexModelSelector.svelte';
  import type { LocalKnowledgeSetupPresentation, LocalKnowledgeSetupActions } from './local-knowledge-setup-presentation.js';
  let { presentation: p, actions: a }: { presentation: LocalKnowledgeSetupPresentation; actions: LocalKnowledgeSetupActions } = $props();
  let assessmentModel=$state('');
  let cleanupOpen=$state(false);
  const configuredAssessmentModel=$derived(p.configuration?.assessmentModel??'');
  $effect(()=>{assessmentModel=configuredAssessmentModel;});
</script>
{#if p.error}<p role="alert" class="text-destructive">{p.error}</p>{/if}
{#if p.notice}<p role="status" class="text-sm text-muted-foreground">{p.notice}</p>{/if}
  <section class="flex flex-col gap-3" aria-label={p.copy.setup}>
    <div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 flex-1 space-y-2"><h2>{p.copy.setup}</h2><p class="text-muted-foreground">{p.copy.setupHelp}</p></div>
    <StatefulButton variant="ghost" class="w-fit" pending={p.statusPending} onclick={() => a.refresh()}>{p.copy.refresh}</StatefulButton></div>
    {#if p.status && !p.status.models.length}<p role="status">{p.status.message}</p>{/if}
    {#each p.status?.models ?? [] as model (model.id)}
      <article class="flex flex-col gap-3 py-4">
        <div class="flex flex-wrap justify-between gap-3"><ModelSelector label="Embedding model" options={[{id:model.id,title:model.title,provider:'Local embeddings',local:true,description:'Search only · not a chat model'}]} value={model.id} onSelect={()=>{}} /><Badge variant="outline">{!model.runtimeDownloadAvailable && model.state !== 'ready' ? 'Download unavailable' : model.state === 'missing' ? 'Not installed' : model.state.replace('_', ' ')}</Badge></div>
        <dl class="facts-list text-sm">
          <dt>{p.copy.modelWeights}</dt><dd>{(model.weightsBytes / 1048576).toFixed(1)} MiB · {model.licence}</dd>
          <dt>{p.copy.runtimeExtra}</dt><dd>{model.runtime.package} · {model.runtime.licence} · {(model.runtimeBytes / 1048576).toFixed(1)} MiB</dd>
          <dt>{p.copy.prerequisites}</dt><dd>{model.prerequisites}</dd>
        </dl>
        <Collapsible.Root><Collapsible.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="sm">Installation details <ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger><Collapsible.Content class="space-y-3 py-3"><p class="break-all"><strong>{p.copy.location}:</strong> {model.modelDirectory}<br />{model.runtimeDirectory}</p><p>{model.licence}</p><p class="break-all"><a class="underline" href={model.source} target="_blank" rel="noreferrer">Model source</a></p></Collapsible.Content></Collapsible.Root>
        {#if model.message && model.message !== 'runtime_unavailable'}<p>{model.message}</p>{/if}
        {#if (model.state==='downloading' || model.state==='installing_runtime') && model.receivedBytes !== undefined && model.expectedBytes !== undefined}<DownloadProgress received={model.receivedBytes} total={model.expectedBytes} label="Current file" />{/if}
        {#if model.state==='installing_runtime' || model.state==='verifying'}<p role="status" class="text-sm text-muted-foreground">{model.state==='verifying'?'Verifying downloaded files…':'Installing the local runtime…'}</p>{/if}
        {#if ['installing_runtime', 'downloading', 'verifying'].includes(model.state) || p.pendingAction === 'download:' + model.id}
          <StatefulButton variant="outline" class="w-fit" pending={p.pendingAction === 'cancel_download:' + model.id} onclick={() => a.cancelDownload(model.id)}>{p.copy.cancel}</StatefulButton>
        {:else if model.state !== 'ready'}
          {#if !model.runtimeDownloadAvailable}<p role="status" class="text-sm text-muted-foreground">The replacement download is not published yet. Text search remains available.</p>{/if}
          <StatefulButton variant="outline" class="w-fit" pending={p.pendingAction === 'download:' + model.id} disabled={Boolean(p.pendingAction) || !model.runtimeDownloadAvailable} onclick={() => a.download(model.id)}>{!model.runtimeDownloadAvailable ? p.copy.download : model.state === 'failed' || model.state === 'cancelled' ? p.copy.retry : p.copy.download}</StatefulButton>
        {/if}
      </article>
    {/each}
    {#if p.status?.obsoleteRuntimePresent}
      <Dialog.Root bind:open={cleanupOpen}>
        <Dialog.Trigger>{#snippet child({ props })}<Button {...props} variant="outline" class="w-fit" disabled={Boolean(p.pendingAction)}>{p.copy.cleanup}</Button>{/snippet}</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header><Dialog.Title>{p.copy.cleanupTitle}</Dialog.Title><Dialog.Description>{p.copy.cleanupHelp}</Dialog.Description></Dialog.Header>
          <Dialog.Footer>
            <Button variant="outline" onclick={() => { cleanupOpen=false; }}>{p.copy.cleanupCancel}</Button>
            <StatefulButton variant="destructive" pending={p.pendingAction==='cleanup_obsolete'} onclick={async () => { await a.cleanupObsolete(); cleanupOpen=false; }}>{p.copy.cleanup}</StatefulButton>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    {/if}
  </section>

    {#if p.configuration}
      <form class="form-stack" onsubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        if (p.configuration) void a.configure({ ...p.configuration, assessmentModel, assessmentTimeoutMs: Number(data.get('timeout')) * 1000, maxAutomaticStartsPerDay: Number(data.get('starts')), maxAutomaticMillisecondsPerDay: Number(data.get('minutes')) * 60000 });
      }}>
        <h3>{p.copy.settings}</h3>
        <div class="flex flex-wrap items-center justify-between gap-3"><span>{p.copy.assessmentModel}</span><CodexModelSelector label={p.copy.assessmentModel} selection={{model:assessmentModel}} requiredEffort="low" disabled={Boolean(p.pendingAction)} onSelect={value=>{if(value)assessmentModel=value.model;}} /></div>
        <Field.Field><Field.Label for="knowledge-timeout">{p.copy.timeout}</Field.Label><Input id="knowledge-timeout" name="timeout" type="number" min="1" max="300" value={p.configuration.assessmentTimeoutMs / 1000} required /></Field.Field>
        <Field.Field><Field.Label for="knowledge-starts">{p.copy.starts}</Field.Label><Input id="knowledge-starts" name="starts" type="number" min="1" max="100" value={p.configuration.maxAutomaticStartsPerDay} required /></Field.Field>
        <Field.Field><Field.Label for="knowledge-minutes">{p.copy.minutes}</Field.Label><Input id="knowledge-minutes" name="minutes" type="number" min="1" max="1440" value={p.configuration.maxAutomaticMillisecondsPerDay / 60000} required /></Field.Field>
        <p class="text-muted-foreground">{p.copy.confidentiality}</p>
        <StatefulButton type="submit" variant="outline" class="w-fit" pending={p.pendingAction === 'configure'} disabled={Boolean(p.pendingAction)}>{p.copy.save}</StatefulButton>
      </form>
    {/if}

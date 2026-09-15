<script lang="ts">
  import { Button, Collapsible, ChevronRightIcon, StatefulButton } from '@drawloom/ui';
  import type { KnowledgeDisclosurePresentation } from './knowledge-disclosure.js';
  import type { KnowledgeActions, KnowledgePresentation } from './knowledge-presentation.js';
  let { presentation: p, evidence, actions: a }: {
    presentation: KnowledgeDisclosurePresentation;
    evidence: KnowledgePresentation;
    actions: Pick<KnowledgeActions, 'inspect'>;
  } = $props();
</script>

{#if p.label}
  <Collapsible.Root class="mt-2 min-w-0">
    <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm" class="text-muted-foreground">{p.label}<ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger>
    <Collapsible.Content class="space-y-4 py-3">
      <p class="text-sm text-muted-foreground">{p.notice}</p>
      {#each p.references as reference (JSON.stringify(reference.ref))}
        <div class="space-y-1">
          <StatefulButton variant="ghost" size="sm" pending={evidence.evidencePending && JSON.stringify(evidence.selected) === JSON.stringify(reference.ref)} pendingLabel={evidence.copy.loading} onclick={() => a.inspect(reference.ref)}>{reference.label}</StatefulButton>
          <p class="text-sm text-muted-foreground">{reference.detail}</p>
          <p class="text-sm text-muted-foreground break-all">{reference.ref.origin} · {reference.ref.id} · {reference.ref.revision}</p>
        </div>
      {/each}
      {#if evidence.error}<p role="alert" class="text-sm text-destructive">{evidence.error}</p>{/if}
      {#each evidence.evidence?.records ?? [] as record (JSON.stringify(record.ref))}
        <article class="space-y-2">
          <p class="text-sm text-muted-foreground">{record.status}{'freshness' in record ? ` · ${record.freshness}` : ''}</p>
          <p class="whitespace-pre-wrap break-words">{record.body}</p>
          <StatefulButton variant="ghost" size="sm" pending={evidence.evidencePending && JSON.stringify(evidence.selected) === JSON.stringify(record.ref)} onclick={() => a.inspect(record.ref)}>{evidence.copy.inspect}</StatefulButton>
        </article>
      {/each}
      {#if evidence.hasMoreEvidence}
        <p class="text-sm text-muted-foreground">{evidence.copy.partial}</p>
        <StatefulButton variant="ghost" pending={evidence.evidencePending} onclick={() => evidence.selected && a.inspect(evidence.selected, true)}>{evidence.copy.moreEvidence}</StatefulButton>
      {/if}
    </Collapsible.Content>
  </Collapsible.Root>
{:else if p.notice}
  <p class="mt-2 text-sm text-muted-foreground">{p.notice}</p>
{/if}

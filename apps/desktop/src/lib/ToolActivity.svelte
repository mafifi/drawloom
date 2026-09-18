<script lang="ts">
  import { Button, Collapsible, Badge } from '@drawloom/ui';
  import type { ToolResult } from '@drawloom/tools';
  import { presentToolOutcome } from './tool-outcome.js';
  let { results, historical = false }: { results: (ToolResult & { toolName?: string })[]; historical?: boolean } = $props();
  const rows = $derived(results.map(result => ({ result, ...presentToolOutcome(result) })));
  const completed = $derived(rows.filter(row => row.state === 'completed').length);
  const issues = $derived(rows.filter(row => row.state !== 'completed'));
  const summary = $derived([...new Set(issues.map(row => row.statusLabel))].map(label => `${issues.filter(row => row.statusLabel === label).length} ${label.toLowerCase()}`).join(' · '));
</script>

{#if rows.length}
  <Collapsible.Root class="conversation-activity my-4">
    <Collapsible.Trigger>
      {#snippet child({ props })}<Button {...props} variant="ghost" class="h-auto w-full justify-start flex-wrap gap-2 text-muted-foreground text-xs py-2">
        <span>{historical ? 'Other tool activity' : 'Tool activity'} · {completed} completed</span>
        {#if summary}<Badge variant="outline">{summary}</Badge>{/if}
        <span aria-hidden="true">⌄</span>
      </Button>{/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content class="space-y-2 py-2">
      {#each rows as row}
        <Collapsible.Root>
          <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" class="h-auto w-full justify-between gap-3 text-sm"><span class="truncate">{row.result.toolName?.replace(/[_.]/g, ' ') ?? 'Recorded tool call'}</span><Badge variant="secondary">{row.statusLabel}</Badge></Button>{/snippet}</Collapsible.Trigger>
          <Collapsible.Content class="px-3 py-2"><p class="text-sm text-muted-foreground">{row.description}</p><pre>{JSON.stringify(row.result, null, 2)}</pre></Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </Collapsible.Content>
  </Collapsible.Root>
{/if}

<script lang="ts">
  import { Button, Collapsible, Badge, Tool } from '@drawloom/ui';
  import type { ToolResult } from '@drawloom/tools';
  import { presentToolOutcome, toolActivityTitle } from './tool-outcome.js';
  let { results, historical = false, toolLabels = [] }: { results: (ToolResult & { toolName?: string })[]; historical?: boolean; toolLabels?: readonly { toolName: string; title: string }[] } = $props();
  const rows = $derived(results.map(result => ({ result, ...presentToolOutcome(result) })));
  const completed = $derived(rows.filter(row => row.state === 'completed').length);
  const issues = $derived(rows.filter(row => row.state !== 'completed'));
  const summary = $derived([...new Set(issues.map(row => row.statusLabel))].map(label => `${issues.filter(row => row.statusLabel === label).length} ${label.toLowerCase()}`).join(' · '));
</script>

{#if rows.length}
  <Collapsible.Root class="conversation-process">
    <Collapsible.Trigger>
      {#snippet child({ props })}<Button {...props} variant="ghost" class="h-auto w-full justify-start flex-wrap gap-2 text-muted-foreground text-xs py-2">
        <span>{historical ? 'Other tool activity' : 'Tool activity'} · {completed} completed</span>
        {#if summary}<Badge variant="outline">{summary}</Badge>{/if}
        <span aria-hidden="true">⌄</span>
      </Button>{/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content class="space-y-2 py-2">
      {#each rows as row}
        <Tool.Root>
          <Tool.Header type={toolActivityTitle(row.result.toolName, toolLabels)} state={row.state === 'completed' ? 'output-available' : 'output-error'} statusLabel={row.statusLabel} />
          <Tool.Content class="min-w-0 px-3 py-2"><p class="text-sm text-muted-foreground">{row.description}</p><pre class="max-w-full whitespace-pre-wrap wrap-anywhere">{JSON.stringify(row.result, null, 2)}</pre></Tool.Content>
        </Tool.Root>
      {/each}
    </Collapsible.Content>
  </Collapsible.Root>
{/if}

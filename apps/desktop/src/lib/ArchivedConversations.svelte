<script lang="ts">
  import { ArchiveIcon, ChatIcon, Empty, Field, Input, StatefulButton } from '@drawloom/ui';
  import type { archiveCopy } from './screen-language.js';
  export interface ArchivePresentation { copy:typeof archiveCopy; rows: { id:string; title:string; project:string; workbench:string }[]; pendingId?:string; busy:boolean; error:string; }
  let { presentation:p, restore }: { presentation:ArchivePresentation; restore(id:string):Promise<void> } = $props();
  let query=$state('');
  const rows=$derived(p.rows.filter(row => [row.title,row.project,row.workbench].join(' ').toLowerCase().includes(query.toLowerCase())));
</script>
<section class="primary-view-content space-y-8">
  <p class="text-muted-foreground">{p.copy.introduction}</p>
  {#if p.rows.length}<Field.Field><Field.Label class="sr-only" for="archive-search">{p.copy.search}</Field.Label><Input id="archive-search" bind:value={query} placeholder={p.copy.placeholder} /></Field.Field>{/if}
  {#if p.error}<p role="alert" class="text-destructive">{p.error}</p>{/if}
  <div class="item-list">{#each rows as row (row.id)}
    <div class="collection-row"><ChatIcon class="size-4 shrink-0 text-muted-foreground" /><div class="min-w-0 flex-1"><p class="truncate">{row.title}</p><p class="truncate text-sm text-muted-foreground">{row.project} · {row.workbench}</p></div><StatefulButton variant="ghost" pending={p.pendingId===row.id} disabled={p.busy} onclick={()=>restore(row.id)}>{p.copy.restore}</StatefulButton></div>
  {:else}<Empty.Root class="py-12"><Empty.Header><Empty.Media variant="icon"><ArchiveIcon /></Empty.Media><Empty.Title>{query ? p.copy.noMatches : p.copy.empty}</Empty.Title><Empty.Description>{query ? p.copy.tryAgain : p.copy.help}</Empty.Description></Empty.Header></Empty.Root>{/each}</div>
</section>

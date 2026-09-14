<script lang="ts">
  import { Button } from '@drawloom/ui';
  export type ProjectActivitySummaryPresentation={loading:boolean;error:string;items:{id:string;owner:string;workflow:string;status:string}[]};
  let{presentation:p,onopen}:{presentation:ProjectActivitySummaryPresentation;onopen():void}=$props();
</script>
<section aria-label="Current workflow activity" class="space-y-4"><div class="flex items-center justify-between gap-3"><h3>Activity</h3><Button variant="ghost" onclick={onopen}>View activity</Button></div>{#if p.loading}<p role="status" class="text-muted-foreground">Loading activity…</p>{:else if p.error}<p role="alert" class="text-destructive">{p.error}</p>{:else if p.items.length}<ul class="space-y-3">{#each p.items as item (item.id)}<li>{item.workflow} <span class="text-muted-foreground">· {item.status}</span></li>{/each}</ul>{:else}<p class="text-muted-foreground">Nothing running in this project.</p>{/if}</section>

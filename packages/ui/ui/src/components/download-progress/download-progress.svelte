<script lang="ts">
  import {Progress} from 'bits-ui';
  let {received,total,label='Current file'}:{received:number;total:number;label?:string}=$props();
  const percent=$derived(total>0?Math.min(100,Math.max(0,received/total*100)):null);
</script>
<div class="space-y-2">
  <div class="flex justify-between gap-3 text-sm text-muted-foreground"><span>{label}</span><span>{(received/1048576).toFixed(1)} / {(total/1048576).toFixed(1)} MiB</span></div>
  <Progress.Root value={percent} max={100} aria-label={label} class="h-2 w-full overflow-hidden rounded-full bg-muted"><div class="h-full bg-primary" style:width={percent===null?'0%':`${percent}%`}></div></Progress.Root>
</div>

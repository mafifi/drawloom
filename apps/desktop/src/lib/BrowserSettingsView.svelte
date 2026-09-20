<script lang="ts">
  import { Empty, StatefulButton, Alert } from '@drawloom/ui';
  import type { DesktopBrowserSnapshot } from '@drawloom/desktop-host';
  let {presentation,actions}:{presentation:{snapshot:DesktopBrowserSnapshot;pending:string;error:string};actions:{forget(origin:string,permission:'camera'|'microphone'):Promise<unknown>}}=$props();
</script>
<section class="settings-group">
  <h2>Site permissions</h2>
  <p class="text-muted-foreground">Websites ask before using your camera or microphone. These permissions are separate from agent tools and macOS privacy consent.</p>
  {#if presentation.error}<Alert.Root><Alert.Description>{presentation.error}</Alert.Description></Alert.Root>{/if}
  {#if !presentation.snapshot.available}
    <div class="settings-surface"><div class="settings-stack"><p>{presentation.snapshot.reason}</p></div></div>
  {:else if !presentation.snapshot.permissions.length}
    <div class="settings-surface"><Empty.Root><Empty.Title>No saved site permissions</Empty.Title><Empty.Description>New sites default to Ask. Allow once does not create a saved permission.</Empty.Description></Empty.Root></div>
  {:else}
    <div class="settings-surface">
      {#each presentation.snapshot.permissions as setting (setting.origin+setting.permission)}
        <div class="settings-row"><div class="min-w-0"><h3 class="break-all">{setting.origin}</h3><p class="text-sm text-muted-foreground">{setting.permission==='camera'?'Camera':'Microphone'} · {setting.decision==='allow'?'Allowed':'Blocked'}</p></div>
          <StatefulButton variant="outline" pending={presentation.pending===`forget:${setting.origin}:${setting.permission}`} disabled={!!presentation.pending} onclick={()=>actions.forget(setting.origin,setting.permission)}>Reset to Ask</StatefulButton>
        </div>
      {/each}
    </div>
    <p class="text-sm text-muted-foreground">Reset applies to future requests. Close the website to end current use; removing a saved permission does not confirm an active stream has stopped.</p>
  {/if}
</section>

<script lang="ts">
  import { tick } from 'svelte';
  import { Button, StatefulButton, Input, Alert, Empty, ChevronRightIcon, RefreshIcon, CloseIcon, StopIcon } from '@drawloom/ui';
  import type { BrowserTab } from '@drawloom/desktop-host';
  import type { BrowserTabCommand } from './browser-controller.js';
  import { placeBrowser } from './browser-placement.js';
  let {presentation,actions}: {
    presentation:{tab?:BrowserTab;available:boolean;reason?:string;error:string;pending:string;visible:boolean};
    actions:{navigate(url:string):Promise<void>;command(kind:BrowserTabCommand):Promise<unknown>;close():void;place:Parameters<typeof placeBrowser>[1]['place']};
  }=$props();
  let address=$state('');
  let input=$state<HTMLInputElement|null>(null);
  let prior='';
  $effect(()=>{const key=presentation.tab?.id+':'+presentation.tab?.url;if(key!==prior){prior=key;address=presentation.tab?.url??'';}});
  $effect(()=>{if(presentation.visible&&!presentation.tab?.url)void tick().then(()=>input?.focus());});
  const external=$derived.by(()=>{try{const url=new URL(address);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}});
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Browser">
  <form class="action-row border-b p-3" onsubmit={event=>{event.preventDefault();void actions.navigate(address);}}>
    <Button type="button" variant="ghost" size="icon" aria-label="Back" title="Back" disabled={!presentation.tab?.canGoBack||!!presentation.pending} onclick={()=>actions.command('back')}><ChevronRightIcon class="rotate-180"/></Button>
    <Button type="button" variant="ghost" size="icon" aria-label="Forward" title="Forward" disabled={!presentation.tab?.canGoForward||!!presentation.pending} onclick={()=>actions.command('forward')}><ChevronRightIcon/></Button>
    {#if presentation.tab?.status==='loading'}<Button type="button" variant="ghost" size="icon" aria-label="Stop loading" title="Stop loading" onclick={()=>actions.command('stop')}><StopIcon/></Button>
    {:else}<StatefulButton type="button" variant="ghost" size="icon" aria-label="Reload" title="Reload" pending={presentation.pending==='reload'} disabled={!presentation.tab?.url||!!presentation.pending} onclick={()=>actions.command('reload')}><RefreshIcon/></StatefulButton>{/if}
    <Input bind:ref={input} bind:value={address} class="min-w-0 flex-1" aria-label="Website address" placeholder="Enter a website address" autocomplete="off" spellcheck={false}/>
    <StatefulButton type="submit" variant="outline" pending={presentation.pending==='navigate'} disabled={!address.trim()||!presentation.available||!!presentation.pending}>Go</StatefulButton>
  </form>
  {#if presentation.error||presentation.tab?.error}<div class="p-3"><Alert.Root><Alert.Description>{presentation.error||presentation.tab?.error}</Alert.Description></Alert.Root></div>{/if}
  <div class="action-row px-3 py-2">
    {#if presentation.available}<Button variant="link" disabled={!presentation.tab?.url} onclick={()=>actions.command('external')}>Open externally</Button>
    {:else if external}<Button variant="link" href={external} target="_blank" rel="noopener noreferrer">Open externally</Button>{/if}
    {#if presentation.tab?.status==='loading'}<span class="text-sm text-muted-foreground" role="status">Loading website…</span>{/if}
  </div>
  <div class="min-h-0 flex-1" use:placeBrowser={{tabId:presentation.tab?.id??'',visible:presentation.visible&&presentation.available&&!!presentation.tab?.url,place:actions.place}}>
    {#if !presentation.available}<Empty.Root><Empty.Title>Native browser unavailable</Empty.Title><Empty.Description>{presentation.reason}</Empty.Description></Empty.Root>
    {:else if !presentation.tab?.url}<Empty.Root><Empty.Title>Open a website</Empty.Title><Empty.Description>Enter an address above. Viewing a website does not share it with the agent.</Empty.Description></Empty.Root>{/if}
  </div>
</section>

<script lang="ts" module>
  export interface MentionOption { id:string; title:string; description?:string; scope?:string; group:string; kind:'skill'|'plugin'|'document'|'attachment'|'browse'|'conversation'; disabled?:boolean; }
</script>
<script lang="ts">
  import { Popover } from 'bits-ui';
  import * as Command from '../command/index.js';
  import BookOpen from '@lucide/svelte/icons/box';
  import Plug from '@lucide/svelte/icons/plug';
  import FileText from '@lucide/svelte/icons/file-text';
  import Paperclip from '@lucide/svelte/icons/paperclip';
  import Search from '@lucide/svelte/icons/search';
  import Messages from '@lucide/svelte/icons/messages-square';
  let {open, anchor, input, options, activeId='', label, status='', onOpenChange, onActiveChange, onSelect}: {
    open:boolean; anchor:HTMLElement|null; input:HTMLTextAreaElement|null; options:MentionOption[]; activeId?:string; label:string; status?:string;
    onOpenChange(open:boolean):void; onActiveChange(id:string):void; onSelect(id:string):void;
  }=$props();
  const groups=$derived([...new Set(options.map(item=>item.group))]);
  $effect(()=>{if(open && activeId) document.getElementById('mention-'+encodeURIComponent(activeId))?.scrollIntoView({block:'nearest'});});
</script>
<Popover.Root {open} {onOpenChange}>
  <Popover.Portal>
    <Popover.Content customAnchor={anchor} side="top" align="start" sideOffset={8} avoidCollisions={false} trapFocus={false}
      onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()}
      onInteractOutside={event=>{if(event.target===input) event.preventDefault();}}
      onFocusOutside={event=>{if(event.target===input) event.preventDefault();}}
      class="z-50 overflow-hidden rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md outline-none"
      style="width:var(--bits-popover-anchor-width);max-height:var(--bits-popover-content-available-height);"
      aria-label={label}>
      <Command.Root shouldFilter={false} value={activeId} onValueChange={onActiveChange}>
        <Command.List id="composer-mention-list" role="listbox" aria-label={label} class="max-h-72 overflow-y-auto">
          {#each groups as group}<Command.Group heading={group || undefined}>
            {#each options.filter(item=>item.group===group) as item (item.id)}
              <Command.Item id={'mention-'+encodeURIComponent(item.id)} value={item.id} disabled={item.disabled} onSelect={()=>onSelect(item.id)}
                class="min-h-9 gap-2 rounded-full px-3 py-2 data-selected:bg-accent [&_.cn-command-item-indicator]:hidden" title={[item.title,item.description,item.scope].filter(Boolean).join(' · ')}>
                {@const Icon=item.kind==='skill'?BookOpen:item.kind==='plugin'?Plug:item.kind==='attachment'?Paperclip:item.kind==='browse'?Search:item.kind==='conversation'?Messages:FileText}
                <Icon aria-hidden="true"/><span class="shrink-0 max-w-[55%] truncate">{item.title}</span><span class="min-w-0 flex-1 truncate text-muted-foreground">{item.description}</span>{#if item.scope}<span class="shrink-0 text-xs text-muted-foreground">{item.scope}</span>{/if}
              </Command.Item>
            {/each}
          </Command.Group>{/each}
          {#if !options.length}<Command.Empty>{status || 'No matching items'}</Command.Empty>{/if}
        </Command.List>
        {#if status && options.length}<p class="px-3 py-2 text-xs text-muted-foreground" role="status">{status}</p>{/if}
      </Command.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

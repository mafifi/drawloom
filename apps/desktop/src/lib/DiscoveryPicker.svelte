<script lang="ts">
  import { tick } from 'svelte';
  import { MentionPicker } from '@drawloom/ui';
  import type { DiscoveryPickerPresentation, DiscoveryPickerActions } from './composer-view.js';
  let {presentation: p, actions, input, anchor, onSelected, onAttach, onBrowse, onCreateGoal}: {presentation: DiscoveryPickerPresentation; actions: DiscoveryPickerActions; input: HTMLTextAreaElement|null; anchor: HTMLElement|null; onSelected():void; onAttach():void; onBrowse():void; onCreateGoal():void} = $props();
  const options = $derived([...p.options]);
  $effect(()=>{if(p.open && !options.some(item=>item.id===p.activeId&&!item.disabled)) actions.setActiveId(options.find(item=>!item.disabled)?.id??'');});
  function select(id:string){
    if(id==='action:more'){actions.showMorePicker();return;}
    if(id==='action:apps'){actions.loadMoreApps();return;}
    if(id==='action:context'){actions.beginContextPicker();void tick().then(()=>{input?.focus();input?.setSelectionRange(p.draftLength,p.draftLength);});return;}
    if(id==='action:goal'){actions.consumePickerToken();onCreateGoal();return;}
    if(id==='action:plan'){actions.consumePickerToken();void actions.setMode('plan');onSelected();return;}
    if(id==='action:fork'){actions.beginFork();return;}
    if(id==='action:browser'){void actions.openBrowser();return;}
    if(id==='action:attach'){actions.consumePickerToken();onAttach();return;}
    if(id==='action:browse'){actions.consumePickerToken();onBrowse();return;}
    if(id.startsWith('discovery:'))actions.selectDiscovery(id.slice(10));
    else if(id.startsWith('document:'))actions.selectPickerContext(id.slice(9));
    else if(id.startsWith('conversation:'))actions.selectConversationContext(id.slice(13));
    onSelected();
  }
  export function keydown(event:KeyboardEvent){
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();actions.setOpen(false);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault(); const enabled=options.filter(item=>!item.disabled), current=enabled.findIndex(item=>item.id===p.activeId);
      if(enabled.length)actions.setActiveId(enabled[(current+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]!.id);
    }else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();select(p.activeId);}
  }
</script>
<MentionPicker open={p.open} {anchor} {input} {options} activeId={p.activeId} label={p.kind==='skill'?'Skills':p.kind==='action'?'Actions and skills':p.kind==='context'?'Files and chats':'Add context'} status={p.status} onOpenChange={actions.setOpen} onActiveChange={actions.setActiveId} onSelect={select}/>

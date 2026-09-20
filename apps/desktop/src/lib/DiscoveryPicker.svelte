<script lang="ts">
  import { tick } from 'svelte';
  import { MentionPicker, type MentionOption } from '@drawloom/ui';
  import type { DesktopViewModel } from './view-model.svelte.js';
  import { discoveryName } from './screen-language.js';
  let {vm,input,anchor,onSelected,onAttach,onBrowse,onCreateGoal}:{vm:DesktopViewModel; input:HTMLTextAreaElement|null;anchor:HTMLElement|null;onSelected():void;onAttach():void;onBrowse():void;onCreateGoal():void}=$props();
  const options=$derived.by(()=>{
    const result:MentionOption[]=vm.pickerEntries.map(entry=>({id:'discovery:'+entry.id,title:discoveryName(entry),icon:entry.presentation?.icon,description:entry.description,scope:entry.scope==='required'?'Active':entry.availability!=='available'?entry.availability:undefined,group:entry.kind==='skill'?'Skills':'Plugins',kind:entry.kind==='skill'?'skill':'plugin',disabled:!entry.selectable||entry.availability!=='available'||entry.scope==='required'}));
    result.push(...vm.composerActions);
    if(vm.pickerKind==='add') {
      if(!vm.pickerQuery || 'files attach'.includes(vm.pickerQuery.toLowerCase())) result.unshift({id:'action:attach',title:'Choose files',description:'From your computer',group:'Add',kind:'attachment'});
      result.push({id:'action:context',title:'Type to search files or chats',group:'Files and chats',kind:'hint'});
    }
    result.push(...vm.pickerContextOptions);
    if(vm.pickerEntries.length<vm.pickerMatchCount)result.push({id:'action:more',title:'Load more results',group:'',kind:'browse'});
    if(vm.pickerKind==='add'&&vm.catalogue?.nextCursor)result.push({id:'action:apps',title:'Load more integrations',group:'',kind:'browse',disabled:vm.cataloguePending});
    const order=['Add','Actions','Plugins','Skills','Files','Chats','','Files and chats'];
    return result.sort((a,b)=>order.indexOf(a.group)-order.indexOf(b.group));
  });
  $effect(()=>{if(vm.pickerOpen && !options.some(item=>item.id===vm.pickerActiveId&&!item.disabled)) vm.pickerActiveId=options.find(item=>!item.disabled)?.id??'';});
  function select(id:string){
    if(id==='action:more'){vm.showMorePicker();return;}
    if(id==='action:apps'){vm.loadMoreApps();return;}
    if(id==='action:context'){vm.beginContextPicker();void tick().then(()=>{input?.focus();input?.setSelectionRange(vm.draft.length,vm.draft.length);});return;}
    if(id==='action:goal'){vm.consumePickerToken();onCreateGoal();return;}
    if(id==='action:plan'){vm.consumePickerToken();void vm.setMode('plan');onSelected();return;}
    if(id==='action:fork'){vm.beginFork();return;}
    if(id==='action:browser'){void vm.openBrowser();return;}
    if(id==='action:attach'){vm.consumePickerToken();onAttach();return;}
    if(id==='action:browse'){vm.consumePickerToken();onBrowse();return;}
    if(id.startsWith('discovery:'))vm.selectDiscovery(id.slice(10));
    else if(id.startsWith('document:'))vm.selectPickerContext(id.slice(9));
    else if(id.startsWith('conversation:'))vm.selectConversationContext(id.slice(13));
    onSelected();
  }
  export function keydown(event:KeyboardEvent){
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();vm.pickerOpen=false;return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault(); const enabled=options.filter(item=>!item.disabled), current=enabled.findIndex(item=>item.id===vm.pickerActiveId);
      if(enabled.length)vm.pickerActiveId=enabled[(current+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]!.id;
    }else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();select(vm.pickerActiveId);}
  }
</script>
<MentionPicker open={vm.pickerOpen} {anchor} {input} {options} activeId={vm.pickerActiveId} label={vm.pickerKind==='skill'?'Skills':vm.pickerKind==='action'?'Actions and skills':vm.pickerKind==='context'?'Files and chats':'Add context'} status={vm.pickerKind==='context'?(!vm.pickerQuery.trim()?'Type to search files or chats':''):vm.cataloguePending?'Loading…':vm.catalogueError?'Discovery unavailable. Refresh in Plugins.':''} onOpenChange={open=>vm.pickerOpen=open} onActiveChange={id=>vm.pickerActiveId=id} onSelect={select}/>

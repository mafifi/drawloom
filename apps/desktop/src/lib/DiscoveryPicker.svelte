<script lang="ts">
  import { MentionPicker, type MentionOption } from '@drawloom/ui';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let {vm,input,anchor,onSelected,onAttach,onBrowse}:{vm:DesktopViewModel; input:HTMLTextAreaElement|null;anchor:HTMLElement|null;onSelected():void;onAttach():void;onBrowse():void}=$props();
  const options=$derived.by(()=>{
    const result:MentionOption[]=vm.pickerEntries.map(entry=>({id:'discovery:'+entry.id,title:entry.name,description:entry.description,scope:entry.scope==='required'?'Active':entry.availability!=='available'?entry.availability:undefined,group:entry.kind==='skill'?'Skills':'Plugins',kind:entry.kind==='skill'?'skill':'plugin',disabled:!entry.selectable||entry.availability!=='available'||entry.scope==='required'}));
    if(vm.pickerKind==='context') {
      if(!vm.pickerQuery || 'files attach'.includes(vm.pickerQuery.toLowerCase())) result.unshift({id:'action:attach',title:'Choose files',description:'From your computer',group:'Files',kind:'attachment'});
      for(const item of vm.state?.operator.artifacts??[])if(item.content.kind==='text'&&vm.contextLabel(item.id).toLowerCase().includes(vm.pickerQuery.toLowerCase()))result.push({id:'document:'+item.id,title:vm.contextLabel(item.id),group:'Files',kind:'document'});
      for(const item of (vm.state?.conversations??[]).filter(c=>c.id!==vm.state?.selectedId && !c.archived && c.title.toLowerCase().includes(vm.pickerQuery.toLowerCase())).slice(0,20))result.push({id:'conversation:'+item.id,title:item.title,description:'Share recent cached text',group:'Conversations',kind:'conversation',disabled:vm.conversationContextIds.includes(item.id)});
    }
    if(vm.pickerEntries.length<vm.pickerMatchCount)result.push({id:'action:more',title:'Load more results',group:'',kind:'browse'});
    if(vm.pickerKind==='context'&&vm.catalogue?.nextCursor)result.push({id:'action:apps',title:'Load more integrations',group:'',kind:'browse',disabled:vm.cataloguePending});
    const order=['Files','Plugins','Skills','Conversations',''];
    return result.sort((a,b)=>order.indexOf(a.group)-order.indexOf(b.group));
  });
  $effect(()=>{if(vm.pickerOpen && !options.some(item=>item.id===vm.pickerActiveId&&!item.disabled)) vm.pickerActiveId=options.find(item=>!item.disabled)?.id??'';});
  function select(id:string){
    if(id==='action:more'){vm.showMorePicker();return;}
    if(id==='action:apps'){vm.loadMoreApps();return;}
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
<MentionPicker open={vm.pickerOpen} {anchor} {input} {options} activeId={vm.pickerActiveId} label={vm.pickerKind==='skill'?'Skills':'Add context'} status={vm.cataloguePending?'Loading…':vm.catalogueError?'Discovery unavailable. Refresh in Plugins.':''} onOpenChange={open=>vm.pickerOpen=open} onActiveChange={id=>vm.pickerActiveId=id} onSelect={select}/>

<script lang="ts">
  import { MentionPicker, type MentionOption } from '@drawloom/ui';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let {vm,input,anchor,onSelected,onAttach,onBrowse}:{vm:DesktopViewModel; input:HTMLTextAreaElement|null;anchor:HTMLElement|null;onSelected():void;onAttach():void;onBrowse():void}=$props();
  const options=$derived.by(()=>{
    const result:MentionOption[]=vm.pickerEntries.map(entry=>({id:'discovery:'+entry.id,title:entry.name,description:entry.description,scope:entry.scope==='required'?'Active':entry.availability!=='available'?entry.availability:undefined,group:vm.pickerKind==='skill'?'':'Plugins',kind:vm.pickerKind==='skill'?'skill':'plugin',disabled:!entry.selectable||entry.availability!=='available'||entry.scope==='required'}));
    if(vm.pickerKind==='context') {
      if(!vm.pickerQuery) result.unshift({id:'action:attach',title:'Files',description:'Attach from your computer',group:'Add',kind:'attachment'},{id:'action:browse',title:'Browse resources',description:'Connected sources',group:'Add',kind:'browse'});
      for(const item of vm.state?.operator.artifacts??[])if(item.content.kind==='text'&&vm.contextLabel(item.id).toLowerCase().includes(vm.pickerQuery.toLowerCase()))result.push({id:'document:'+item.id,title:vm.contextLabel(item.id),group:'Context',kind:'document'});
    }
    if(vm.pickerEntries.length<vm.pickerMatchCount)result.push({id:'action:more',title:'Load more results',group:'',kind:'browse'});
    if(vm.pickerKind==='context'&&vm.catalogue?.nextCursor)result.push({id:'action:apps',title:'Load more integrations',group:'',kind:'browse',disabled:vm.cataloguePending});
    return result;
  });
  $effect(()=>{if(vm.pickerOpen && !options.some(item=>item.id===vm.pickerActiveId&&!item.disabled)) vm.pickerActiveId=options.find(item=>!item.disabled)?.id??'';});
  function select(id:string){
    if(id==='action:more'){vm.showMorePicker();return;}
    if(id==='action:apps'){vm.loadMoreApps();return;}
    if(id==='action:attach'){vm.consumePickerToken();onAttach();return;}
    if(id==='action:browse'){vm.consumePickerToken();onBrowse();return;}
    if(id.startsWith('discovery:'))vm.selectDiscovery(id.slice(10));
    else if(id.startsWith('document:'))vm.selectPickerContext(id.slice(9));
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
<MentionPicker open={vm.pickerOpen} {anchor} {input} {options} activeId={vm.pickerActiveId} label={vm.pickerKind==='skill'?'Skills':'Context and plugins'} status={vm.cataloguePending?'Loading…':vm.catalogueError?'Discovery unavailable. Refresh in Plugins.':''} onOpenChange={open=>vm.pickerOpen=open} onActiveChange={id=>vm.pickerActiveId=id} onSelect={select}/>

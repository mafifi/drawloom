<script lang="ts">
  import {ModelSelector,type ModelOption} from '@drawloom/ui';
  import {type AgentModelSelection} from '@drawloom/agent';
  import {createCodexModelViewModel} from './codex-model-view-model.svelte.js';
  let {selection,disabled=false,label='Model',requiredEffort,onSelect}:{selection?:AgentModelSelection;disabled?:boolean;label?:string;requiredEffort?:string;onSelect:(selection:AgentModelSelection|undefined)=>void}=$props();
  const view=createCodexModelViewModel();
  const models=$derived(view.models),loading=$derived(view.loading),error=$derived(view.error);
  const options=$derived<ModelOption[]>([
    ...(!requiredEffort?[{id:'__default__',title:'Codex default',provider:'Codex',local:false}]:[]),
    ...models.map(model=>({id:model.id,title:model.title,provider:'Codex',local:false,efforts:model.efforts,disabled:Boolean(requiredEffort&&!model.efforts.includes(requiredEffort))})),
    ...(selection&&!models.some(m=>m.id===selection.model)?[{id:selection.model,title:selection.model,provider:'Configured',local:false,disabled:true,description:'Availability not confirmed'}]:[]),
  ]);

</script>
<ModelSelector {options} value={selection?.model??'__default__'} effort={requiredEffort?undefined:selection?.effort} {label} {loading} {error} {disabled} placeholder="Codex default" onOpen={()=>void view.refresh()}
  onSelect={id=>{const model=models.find(m=>m.id===id);onSelect(id!=='__default__'?{model:id,...(requiredEffort?{effort:requiredEffort}:model?.defaultEffort?{effort:model.defaultEffort}:{})}:undefined);}}
  onEffort={requiredEffort?undefined:effort=>{if(selection)onSelect({...selection,effort});}} />

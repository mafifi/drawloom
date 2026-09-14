<script lang="ts">
  import {ModelSelector,type ModelOption} from '@drawloom/ui';
  import {AgentModelSchema,type AgentModelSelection,type AgentModel} from '@drawloom/agent';
  import {z} from 'zod';
  let {selection,disabled=false,label='Model',requiredEffort,onSelect}:{selection?:AgentModelSelection;disabled?:boolean;label?:string;requiredEffort?:string;onSelect:(selection:AgentModelSelection|undefined)=>void}=$props();
  let models=$state<AgentModel[]>([]),loading=$state(false),error=$state('');
  const options=$derived<ModelOption[]>([
    ...(!requiredEffort?[{id:'__default__',title:'Codex default',provider:'Codex',local:false}]:[]),
    ...models.map(model=>({id:model.id,title:model.title,provider:'Codex',local:false,efforts:model.efforts,disabled:Boolean(requiredEffort&&!model.efforts.includes(requiredEffort))})),
    ...(selection&&!models.some(m=>m.id===selection.model)?[{id:selection.model,title:selection.model,provider:'Configured',local:false,disabled:true,description:'Availability not confirmed'}]:[]),
  ]);
  async function load(){if(loading)return;loading=true;error='';try{const response=await fetch('/api/models');if(!response.ok)throw Error();models=z.object({models:z.array(AgentModelSchema).max(1000)}).parse(await response.json()).models;}catch{error='Models unavailable. Check the Codex connection.';}finally{loading=false;}}
</script>
<ModelSelector {options} value={selection?.model??'__default__'} effort={requiredEffort?undefined:selection?.effort} {label} {loading} {error} {disabled} placeholder="Codex default" onOpen={()=>void load()}
  onSelect={id=>{const model=models.find(m=>m.id===id);onSelect(id!=='__default__'?{model:id,...(requiredEffort?{effort:requiredEffort}:model?.defaultEffort?{effort:model.defaultEffort}:{})}:undefined);}}
  onEffort={requiredEffort?undefined:effort=>{if(selection)onSelect({...selection,effort});}} />

import { z } from 'zod';
import { AgentModelSchema, type AgentModel, type AgentModelSelection } from '@drawloom/agent';
import type { RpcTransport } from '@drawloom/host';
const pageSchema=z.object({data:z.array(z.object({model:z.string(),displayName:z.string(),supportedReasoningEfforts:z.array(z.object({reasoningEffort:z.string()})),defaultReasoningEffort:z.string().optional()})).max(100),nextCursor:z.string().nullable().optional()});
/** An initialized transport; no thread or model invocation is created. */
export async function readCodexModels(rpc:Pick<RpcTransport,'request'>):Promise<AgentModel[]> {
  const result:AgentModel[]=[];const cursors=new Set<string>();let cursor:string|undefined;
  for(let page=0;page<10;page++) {
    let timer:ReturnType<typeof setTimeout>|undefined;
    let raw:unknown;
    try {raw=await Promise.race([rpc.request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Model discovery timed out')),8000);})]);}
    finally {clearTimeout(timer);}
    const next=pageSchema.parse(raw);
    for(const item of next.data)result.push(AgentModelSchema.parse({id:item.model,title:item.displayName,efforts:item.supportedReasoningEfforts.map(e=>e.reasoningEffort),...(item.defaultReasoningEffort?{defaultEffort:item.defaultReasoningEffort}:{})}));
    if(!next.nextCursor)return result.filter((model,index)=>result.findIndex(m=>m.id===model.id)===index);
    if(cursors.has(next.nextCursor))throw Error('Repeated model cursor');cursors.add(next.nextCursor);cursor=next.nextCursor;
  }
  throw Error('Model catalogue exceeds page limit');
}
export function permitsModel(models:readonly AgentModel[],selection:AgentModelSelection):boolean {
  const model=models.find(m=>m.id===selection.model);return Boolean(model && (!selection.effort || model.efforts.includes(selection.effort)));
}

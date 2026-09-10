import { z } from 'zod';
import { DiscoverySnapshotSchema, type AgentDiscovery, type AgentResult, type DiscoveryEntry, type DiscoverySelection, type DiscoverySnapshot } from '@drawloom/agent';
import type { RpcTransport, JsonStore } from '@drawloom/host';
import { ToolContentSchema, type ToolContent } from '@drawloom/tools';

const id = z.string().min(1);
const skill = z.object({ name:id, description:z.string(), path:id, scope:z.enum(['user','repo','system','admin']), enabled:z.boolean(), pluginId:id.nullable() });
const app = z.object({ id, name:id, description:z.string().nullable(), isAccessible:z.boolean(), isEnabled:z.boolean() });
const plugin = z.object({ id, name:id, installed:z.boolean(), enabled:z.boolean(), availability:z.enum(['AVAILABLE','DISABLED_BY_ADMIN']), interface:z.object({ longDescription:z.string().nullable(), shortDescription:z.string().nullable() }).nullable() });
const server = z.object({ name:id, pluginId:id.nullable(), tools:z.record(z.string(),z.object({name:id,description:z.string().optional()})), resources:z.array(z.object({uri:id,name:id,title:z.string().optional(),description:z.string().optional()})).default([]) });
type NativeSelection = { type: 'skill' | 'mention'; name: string; path: string };
const rejected = (): AgentResult<never> => ({status:'rejected',failure:{code:'invalid_state',message:'Discovery changed or the selection is unavailable. Refresh and select again.'}});
async function identity(kind: string, nativeId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nativeId));
  return `codex:${kind}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Installed 0.153.4 wire shapes; native paths are confined to this session map. */
export function createCodexDiscovery(rpc: RpcTransport, threadId: string, isClosed: () => boolean, experimentalPlugins = false, store?: JsonStore) {
  let generation = 0;
  let explicitRevision = 0;
  let lastAppNotification: string | undefined;
  let cached: DiscoverySnapshot | undefined;
  let pending: Promise<AgentResult<DiscoverySnapshot>> | undefined;
  let selections = new Map<string, NativeSelection>();
  let resources = new Map<string, {server:string;uri:string}>();
  const clear = () => { generation++; cached=undefined; pending=undefined; selections.clear(); resources.clear(); };
  const invalidate = () => { explicitRevision++; clear(); };
  const upstreamChanged = (method: string, params: unknown) => {
    if (method === 'app/list/updated') {
      const parsed = z.object({data:z.array(app).max(10_000)}).safeParse(params);
      if (parsed.success) {
        const signature = JSON.stringify(parsed.data.data);
        if (signature === lastAppNotification) return;
        lastAppNotification = signature;
      }
    }
    clear();
  };
  const discovery: AgentDiscovery = {
    invalidate,
    async readResource(selection) {
      const current = generation;
      let target = cached?.revision === selection.revision ? resources.get(selection.id) : undefined;
      // Returned links have a durable, session-bound receipt rather than a
      // catalogue revision: they need not ever appear in resources/list.
      if (!target && store && /^codex:returned-resource:[a-f0-9]{64}$/.test(selection.id)) {
        const receipt = z.object({server:id,uri:id,revision:id}).safeParse(await store.get(`codex-resource:${threadId}:${selection.id}`));
        if (receipt.success && receipt.data.revision === selection.revision) target = {server:receipt.data.server,uri:receipt.data.uri};
      }
      if (!target || isClosed()) return rejected();
      try {
        const result = z.object({ contents: z.array(z.unknown()) }).parse(await rpc.request('mcpServer/resource/read', { threadId, ...target }));
        const content = ToolContentSchema.parse(result.contents.map(resource => ({type:'resource',resource})));
        if (current !== generation || isClosed()) return rejected();
        return { status:'ok', value: content.filter(block => block.type === 'resource' && block.resource.uri === target.uri) };
      } catch (error) {
        return { status:'rejected', failure:{code:'provider_unavailable',message:'This provider resource could not be read. No tool was invoked.'} };
      }
    },
    async list(options = {}) {
      if (isClosed()) return rejected();
      if (options.refresh) invalidate();
      if(cached) return {status:'ok',value:structuredClone(cached)};
      if(pending) return pending;
      const explicit = explicitRevision;
      let retries = 1;
      const attempt = async (): Promise<AgentResult<DiscoverySnapshot>> => {
        const current=generation;
        const revision=crypto.randomUUID();
        const entries: DiscoveryEntry[]=[];
        const native=new Map<string,NativeSelection>();
        const readable=new Map<string,{server:string;uri:string}>();
        const categories: DiscoverySnapshot['categories']=[];
        const add=async (nativeId: string, entry:Omit<DiscoveryEntry,'id'>, selection?:NativeSelection) => {
          if (entries.length >= 10_000) throw Error('Inventory limit');
          const key=await identity(entry.kind, nativeId);
          if (entries.some(e => e.id === key)) return key;
          entries.push({...entry,id:key});if(selection)native.set(key,selection);
          return key;
        };
        async function category(kind: DiscoveryEntry['kind'], run:()=>Promise<void>) {
          const start=entries.length;
          try {await run();categories.push({kind,status:'available'});}
          catch(error) { for(const entry of entries.splice(start)){native.delete(entry.id);readable.delete(entry.id);}const unsupported=z.object({code:z.literal(-32601)}).safeParse(error).success;categories.push({kind,status:unsupported?'unsupported':'error',message:'Provider discovery is unavailable for this category.'}); }
        }
        async function pages<T>(method:string,schema:z.ZodType<T>, params:Record<string,unknown>, consume:(value:T)=>Promise<void>) {
          let cursor:string|null=null;const seen=new Set<string>();
          for(let page=0;page<100;page++) {
            const result=z.object({data:z.array(schema).max(1000),nextCursor:id.nullable()}).parse(await rpc.request(method,{...params,cursor,limit:100}));
            for (const item of result.data) await consume(item);
            if(result.nextCursor===null)return;
            if(seen.has(result.nextCursor))throw Error('Repeated cursor');
            seen.add(result.nextCursor);cursor=result.nextCursor;
          }
          throw Error('Inventory page limit');
        }
        await category('skill',async()=>{
          const result=z.object({data:z.array(z.object({cwd:id,skills:z.array(skill),errors:z.array(z.unknown())}))}).parse(await rpc.request('skills/list',{forceReload:options.refresh??false}));
          for(const group of result.data) {
            if(group.errors.length)throw Error('Incomplete skill scan');
            for(const item of group.skills)await add(item.path, {origin:'codex',kind:'skill',name:item.name,description:item.description,scope:item.scope,availability:item.enabled?'available':'unavailable',selectable:item.enabled,...(item.pluginId?{ownerId:await identity('plugin', item.pluginId)}:{})},item.enabled?{type:'skill',name:item.name,path:item.path}:undefined);
          }
        });
        await category('app',()=>pages('app/list',app,{threadId,forceRefetch:options.refresh??false},async item=>{
          const available=item.isAccessible&&item.isEnabled;
          await add(item.id, {origin:'codex',kind:'app',name:item.name,description:item.description??'',scope:'session',availability:available?'available':'unavailable',selectable:available},available?{type:'mention',name:item.name,path:`app://${item.id}`}:undefined);
        }));
        await category('tool',()=>pages('mcpServerStatus/list',server,{threadId},async item=>{
          for(const tool of Object.values(item.tools))await add(item.name + ':' + tool.name, {origin:`codex:mcp:${item.name}`,kind:'tool',name:tool.name,description:tool.description??'',scope:'session',availability:'unverified',selectable:false,...(item.pluginId?{ownerId:await identity('plugin', item.pluginId)}:{})});
          for (const resource of item.resources) {
            const key = await add(item.name + ':' + resource.uri, { origin:`codex:mcp:${item.name}`,kind:'resource',name:resource.title??resource.name,description:resource.description??'',scope:'session',availability:'available',selectable:false,readable:true });
            readable.set(key,{server:item.name,uri:resource.uri});
          }
        }));
        if(experimentalPlugins)await category('plugin',async()=>{
          const result=z.object({marketplaces:z.array(z.object({name:id,plugins:z.array(plugin)})),marketplaceLoadErrors:z.array(z.unknown())}).parse(await rpc.request('plugin/list',{forceRefetch:options.refresh??false}));
          if(result.marketplaceLoadErrors.length)throw Error('Incomplete plugin scan');
          for(const marketplace of result.marketplaces)for(const item of marketplace.plugins) {
            const available=item.installed&&item.enabled&&item.availability==='AVAILABLE';
            await add(item.id, {origin:`codex:plugin:${marketplace.name}`,kind:'plugin',name:item.name,description:item.interface?.shortDescription??item.interface?.longDescription??'',scope:'session',availability:available?'available':'unavailable',selectable:available},available?{type:'mention',name:item.name,path:`plugin://${item.id}`}:undefined);
          }
        });
        else categories.push({kind:'plugin',status:'unsupported',message:'Experimental native plugin discovery is off.'});
        // Native app discovery can itself emit an updated catalogue. Retry one
        // settled read, but never republish after explicit invalidation/closure.
        if(current!==generation||isClosed()) {
          if (!isClosed() && explicit === explicitRevision && retries-- > 0) { options = {}; return attempt(); }
          return rejected();
        }
        cached=DiscoverySnapshotSchema.parse({revision,entries,categories});selections=native;resources=readable;
        return {status:'ok',value:structuredClone(cached)};
      };
      const request=attempt();
      pending=request;
      try{return await request;}finally{if(pending===request)pending=undefined;}
    },
  };
  return {discovery,upstreamChanged,
    async rememberReturnedResources(source: string, content: ToolContent): Promise<Record<string,DiscoverySelection>> {
      const output: Record<string,DiscoverySelection> = Object.create(null);
      if (!store || isClosed()) return output;
      for (const block of content.slice(0,256)) {
        if (block.type !== 'resource_link' || block.uri.length > 4096) continue;
        const key = await identity('returned-resource', JSON.stringify([source,block.uri]));
        const storageKey = `codex-resource:${threadId}:${key}`;
        const saved = z.object({server:id,uri:id,revision:id}).safeParse(await store.get(storageKey));
        // This versions the source-bound receipt, not the resource's contents.
        // Concurrent completions must not invalidate each other's identical link.
        const revision = saved.success ? saved.data.revision : await identity('resource-receipt', JSON.stringify([1,threadId,source,block.uri]));
        if (!saved.success) await store.set(storageKey,{server:source,uri:block.uri,revision});
        output[block.uri] = {id:key,revision};
      }
      return output;
    },
    resolve(values:readonly DiscoverySelection[]):NativeSelection[]|undefined {
    if(!values.length)return [];
    if(!cached||isClosed())return undefined;
    const output:NativeSelection[]=[];const seen=new Set<string>();
    for(const selected of values){const item=selections.get(selected.id);if(selected.revision!==cached.revision||!item)return undefined;if(!seen.has(selected.id)){seen.add(selected.id);output.push({...item});}}
    return output;
  }};
}

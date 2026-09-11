import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppResource,registerAppTool,RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { PluginBackendFactory } from '@drawloom/desktop-host';
const backend:PluginBackendFactory=async({configuration})=>{
  const c=z.object({id:z.string(),initial:z.string(),returned:z.string(),blocked:z.string()}).parse(configuration);
  const uri=`ui://${c.id}/view.html`;
  const script=await readFile(join(import.meta.dir,'app.js'),'utf8');
  const server=new McpServer({name:c.id,version:'1'});
  registerAppResource(server,'Shared media',uri,{},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:`<!doctype html><html><head><style>:root{color-scheme:light dark}body{font:14px system-ui;padding:16px}img{width:80px;height:80px}input,button{font:inherit;padding:8px;margin:8px}</style></head><body><p id="ready">Connecting</p><label>Unsaved note<input aria-label="Unsaved note"></label><button id="declare">Return media source</button><p id="result"></p><img id="initial" src="${c.initial}/image.png" alt="Initially shared"><img id="returned" src="${c.returned}/image.png" alt="Newly shared"><img id="blocked" src="${c.blocked}/image.png" alt="Undeclared"><script type="module">${script}</script><script src="${c.initial}/script.js"></script></body></html>`,_meta:{ui:{csp:{resourceDomains:c.id==='producer'?[c.initial]:[]}}}}]}));
  registerAppTool(server,'open',{inputSchema:{},_meta:{ui:{resourceUri:uri,visibility:['app']}}},async()=>({content:[]}));
  registerAppTool(server,'result',{inputSchema:{},_meta:{ui:{visibility:['app']}}},async()=>({content:[{type:'resource_link',name:'Shared returned image',uri:c.returned+'/redirect.png?signature=SYNTHETIC',mimeType:'image/png'},{type:'resource_link',name:'Expired image',uri:c.returned+'/expired.png',mimeType:'image/png'}]}));
  const [transport,peer]=InMemoryTransport.createLinkedPair();await server.connect(peer);
  return {contributions:{workbenches:[{id:c.id,title:c.id,description:'Public synthetic media check',tools:[],skills:[]}],views:[{id:c.id+'.view',workbenchId:c.id,title:c.id,entrypoint:uri}]},servers:[{name:'media',transport}],dispose:()=>server.close()};
};
export default backend;

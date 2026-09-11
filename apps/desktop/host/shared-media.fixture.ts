import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { PluginBackendFactory } from '@drawloom/desktop-host';

const backend: PluginBackendFactory = async ({configuration}) => {
  const config=z.object({id:z.string(),origin:z.string().optional(),url:z.string()}).parse(configuration);
  const uri=`ui://${config.id}/view.html`;
  const server=new McpServer({name:config.id,version:'1.0.0'});
  registerAppResource(server,'Media',uri,{},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:'<!doctype html><p>Independent public workbench</p>',_meta:{ui:{csp:{resourceDomains:config.origin?[config.origin]:[]}}}}]}));
  registerAppTool(server,'open',{inputSchema:{},_meta:{ui:{resourceUri:uri,visibility:['app']}}},async()=>({content:[]}));
  registerAppTool(server,'result',{inputSchema:{},_meta:{ui:{visibility:['app']}}},async()=>({content:[{type:'resource_link',name:'Returned video',uri:config.url,mimeType:'video/mp4'}]}));
  const [transport,peer]=InMemoryTransport.createLinkedPair();await server.connect(peer);
  return {contributions:{workbenches:[{id:config.id,title:config.id,description:'Synthetic media composition',tools:[],skills:[]}],views:[{id:config.id+'.view',workbenchId:config.id,title:config.id,entrypoint:uri}]},servers:[{name:'media',transport}],dispose:()=>server.close()};
};
export default backend;

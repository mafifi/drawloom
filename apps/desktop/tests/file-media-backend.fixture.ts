import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { PluginBackendFactory } from '@drawloom/desktop-host';
// Public synthetic CSP fixture; no model, private plugin or filesystem API.
const backend: PluginBackendFactory = async ({ configuration }) => {
  const config=z.object({approved:z.string().url(),blocked:z.string().url()}).parse(configuration);
  const uri='ui://media-check/view.html';
  const server=new McpServer({name:'media-check',version:'1.0.0'});
  const html=`<!doctype html><html><head><title>Media policy check</title></head><body>
    <video id="project" src="synthetic.mp4" controls preload="metadata"></video>
    <img id="approved" src="${config.approved}/image"><img id="blocked" src="${config.blocked}/image">
    <script src="${config.approved}/script"></script>
    <script>window.inlineAllowed=true;fetch(${JSON.stringify(config.approved+'/connect')}).catch(()=>{});</script>
    </body></html>`;
  registerAppResource(server,'Media check',uri,{},async()=>({contents:[{uri,mimeType:RESOURCE_MIME_TYPE,text:html,_meta:{ui:{csp:{resourceDomains:[config.approved]}}}}]}));
  registerAppTool(server,'media.open',{inputSchema:{},_meta:{ui:{resourceUri:uri,visibility:['app']}}},async()=>({content:[]}));
  const [transport,peer]=InMemoryTransport.createLinkedPair();await server.connect(peer);
  return {contributions:{workbenches:[{id:'media-check',title:'Media policy check',description:'Public synthetic browser fixture',tools:[],skills:[]}],views:[{id:'media-check.view',workbenchId:'media-check',title:'Media policy check',entrypoint:uri}]},servers:[{name:'media',transport}],dispose:()=>server.close()};
};
export default backend;

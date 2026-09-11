// Browser-only synthetic MCP App, bundled by the opt-in browser fixture.
import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({name:'shared-media-check',version:'1'}, {}, {autoResize:false});
await app.connect();
document.querySelector('#ready')!.textContent='Connected';
document.querySelector('#declare')!.addEventListener('click',async()=>{
  await app.callServerTool({name:'result',arguments:{}});
  document.querySelector('#result')!.textContent='Source returned';
});

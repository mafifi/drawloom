// Rebuild the review inventory and Archify maps from tracked source and manifests.
// Outputs are local build artifacts, never inputs to the product.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output=resolve(root,'docs/reference/generated/repository-atlas');
const archify=process.argv[2];
if(!archify)throw Error('Pass the path to archify.mjs. No tool is downloaded automatically.');
mkdirSync(output,{recursive:true});
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const packages=files.filter(p=>/^(packages\/[^/]+\/[^/]+|apps\/[^/]+)\/package.json$/.test(p)).map(path=>({path,dir:dirname(path),...JSON.parse(readFileSync(resolve(root,path),'utf8'))}));
const families=[...new Set(packages.map(p=>p.path.startsWith('apps/')?'application':p.path.split('/')[1]))];
const family=p=>p.path.startsWith('apps/')?'application':p.path.split('/')[1];
const id=p=>'pkg-'+p.name.replace(/[^a-z0-9]/gi,'-');
const manifests=new Map(packages.map(p=>[p.name,p]));
const deps=p=>Object.keys({...p.dependencies,...p.optionalDependencies}).filter(name=>manifests.has(name));
const row=p=>({id:id(p),label:p.name.replace('@drawloom/',''),sublabel:p.drawloom?.role??'workspace',type:'backend',sources:[{path:p.path},...(files.includes(p.dir+'/src/index.ts')?[{path:p.dir+'/src/index.ts'}]:[])]});
const maps=[];
function render(name,title,nodes,edges,cards=[]){
 if(edges.length)edges=edges.map((edge,i)=>{const from=nodes.findIndex(n=>n.id===edge.from),to=nodes.findIndex(n=>n.id===edge.to),lane=400+i*80;return {...edge,label:undefined,fromSide:'right',toSide:'right',via:[[lane,105+from*230],[lane,105+to*230]]};});
 const spec={schema_version:1,diagram_type:'architecture',meta:{title,locale:'en',quality_profile:'standard',repository:{url:'https://github.com/mafifi/drawloom',revision}},layout:{mode:'grid',origin:[50,60],cols:3,cellW:250,cellH:90,gapX:150,gapY:140},components:nodes.map((n,i)=>({...n,sources:n.sources.slice(0,3),row:edges.length?i:Math.floor(i/3),col:edges.length?0:i%3,size:[250,90]})),connections:edges,cards:[{dot:'cyan',title:'How to read',items:['Source links identify owning files. Arrows point from a consumer to its declared dependency, not runtime call order. External libraries and dynamic imports need separate inspection.']},...cards]};
 const input=resolve(output,name+'.architecture.json'),html=resolve(output,name+'.html');
 writeFileSync(input,JSON.stringify(spec,null,2)+'\n');
 try {execFileSync('node',[archify,'deliver','architecture',input,html,'--quality','standard','--repo-root',root,'--json'],{stdio:['ignore','pipe','pipe']});} catch(error){console.error(error.stdout?.toString());throw error;}
 maps.push({name,title});
}
render('overview','Drawloom — ownership map',families.map(f=>({id:f,label:f,sublabel:packages.filter(p=>family(p)===f).length+' workspaces',type:f==='application'?'frontend':'backend',sources:packages.filter(p=>family(p)===f).map(p=>({path:p.path}))})),[],[{dot:'emerald',title:'Drill down',items:['Open a family map for package relationships. The inventory includes every tracked file, not only workspaces. Eleven logical capabilities are not eleven packages; see ADR 0005.']}]);
for(const f of families){
 const own=packages.filter(p=>family(p)===f), names=new Set(own.map(p=>p.name));
 const edges=own.flatMap(p=>deps(p).filter(n=>names.has(n)).map(n=>({id:id(p)+'-'+id(manifests.get(n)),from:id(p),to:id(manifests.get(n)),label:'depends on'})));
 render(f,'Drawloom — '+f,own.map(row),edges,own.map(p=>({dot:'emerald',title:p.name,items:[p.dir,'Outside this family: '+(deps(p).filter(n=>!names.has(n)).join(', ')||'none')]})));
}
function fileMap(name,title,paths){
 for(const path of paths)if(!files.includes(path))throw Error('Missing map source: '+path);
 const nodes=paths.map((path,i)=>({id:'file'+i,label:path.split('/').at(-1),sublabel:path.includes('/host/')?'Host boundary':'Presentation',type:'backend',sources:[{path}]}));
 const edges=paths.flatMap((path,i)=>{
  const source=readFileSync(resolve(root,path),'utf8');
  return paths.flatMap((target,j)=>{
   let imported=relative(dirname(path),target).replace(/\.ts$/,'.js');if(!imported.startsWith('.'))imported='./'+imported;
   return i!==j&&(source.includes("'"+imported+"'")||source.includes('"'+imported+'"'))?[{id:'import'+i+'-'+j,from:'file'+i,to:'file'+j}]:[];
  });
 });
 render(name,title,nodes,edges,[{dot:'emerald',title:'File detail',items:['Here arrows represent literal relative imports among these selected files, including type imports. This is a bounded entry-point map, not a complete call graph. Follow the full file ledger for the rest.']}]);
}
fileMap('desktop-composer','Desktop — conversation and composer',[
 'apps/desktop/src/lib/Conversation.svelte','apps/desktop/src/lib/Composer.svelte','apps/desktop/src/lib/DiscoveryPicker.svelte','apps/desktop/src/lib/CodexModelSelector.svelte','apps/desktop/src/lib/view-model.svelte.ts','apps/desktop/src/lib/protocol.ts']);
fileMap('desktop-views','Desktop — purposeful destinations',[
 'apps/desktop/src/lib/PrimaryView.svelte','apps/desktop/src/lib/NavigationLanding.svelte','apps/desktop/src/lib/WorkflowRuns.svelte','apps/desktop/src/lib/Knowledge.svelte','apps/desktop/src/lib/DiscoveryInventory.svelte','apps/desktop/src/lib/ArchivedConversations.svelte']);
fileMap('desktop-host','Desktop — integration entry points',[
 'apps/desktop/host/main.ts','apps/desktop/host/server.ts','apps/desktop/host/application.ts','apps/desktop/host/composition.ts','apps/desktop/host/history-coordinator.ts','apps/desktop/host/plugin-backend.ts','apps/desktop/host/view-context.ts']);
const inventory=files.map(path=>{
 const bytes=readFileSync(resolve(root,path));
 const text=!bytes.includes(0),lines=text?(bytes.length?bytes.toString('utf8').split('\n').length-(bytes.at(-1)===10?1:0):0):null;
 const bucket=path.split('/')[0];
 return {path,bytes:bytes.length,lines,bucket};
});
writeFileSync(resolve(output,'inventory.json'),JSON.stringify({revision,files:inventory},null,2)+'\n');
const link=path=>relative(output,resolve(root,path)).split('/').map(encodeURIComponent).join('/');
const md=['# Drawloom repository reading ledger','',`Source revision: \`${revision}\`. Generated from git-tracked files; line counts include blanks/comments and are not cloc code counts. Binary files retain byte sizes. Existing tracked generated files are included, visibly by path. Nothing is marked reviewed automatically.`, '', '## Maps','',...maps.map(m=>`- [${m.title}](${m.name}.html)`),'','## Reading inventory',''];
for(const bucket of [...new Set(inventory.map(f=>f.bucket))]){
 const entries=inventory.filter(f=>f.bucket===bucket);
 md.push(`### ${bucket}`, '', `${entries.length} files · ${entries.reduce((n,f)=>n+(f.lines??0),0).toLocaleString()} text lines`,'');
 for(const f of entries)md.push(`- [ ] [${f.path}](${link(f.path)}) — ${f.lines===null?'binary, '+f.bytes+' bytes':f.lines+' lines'}`);
 md.push('');
}
writeFileSync(resolve(output,'index.md'),md.join('\n'));
console.log(JSON.stringify({revision,maps:maps.length,files:inventory.length,textLines:inventory.reduce((n,f)=>n+(f.lines??0),0),output},null,2));

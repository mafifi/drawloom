// Fresh renderings never overwrite publication evidence from an earlier run.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [survey,name,archify,checkout]=process.argv.slice(2);
if(!['authorization-survey','evaluation-survey','harness-workbench-survey','knowledge-memory-survey'].includes(survey)||!name||!/^[a-z0-9-]+$/.test(name)||!archify||!checkout)throw Error('Usage: node scripts/render-survey-evidence.mjs <survey> <diagram> <archify.mjs> <source-checkout>');
const source=resolve(root,'docs/reference',survey,name+'.architecture.json');
if(!existsSync(source))throw Error('Unknown diagram source');
const run=new Date().toISOString().replaceAll(':','-');
const output=resolve(root,'docs/reference/evidence/generated',survey,run);
mkdirSync(output,{recursive:true});
const html=resolve(output,name+'.html');
const receipt=execFileSync('node',[resolve(archify),'deliver','architecture',source,html,'--quality','showcase','--repo-root',resolve(checkout),'--json'],{encoding:'utf8'});
writeFileSync(resolve(output,name+'.delivery.json'),receipt);
console.log(output);
console.log('Browser checks and visual review are separate. Write any new sidecars beside this HTML, never into the archived surveys directory.');

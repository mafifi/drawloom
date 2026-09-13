import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {dependencyFootprint} from './footprint.mjs';

test('footprint includes type-only and aliased packages once despite dependency cycles',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-eval-footprint-'));
  try {
    for(const [folder,manifest] of Object.entries({
      runner:{name:'runner',version:'1.0.0',types:'types.d.ts',dependencies:{alias:'npm:scorer@1.0.0'}},
      alias:{name:'scorer',version:'1.0.0',exports:{types:'./types.d.ts'},dependencies:{runner:'1.0.0'}},
    })) {
      await mkdir(join(root,'node_modules',folder),{recursive:true});
      await writeFile(join(root,'node_modules',folder,'package.json'),JSON.stringify(manifest));
    }
    const result=dependencyFootprint('runner',root);
    expect(result.packageCount).toBe(2);
    expect(result.packages.map(p=>p.name)).toEqual(['runner','scorer']);
    expect(result.unresolved).toEqual([]);
    expect(result.installedBytes).toBeGreaterThan(0);
    const combined=dependencyFootprint(['runner','alias'],root);
    expect(combined.packageCount).toBe(2);
    expect(combined.installedBytes).toBe(result.installedBytes);
  } finally {await rm(root,{recursive:true,force:true});}
});

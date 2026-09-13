// Measurement only: installed dependency closures overlap; do not sum them as
// incremental download cost. Excludes dev dependencies and nested node_modules.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

function locate(name, from) {
  const req = createRequire(join(from, '__eval_measurement__.cjs'));
  // Count installed folders even when exports expose only types or an npm alias
  // uses a different manifest name. No dependency code is executed.
  for (const modules of req.resolve.paths(name) ?? []) {
    const folder = join(modules,name);
    if (existsSync(join(folder,'package.json'))) {
      const path = realpathSync(folder);
      return {path,pkg:JSON.parse(readFileSync(join(path,'package.json'),'utf8'))};
    }
  }
  let entry;
  try { entry = req.resolve(`${name}/package.json`); }
  catch { entry = req.resolve(name); }
  let path = dirname(realpathSync(entry));
  while (true) {
    const manifest = join(path,'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest,'utf8'));
      if (pkg.name === name) return {path,pkg};
    }
    const next = dirname(path);
    if (next === path) throw Error(`Cannot locate package manifest for ${name}`);
    path = next;
  }
}
function bytes(path) {
  let count = 0;
  for (const entry of readdirSync(path, {withFileTypes:true})) {
    if (entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
    const child = join(path,entry.name);
    count += entry.isDirectory() ? bytes(child) : entry.isFile() ? lstatSync(child).size : 0;
  }
  return count;
}
export function dependencyFootprint(name, from = process.cwd()) {
  const visited = new Set(), packages = [], unresolved = new Set();
  function visit(name, from, optional = false) {
    let found;
    try { found = locate(name,from); }
    catch { unresolved.add(`${optional?'optional-or-peer':'required'}:${name}`); return; }
    const {path,pkg} = found;
    if (visited.has(path)) return;
    visited.add(path);
    packages.push({name:pkg.name,version:pkg.version,bytes:bytes(path)});
    for (const child of Object.keys(pkg.dependencies ?? {})) visit(child,path);
    for (const child of Object.keys({...pkg.optionalDependencies,...pkg.peerDependencies})) visit(child,path,true);
  }
  const roots = Array.isArray(name) ? name : [name];
  for (const root of roots) visit(root,from);
  return {root:roots.join(' + '), packageCount:packages.length, installedBytes:packages.reduce((n,p)=>n+p.bytes,0),
    packages:packages.sort((a,b)=>a.name.localeCompare(b.name)), unresolved:[...unresolved].sort(),
    method:'Resolved installed dependency/optional/peer closure; unique real package folders, regular-file bytes; excludes nested node_modules and symlinks. Closures overlap. Not download or incremental disk cost.'};
}

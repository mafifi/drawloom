// Read-only tracked-file inventory; counts physical lines, not executable LOC.
// Usage: node inventory.mjs /checkout [second-checkout]
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

function category(path) {
  if (/(^|\/)(vendor|third_party|third-party|vendored)(\/|$)/i.test(path)) return 'vendor';
  if (/(^|\/)(generated|__generated__|dist|build)(\/|$)|\.generated\.|worker-configuration\.d\.ts$/.test(path)) return 'generated';
  if (/(^|\/)(fixtures|__fixtures__|__snapshots__|snapshots)(\/|$)|\.snap$/.test(path)) return 'fixtures-snapshots';
  if (/(^|\/)(test|tests|__tests__|e2e)(\/|$)|\.(test|spec)\./.test(path)) return 'tests';
  if (/^(design-systems|design-templates)\//.test(path)) return 'design-reference-catalogs';
  if (/(^|\/)(locales|i18n|translations)(\/|$)|\.i18n\.yaml$/.test(path)) return 'localisation';
  if (/lock(\.json|\.yaml)?$|(^|\/)Cargo\.lock$/.test(path)) return 'lockfiles';
  if (/\.(md|mdx|rst|txt)$/.test(path) || /(^|\/)(LICENSE|NOTICE|COPYING)/.test(path)) return 'documentation';
  if (/\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue|py|rs|go|c|cpp|h|swift|sh|css|scss|html)$/.test(path)) return 'implementation-scripts-styles';
  return 'configuration-data-other';
}

for (const root of process.argv.slice(2)) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).trim();
  const paths = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).split('\0').filter(Boolean);
  const categories = {}, areas = {}, extensions = {}, packages = [];
  let binaryFiles = 0, binaryBytes = 0, symlinks = 0;
  for (const path of paths) {
    const full = join(root, path);
    if (lstatSync(full).isSymbolicLink()) { symlinks++; continue; }
    const bytes = readFileSync(full);
    if (bytes.includes(0)) { binaryFiles++; binaryBytes += bytes.length; continue; }
    const text = bytes.toString('utf8');
    const lines = text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
    const area = path.split('/').slice(0, path.startsWith('packages/') ? 2 : path.startsWith('apps/') ? 2 : 1).join('/');
    for (const [table, key] of [[categories, category(path)], [areas, area], [extensions, extname(path) || '(none)']]) {
      table[key] ??= { files: 0, lines: 0, bytes: 0 };
      table[key].files++; table[key].lines += lines; table[key].bytes += bytes.length;
    }
    if (path.endsWith('/package.json') || path === 'package.json') {
      try { const p = JSON.parse(text); if (p.name) packages.push({ path, name: p.name, description: p.description ?? '', private: p.private === true }); } catch {}
    }
  }
  console.log(JSON.stringify({ repository: basename(root), revision: git('rev-parse', 'HEAD'), origin: git('remote', 'get-url', 'origin'), trackedFiles: paths.length,
    binaryFiles, binaryBytes, symlinks, categories, areas, extensions, packages,
    methodology: 'Tracked working-tree files at recorded clean revision. Physical lines including comments/blanks. Exclusive path/extension classification, precedence in inventory.mjs. Binary means contains NUL; embedded/minified/generated files without markers can remain in implementation. Not executable LOC or a maturity measure.' }, null, 2));
}

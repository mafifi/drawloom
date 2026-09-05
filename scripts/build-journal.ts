import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const root = resolve(import.meta.dir, '..');
const output = resolve(Bun.env.JOURNAL_OUT_DIR || `${root}/publishing/site/dist`);
// Preview is an explicit command flag. An inherited preview environment cannot
// accidentally turn the default build into a draft publication.
const preview = Bun.argv.includes('--drafts');
const child = Bun.spawn(['bun', 'x', '--no-install', 'astro', 'build'], {
  cwd: `${root}/publishing/site`, env: {...Bun.env, JOURNAL_DRAFTS: preview ? '1' : '0', JOURNAL_OUT_DIR: output},
  stdout: 'inherit', stderr: 'inherit',
});
const status = await child.exited;
if (status !== 0) process.exit(status);
// Stage only media actually referenced by emitted HTML, after Astro has cleaned
// its output. Draft render output never lives in Astro's public directory.
const generated = resolve(Bun.env.JOURNAL_MEDIA_DIR || `${root}/publishing/.generated/media`);
for (const file of readdirSync(output, {recursive: true}).map(String).filter((file) => file.endsWith('.html'))) {
  const html = readFileSync(resolve(output, file), 'utf8');
  for (const match of html.matchAll(/(?:src|poster)="\/drawloom\/media\/([a-z0-9-]+\/[^"/]+)"/g)) {
    const relative = match[1]!;
    if (!/^[a-z0-9-]+\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(mp4|png|webp|jpg)$/.test(relative)) throw new Error(`Invalid media reference: ${relative}`);
    const destination = resolve(output, 'media', relative);
    mkdirSync(dirname(destination), {recursive: true});
    const [piece, name] = relative.split('/') as [string, string];
    const sourceAsset = resolve(root, 'publishing', piece, 'assets', name);
    copyFileSync(existsSync(sourceAsset) ? sourceAsset : resolve(generated, relative), destination);
  }
}

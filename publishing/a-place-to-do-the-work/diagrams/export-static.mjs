// Extract only the authored vector and its semantic styles from a successful
// Archify delivery. No viewer script, browser state or network access is used.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const generated = resolve(here, '../../.generated/archify-journal');
const output = resolve(here, '../../site/public/artwork/why-drawloom');
mkdirSync(output, {recursive: true});
const receipts = JSON.parse(readFileSync(resolve(generated, 'receipts.json'), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const provenance = [];
const themeSource = readFileSync(resolve(here, 'journal-theme.css'), 'utf8');
const journal = readFileSync(resolve(here, '../../site/src/styles/journal.css'), 'utf8');
const palette = Object.fromEntries(['paper', 'ink', 'green', 'muted', 'rule'].map((key) => [key, journal.match(new RegExp(`--${key}:\\s*(#[a-fA-F0-9]{6});`))[1]]));
for (const name of ['drawloom', 'stack-2024', 'stack-2025', 'stack-2026']) {
  const html = readFileSync(resolve(generated, `${name}.html`), 'utf8');
  const source = readFileSync(resolve(here, `${name}.architecture.json`), 'utf8');
  const receipt = receipts.find((item) => item.name === name && item.command === 'deliver');
  if (!receipt?.ok || receipt.validation?.checksPassed !== 9 || receipt.validation?.errors !== 0 || receipt.validation?.warnings !== 0 || receipt.artifact?.sha256 !== sha(html) || receipt.specification?.sha256 !== sha(source)) {
    throw new Error(`Revalidate and deliver ${name} before exporting`);
  }
  const vector = html.match(/<svg\s+viewBox="[^"]+"[\s\S]*?<\/svg>/)?.[0];
  const stylesheet = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!vector || !stylesheet || /<(script|foreignObject|image)\b|\bon\w+=|\bhref=/i.test(vector)) throw new Error(`Unexpected SVG content: ${name}`);
  // These four sources use only simple semantic classes. Keep the original
  // rules verbatim, including role stamps; omit all interactive viewer styling.
  const css = [...stylesheet.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => /^\s*(\.[catm]-[\w-]+|svg \.(semantic-sigil|s-[\w-]+))\s*(>|\.|\{|$)/.test(selector.trim() + '{'))
    .map(([, selector, body]) => `${selector.trim()} {${body}}`).join('\n');
  const theme = stylesheet.slice(stylesheet.indexOf('[data-theme="light"][data-preset]'));
  if (!theme.startsWith('[data-theme="light"][data-preset]')) throw new Error('Missing journal theme');
  const viewBox = vector.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  let svg = vector.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" data-theme="light" width="${viewBox[2] * 2}" height="${viewBox[3] * 2}" `)
    .replace(/\s(?:tabindex|aria-pressed)="[^"]*"|\srole="button"|\saria-label="Focus[^"]*"/g, '');
  svg = svg.replace(/(<svg[^>]+>)/, `$1\n<style>svg {font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;}\n${css}\n${theme}</style>\n<rect width="100%" height="100%" fill="var(--bg)"/>`);
  writeFileSync(resolve(output, `${name}.svg`), svg + '\n');
  provenance.push({name, specification: sha(source), theme: sha(themeSource), palette, deliveredHtml: sha(html), svg: sha(svg + '\n')});
}
writeFileSync(resolve(output, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

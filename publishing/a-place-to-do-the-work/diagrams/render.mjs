// One-off editorial renderer. Requires an existing Archify skill directory;
// it neither downloads a tool nor changes the supplied installation.
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const archify = process.argv[2];
if (!archify) throw new Error('Usage: node render.mjs <existing Archify skill directory> [--visual-check]');
const output = resolve(here, '../../.generated/archify-journal');
mkdirSync(output, {recursive: true});
const toolCopy = mkdtempSync(join(output, 'renderer-'));
try {
  cpSync(resolve(archify), toolCopy, {recursive: true});
  const journal = readFileSync(resolve(here, '../../site/src/styles/journal.css'), 'utf8');
  const theme = readFileSync(join(here, 'journal-theme.css'), 'utf8').replace(/__(paper|ink|muted|rule|green)__/g, (_, token) => {
    const value = journal.match(new RegExp(`--${token}:\\s*(#[a-fA-F0-9]{6});`))?.[1];
    if (!value) throw new Error(`Missing journal colour: ${token}`);
    return value;
  });
  const templatePath = join(toolCopy, 'assets/template.html');
  const template = readFileSync(templatePath, 'utf8');
  if (!template.includes('</style>')) throw new Error('Archify template has no stylesheet');
  writeFileSync(templatePath, template.replace('</style>', `${theme}\n</style>`));
  const receipts = [];
  for (const name of ['drawloom', 'stack-2024', 'stack-2025', 'stack-2026']) {
    const source = join(here, `${name}.architecture.json`);
    const html = join(output, `${name}.html`);
    const commands = [
      ['validate', 'architecture', source, '--quality', 'showcase', '--json'],
      ['deliver', 'architecture', source, html, '--quality', 'showcase', '--json'],
      ...(process.argv.includes('--visual-check') ? [['visual-check', html, '--json']] : []),
    ];
    for (const args of commands) {
      const result = spawnSync(process.execPath, [join(toolCopy, 'bin/archify.mjs'), ...args], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
      if (result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
      const receipt = JSON.parse(result.stdout);
      receipts.push({name, ...receipt});
      console.log(`${name}: ${args[0]} passed`);
    }
  }
  writeFileSync(join(output, 'receipts.json'), JSON.stringify(receipts, null, 2));
} finally {
  // Only the unique disposable copy created by this invocation is removed.
  rmSync(toolCopy, {recursive: true, force: true});
}

import {expect, test} from 'bun:test';
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stagePlaceholder} from './stage-publishing-placeholder';

const site = fileURLToPath(new URL('../publishing/site/', import.meta.url));

test('the retained fallback artifact contains only the coming-soon page, not the retired proof', () => {
  expect(existsSync(`${site}index.html`)).toBe(true);
  const artifact = mkdtempSync(join(tmpdir(), 'drawloom-placeholder-'));
  try {
    stagePlaceholder(artifact);
    expect(readdirSync(artifact, {recursive: true})).toEqual(['index.html']);
    expect(readFileSync(`${artifact}/index.html`)).toEqual(readFileSync(`${site}index.html`));
  } finally { rmSync(artifact, {recursive: true, force: true}); }
  const html = readFileSync(`${site}index.html`, 'utf8');
  expect(html).toMatch(/<h1>Coming soon\.<\/h1>/);
  expect(html).toContain('https://github.com/mafifi/drawloom');
  expect(html).not.toMatch(/<video|<script|<article|workbench\.mp4|Publishing proof/);
});

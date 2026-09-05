import {expect, test} from 'bun:test';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const site = fileURLToPath(new URL('../publishing/site/', import.meta.url));

test('the public artifact contains only the coming-soon page, not the retired proof', () => {
  expect(existsSync(`${site}index.html`)).toBe(true);
  expect(readdirSync(site, {recursive: true})).toEqual(['index.html']);
  const html = readFileSync(`${site}index.html`, 'utf8');
  expect(html).toMatch(/<h1>Coming soon\.<\/h1>/);
  expect(html).toContain('https://github.com/mafifi/drawloom');
  expect(html).not.toMatch(/<video|<script|<article|workbench\.mp4|Publishing proof/);
});

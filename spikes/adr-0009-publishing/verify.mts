import assert from 'node:assert/strict';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const output = fileURLToPath(new URL('./dist/', import.meta.url));
assert.ok(existsSync(`${output}index.html`), 'Publishing build must produce a readable article');
const html = readFileSync(`${output}index.html`, 'utf8');
assert.match(html, /<h1[ >]/, 'Article must have a semantic title');
assert.match(html, /Publishing proof/, 'Public example must be explicitly labelled');
assert.match(html, /name="robots" content="noindex/);
assert.match(html, /<video[^>]*controls/);
assert.doesNotMatch(html, /<video[^>]*autoplay/);
assert.match(html, /id="transcript"/);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Anchor and accessibility targets must be unique');
assert.doesNotMatch(html, /<script[ >]/, 'Article must not require client JavaScript');
const media = [...html.matchAll(/(?:src|poster)="([^"]+)"/g)].map((match) => match[1]!);
assert.ok(media.length >= 2, 'Both video and poster must be embedded');
for (const url of media) {
  assert.ok(url.startsWith('/drawloom/'), `Asset must respect Pages base path: ${url}`);
  assert.ok(statSync(`${output}${url.slice('/drawloom/'.length)}`).size > 0);
}
const video = readFileSync(`${output}media/workbench.mp4`);
assert.equal(video.toString('ascii', 4, 8), 'ftyp', 'Must be a real MP4');
assert.ok(video.length < 10_000_000, 'Keep this short proof below 10 MB');
console.log(`Publishing proof: HTML, fallback, transcript, base paths and MP4 verified (${video.length} bytes)`);

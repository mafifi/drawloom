// Read-only verification of this survey, not execution of upstream repositories.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const generated = resolve(root, '../generated/evaluation-survey');
const development = process.env.DRAWLOOM_SURVEY_CHECKOUTS || '/Users/afifim/Development';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (directory, ...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const repositories = new Map();
let diagramCount = 0;
let sourceCount = 0;
let localLinks = 0;
const checkedSources = new Set();

for (const filename of readdirSync(root).filter(name => name.endsWith('.architecture.json'))) {
  const name = filename.replace('.architecture.json', '');
  const source = readFileSync(resolve(root, filename));
  const specification = JSON.parse(source);
  const delivery = JSON.parse(readFileSync(resolve(root, `${name}.delivery.json`)));
  const artifact = readFileSync(resolve(generated, `${name}.html`));
  const browser = JSON.parse(readFileSync(resolve(generated, `${name}.visual-check.json`)));
  assert.equal(delivery.ok, true, name);
  assert.equal(delivery.specification.sha256, sha256(source), `${name}: specification hash`);
  assert.equal(delivery.artifact.sha256, sha256(artifact), `${name}: artifact hash`);
  assert.equal(delivery.artifact.bytes, artifact.byteLength, `${name}: artifact bytes`);
  assert.equal(delivery.validation.checksPassed, 9, name);
  assert.equal(delivery.validation.errors, 0, name);
  assert.equal(delivery.validation.warnings, 0, name);
  assert.equal(browser.status, 'pass', name);
  assert.equal(browser.artifact.sha256, sha256(artifact), `${name}: browser binding`);
  assert.equal(browser.visualReview, 'pending', 'Automated evidence must not claim human review');
  const sizes = browser.containment.viewports.map(v => `${v.width}x${v.height}`);
  for (const size of ['1440x900', '1600x1000', '1920x1080', '2048x1320']) assert(sizes.includes(size), `${name}: ${size}`);
  for (const viewport of browser.containment.viewports) {
    assert(viewport.scrollWidth <= viewport.innerWidth && viewport.scrollHeight <= viewport.innerHeight, name);
  }
  if (specification.meta.repository) {
    const repository = specification.meta.repository;
    const checkout = resolve(development, name);
    assert.equal(git(checkout, 'remote', 'get-url', 'origin').replace(/\.git$/, ''), repository.url);
    // Source evidence stays valid after a later checkout update if the commit is retained.
    assert.equal(git(checkout, 'cat-file', '-t', repository.revision), 'commit');
    repositories.set(repository.url, checkout);
    for (const component of specification.components) {
      assert(component.sources?.length, `${name}: missing component source`);
      for (const source of component.sources) {
        assert.equal(git(checkout, 'cat-file', '-t', `${repository.revision}:${source.path}`), 'blob');
        sourceCount++;
      }
    }
  }
  diagramCount++;
}

repositories.set('https://github.com/nexu-io/open-design', resolve(development, 'open-design'));
for (const filename of readdirSync(root).filter(name => name.endsWith('.md'))) {
  const content = readFileSync(resolve(root, filename), 'utf8');
  for (const match of content.matchAll(/https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([a-f0-9]{40})\/([^\s)#]+)/g)) {
    const [, repo, revision, path] = match;
    const key = `${repo}@${revision}:${path}`;
    if (checkedSources.has(key)) continue;
    const checkout = repositories.get(`https://github.com/${repo}`);
    assert(checkout, `${filename}: unregistered repository ${repo}`);
    assert.equal(git(checkout, 'cat-file', '-t', `${revision}:${path}`), 'blob', key);
    checkedSources.add(key);
  }
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|#)/.test(target)) continue;
    const path = target.split('#')[0];
    assert(existsSync(resolve(root, path)), `${filename}: broken relative link ${target}`);
    localLinks++;
  }
}

console.log(JSON.stringify({ diagrams: diagramCount, componentSources: sourceCount,
  pinnedSourceLinks: checkedSources.size, localLinks, status: 'pass',
  scope: 'Artifact identity, bounded browser receipts and source/link existence; not upstream behavior or performance.' }, null, 2));

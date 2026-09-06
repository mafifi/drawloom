import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {articleMetadata} from '../publishing/site/src/article-metadata';

test('article metadata defaults to private and validates publication and media boundaries', () => {
  const article = {title: 'Title', description: 'Description'};
  expect(articleMetadata.parse(article).draft).toBe(true);
  expect(articleMetadata.safeParse({...article, draft: false}).success).toBe(false);
  expect(articleMetadata.safeParse({...article, draft: false, published: '2026-09-05'}).success).toBe(true);
  expect(articleMetadata.safeParse({...article, media: {video: '../private.mp4', poster: 'still.png'}}).success).toBe(false);
  expect(articleMetadata.safeParse({...article, media: {video: 'clip.mp4'}}).success).toBe(false);
});

test('Archify source keeps the workbench outside all eleven Drawloom capabilities', () => {
  const diagram = JSON.parse(readFileSync('publishing/a-place-to-do-the-work/diagrams/drawloom.architecture.json', 'utf8')) as {
    components: {id: string}[];
    boundaries: {wraps: string[]}[];
    connections: {from: string; to: string}[];
  };
  expect(diagram.components).toHaveLength(12);
  expect([...diagram.boundaries[0]!.wraps].sort()).toEqual([
    'orchestration', 'memory', 'knowledge', 'context', 'agent', 'inference',
    'policy', 'tools', 'sandbox', 'observability', 'evaluation',
  ].sort());
  expect(diagram.boundaries[0]!.wraps).not.toContain('product');
  const connections = diagram.connections.map(({from, to}) => `${from}:${to}`);
  for (const edge of ['context:agent', 'agent:policy', 'policy:tools', 'tools:sandbox']) expect(connections).toContain(edge);
  expect(connections).not.toContain('agent:inference');
  const theme = readFileSync('publishing/a-place-to-do-the-work/diagrams/journal-theme.css', 'utf8');
  for (const token of ['paper', 'ink', 'muted', 'rule', 'green']) expect(theme).toContain(`__${token}__`);
  expect(theme).toContain('.c-region { fill: transparent; }');
});

test('selected Archify artwork matches its source and contains no viewer runtime', () => {
  const base = 'publishing/site/public/artwork/why-drawloom';
  const sources = 'publishing/a-place-to-do-the-work/diagrams';
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const journal = readFileSync('publishing/site/src/styles/journal.css', 'utf8');
  const receipts = JSON.parse(readFileSync(`${base}/provenance.json`, 'utf8')) as {name: string; specification: string; theme: string; palette: Record<string, string>; svg: string}[];
  expect(receipts.map(({name}) => name)).toEqual(['drawloom', 'stack-2024', 'stack-2025', 'stack-2026']);
  for (const receipt of receipts) {
    const svg = readFileSync(`${base}/${receipt.name}.svg`, 'utf8');
    expect(sha(svg)).toBe(receipt.svg);
    expect(sha(readFileSync(`${sources}/${receipt.name}.architecture.json`, 'utf8'))).toBe(receipt.specification);
    expect(sha(readFileSync(`${sources}/journal-theme.css`, 'utf8'))).toBe(receipt.theme);
    for (const [key, value] of Object.entries(receipt.palette)) expect(journal).toContain(`--${key}: ${value};`);
    expect(svg).toContain('data-theme="light"');
    expect(svg).not.toMatch(/<(script|foreignObject|image)\b|\bon\w+=|\bhref=|@import|role="button"/i);
  }
});

test('production excludes draft routes and media; explicit preview renders accessible static articles', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'drawloom-journal-test-'));
  try {
    const media = join(temporary, 'rendered');
    mkdirSync(join(media, 'workbench-example'), {recursive: true});
    // These are copy-boundary fixtures. Actual playback is verified separately
    // against journal:render output, without a Chromium render in every test run.
    writeFileSync(join(media, 'workbench-example/workbench.mp4'), 'test-video');
    writeFileSync(join(media, 'workbench-example/workbench.png'), 'test-poster');
    mkdirSync(join(media, 'a-place-to-do-the-work'), {recursive: true});
    writeFileSync(join(media, 'a-place-to-do-the-work/episode-steps.mp4'), 'test-video');
    writeFileSync(join(media, 'a-place-to-do-the-work/episode-steps.png'), 'test-poster');
    for (const name of ['02-public-episode-opening.png', '03-programme-raw.png', '09-legacy-public-reconstruction.png', '10-legacy-admin-reconstruction.png', '11-current-public-homepage.png']) {
      writeFileSync(join(media, `a-place-to-do-the-work/${name}`), 'test-screenshot');
    }
    for (const preview of [false, true]) {
      const output = join(temporary, preview ? 'preview' : 'production');
      const process = Bun.spawn(['bun', 'run', 'scripts/build-journal.ts', ...(preview ? ['--drafts'] : [])], {
        env: {...Bun.env, JOURNAL_OUT_DIR: output, JOURNAL_MEDIA_DIR: media, JOURNAL_DRAFTS: '1'}, stdout: 'pipe', stderr: 'pipe',
      });
      const [stdout, stderr, status] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
      expect(status, stdout + stderr).toBe(0);
      const files = readdirSync(output, {recursive: true}).map(String);
      const home = readFileSync(join(output, 'index.html'), 'utf8');
      if (!preview) {
        expect(home).not.toContain('workbench-example');
        expect(files.some((file) => file.includes('workbench-example'))).toBe(false);
        expect(home).toContain('a-place-to-do-the-work');
        const published = readFileSync(join(output, 'articles/a-place-to-do-the-work/index.html'), 'utf8');
        expect(published).toContain('<h1>Why Drawloom?</h1>');
        expect(published).not.toContain('noindex');
        expect(published).not.toContain('Draft · local preview');
        expect(published).toContain('2026-09-05');
        expect(files).toContain('media/a-place-to-do-the-work/episode-steps.mp4');
        expect(files).toContain('media/a-place-to-do-the-work/03-programme-raw.png');
        expect(files.some((file) => file.includes('notes.md') || file.includes('reference.png'))).toBe(false);
      } else {
        expect(home).toContain('Illustrative example');
        const article = readFileSync(join(output, 'articles/workbench-example/index.html'), 'utf8');
        expect(article).toContain('Read transcript');
        expect(article).toContain('noindex');
        expect(article).toContain('/drawloom/media/workbench-example/workbench.mp4');
        expect(article).not.toMatch(/\bautoplay\b|<script[^>]+react/i);
        expect(files).toContain('media/workbench-example/workbench.mp4');
        const draft = readFileSync(join(output, 'articles/a-place-to-do-the-work/index.html'), 'utf8');
        expect(draft).not.toContain('Draft · local preview');
        expect(draft).not.toContain('noindex');
        expect(draft).toContain('id="transcript"');
        expect(draft).toContain('<h1>Why Drawloom?</h1>');
        expect(draft.match(/class="architecture-figure"/g)).toHaveLength(3);
        for (const name of ['drawloom', 'stack-2024', 'stack-2025', 'stack-2026']) {
          expect(files).toContain(`artwork/why-drawloom/${name}.svg`);
          expect(draft).toContain(`/drawloom/artwork/why-drawloom/${name}.svg`);
        }
        expect(draft).toContain('Read the diagram');
        expect(draft).toContain('id="drawloom-map-caption"');
        const capabilityNames = ['memory', 'knowledge', 'context-compilation', 'orchestration', 'agent-execution', 'model-inference', 'policy-and-approval', 'tools', 'sandbox', 'observability', 'evaluation'];
        for (const capability of capabilityNames) {
          expect(draft.match(new RegExp(`data-capability="${capability}"`, 'g'))).toHaveLength(1);
        }
        expect(draft).toContain('the provider keeps its inner agent loop');
        expect(draft).not.toContain('11-current-public-homepage.png');
        expect(draft.match(/<video\b/g)).toHaveLength(1);
        expect(draft.indexOf('<video')).toBeLessThan(draft.indexOf('id="the-light-bulb-moment"'));
        expect(files).toContain('media/a-place-to-do-the-work/02-public-episode-opening.png');
        expect(files).toContain('media/a-place-to-do-the-work/03-programme-raw.png');
        expect(files).toContain('media/a-place-to-do-the-work/09-legacy-public-reconstruction.png');
        expect(files).toContain('media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png');
        expect(files).toContain('media/a-place-to-do-the-work/12-operator-annual-plan.jpg');
        expect(files).toContain('media/a-place-to-do-the-work/13-operator-story-workspace.jpg');
        expect(draft.indexOf('12-operator-annual-plan.jpg')).toBeGreaterThan(draft.indexOf('what I mean by a'));
        expect(draft.indexOf('12-operator-annual-plan.jpg')).toBeLessThan(draft.indexOf('id="a-better-place-to-make-an-episode"'));
        expect(files).not.toContain('media/a-place-to-do-the-work/11-current-public-homepage.png');
        expect(files).toContain('media/a-place-to-do-the-work/episode-steps.mp4');
      }
    }
  } finally { rmSync(temporary, {recursive: true, force: true}); }
}, 120_000);

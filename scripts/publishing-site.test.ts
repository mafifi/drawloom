import {expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {articleMetadata} from '../publishing/site/src/article-metadata';

test('article metadata defaults to private and validates publication and media boundaries', () => {
  const article = {title: 'Title', description: 'Description'};
  expect(articleMetadata.parse(article).draft).toBe(true);
  expect(articleMetadata.safeParse({...article, draft: false}).success).toBe(false);
  expect(articleMetadata.safeParse({...article, draft: false, published: '2026-09-05'}).success).toBe(true);
  expect(articleMetadata.safeParse({...article, media: {video: '../private.mp4', poster: 'still.png'}}).success).toBe(false);
  expect(articleMetadata.safeParse({...article, media: {video: 'clip.mp4'}}).success).toBe(false);
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
        expect(draft.match(/<svg\b/g)).toHaveLength(4);
        expect(draft).toContain('id="drawloom-map-desc"');
        expect(draft.match(/<video\b/g)).toHaveLength(1);
        expect(draft.indexOf('<video')).toBeLessThan(draft.indexOf('id="the-light-bulb-moment"'));
        expect(files).toContain('media/a-place-to-do-the-work/02-public-episode-opening.png');
        expect(files).toContain('media/a-place-to-do-the-work/03-programme-raw.png');
        expect(files).toContain('media/a-place-to-do-the-work/09-legacy-public-reconstruction.png');
        expect(files).toContain('media/a-place-to-do-the-work/10-legacy-admin-reconstruction.png');
        expect(files).toContain('media/a-place-to-do-the-work/11-current-public-homepage.png');
        expect(files).toContain('media/a-place-to-do-the-work/episode-steps.mp4');
      }
    }
  } finally { rmSync(temporary, {recursive: true, force: true}); }
}, 120_000);

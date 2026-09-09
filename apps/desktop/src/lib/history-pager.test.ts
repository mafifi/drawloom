import { test, expect } from 'bun:test';
import { createHistoryPager } from './history-pager.js';
const entry = (i: number) => ({ id: String(i), position: [i, 0], role: 'assistant', text: String(i), assets: [], state: 'complete' });
const page = (start: number, end: number) => ({ entries: Array.from({ length: end - start }, (_, i) => entry(start + i)), olderCursor: String(start), hasOlder: start > 0, changeCursor: 'r1', status: { revision: 1, sync: 'idle', hasOlder: false } });

test('history pagination bounds the rendered window and ignores a late conversation read', async () => {
  let finish!: (r: Response) => void;
  const urls: string[] = [];
  const pager = createHistoryPager(async url => {
    urls.push(url);
    if (url.includes('conversationId=a')) return new Promise<Response>(resolve => { finish = resolve; });
    return Response.json(page(url.includes('before=') ? 9500 : 9950, url.includes('before=') ? 9700 : 10000));
  });
  const a = pager.open('a');
  await pager.open('b');
  finish(Response.json(page(0, 1))); await a;
  expect(pager.value.entries[0]?.id).toBe('9950');
  await pager.earlier();
  expect(pager.value.entries.length).toBeLessThanOrEqual(200);
  expect(pager.value.atLatest).toBe(false);
  expect(urls.at(-1)).toContain('before=9950');
});

test('unchanged changes have no body and stable edits replace rather than duplicate', async () => {
  let count = 0;
  const pager = createHistoryPager(async url => {
    if (!url.includes('/changes')) return Response.json(page(0, 50));
    if (++count === 1) return new Response(null, { status: 204 });
    return Response.json({ entries: [{ ...entry(3), text: 'edited' }], cursor: 'r2', hasMore: false, status: { revision: 2, sync: 'idle', hasOlder: false } });
  });
  await pager.open('a'); await pager.poll(); await pager.poll();
  expect(pager.value.entries.length).toBe(50);
  expect(pager.value.entries.find(e => e.id === '3')?.text).toBe('edited');
});

test('a stalled changes request cannot block the newly selected conversation', async () => {
  let pollsB = 0, release!: (response: Response) => void;
  const pager = createHistoryPager(async url => {
    if (!url.includes('/changes')) return Response.json(page(0, 1));
    if (url.includes('conversationId=a')) return new Promise<Response>(resolve => { release = resolve; });
    pollsB++; return new Response(null, { status: 204 });
  });
  await pager.open('a'); const old = pager.poll();
  await pager.open('b'); await pager.poll();
  expect(pollsB).toBe(1);
  release(new Response(null, { status: 204 })); await old;
});

test('normal earlier navigation keeps its historical window while new messages arrive', async () => {
  const pager = createHistoryPager(async url => Response.json(url.includes('/changes')
    ? { entries: [entry(150)], cursor: 'r2', hasMore: false, status: { revision: 2, sync: 'idle', hasOlder: false } }
    : page(url.includes('before=') ? 50 : 100, url.includes('before=') ? 100 : 150)));
  await pager.open('a'); await pager.earlier(); await pager.poll();
  expect(pager.value.atLatest).toBe(false);
  expect(pager.value.entries).toHaveLength(100);
  expect(pager.value.entries.at(-1)?.id).toBe('149');
});

test('background bootstrap reveals older history and obtains a usable page boundary', async () => {
  let reads = 0;
  const pager = createHistoryPager(async url => {
    if (url.includes('/changes')) return Response.json({ entries: [entry(99)], cursor: 'r2', hasMore: false, status: { revision: 2, sync: 'idle', hasOlder: true } });
    reads++; return Response.json(reads === 1 ? page(0, 0) : page(50, 100));
  });
  await pager.open('a'); await pager.poll();
  expect(pager.value.hasOlder).toBe(true);
  expect(reads).toBe(2);
});

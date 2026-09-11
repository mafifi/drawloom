import { expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopAssets } from './assets.js';

test('streamed desktop assets retain content identity without buffering the input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-stream-assets-'));
  try {
    const assets = createDesktopAssets(root) as ReturnType<typeof createDesktopAssets> & {
      putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<{ key: string; size: number }>;
    };
    async function* input() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }
    const first = await assets.putStream(input(), 'image/png');
    const second = await assets.putStream(input(), 'image/png');
    expect(second).toEqual(first);
    expect(first.size).toBe(3);
    expect(await assets.read(first.key)).toEqual(new Uint8Array([1, 2, 3]));
    expect((await readdir(root)).filter(name => name.startsWith('.drawloom-'))).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelled streamed desktop assets leave no publishable or temporary file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-cancel-assets-'));
  try {
    const assets = createDesktopAssets(root) as ReturnType<typeof createDesktopAssets> & {
      putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string, options?: { signal?: AbortSignal }): Promise<unknown>;
    };
    await writeFile(join(root, '.drawloom-preserve'), 'owned elsewhere');
    const controller = new AbortController();
    async function* input() {
      yield new Uint8Array([1]);
      controller.abort();
      yield new Uint8Array([2]);
    }
    await expect(assets.putStream(input(), 'image/png', { signal: controller.signal })).rejects.toThrow();
    expect(await readdir(root)).toEqual(['.drawloom-preserve']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('streamed desktop assets enforce the managed byte ceiling on actual chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-bounded-assets-'));
  try {
    const assets = createDesktopAssets(root) as ReturnType<typeof createDesktopAssets> & {
      putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<unknown>;
    };
    const block = new Uint8Array(64 * 1024);
    async function* oversized() {
      for (let index = 0; index <= 4096; index++) yield block;
      yield new Uint8Array([1]);
    }
    await expect(assets.putStream(oversized(), 'video/mp4')).rejects.toThrow('Unsupported or oversized file');
    expect(await readdir(root)).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

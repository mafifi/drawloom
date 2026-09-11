import { createNodeAssetStore } from '@drawloom/node-host';
import { AssetSchema, type Asset } from '@drawloom/host';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain', 'text/markdown']);
export const browserImportTypes: ReadonlySet<string> = supported;
export const browserImportByteLimit = 256 * 1024 * 1024;
export const nativeRpcMessageByteLimit = 32 * 1024 * 1024;
const nativeImageByteLimit = 16 * 1024 * 1024;
const managedAssetByteLimit = 256 * 1024 * 1024;
export function createDesktopAssets(root: string) {
  const store = createNodeAssetStore(root);
  async function putStream(
    chunks: AsyncIterable<Uint8Array>,
    mediaType: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Asset> {
    if (!supported.has(mediaType) && mediaType !== 'video/quicktime')
      throw Error('Unsupported or oversized file');
    const base = resolve(root);
    await mkdir(base, { recursive: true });
    const rootInfo = await lstat(base);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw Error('Asset storage unavailable');
    const canonical = await realpath(base);
    const temporary = join(canonical, '.drawloom-upload-' + randomUUID());
    let file: Awaited<ReturnType<typeof open>> | undefined;
    let created = false;
    try {
      if (options.signal?.aborted) throw Error('Asset upload cancelled');
      file = await open(temporary, 'wx', 0o600);
      created = true;
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of chunks) {
        if (options.signal?.aborted) throw Error('Asset upload cancelled');
        if (!(chunk instanceof Uint8Array) || chunk.byteLength > managedAssetByteLimit - size)
          throw Error('Unsupported or oversized file');
        size += chunk.byteLength;
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.byteLength) {
          if (options.signal?.aborted) throw Error('Asset upload cancelled');
          const length = Math.min(64 * 1024, chunk.byteLength - offset);
          const { bytesWritten } = await file.write(chunk, offset, length, null);
          if (bytesWritten === 0) throw Error('Asset storage unavailable');
          offset += bytesWritten;
        }
      }
      if (options.signal?.aborted) throw Error('Asset upload cancelled');
      if (size === 0) throw Error('Unsupported or oversized file');
      await file.sync();
      await file.close();
      file = undefined;
      if (options.signal?.aborted) throw Error('Asset upload cancelled');
      const key = hash.digest('hex');
      const target = join(canonical, key);
      try {
        await link(temporary, target);
        const directory = await open(canonical, constants.O_RDONLY);
        try { await directory.sync(); } finally { await directory.close(); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await store.open(key);
        try {
          if (existing.size !== size) throw Error('Asset storage unavailable');
          const existingHash = createHash('sha256');
          for await (const chunk of existing.stream()) existingHash.update(chunk);
          if (existingHash.digest('hex') !== key) throw Error('Asset storage unavailable');
        } finally {
          await existing.close();
        }
      }
      return AssetSchema.parse({ key, mediaType, size });
    } finally {
      if (file) await file.close().catch(() => {});
      if (created) {
        try { await unlink(temporary); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
  async function put(bytes: Uint8Array, mediaType: string): Promise<Asset> {
    async function* input() { yield bytes; }
    return putStream(input(), mediaType);
  }
  return {
    put,
    putStream,
    open: store.open,
    read: store.read,
    async imageInput(asset: Asset) {
      if (asset.size > nativeImageByteLimit) throw Error('Unsupported or oversized file');
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.mediaType)) throw Error('Codex accepts image attachments; other files remain viewable artifacts');
      const bytes = await store.read(asset.key);
      if (bytes.length !== asset.size || !/^[a-f0-9]{64}$/.test(asset.key)) throw Error('Asset unavailable');
      return join(root, asset.key);
    },
    async captureImage(result: string) {
      const base64 = result.replace(/^data:image\/png;base64,/, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 24 * 1024 * 1024) throw Error('Invalid image result');
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length > nativeImageByteLimit) throw Error('Invalid image result');
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Invalid PNG result');
      return put(bytes, 'image/png');
    },
  };
}

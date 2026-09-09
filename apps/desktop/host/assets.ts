import { createNodeAssetStore } from '@drawloom/node-host';
import { AssetSchema, type Asset } from '@drawloom/host';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm', 'application/pdf', 'text/plain', 'text/markdown']);
export const browserImportTypes: ReadonlySet<string> = supported;
export const browserImportByteLimit = 16 * 1024 * 1024;
export const nativeRpcMessageByteLimit = 32 * 1024 * 1024;
const nativeImageByteLimit = 16 * 1024 * 1024;
const managedAssetByteLimit = 256 * 1024 * 1024;
export function createDesktopAssets(root: string) {
  const store = createNodeAssetStore(root);
  async function put(bytes: Uint8Array, mediaType: string): Promise<Asset> {
    if ((!supported.has(mediaType) && mediaType !== 'video/quicktime') || bytes.length > managedAssetByteLimit || bytes.length === 0) throw Error('Unsupported or oversized file');
    const key = createHash('sha256').update(bytes).digest('hex');
    await store.write(key, bytes); return AssetSchema.parse({ key, mediaType, size: bytes.length });
  }
  return {
    put,
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

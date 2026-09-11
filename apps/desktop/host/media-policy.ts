import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { JsonStore } from '@drawloom/host';
import { ToolContentSchema } from '@drawloom/tools';
import { MediaPolicySnapshotSchema, type MediaPolicySnapshot } from '../src/lib/media-policy-protocol.js';
import { ResourceOriginSchema } from '../src/lib/package-protocol.js';

/** Presentation eligibility, not a claim that remote content is trustworthy. */
export function remoteMediaUrl(value: string, mediaType: string | undefined): URL | undefined {
  if (!mediaType || !/^(image|audio|video)\/[a-z0-9.+-]+$/i.test(mediaType)) return;
  try {
    const url = new URL(value);
    if (url.username || url.password || value.length > 4096 || !ResourceOriginSchema.safeParse(url.origin).success) return;
    return url;
  } catch { return; }
}

export type MediaPolicy = Awaited<ReturnType<typeof createMediaPolicy>>;
/** One global owner; producers declare, every renderer consumes the same snapshot. */
export async function createMediaPolicy(store: JsonStore, configured: readonly string[] = []) {
  const stored = await store.get('media-policy');
  let sources = stored === undefined ? [] : MediaPolicySnapshotSchema.parse(stored).sources;
  let queue: Promise<unknown> = Promise.resolve();
  const snapshot = (): MediaPolicySnapshot => ({
    revision: createHash('sha256').update(JSON.stringify(sources.map(s=>s.origin))).digest('hex'),
    sources: structuredClone(sources),
  });
  async function declare(source: string, values: readonly string[]) {
    const owner = z.string().min(1).max(512).parse(source);
    const origins = z.array(ResourceOriginSchema).max(256).parse(values);
    const next = queue.then(async () => {
      const merged = new Map(sources.map(s=>[s.origin,new Set(s.sources)]));
      for (const origin of origins) {
        const owners = merged.get(origin) ?? new Set<string>();
        owners.add(owner); merged.set(origin,owners);
      }
      const updated = [...merged].sort(([a],[b])=>a.localeCompare(b)).map(([origin,owners])=>({origin,sources:[...owners].sort()}));
      if (JSON.stringify(updated) === JSON.stringify(sources)) return;
      const value = MediaPolicySnapshotSchema.parse({revision:'stored',sources:updated});
      // Do not publish permission until its declaration is durable.
      await store.set('media-policy',value);
      sources = value.sources;
    });
    queue = next.catch(()=>{});
    return next;
  }
  await declare('host:configuration',configured);
  return {
    snapshot, declare,
    allows(value: string) {
      try { const url=new URL(value);return !url.username && !url.password && sources.some(s=>s.origin===url.origin); }
      catch { return false; }
    },
    async capture(source: string, raw: unknown) {
      const content=ToolContentSchema.max(256).parse(raw);
      const origins=new Set<string>();
      for(const block of content) {
        const reference=block.type==='resource_link'?block:block.type==='resource'?block.resource:undefined;
        if (!reference) continue;
        const url=remoteMediaUrl(reference.uri,reference.mimeType);
        if(url)origins.add(url.origin);
      }
      if(origins.size)await declare(source,[...origins]);
    },
  };
}

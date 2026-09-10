import { createHash } from 'node:crypto';
import { ToolContentSchema } from '@drawloom/tools';
import { ResourceReferenceSchema, type Asset, type AssetLibrary, type ResourceReference } from '@drawloom/host';
import type { HistoryEntry } from '@drawloom/conversation-history';
import { browserImportTypes } from './assets.js';

type Entry = Omit<HistoryEntry, 'position'>;
export function createResourceContent(options: {
  assets: AssetLibrary;
  existing(id: string): Promise<Entry | undefined>;
  save(entry: Entry): Promise<void>;
  knownAsset(key: string): Asset | undefined;
}) {
  return {
    async capture(input: { id: string; source: string; operationId?: string; content: unknown;
      readable?: (uri: string) => boolean; save?: boolean;
      resourceSelections?: Record<string, NonNullable<ResourceReference['retrieval']>> }): Promise<Entry> {
      const previous = await options.existing(input.id);
      if (previous) return previous;
      const content = ToolContentSchema.max(256).parse(input.content);
      let capturedBytes = 0;
      const resources: ResourceReference[] = [];
      const texts: string[] = [];
      for (const [index, block] of content.entries()) {
        if (block.type === 'text') { texts.push(block.text.slice(0, 4000)); continue; }
        const uri = block.type === 'resource_link' ? block.uri : block.type === 'resource' ? block.resource.uri : undefined;
        // Plain display only; never render provider-controlled URIs as executable links.
        const title = (block.type === 'resource_link' ? block.title ?? block.name : block.type === 'resource' ? 'Reference document' : block.type === 'image' ? 'Image result' : 'Audio result').slice(0, 512);
        const mimeType = block.type === 'resource' ? block.resource.mimeType : block.mimeType;
        let asset = uri?.startsWith('asset://') ? options.knownAsset(uri.slice('asset://'.length)) : undefined;
        const data = block.type === 'image' || block.type === 'audio' ? block.data : block.type === 'resource' && 'blob' in block.resource ? block.resource.blob : undefined;
        const text = block.type === 'resource' && 'text' in block.resource ? block.resource.text : undefined;
        if (data !== undefined || text !== undefined) {
          if (browserImportTypes.has(mimeType ?? 'text/plain') && (text === undefined || text.length <= 16 * 1024 * 1024) && (data === undefined || (data.length <= 24 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/.test(data)))) {
            const bytes = data !== undefined ? Buffer.from(data, 'base64') : new TextEncoder().encode(text);
            // Unsupported/oversized data stays a visible reference. Persistence
            // errors must propagate: a failed capture is not synchronized history.
            if (bytes.length > 0 && capturedBytes + bytes.length <= 16 * 1024 * 1024) {
              asset = await options.assets.put(bytes, mimeType ?? 'text/plain'); capturedBytes += bytes.length;
            }
          }
        }
        resources.push(ResourceReferenceSchema.parse({
          id: createHash('sha256').update(input.id + ':' + index).digest('hex'), source: input.source, title,
          ...(uri ? { uri: uri.slice(0, 4096) } : {}), ...(mimeType ? { mimeType } : {}), ...(asset ? { asset } : {}),
          ...(uri && input.resourceSelections?.[uri] ? { retrieval: input.resourceSelections[uri] } : {}),
          status: asset ? 'ready' : uri && (input.readable?.(uri) || input.resourceSelections?.[uri]) ? 'readable' : 'unavailable',
        }));
      }
      const entry: Entry = { id: input.id, role: 'assistant', text: texts.join('\n').slice(0, 8000) || 'Returned resources',
        state: 'complete', assets: [], resources, ...(input.operationId ? { operationId: input.operationId } : {}) };
      if (input.save !== false) await options.save(entry);
      return entry;
    },
  };
}

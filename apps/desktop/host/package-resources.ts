import { createHash } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ResourceListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { DesktopCatalogue } from '../src/lib/protocol.js';

/** Metadata cache only. A receipt names one URI from one connected server. */
export function createPackageResources(clients: ReadonlyMap<string, Client>) {
  type Page = Pick<DesktopCatalogue, 'entries' | 'categories'>;
  const cache = new Map<string, { client: Client; page: Page }>();
  const receipts = new Map<string, { source: string; uri: string; revision: string; client: Client }>();
  const generations = new WeakMap<Client, number>();
  let pending: Promise<Page> | undefined;
  function snapshot():Page {
    const result:Page={entries:[],categories:[]};
    for(const [source,client] of clients){
      const saved=cache.get(source);
      if(saved?.client===client){result.entries.push(...saved.page.entries);result.categories.push(...saved.page.categories);}
      else result.categories.push({kind:'resource',status:'loading'});
    }
    return result;
  }
  async function discover(refresh = false, wait = true): Promise<Page> {
    if (pending) return wait ? pending : snapshot();
    if(!refresh&&[...clients].every(([source,client])=>cache.get(source)?.client===client))return snapshot();
    if(refresh)cache.clear();
    pending = (async () => {
      const result: Page = { entries: [], categories: [] };
      for (const [source, client] of clients) {
        if (!generations.has(client)) {
          generations.set(client, 0);
          client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
            generations.set(client, (generations.get(client) ?? 0) + 1); cache.delete(source);
            for (const [id, receipt] of receipts) if (receipt.source === source) receipts.delete(id);
          });
        }
        const generation = generations.get(client);
        const cached = cache.get(source);
        if (!refresh && cached?.client === client) { result.entries.push(...cached.page.entries); result.categories.push(...cached.page.categories); continue; }
        const page: Page = { entries: [], categories: [] };
        for (const [id, receipt] of receipts) if (receipt.source === source) receipts.delete(id);
        try {
          let cursor: string | undefined; const seen = new Set<string>(), ids = new Set<string>();
          for (let index = 0; index < 100; index++) {
            const response = await client.listResources(cursor ? { cursor } : {}, { timeout: 15_000 });
            for (const resource of response.resources) {
              if (page.entries.length >= 2000) throw Error('Resource catalogue limit');
              const id = `package-resource:${createHash('sha256').update(JSON.stringify([source, resource.uri])).digest('hex')}`;
              if (ids.has(id)) throw Error('Duplicate resource identity'); ids.add(id);
              const revision = createHash('sha256').update(JSON.stringify(resource)).digest('hex');
              page.entries.push({ id, revision, origin: source, kind: 'resource', name: resource.title ?? resource.name,
                description: resource.description ?? '', scope: 'server', availability: 'available', selectable: false, readable: true });
              receipts.set(id, { source, uri: resource.uri, revision, client });
            }
            if (!response.nextCursor) { cursor = undefined; break; }
            if (seen.has(response.nextCursor)) throw Error('Resource cursor loop');
            seen.add(response.nextCursor); cursor = response.nextCursor;
          }
          if (cursor) throw Error('Resource page limit');
          if (clients.get(source) !== client || generations.get(client) !== generation) throw Error('Resource connection changed');
          page.categories.push({ kind: 'resource', status: 'available' });
          cache.set(source, { client, page });
        } catch {
          page.entries = []; cache.delete(source);
          for (const [id, receipt] of receipts) if (receipt.source === source) receipts.delete(id);
          page.categories.push({ kind: 'resource', status: 'error', message: 'Package resource discovery failed. Refresh to retry; tools and other servers remain independent.' });
          if(clients.get(source)===client&&generations.get(client)===generation)cache.set(source,{client,page});
        }
        result.entries.push(...page.entries); result.categories.push(...page.categories);
      }
      return result;
    })().finally(()=>{pending=undefined;});
    return wait ? pending : snapshot();
  }
  return { discover,
    async read(selection: { id: string; revision: string }) {
      const receipt = receipts.get(selection.id);
      if (!receipt || receipt.revision !== selection.revision || clients.get(receipt.source) !== receipt.client) throw Error('Resource unavailable');
      const generation = generations.get(receipt.client);
      const result = await receipt.client.readResource({ uri: receipt.uri }, { timeout: 15_000 });
      if (receipts.get(selection.id) !== receipt || clients.get(receipt.source) !== receipt.client ||
        generations.get(receipt.client) !== generation) throw Error('Resource unavailable');
      return { ...result, contents: result.contents.filter(content => content.uri === receipt.uri) };
    },
  };
}

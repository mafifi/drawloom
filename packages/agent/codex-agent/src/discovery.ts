import { z } from 'zod';
import {
  DiscoverySnapshotSchema,
  type AgentDiscovery,
  type AgentResult,
  type DiscoveryEntry,
  type DiscoverySelection,
  type DiscoverySnapshot,
} from '@drawloom/agent';
import type { RpcTransport, JsonStore } from '@drawloom/host';
import { ToolContentSchema, type ToolContent } from '@drawloom/tools';

const id = z.string().min(1);
const skill = z.object({
  name: id,
  description: z.string(),
  path: id,
  scope: z.enum(['user', 'repo', 'system', 'admin']),
  enabled: z.boolean(),
  pluginId: id.nullable(),
});
const app = z.object({
  id,
  name: id,
  description: z.string().nullable(),
  isAccessible: z.boolean(),
  isEnabled: z.boolean(),
});
const plugin = z.object({
  id,
  name: id,
  installed: z.boolean(),
  enabled: z.boolean(),
  availability: z.enum(['AVAILABLE', 'DISABLED_BY_ADMIN']),
  interface: z
    .object({
      longDescription: z.string().nullable(),
      shortDescription: z.string().nullable(),
    })
    .nullable(),
});
const server = z.object({
  name: id,
  pluginId: id.nullable(),
  authStatus: z
    .enum(['unknown', 'unsupported', 'notLoggedIn', 'bearerToken', 'oAuth'])
    .optional(),
  tools: z.record(
    z.string(),
    z.object({ name: id, description: z.string().optional() }),
  ),
  resources: z
    .array(
      z.object({
        uri: id,
        name: id,
        title: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});
type NativeSelection = {
  type: 'skill' | 'mention';
  name: string;
  path: string;
};
const rejected = (): AgentResult<never> => ({
  status: 'rejected',
  failure: {
    code: 'invalid_state',
    message:
      'Discovery changed or the selection is unavailable. Refresh and select again.',
  },
});
async function identity(kind: string, nativeId: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(nativeId),
  );
  return `codex:${kind}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Installed 0.153.4 wire shapes; native paths are confined to this session map. */
export function createCodexDiscovery(
  rpc: RpcTransport,
  threadId: string,
  isClosed: () => boolean,
  experimentalPlugins = false,
  store?: JsonStore,
) {
  let generation = 0;
  let explicitRevision = 0;
  let lastAppNotification: string | undefined;
  let cached: DiscoverySnapshot | undefined;
  type Kind = DiscoveryEntry['kind'];
  type Target = { server: string; uri: string };
  type Category = {
    entries: DiscoveryEntry[];
    native: Map<string, NativeSelection>;
    readable: Map<string, Target>;
    auth: Map<string, string>;
    status: DiscoverySnapshot['categories'][number];
  };
  type ReadCategory = (
    part: Category,
    add: (
      nativeId: string,
      entry: Omit<DiscoveryEntry, 'id'>,
      selection?: NativeSelection,
    ) => Promise<string>,
    refresh: boolean,
  ) => Promise<void>;
  const order: Kind[] = ['skill', 'app', 'tool', 'plugin'];
  let parts = new Map<Kind, Category>();
  let pending = new Set<Promise<void>>();
  let continuations = new Map<string, { native: string; used: boolean }>();
  let appCursors = new Set<string>();
  let nextCursor: string | undefined;
  let entryBudget = 10_000;
  let activeKinds = new Set<Kind>(),
    dirtyKinds = new Set<Kind>();
  let readers = new Map<Kind, ReadCategory>();
  let selections = new Map<string, NativeSelection>();
  let resources = new Map<string, { server: string; uri: string }>();
  let authentication = new Map<string, string>();
  const clear = () => {
    generation++;
    cached = undefined;
    pending = new Set();
    parts = new Map();
    continuations = new Map();
    appCursors = new Set();
    nextCursor = undefined;
    entryBudget = 10_000;
    activeKinds = new Set();
    dirtyKinds = new Set();
    readers = new Map();
    selections.clear();
    resources.clear();
    authentication.clear();
  };
  const invalidate = () => {
    explicitRevision++;
    clear();
  };
  const upstreamChanged = (method: string, params: unknown) => {
    if (method === 'app/list/updated') {
      const parsed = z
        .object({ data: z.array(app).max(10_000) })
        .safeParse(params);
      if (parsed.success) {
        const signature = JSON.stringify(parsed.data.data);
        if (signature === lastAppNotification) return;
        lastAppNotification = signature;
      }
    }
    const kind: Kind | undefined =
      method === 'app/list/updated'
        ? 'app'
        : method === 'skills/changed'
          ? 'skill'
          : method.startsWith('mcpServer/')
            ? 'tool'
            : undefined;
    if (!kind || !cached) {
      clear();
      return;
    }
    // Native category updates do not restart unrelated reads. Revision rotation
    // rejects selections from before the change, including pending submissions.
    cached.revision = crypto.randomUUID();
    entryBudget += parts.get(kind)?.entries.length ?? 0;
    parts.delete(kind);
    if (kind === 'app') {
      nextCursor = undefined;
      continuations.clear();
      appCursors.clear();
    }
    if (activeKinds.has(kind)) dirtyKinds.add(kind);
    else if (kind === 'app') loadApps(false);
    else {
      const read = readers.get(kind);
      if (read) load(kind, read);
    }
    if (dirtyKinds.has(kind))
      parts.set(kind, {
        entries: [],
        native: new Map(),
        readable: new Map(),
        auth: new Map(),
        status: { kind, status: 'loading' },
      });
    publish();
  };
  function publish() {
    if (!cached) return;
    const ordered = order.flatMap((kind) => parts.get(kind) ?? []);
    cached = DiscoverySnapshotSchema.parse({
      revision: cached.revision,
      entries: ordered.flatMap((p) => p.entries),
      categories: ordered.map((p) => p.status),
      ...(nextCursor ? { nextCursor } : {}),
    });
    selections = new Map(ordered.flatMap((p) => [...p.native]));
    resources = new Map(ordered.flatMap((p) => [...p.readable]));
    authentication = new Map(ordered.flatMap((p) => [...p.auth]));
  }
  function load(kind: Kind, read: ReadCategory, refresh = false) {
    const current = generation,
      active = pending;
    readers.set(kind, read);
    activeKinds.add(kind);
    const previous = parts.get(kind);
    const part: Category = {
      entries: [...(previous?.entries ?? [])],
      native: new Map(previous?.native),
      readable: new Map(previous?.readable),
      auth: new Map(previous?.auth),
      status: { kind, status: 'loading' },
    };
    parts.set(kind, {
      entries: [...(previous?.entries ?? [])],
      native: new Map(previous?.native),
      readable: new Map(previous?.readable),
      auth: new Map(previous?.auth),
      status: { kind, status: 'loading' },
    });
    publish();
    const run = Promise.resolve()
      .then(async () => {
        const add = async (
          nativeId: string,
          entry: Omit<DiscoveryEntry, 'id'>,
          selection?: NativeSelection,
        ) => {
          const key = await identity(entry.kind, nativeId);
          if (current !== generation || isClosed())
            throw Error('Discovery changed');
          if (!part.entries.some((e) => e.id === key)) {
            if (entryBudget <= 0) throw Error('Inventory limit');
            entryBudget--;
            part.entries.push({ ...entry, id: key });
          }
          if (selection) part.native.set(key, selection);
          return key;
        };
        try {
          await read(part, add, refresh);
          part.status = { kind, status: 'available' };
        } catch (error) {
          // A failed category/page must not erase an unrelated completed category.
          if (current === generation)
            entryBudget +=
              part.entries.length - (previous?.entries.length ?? 0);
          part.entries = [...(previous?.entries ?? [])];
          part.native = new Map(previous?.native);
          part.readable = new Map(previous?.readable);
          part.auth = new Map(previous?.auth);
          part.status = {
            kind,
            status: z.object({ code: z.literal(-32601) }).safeParse(error)
              .success
              ? 'unsupported'
              : 'error',
            message:
              'Provider discovery is unavailable for this category. Refresh to retry.',
          };
          if (kind === 'app' && current === generation) nextCursor = undefined;
        }
        if (current === generation && !isClosed() && !dirtyKinds.has(kind)) {
          parts.set(kind, part);
          publish();
        }
      })
      .finally(() => {
        active.delete(run);
        if (current !== generation || isClosed()) return;
        activeKinds.delete(kind);
        if (dirtyKinds.delete(kind)) {
          entryBudget += part.entries.length - (previous?.entries.length ?? 0);
          if (kind === 'app') loadApps(false);
          else load(kind, read);
        }
      });
    active.add(run);
  }
  function loadApps(forceRefetch: boolean, cursor: string | null = null) {
    const current = generation;
    load('app', async (_part, add) => {
      const result = z
        .object({ data: z.array(app).max(1000), nextCursor: id.nullable() })
        .parse(
          await rpc.request('app/list', {
            threadId,
            forceRefetch,
            cursor,
            limit: 100,
          }),
        );
      if (current !== generation || isClosed() || dirtyKinds.has('app')) return;
      if (
        result.nextCursor &&
        (appCursors.has(result.nextCursor) || appCursors.size >= 100)
      )
        throw Error('Repeated cursor or page limit');
      for (const item of result.data) {
        const available = item.isAccessible && item.isEnabled;
        await add(
          item.id,
          {
            origin: 'codex',
            kind: 'app',
            name: item.name,
            description: item.description ?? '',
            scope: 'session',
            availability: available ? 'available' : 'unavailable',
            selectable: available,
          },
          available
            ? { type: 'mention', name: item.name, path: `app://${item.id}` }
            : undefined,
        );
      }
      if (current !== generation || isClosed() || dirtyKinds.has('app')) return;
      nextCursor = undefined;
      if (result.nextCursor) {
        appCursors.add(result.nextCursor);
        nextCursor = crypto.randomUUID();
        continuations.set(nextCursor, {
          native: result.nextCursor,
          used: false,
        });
      }
    });
  }
  function begin(refresh: boolean) {
    cached = { revision: crypto.randomUUID(), entries: [], categories: [] };
    load(
      'skill',
      async (_part, add, forceReload) => {
        const result = z
          .object({
            data: z.array(
              z.object({
                cwd: id,
                skills: z.array(skill),
                errors: z.array(z.unknown()),
              }),
            ),
          })
          .parse(await rpc.request('skills/list', { forceReload }));
        for (const group of result.data) {
          if (group.errors.length) throw Error('Incomplete skill scan');
          for (const item of group.skills)
            await add(
              item.path,
              {
                origin: 'codex',
                kind: 'skill',
                name: item.name,
                description: item.description,
                scope: item.scope,
                availability: item.enabled ? 'available' : 'unavailable',
                selectable: item.enabled,
                ...(item.pluginId
                  ? { ownerId: await identity('plugin', item.pluginId) }
                  : {}),
              },
              item.enabled
                ? { type: 'skill', name: item.name, path: item.path }
                : undefined,
            );
        }
      },
      refresh,
    );
    loadApps(refresh);
    load('tool', async (part, add) => {
      let cursor: string | null = null;
      const seen = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const result = z
          .object({
            data: z.array(server).max(1000),
            nextCursor: id.nullable(),
          })
          .parse(
            await rpc.request('mcpServerStatus/list', {
              threadId,
              cursor,
              limit: 100,
            }),
          );
        for (const item of result.data) {
          if (
            item.authStatus === 'notLoggedIn' ||
            item.authStatus === 'oAuth'
          ) {
            const key = await add(item.name, {
              origin: 'codex',
              kind: 'integration',
              name: item.name,
              description:
                item.authStatus === 'oAuth'
                  ? 'Signed in through Codex. Credentials remain with Codex.'
                  : 'Sign-in required through Codex.',
              scope: 'session',
              availability:
                item.authStatus === 'oAuth' ? 'available' : 'unavailable',
              selectable: false,
              authenticationOwner: 'provider',
            });
            part.auth.set(key, item.name);
          }
          for (const tool of Object.values(item.tools))
            await add(item.name + ':' + tool.name, {
              origin: `codex:mcp:${item.name}`,
              kind: 'tool',
              name: tool.name,
              description: tool.description ?? '',
              scope: 'session',
              availability: 'unverified',
              selectable: false,
              ...(item.pluginId
                ? { ownerId: await identity('plugin', item.pluginId) }
                : {}),
            });
          for (const resource of item.resources) {
            const key = await add(item.name + ':' + resource.uri, {
              origin: `codex:mcp:${item.name}`,
              kind: 'resource',
              name: resource.title ?? resource.name,
              description: resource.description ?? '',
              scope: 'session',
              availability: 'available',
              selectable: false,
              readable: true,
            });
            part.readable.set(key, { server: item.name, uri: resource.uri });
          }
        }
        if (result.nextCursor === null) return;
        if (seen.has(result.nextCursor)) throw Error('Repeated cursor');
        seen.add(result.nextCursor);
        cursor = result.nextCursor;
      }
      throw Error('Inventory page limit');
    });
    if (experimentalPlugins)
      load(
        'plugin',
        async (_part, add, forceRefetch) => {
          const result = z
            .object({
              marketplaces: z.array(
                z.object({ name: id, plugins: z.array(plugin) }),
              ),
              marketplaceLoadErrors: z.array(z.unknown()),
            })
            .parse(await rpc.request('plugin/list', { forceRefetch }));
          if (result.marketplaceLoadErrors.length)
            throw Error('Incomplete plugin scan');
          for (const marketplace of result.marketplaces)
            for (const item of marketplace.plugins) {
              const available =
                item.installed &&
                item.enabled &&
                item.availability === 'AVAILABLE';
              await add(
                item.id,
                {
                  origin: `codex:plugin:${marketplace.name}`,
                  kind: 'plugin',
                  name: item.name,
                  description:
                    item.interface?.shortDescription ??
                    item.interface?.longDescription ??
                    '',
                  scope: 'session',
                  availability: available ? 'available' : 'unavailable',
                  selectable: available,
                },
                available
                  ? {
                      type: 'mention',
                      name: item.name,
                      path: `plugin://${item.id}`,
                    }
                  : undefined,
              );
            }
        },
        refresh,
      );
    else {
      parts.set('plugin', {
        entries: [],
        native: new Map(),
        readable: new Map(),
        auth: new Map(),
        status: {
          kind: 'plugin',
          status: 'unsupported',
          message: 'Experimental native plugin discovery is off.',
        },
      });
      publish();
    }
  }
  const discovery: AgentDiscovery = {
    invalidate,
    async authenticate(selection) {
      const current = generation;
      const name =
        cached?.revision === selection.revision
          ? authentication.get(selection.id)
          : undefined;
      if (!name || isClosed()) return rejected();
      try {
        const result = z
          .object({
            authorizationUrl: z
              .string()
              .url()
              .refine((value) => {
                const url = new URL(value);
                return (
                  url.protocol === 'https:' && !url.username && !url.password
                );
              }),
          })
          .parse(
            await rpc.request('mcpServer/oauth/login', { name, threadId }),
          );
        if (
          current !== generation ||
          cached?.revision !== selection.revision ||
          isClosed()
        )
          return rejected();
        return { status: 'ok', value: result };
      } catch {
        return {
          status: 'rejected',
          failure: {
            code: 'provider_unavailable',
            message:
              'Native sign-in is unavailable. Use the provider’s own integration settings.',
          },
        };
      }
    },
    async readResource(selection) {
      const current = generation;
      let target =
        cached?.revision === selection.revision
          ? resources.get(selection.id)
          : undefined;
      const listed = target !== undefined;
      // Returned links have a durable, session-bound receipt rather than a
      // catalogue revision: they need not ever appear in resources/list.
      if (
        !target &&
        store &&
        /^codex:returned-resource:[a-f0-9]{64}$/.test(selection.id)
      ) {
        const receipt = z
          .object({ server: id, uri: id, revision: id })
          .safeParse(
            await store.get(`codex-resource:${threadId}:${selection.id}`),
          );
        if (receipt.success && receipt.data.revision === selection.revision)
          target = { server: receipt.data.server, uri: receipt.data.uri };
      }
      if (!target || isClosed()) return rejected();
      try {
        const result = z
          .object({ contents: z.array(z.unknown()) })
          .parse(
            await rpc.request('mcpServer/resource/read', {
              threadId,
              ...target,
            }),
          );
        const content = ToolContentSchema.parse(
          result.contents.map((resource) => ({ type: 'resource', resource })),
        );
        if (
          current !== generation ||
          isClosed() ||
          (listed &&
            (cached?.revision !== selection.revision ||
              resources.get(selection.id) !== target))
        )
          return rejected();
        return {
          status: 'ok',
          value: content.filter(
            (block) =>
              block.type === 'resource' && block.resource.uri === target.uri,
          ),
        };
      } catch (error) {
        return {
          status: 'rejected',
          failure: {
            code: 'provider_unavailable',
            message:
              'This provider resource could not be read. No tool was invoked.',
          },
        };
      }
    },
    async list(options = {}) {
      if (isClosed()) return rejected();
      if (options.cursor) {
        const continuation = continuations.get(options.cursor);
        if (!cached || !continuation || options.refresh) return rejected();
        if (!continuation.used) {
          continuation.used = true;
          nextCursor = undefined;
          loadApps(false, continuation.native);
        }
      } else {
        // Refresh is coalesced while a read is active, not a second forceRefetch.
        if (options.refresh && !pending.size) invalidate();
        if (!cached) begin(options.refresh ?? false);
      }
      const explicit = explicitRevision;
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = generation;
        if (options.wait !== false) {
          await Promise.all(pending);
          await Promise.all(pending);
        }
        if (isClosed() || explicit !== explicitRevision) return rejected();
        if (current === generation && cached)
          return { status: 'ok', value: structuredClone(cached) };
        if (attempt === 0 && !cached) begin(false);
      }
      return rejected();
    },
  };
  return {
    discovery,
    upstreamChanged,
    async rememberReturnedResources(
      source: string,
      content: ToolContent,
    ): Promise<Record<string, DiscoverySelection>> {
      const output: Record<string, DiscoverySelection> = Object.create(null);
      if (!store || isClosed()) return output;
      for (const block of content.slice(0, 256)) {
        if (block.type !== 'resource_link' || block.uri.length > 4096) continue;
        const key = await identity(
          'returned-resource',
          JSON.stringify([source, block.uri]),
        );
        const storageKey = `codex-resource:${threadId}:${key}`;
        const saved = z
          .object({ server: id, uri: id, revision: id })
          .safeParse(await store.get(storageKey));
        // This versions the source-bound receipt, not the resource's contents.
        // Concurrent completions must not invalidate each other's identical link.
        const revision = saved.success
          ? saved.data.revision
          : await identity(
              'resource-receipt',
              JSON.stringify([1, threadId, source, block.uri]),
            );
        if (!saved.success)
          await store.set(storageKey, {
            server: source,
            uri: block.uri,
            revision,
          });
        output[block.uri] = { id: key, revision };
      }
      return output;
    },
    resolve(
      values: readonly DiscoverySelection[],
    ): NativeSelection[] | undefined {
      if (!values.length) return [];
      if (!cached || isClosed()) return undefined;
      const output: NativeSelection[] = [];
      const seen = new Set<string>();
      for (const selected of values) {
        const item = selections.get(selected.id);
        if (selected.revision !== cached.revision || !item) return undefined;
        if (!seen.has(selected.id)) {
          seen.add(selected.id);
          output.push({ ...item });
        }
      }
      return output;
    },
  };
}
